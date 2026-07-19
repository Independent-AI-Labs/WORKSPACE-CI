# CI tests: ci_check_silent_swallow (e2e only)
# Sourced by run_tests_integration.sh, requires test_helpers.sh loaded first.
#
# Unit-pattern tests (44 synthetic diff pipe tests) moved to:
#   tests/unit/test_silent_swallow_patterns.py
# Those run in-process via pytest (~1s) instead of spawning 44 Python
# processes (~90s under PRoot).
#
# This file keeps ONLY end-to-end tests that exercise the real
# ci_check_silent_swallow bash function via actual git staging.

echo ""
echo "=== ci_check_silent_swallow e2e tests ==="

# ---------------------------------------------------------------------------
# _setup_silent_repo: build a fresh git repo with one initial commit, then
# leave the caller a clean tree to stage new content into.
# ---------------------------------------------------------------------------
_setup_silent_repo() {
    cd "$TEST_TMP/workspace/projects/CI"
    if [[ ! -d ".git" ]]; then
        git init -q .
        git config user.email "test@example.com"
        git config user.name "test"
        git add -A
        git commit -q -m "init" --allow-empty
    fi
    source lib/checks.sh
    _stub_exemption_provenance
}

# ---------------------------------------------------------------------------
# End-to-end: the actual `ci_check_silent_swallow` bash function via a real
# git stage.
# ---------------------------------------------------------------------------
test_silent_e2e_blocks_staged_violation() {
    _setup_silent_repo
    cat > bad.py <<'EOF'
def f():
    try:
        foo()
    except Exception:
        pass
EOF
    git add bad.py
    ! ci_check_silent_swallow
}
_run_test "silent: e2e blocks staged python silent except" test_silent_e2e_blocks_staged_violation

test_silent_e2e_passes_with_clean_diff() {
    _setup_silent_repo
    cat > clean.py <<'EOF'
def f():
    return 1 + 2
EOF
    git add clean.py
    ci_check_silent_swallow
}
_run_test "silent: e2e passes with clean diff" test_silent_e2e_passes_with_clean_diff

test_silent_e2e_blocks_shell_devnull() {
    _setup_silent_repo
    printf '#!/usr/bin/env bash\nsomecmd 2>%s\n' '/dev/null' > bad.sh
    git add bad.sh
    ! ci_check_silent_swallow
}
_run_test "silent: e2e blocks staged shell devnull redirect" test_silent_e2e_blocks_shell_devnull

test_silent_e2e_blocks_js_empty_catch() {
    _setup_silent_repo
    cat > bad.ts <<'EOF'
try { foo(); } catch (e) {}
EOF
    git add bad.ts
    ! ci_check_silent_swallow
}
_run_test "silent: e2e blocks staged JS empty catch" test_silent_e2e_blocks_js_empty_catch

test_silent_e2e_blocks_cron_no_redirect() {
    _setup_silent_repo
    cat > foo.cron <<'EOF'
*/5 * * * * /usr/bin/run-task.sh
EOF
    git add foo.cron
    ! ci_check_silent_swallow
}
_run_test "silent: e2e blocks staged cron without log redirect" test_silent_e2e_blocks_cron_no_redirect

test_silent_e2e_passes_cron_with_redirect() {
    _setup_silent_repo
    cat > foo.cron <<'EOF'
*/5 * * * * /usr/bin/run-task.sh >> /var/log/task.log 2>&1
EOF
    git add foo.cron
    ci_check_silent_swallow
}
_run_test "silent: e2e passes cron with log redirect" test_silent_e2e_passes_cron_with_redirect

test_silent_e2e_blocks_multiple_files() {
    _setup_silent_repo
    cat > bad1.py <<'EOF'
except Exception: pass
EOF
    printf '#!/usr/bin/env bash\nrm foo || %s\n' 'true' > bad2.sh
    git add bad1.py bad2.sh
    ! ci_check_silent_swallow
}
_run_test "silent: e2e blocks multiple staged violations" test_silent_e2e_blocks_multiple_files

test_silent_e2e_passes_no_staged_files() {
    _setup_silent_repo
    ci_check_silent_swallow
}
_run_test "silent: e2e passes with no staged files" test_silent_e2e_passes_no_staged_files
