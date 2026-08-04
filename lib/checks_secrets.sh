#!/usr/bin/env bash
# CI Secret Scanning: dynamic gitleaks wrapper.
#
# Sourced by checks.sh. Requires ci.sh to be loaded first.
#
# Scans ALL non-gitignored files (tracked + untracked) using gitleaks.
# No .gitleaks.toml needed: each repo's .gitignore is the sole filter.
# git ls-files gives tracked files; --others --exclude-standard gives
# untracked non-ignored files. Together = all files on disk minus gitignored.

# --- ci_scan_secrets ---
# Scans all non-gitignored files (tracked + untracked) for leaked secrets
# using gitleaks in parallel across the full file set.
# No .gitleaks.toml is needed because each repo's .gitignore serves as the
# sole filter.
# Redacts secret values in output to prevent re-exposure in CI logs.
ci_scan_secrets() {
    local _ss_gitleaks_bin _ss_root
    _ss_root="$(git rev-parse --show-toplevel)"
    _ss_gitleaks_bin="$(ci_resolve_tool_path "$_ss_root" gitleaks)" || {
        ci_fail "gitleaks not found (boot dir or PATH)"
        return 1
    }

    # Enumerate the full repository, not only staged paths. --exclude-standard
    # removes ordinary untracked ignored files; the explicit check-ignore pass
    # is also required because git ls-files includes tracked paths even when a
    # later .gitignore rule matches them.
    local _ss_stderr_tmp _ss_files_tmp
    _ss_stderr_tmp="$(mktemp)"
    _ss_files_tmp="$(mktemp)"
    local _ss_candidates_tmp
    _ss_candidates_tmp="$(mktemp)"
    local _ss_git_rc=0
    git ls-files -co --exclude-standard -z >"$_ss_candidates_tmp" \
        2>"$_ss_stderr_tmp" || _ss_git_rc=$?
    if [[ $_ss_git_rc -ne 0 ]]; then
        ci_fail "git ls-files failed"
        [[ -s "$_ss_stderr_tmp" ]] && cat "$_ss_stderr_tmp" >&2
        rm -f "$_ss_stderr_tmp" "$_ss_candidates_tmp" "$_ss_files_tmp"
        return 1
    fi
    rm -f "$_ss_stderr_tmp"

    # --no-index makes ignore rules apply to tracked files as well. This keeps
    # a tracked file that is now ignored out of the scan, matching the policy
    # that ignored content is never eligible for secret scanning.
    local _ss_filtered_tmp
    _ss_filtered_tmp="$(mktemp)"
    local _ss_ignore_out _ss_ignore_rc
    while IFS= read -r -d '' _ss_path; do
        _ss_ignore_rc=0
        _ss_ignore_out="$(git check-ignore --no-index -- "$_ss_path" 2>&1)" || _ss_ignore_rc=$?
        if [[ $_ss_ignore_rc -eq 1 ]]; then
            printf '%s\0' "$_ss_path"
        elif [[ $_ss_ignore_rc -ne 0 ]]; then
            ci_fail "git check-ignore failed for $_ss_path (exit $_ss_ignore_rc)"
            [[ -n "$_ss_ignore_out" ]] && printf '%s\n' "$_ss_ignore_out" >&2
            rm -f "$_ss_candidates_tmp" "$_ss_filtered_tmp" "$_ss_files_tmp"
            return 1
        fi
    done <"$_ss_candidates_tmp" >"$_ss_filtered_tmp"
    sort -zu "$_ss_filtered_tmp" >"$_ss_files_tmp"
    rm -f "$_ss_candidates_tmp" "$_ss_filtered_tmp"

    if [[ ! -s "$_ss_files_tmp" ]]; then
        ci_pass "gitleaks: no files to scan"
        rm -f "$_ss_files_tmp"
        return 0
    fi

    local _ss_total
    _ss_total=$(tr -cd '\0' < "$_ss_files_tmp" | wc -c)

    local _ss_rc=0
    # xargs -P4 parallelizes gitleaks across files for speed. Batching
    # multiple paths per invocation was measured 150x SLOWER (gitleaks
    # scans multi-path argv concurrently and thrashes), so one path per
    # process stays. --log-level=error suppresses gitleaks INF/WRN status
    # on stderr (redundant with exit code); real errors still surface.
    # --verbose sends Finding blocks to stdout for the developer to see.
    xargs -0 -P4 -I{} "$_ss_gitleaks_bin" dir {} \
        --no-banner --redact --verbose --log-level=error \
        < "$_ss_files_tmp" || _ss_rc=$?
    rm -f "$_ss_files_tmp"

    if [[ $_ss_rc -ne 0 ]]; then
        if [[ $_ss_rc -eq 124 || $_ss_rc -eq 137 ]]; then
            ci_fail "gitleaks: TIMED OUT (exit $_ss_rc, scanned $_ss_total files)"
        elif [[ $_ss_rc -eq 139 || $_ss_rc -eq 245 ]]; then
            ci_fail "gitleaks: CRASHED (SIGSEGV, exit $_ss_rc, scanned $_ss_total files)"
        else
            ci_fail "gitleaks: secrets found or error (exit $_ss_rc, scanned $_ss_total files)"
        fi
        return 1
    fi
    ci_pass "gitleaks: no leaks found ($_ss_total files)"
    return 0
}
