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
    local violations_tmp files_tmp combined_tmp diff_tmp
    violations_tmp="$(mktemp)"
    files_tmp="$(mktemp)"
    combined_tmp="$(mktemp)"
    diff_tmp="$(mktemp)"

    if ! git rev-parse --git-dir >/dev/null 2>&1; then
        ci_pass "Silent-swallow: not a git repo, skipping."
        rm -f "$violations_tmp" "$files_tmp" "$combined_tmp"
        return 0
    fi

    local script_path="${CI_LIB_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}/check_silent_swallow.py"
    if [[ ! -f "$script_path" ]]; then
        ci_fail "Silent-swallow: helper script not found at $script_path"
        rm -f "$violations_tmp" "$files_tmp" "$combined_tmp"
        return 1
    fi

    # Build file list: staged .sh, .py, .yml, .yaml, Makefile, Dockerfile
    {
        git diff --cached --name-only -- '*.sh' '*.py' '*.yml' '*.yaml' 'Makefile' 'Dockerfile'
    } > "$files_tmp"

    if [[ ! -s "$files_tmp" ]]; then
        ci_pass "Silent-swallow: no scannable files found."
        rm -f "$files_tmp" "$violations_tmp" "$combined_tmp"
        return 0
    fi

    local rc=0 errors=0 file
    while IFS= read -r file; do
        [[ -z "$file" || ! -f "$file" ]] && continue
        [[ "$file" == tests/* ]] && continue
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
        python3 "$script_path" < "$diff_tmp" > "$violations_tmp" 2>&1 || rc=$?
        if [[ $rc -ne 0 && -s "$violations_tmp" ]]; then
            while IFS= read -r line; do
                echo "$file: $line" >> "$combined_tmp"
            done < "$violations_tmp"
            errors=$((errors + 1))
        fi
        : > "$violations_tmp"
        rc=0
    done < "$files_tmp"

    rm -f "$files_tmp"

    if [[ $errors -eq 0 ]]; then
        ci_pass "Silent-swallow: no silent-error patterns found."
        rm -f "$violations_tmp" "$combined_tmp"
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
    rm -f "$violations_tmp" "$combined_tmp"
    return 1
}
