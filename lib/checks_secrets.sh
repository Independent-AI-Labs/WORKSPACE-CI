#!/usr/bin/env bash
# CI Secret Scanning: dynamic gitleaks wrapper.
#
# Sourced by checks.sh. Requires ci.sh to be loaded first.
#
# Scans ALL non-gitignored files (tracked + untracked) using gitleaks.
# The repository's .gitignore is the sole file-selection filter.

# --- ci_scan_secrets ---
# Scans the repository for leaked secrets with one Gitleaks process. Only the
# non-ignored candidate files are staged into a temporary tree so Gitleaks
# never traverses unreadable ignored directories.
# Redacts secret values in output to prevent re-exposure in CI logs.
ci_scan_secrets() {
    local _ss_gitleaks_bin _ss_root
    _ss_root="$(git rev-parse --show-toplevel)"
    _ss_gitleaks_bin="$(ci_resolve_tool_path "$_ss_root" gitleaks)" || {
        ci_fail "gitleaks not found (boot dir or PATH)"
        return 1
    }

    local _ss_candidates_tmp _ss_stderr_tmp _ss_config_tmp _ss_scan_tmp
    _ss_candidates_tmp="$(mktemp)"
    _ss_stderr_tmp="$(mktemp)"
    _ss_config_tmp="$(mktemp "${TMPDIR:-/tmp}/gitleaks-config.XXXXXX.toml")"
    _ss_scan_tmp="$(mktemp -d "${TMPDIR:-/tmp}/gitleaks-scan.XXXXXX")"
    local _ss_git_rc=0 _ss_path _ss_dest _ss_dest_dir
    git ls-files -co --exclude-standard -z >"$_ss_candidates_tmp" \
        2>"$_ss_stderr_tmp" || _ss_git_rc=$?
    if [[ $_ss_git_rc -ne 0 ]]; then
        ci_fail "git ls-files failed"
        [[ -s "$_ss_stderr_tmp" ]] && cat "$_ss_stderr_tmp" >&2
        rm -f "$_ss_candidates_tmp" "$_ss_stderr_tmp" "$_ss_config_tmp"
        rm -rf "$_ss_scan_tmp"
        return 1
    fi

    local _ss_total
    _ss_total=$(tr -cd '\0' <"$_ss_candidates_tmp" | wc -c)

    if [[ $_ss_total -eq 0 ]]; then
        ci_pass "gitleaks: no files to scan"
        rm -f "$_ss_candidates_tmp" "$_ss_stderr_tmp" "$_ss_config_tmp"
        rm -rf "$_ss_scan_tmp"
        return 0
    fi

    # Build a sparse scan tree from Git's candidate list. This keeps one
    # Gitleaks process while making ignored directories physically absent from
    # the traversal, including ignored paths outside a nested consumer repo.
    while IFS= read -r -d '' _ss_path; do
        _ss_dest="$_ss_scan_tmp/$_ss_path"
        _ss_dest_dir="${_ss_dest%/*}"
        mkdir -p "$_ss_dest_dir" || {
            ci_fail "could not create scan path: $_ss_dest_dir"
            rm -f "$_ss_candidates_tmp" "$_ss_stderr_tmp" "$_ss_config_tmp"
            rm -rf "$_ss_scan_tmp"
            return 1
        }
        if ! ln "$_ss_root/$_ss_path" "$_ss_dest" 2>"$_ss_stderr_tmp"; then
            rm -f "$_ss_stderr_tmp"
            cp -pP "$_ss_root/$_ss_path" "$_ss_dest" || {
                ci_fail "could not stage scan file: $_ss_path"
                rm -f "$_ss_candidates_tmp" "$_ss_stderr_tmp" "$_ss_config_tmp"
                rm -rf "$_ss_scan_tmp"
                return 1
            }
        fi
    done <"$_ss_candidates_tmp"
    rm -f "$_ss_candidates_tmp" "$_ss_stderr_tmp"

    if [[ -f "$_ss_root/.gitleaks.toml" ]]; then
        printf "[extend]\npath = '''%s'''\n\n" "$_ss_root/.gitleaks.toml" >"$_ss_config_tmp"
    else
        printf '[extend]\nuseDefault = true\n\n' >"$_ss_config_tmp"
    fi
    local _ss_rc=0
    ("$_ss_gitleaks_bin" dir "$_ss_scan_tmp" \
        --config "$_ss_config_tmp" --no-banner --redact --verbose --log-level=error) \
        || _ss_rc=$?
    rm -f "$_ss_config_tmp"
    rm -rf "$_ss_scan_tmp"

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
