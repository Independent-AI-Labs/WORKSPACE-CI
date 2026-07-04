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
    local _ss_gitleaks_bin
    _ss_gitleaks_bin="$(command -v gitleaks)" || {
        ci_fail "gitleaks not found on PATH"
        return 1
    }

    # Dynamic .gitignore respect: git ls-files gives tracked files,
    # --others --exclude-standard gives untracked non-ignored files.
    local _ss_stderr_tmp
    _ss_stderr_tmp="$(mktemp)"
    local _ss_files
    _ss_files="$({ git ls-files; git ls-files --others --exclude-standard; } 2>"$_ss_stderr_tmp" | sort -u)"
    local _ss_git_rc=$?
    if [[ $_ss_git_rc -ne 0 ]]; then
        ci_fail "git ls-files failed"
        [[ -s "$_ss_stderr_tmp" ]] && cat "$_ss_stderr_tmp" >&2
        rm -f "$_ss_stderr_tmp"
        return 1
    fi
    rm -f "$_ss_stderr_tmp"

    if [[ -z "$_ss_files" ]]; then
        ci_pass "gitleaks: no files to scan"
        return 0
    fi

    local _ss_total
    _ss_total=$(printf '%s\n' "$_ss_files" | grep -c .)

    local _ss_rc=0
    # xargs -P4 parallelizes gitleaks across files for speed.
    # --log-level=error suppresses gitleaks INF/WRN status on stderr
    # (redundant with exit code); real errors still surface.
    # --verbose sends Finding blocks to stdout for the developer to see.
    printf '%s\n' "$_ss_files" | \
        xargs -P4 -I{} "$_ss_gitleaks_bin" dir {} \
        --no-banner --redact --verbose --log-level=error || _ss_rc=$?

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
