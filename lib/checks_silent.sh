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
# Scans all tracked files for silent error-swallowing patterns across Python,
# JavaScript/TypeScript, shell, and cron.
# Detects bare except/catch blocks, stderr-to-null redirects, and cron entries
# without log redirection using AST-based analysis.
# Blocks the commit so developers must re-raise, log, or handle errors
# explicitly.
#
# FAIL-CLOSED INVARIANT:
#   ci_run_python_checker guarantees that ANY non-zero Python exit code
#   (violations, crash, timeout, missing config) increments the error
#   counter. There is no code path where a non-zero exit is swallowed
#   as a clean pass. The prior bug (line 130 AND-gate on stdout) is
#   eliminated by structural design: the wrapper returns 1 on every
#   non-zero child exit, and this function increments errors on every
#   wrapper non-zero return.
ci_check_silent_swallow() {
    local files_tmp combined_tmp diff_tmp stderr_tmp
    files_tmp="$(mktemp)"
    combined_tmp="$(mktemp)"
    diff_tmp="$(mktemp)"
    stderr_tmp="$(mktemp)"

    # Git-repo check: capture stderr to an explicit temp file. On rc!=0 we print
    # the captured stderr (real signal, no swallow) and skip the check.
    local _gd_rc=0 _git_dir=""
    _git_dir="$(git rev-parse --git-dir 2>"$stderr_tmp")" || _gd_rc=$?
    if [[ $_gd_rc -ne 0 ]]; then
        ci_pass "Silent-swallow: not a git repo, skipping."
        [[ -s "$stderr_tmp" ]] && cat "$stderr_tmp" >&2
        rm -f "$files_tmp" "$combined_tmp" \
              "$diff_tmp" "$stderr_tmp"
        return 0
    fi
    rm -f "$stderr_tmp"

    local script_path="${CI_LIB_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}/check_silent_swallow.py"
    if [[ ! -f "$script_path" ]]; then
        ci_fail "Silent-swallow: helper script not found at $script_path"
        rm -f "$files_tmp" "$combined_tmp" "$diff_tmp"
        return 1
    fi

    # Config file validation: fail fast if the pattern config is missing.
    # This prevents entering the per-file loop where every file would crash
    # with FileNotFoundError. The Python checker (ci_paths.find_config_dir)
    # also resolves this via __file__ walk-up, but checking here gives a
    # clear, immediate error message.
    local _config_file
    _config_file="$(ci_config_path silent_swallow_patterns)" || {
        ci_fail "Silent-swallow: failed to resolve config path"
        rm -f "$files_tmp" "$combined_tmp" "$diff_tmp"
        return 1
    }
    if [[ ! -f "$_config_file" ]]; then
        ci_fail "Silent-swallow: config not found at $_config_file"
        rm -f "$files_tmp" "$combined_tmp" "$diff_tmp"
        return 1
    fi

    # Build file list: ALL tracked files (not just staged). Every swallowed
    # error is a bug, regardless of which file triggered the commit.
    # Pathspec filtering is delegated to the Python classifier
    # (lib/check_silent_swallow_system.py::is_shell_file) so extensionless
    # scripts (scripts/bootstrap-uv, scripts/audit-workspace, etc.) are
    # scanned per the §3.7 "hooks scan ALL files: no exceptions" rule.
    git ls-files --cached --others --exclude-standard > "$files_tmp"

    if [[ ! -s "$files_tmp" ]]; then
        ci_pass "Silent-swallow: no scannable files found."
        rm -f "$files_tmp" "$combined_tmp" "$diff_tmp"
        return 0
    fi

    # Read per-project exceptions from config/silent_swallow_exceptions.yaml.
    # Format mirrors banned_words_exceptions.yaml:
    #   exceptions:
    #     - paths: ['public/vendor/', 'other/path']
    # Provenance is validated fail-closed (root-owned + immutable).
    local -a _exc_paths=()
    local _exc_cfg="config/silent_swallow_exceptions.yaml"
    if ! ci_validate_exemption_file "$_exc_cfg" "silent_swallow_exceptions.yaml"; then
        rm -f "$files_tmp" "$combined_tmp" "$diff_tmp"
        return 1
    fi
    if [[ -f "$_exc_cfg" ]]; then
        local _exc_tmp
        _exc_tmp="$(mktemp)"
        sed -n "s/^\s*-\s*['\"]\(.*[^'\"]\)['\"]\s*$/\1/p" "$_exc_cfg" > "$_exc_tmp"
        while IFS= read -r _pat; do
            [[ -n "$_pat" ]] && _exc_paths+=("$_pat")
        done < "$_exc_tmp"
        rm -f "$_exc_tmp"
    fi

    local errors=0 file
    while IFS= read -r file; do
        [[ -z "$file" || ! -f "$file" ]] && continue
        # Skip binary files (prevents UnicodeDecodeError in Python checker)
        local _enc
        _enc="$(file --mime-encoding -b "$file")" || { echo "[silent-swallow] file --mime-encoding failed on $file" >&2; continue; }
        case "$_enc" in
            utf-8|us-ascii) ;;
            *) continue ;;
        esac
        # Default exemptions: tests may contain deliberate error patterns;
        # compose.yml has pre-existing patterns fixed incrementally.
        case "$file" in
            tests/*) continue ;;
            res/ansible/compose.yml) continue ;;
        esac
        # Per-project exemptions from config/silent_swallow_exceptions.yaml
        local _excluded=0
        for _pat in "${_exc_paths[@]}"; do
            if [[ "$file" == "$_pat"* ]]; then
                _excluded=1
                break
            fi
        done
        [[ $_excluded -eq 1 ]] && continue
        {
            echo "--- a/$file"
            echo "+++ b/$file"
            echo "@@ -0,0 +1,$(wc -l < "$file") @@"
            sed 's/^/+/' "$file"
        } > "$diff_tmp"

        # FAIL-CLOSED: ci_run_python_checker returns 0 IFF the Python
        # checker exits 0. Any non-zero exit (violations, crash, timeout,
        # missing config) returns 1. There is no code path where a
        # non-zero child exit is swallowed as a clean pass.
        #
        # The prior bug: `if [[ $_py_rc -ne 0 && -s "$violations_tmp" ]]`
        # gated error-counting on BOTH non-zero exit AND non-empty stdout.
        # A crash (FileNotFoundError, traceback on stderr, empty stdout)
        # fell through the AND-gate → errors never incremented →
        # function returned 0 = PASS. The silent-swallow hook was
        # silently swallowing its own checker's crash.
        #
        # The fix: errors is incremented on ANY non-zero wrapper return.
        # CI_CHECKER_STDOUT (violations) is collected for display when
        # non-empty; when empty, the crash is logged as a violation.
        ci_run_python_checker "$script_path" < "$diff_tmp"
        local _chk_rc=$?
        if [[ $_chk_rc -ne 0 ]]; then
            if [[ -s "$CI_CHECKER_STDOUT" ]]; then
                while IFS= read -r line; do
                    echo "$file: $line" >> "$combined_tmp"
                done < "$CI_CHECKER_STDOUT"
            else
                echo "$file: [CHECKER CRASHED exit=$_chk_rc] -- see stderr above" >> "$combined_tmp"
            fi
            errors=$((errors + 1))
        fi
        rm -f "$CI_CHECKER_STDOUT"
    done < "$files_tmp"

    rm -f "$files_tmp"

    if [[ $errors -eq 0 ]]; then
        ci_pass "Silent-swallow: no silent-error patterns found."
        rm -f "$combined_tmp" "$diff_tmp"
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
    rm -f "$combined_tmp" "$diff_tmp"
    return 1
}
