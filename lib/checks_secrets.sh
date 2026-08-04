#!/usr/bin/env bash
# CI Secret Scanning: dynamic gitleaks wrapper.
#
# Sourced by checks.sh. Requires ci.sh to be loaded first.
#
# Scans ALL non-gitignored files (tracked + untracked) using gitleaks.
# The repository's .gitignore is the sole file-selection filter.

# --- ci_scan_secrets ---
# Scans the repository for leaked secrets with one Gitleaks process. Git-ignored
# paths are represented as temporary Gitleaks path allowlist entries so the
# directory scanner can retain the real repository paths.
# Redacts secret values in output to prevent re-exposure in CI logs.
ci_scan_secrets() {
    local _ss_gitleaks_bin _ss_root
    _ss_root="$(git rev-parse --show-toplevel)"
    _ss_gitleaks_bin="$(ci_resolve_tool_path "$_ss_root" gitleaks)" || {
        ci_fail "gitleaks not found (boot dir or PATH)"
        return 1
    }

    local _ss_candidates_tmp _ss_ignored_tmp _ss_stderr_tmp _ss_config_tmp
    _ss_candidates_tmp="$(mktemp)"
    _ss_ignored_tmp="$(mktemp)"
    _ss_stderr_tmp="$(mktemp)"
    _ss_config_tmp="$(mktemp "${TMPDIR:-/tmp}/gitleaks-config.XXXXXX.toml")"
    local _ss_git_rc=0 _ss_ignore_rc _ss_path _ss_ignore_out
    git ls-files -co --exclude-standard -z >"$_ss_candidates_tmp" \
        2>"$_ss_stderr_tmp" || _ss_git_rc=$?
    if [[ $_ss_git_rc -ne 0 ]]; then
        ci_fail "git ls-files failed"
        [[ -s "$_ss_stderr_tmp" ]] && cat "$_ss_stderr_tmp" >&2
        rm -f "$_ss_candidates_tmp" "$_ss_ignored_tmp" "$_ss_stderr_tmp" "$_ss_config_tmp"
        return 1
    fi

    local _ss_total=0
    while IFS= read -r -d '' _ss_path; do
        _ss_ignore_rc=0
        _ss_ignore_out="$(git check-ignore --no-index -- "$_ss_path" 2>&1)" || _ss_ignore_rc=$?
        if [[ $_ss_ignore_rc -eq 0 ]]; then
            printf '%s\n' "$_ss_path" >>"$_ss_ignored_tmp"
        elif [[ $_ss_ignore_rc -eq 1 ]]; then
            _ss_total=$((_ss_total + 1))
        else
            ci_fail "git check-ignore failed for $_ss_path (exit $_ss_ignore_rc)"
            [[ -n "$_ss_ignore_out" ]] && printf '%s\n' "$_ss_ignore_out" >&2
            rm -f "$_ss_candidates_tmp" "$_ss_ignored_tmp" "$_ss_stderr_tmp" "$_ss_config_tmp"
            return 1
        fi
    done <"$_ss_candidates_tmp"
    rm -f "$_ss_candidates_tmp" "$_ss_stderr_tmp"

    # --exclude-standard omits untracked ignored directories entirely. Add
    # those directory paths separately so a root scan cannot descend into
    # generated trees such as .boot-linux or node_modules.
    local _ss_ignored_dirs_tmp
    _ss_ignored_dirs_tmp="$(mktemp)"
    git ls-files -o -i --exclude-standard --directory -z >"$_ss_ignored_dirs_tmp" \
        2>"$_ss_stderr_tmp" || _ss_git_rc=$?
    if [[ $_ss_git_rc -ne 0 ]]; then
        ci_fail "git ls-files ignored-path listing failed"
        [[ -s "$_ss_stderr_tmp" ]] && cat "$_ss_stderr_tmp" >&2
        rm -f "$_ss_ignored_dirs_tmp" "$_ss_ignored_tmp" "$_ss_stderr_tmp" "$_ss_config_tmp"
        return 1
    fi
    while IFS= read -r -d '' _ss_path; do
        printf '%s\n' "$_ss_path" >>"$_ss_ignored_tmp"
    done <"$_ss_ignored_dirs_tmp"
    rm -f "$_ss_ignored_dirs_tmp" "$_ss_stderr_tmp"

    if [[ $_ss_total -eq 0 ]]; then
        ci_pass "gitleaks: no files to scan"
        rm -f "$_ss_ignored_tmp" "$_ss_config_tmp"
        return 0
    fi

    if [[ -f "$_ss_root/.gitleaks.toml" ]]; then
        printf "[extend]\npath = '''%s'''\n\n" "$_ss_root/.gitleaks.toml" >"$_ss_config_tmp"
    else
        printf '[extend]\nuseDefault = true\n\n' >"$_ss_config_tmp"
    fi
    printf '[allowlist]\ndescription = "Git-ignored paths"\npaths = [\n' >>"$_ss_config_tmp"
    while IFS= read -r _ss_path; do
        # Quote every regex metacharacter so only the exact ignored path is
        # excluded, while the optional leading directory prefix matches the
        # relative paths reported by Gitleaks.
        local _ss_suffix=''
        if [[ "$_ss_path" == */ ]]; then
            _ss_path="${_ss_path%/}"
            _ss_suffix='(?:/.*)?'
        fi
        _ss_path="$(printf '%s' "$_ss_path" | sed 's/[][\\.^$*+?(){}|]/\\&/g')"
        printf "  '''(^|/)%s%s$''',\n" "$_ss_path" "$_ss_suffix" >>"$_ss_config_tmp"
    done <"$_ss_ignored_tmp"
    printf ']\n' >>"$_ss_config_tmp"
    rm -f "$_ss_ignored_tmp"

    local _ss_rc=0
    # The directory command owns traversal and detector concurrency. Passing
    # individual files through xargs creates one process per file.
    (cd "$_ss_root" && "$_ss_gitleaks_bin" dir . \
        --config "$_ss_config_tmp" --no-banner --redact --verbose --log-level=error) \
        || _ss_rc=$?
    rm -f "$_ss_config_tmp"

    if [[ $_ss_rc -ne 0 ]]; then
        if [[ $_ss_rc -eq 124 || $_ss_rc -eq 137 ]]; then
            ci_fail "gitleaks: TIMED OUT (exit $_ss_rc)"
        elif [[ $_ss_rc -eq 139 || $_ss_rc -eq 245 ]]; then
            ci_fail "gitleaks: CRASHED (SIGSEGV, exit $_ss_rc)"
        else
            ci_fail "gitleaks: secrets found or error (exit $_ss_rc)"
        fi
        return 1
    fi
    ci_pass "gitleaks: no leaks found ($_ss_total files)"
    return 0
}
