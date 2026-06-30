#!/usr/bin/env bash
# CI Silent-Error-Swallow check.
#
# Sourced by checks.sh. Requires ci.sh to be loaded first.
#
# Motivation: silent except/catch/pipe-true patterns (and cron lines without a
# log redirect) are a common source of production failures.
#
# This check scans ALL tracked files. Every swallowed error is a bug.
#
# --- ci_check_silent_swallow ---
# Exits 0 if no violations, 1 otherwise.
ci_check_silent_swallow() {
    local violations_tmp files_tmp combined_tmp diff_tmp stderr_tmp
    violations_tmp="$(mktemp)"
    files_tmp="$(mktemp)"
    combined_tmp="$(mktemp)"
    diff_tmp="$(mktemp)"
    stderr_tmp="$(mktemp)"

    # Git-repo check: capture stderr to an explicit temp file (no >/dev/null
    # 2>&1 suppression per AGENTS.md §3.1). On rc!=0 we print the captured
    # stderr (real signal, no swallow) and skip the check.
    local _gd_rc=0
    git rev-parse --git-dir >/dev/null 2>"$stderr_tmp" || _gd_rc=$?
    if [[ $_gd_rc -ne 0 ]]; then
        ci_pass "Silent-swallow: not a git repo, skipping."
        [[ -s "$stderr_tmp" ]] && cat "$stderr_tmp" >&2
        rm -f "$violations_tmp" "$files_tmp" "$combined_tmp" \
              "$diff_tmp" "$stderr_tmp"
        return 0
    fi
    rm -f "$stderr_tmp"

    local script_path="${CI_LIB_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}/check_silent_swallow.py"
    if [[ ! -f "$script_path" ]]; then
        ci_fail "Silent-swallow: helper script not found at $script_path"
        rm -f "$violations_tmp" "$files_tmp" "$combined_tmp" "$diff_tmp"
        return 1
    fi

    # Resolve the canonical CI venv python (NO `python3` bare-word per
    # AGENTS.md §3.3). Same-project direct invocation per AGENTS.md §4.1.
    local _ci_py="${CI_PROJECT_ROOT:-}/.venv/bin/python"
    if [[ ! -x "$_ci_py" ]]; then
        ci_fail "Silent-swallow: CI venv python not found at $_ci_py"
        rm -f "$violations_tmp" "$files_tmp" "$combined_tmp" "$diff_tmp"
        return 1
    fi

    # Build file list: ALL staged files. Pathspec filtering is delegated to
    # the Python classifier (lib/check_silent_swallow_system.py::is_shell_file)
    # so extensionless scripts (scripts/bootstrap-uv, scripts/audit-workspace,
    # etc.) are scanned per the §3.7 "hooks scan ALL files — no exceptions" rule.
    git diff --cached --name-only > "$files_tmp"

    if [[ ! -s "$files_tmp" ]]; then
        ci_pass "Silent-swallow: no scannable files found."
        rm -f "$files_tmp" "$violations_tmp" "$combined_tmp" "$diff_tmp"
        return 0
    fi

    local rc=0 errors=0 file
    while IFS= read -r file; do
        [[ -z "$file" || ! -f "$file" ]] && continue
        # Exempt files where detector produces known false positives.
        # These should be customized per-project via config, not hardcoded.
        # TODO: read exceptions from a per-project silent_swallow_exceptions.yaml
        case "$file" in
            tests/*) continue ;;  # Tests may contain deliberate error patterns
            res/ansible/compose.yml) continue ;;  # Pre-existing patterns — fix incremental
        esac
        {
            echo "--- a/$file"
            echo "+++ b/$file"
            echo "@@ -0,0 +1,$(wc -l < "$file") @@"
            sed 's/^/+/' "$file"
        } > "$diff_tmp"
        local _py_err _py_rc=0
        _py_err="$(mktemp)"
        "$_ci_py" "$script_path" < "$diff_tmp" > "$violations_tmp" 2>"$_py_err" \
            || _py_rc=$?
        if [[ $_py_rc -ne 0 ]]; then
            # Python checkers may emit findings to stdout, or fail with an
            # infra message on stderr. Print stderr (real signal, no swallow)
            # and consume stdout as violations.
            if [[ -s "$_py_err" ]]; then
                _log_warn_prefix="[silent-swallow: $file] helper stderr:"
                printf '%s\n' "$_log_warn_prefix" >&2
                cat "$_py_err" >&2
            fi
        fi
        rm -f "$_py_err"
        rc=0
        if [[ $_py_rc -ne 0 && -s "$violations_tmp" ]]; then
            while IFS= read -r line; do
                echo "$file: $line" >> "$combined_tmp"
            done < "$violations_tmp"
            errors=$((errors + 1))
        fi
        : > "$violations_tmp"
    done < "$files_tmp"

    rm -f "$files_tmp"

    if [[ $errors -eq 0 ]]; then
        ci_pass "Silent-swallow: no silent-error patterns found."
        rm -f "$violations_tmp" "$combined_tmp" "$diff_tmp"
        return 0
    fi

    echo ""
    ci_fail "Silent-swallow: $errors file(s) with violations:"
    echo ""
    cat "$combined_tmp"
    echo ""
    echo "Silent-error swallowing breaks production debuggability."
    echo "Re-raise, log, or handle the error explicitly."
    echo ""
    rm -f "$violations_tmp" "$combined_tmp" "$diff_tmp"
    return 1
}
