#!/usr/bin/env bash
# CI Secret Scanning: dynamic gitleaks wrapper.
#
# Sourced by checks.sh. Requires ci.sh to be loaded first.
#
# Scans ALL non-gitignored files (tracked + untracked) using gitleaks.
# The repository's .gitignore is the sole file-selection filter.

# --- ci_scan_secrets ---
# Scans the repository for leaked secrets with one Gitleaks process. Git-ignored
# paths are represented as global Gitleaks allowlist entries so directory
# traversal can prune them before opening their contents.
# Redacts secret values in output to prevent re-exposure in CI logs.
ci_scan_secrets() {
    local _ss_gitleaks_bin _ss_root _ss_tool_root
    _ss_root="$(git rev-parse --show-toplevel)"
    _ss_tool_root="${CI_PROJECT_ROOT:-$_ss_root}"
    _ss_gitleaks_bin="$(ci_resolve_tool_path "$_ss_tool_root" gitleaks)" || {
        ci_fail "gitleaks not found (boot dir or PATH)"
        return 1
    }

    local _ss_candidates_tmp _ss_ignored_tmp _ss_stderr_tmp _ss_config_tmp
    _ss_candidates_tmp="$(mktemp)"
    _ss_ignored_tmp="$(mktemp)"
    _ss_stderr_tmp="$(mktemp)"
    _ss_config_tmp="$(mktemp "${TMPDIR:-/tmp}/gitleaks-config.XXXXXX.toml")"
    local _ss_git_rc=0 _ss_path _ss_suffix
    git -C "$_ss_root" ls-files -co --exclude-standard -z >"$_ss_candidates_tmp" \
        2>"$_ss_stderr_tmp" || _ss_git_rc=$?
    if [[ $_ss_git_rc -ne 0 ]]; then
        ci_fail "git ls-files failed"
        [[ -s "$_ss_stderr_tmp" ]] && cat "$_ss_stderr_tmp" >&2
        rm -f "$_ss_candidates_tmp" "$_ss_ignored_tmp" "$_ss_stderr_tmp" "$_ss_config_tmp"
        return 1
    fi

    local _ss_total
    _ss_total=$(tr -cd '\0' <"$_ss_candidates_tmp" | wc -c)

    if [[ $_ss_total -eq 0 ]]; then
        ci_pass "gitleaks: no files to scan"
        rm -f "$_ss_candidates_tmp" "$_ss_ignored_tmp" "$_ss_stderr_tmp" "$_ss_config_tmp"
        return 0
    fi

    local _ss_ignored_paths_tmp
    _ss_ignored_paths_tmp="$(mktemp)"
    git -C "$_ss_root" ls-files -c -i --exclude-standard -z >>"$_ss_ignored_paths_tmp" \
        2>"$_ss_stderr_tmp" || _ss_git_rc=$?
    if [[ $_ss_git_rc -ne 0 ]]; then
        ci_fail "git ls-files tracked ignored-path listing failed"
        [[ -s "$_ss_stderr_tmp" ]] && cat "$_ss_stderr_tmp" >&2
        rm -f "$_ss_candidates_tmp" "$_ss_ignored_tmp" "$_ss_ignored_paths_tmp" "$_ss_stderr_tmp" "$_ss_config_tmp"
        return 1
    fi
    git -C "$_ss_root" ls-files -o -i --exclude-standard --directory -z >>"$_ss_ignored_paths_tmp" \
        2>"$_ss_stderr_tmp" || _ss_git_rc=$?
    if [[ $_ss_git_rc -ne 0 ]]; then
        ci_fail "git ls-files ignored-path listing failed"
        [[ -s "$_ss_stderr_tmp" ]] && cat "$_ss_stderr_tmp" >&2
        rm -f "$_ss_candidates_tmp" "$_ss_ignored_tmp" "$_ss_ignored_paths_tmp" "$_ss_stderr_tmp" "$_ss_config_tmp"
        return 1
    fi
    cat "$_ss_ignored_paths_tmp" >>"$_ss_ignored_tmp"
    rm -f "$_ss_ignored_paths_tmp" "$_ss_stderr_tmp"
    rm -f "$_ss_candidates_tmp"

    # The generated config always carries the default gitleaks rules
    # (useDefault) AND the repo allowlist. Two fail-open shapes are
    # deliberately avoided: (1) pointing at the repo file with
    # `[extend] path` merges rules only and drops its
    # [allowlist]/[[allowlists]] sections; (2) omitting useDefault when a
    # repo file exists makes an allowlist-only file yield a zero-rule
    # scan that passes every secret. The repo file is a normal reviewed
    # tracked source file (agent-editable through review, not a root-owned
    # artifact): its `[extend]`/`title` boilerplate is stripped and
    # useDefault is forced on, so it can never disable the default rules,
    # and its allowlists are concatenated into the top-level config.
    _ss_repo_cfg="$_ss_root/.gitleaks.toml"
    printf '[extend]\nuseDefault = true\n\n' >"$_ss_config_tmp"
    if [[ -L "$_ss_repo_cfg" ]] || { [[ -e "$_ss_repo_cfg" ]] && [[ ! -f "$_ss_repo_cfg" ]]; }; then
        ci_fail "repo .gitleaks.toml must be a regular file (not a symlink or special file): $_ss_repo_cfg"
        rm -f "$_ss_config_tmp" "$_ss_ignored_tmp"
        return 1
    fi
    if [[ -f "$_ss_repo_cfg" ]]; then
        if grep -qE '^[[:space:]]*\[\[?rules\]' "$_ss_repo_cfg"; then
            ci_fail "repo .gitleaks.toml must be allowlist-only (no [[rules]]): $_ss_repo_cfg"
            rm -f "$_ss_config_tmp" "$_ss_ignored_tmp"
            return 1
        fi
        awk '
            /^[[:space:]]*\[/ { _skip = ($0 ~ /^[[:space:]]*\[\[?extend\]\]?[[:space:]]*$/) ? 1 : 0 }
            _skip { next }
            /^[[:space:]]*title[[:space:]]*=/ { next }
            { print }
        ' "$_ss_repo_cfg" >>"$_ss_config_tmp"
        printf '\n' >>"$_ss_config_tmp"
    fi
    if [[ -s "$_ss_ignored_tmp" ]]; then
        printf '[[allowlists]]\ndescription = "Git-ignored paths"\npaths = [\n' >>"$_ss_config_tmp"
        while IFS= read -r -d '' _ss_path; do
            _ss_suffix=''
            if [[ "$_ss_path" == */ ]]; then
                _ss_path="${_ss_path%/}"
                _ss_suffix='(?:/.*)?'
            fi
            _ss_path="$(printf '%s' "$_ss_path" | sed 's/[][\\.^$*+?(){}|]/\\&/g')"
            printf "  '''(^|/)%s%s$''',\n" "$_ss_path" "$_ss_suffix" >>"$_ss_config_tmp"
        done <"$_ss_ignored_tmp"
        printf ']\n' >>"$_ss_config_tmp"
    fi
    rm -f "$_ss_candidates_tmp" "$_ss_stderr_tmp"
    local _ss_rc=0
    (cd "$_ss_root" && "$_ss_gitleaks_bin" dir . \
        --config "$_ss_config_tmp" --no-banner --redact --verbose --log-level=error) \
        || _ss_rc=$?
    rm -f "$_ss_config_tmp"
    rm -f "$_ss_ignored_tmp"

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
