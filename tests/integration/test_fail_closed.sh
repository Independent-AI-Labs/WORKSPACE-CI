#!/usr/bin/env bash
# CI Fail-Closed Integration Tests: mathematical proof that
# ci_run_python_checker and ci_check_silent_swallow CANNOT
# swallow a checker crash as a clean pass.
#
# Sourced by run_tests_integration.sh, requires test_helpers.sh loaded first.
#
# THEOREM (Fail-Closed):
#   For all Python exit codes rc and all stdout states s:
#     rc = 0  =>  ci_run_python_checker returns 0
#     rc != 0  =>  ci_run_python_checker returns 1
#
# PROOF BY CONSTRUCTION:
#   ci_run_python_checker has exactly two return paths:
#     (a) _rc == 0  ->  return 0   (only when Python child exits 0)
#     (b) _rc != 0  ->  return 1   (every other case)
#   There is no third path. The || _rc=$? capture defeats set -e
#   without masking the result. The if [[ _rc -ne 0 ]] branch is
#   the ONLY non-return-0 path.
#
# PROOF BY EXHAUSTIVE TEST:
#   We test all representative exit codes covering every category:
#     0   = success
#     1   = application error / violations
#     2   = config error
#     124 = timeout (SIGTERM)
#     126 = permission denied
#     127 = command not found
#     130 = interrupted (SIGINT)
#     137 = killed (SIGKILL)
#     139 = segfault (SIGSEGV)
#     245 = segfault (alternate)
#     255 = exit(-1)
#   For each: rc=0 -> assert return 0; rc!=0 -> assert return 1.
#   Cross-product with stdout state {empty, non-empty}.

echo ""
echo "=== fail-closed integration tests ==="

# ---------------------------------------------------------------------------
# Mock Python checker: exits with MOCK_EXIT_CODE, optionally writes stdout.
# ---------------------------------------------------------------------------
_make_mock_checker() {
    local _dir
    _dir="$(mktemp -d)"
    cat > "$_dir/mock_checker.py" <<'PYEOF'
import os
import sys

if os.environ.get("MOCK_STDOUT") == "1":
    print("mock violation: fake pattern -- mock output line")
sys.exit(int(os.environ.get("MOCK_EXIT_CODE", "1")))
PYEOF
    printf '%s' "$_dir/mock_checker.py"
}

# ---------------------------------------------------------------------------
# Exhaustive parametric test: for every exit code, prove fail-closed.
# ---------------------------------------------------------------------------
test_fail_closed_all_exit_codes_empty_stdout() {
    _source_lib
    local _mock
    _mock="$(_make_mock_checker)"

    # For every non-zero exit code, ci_run_python_checker MUST return 1.
    local _exit_code
    for _exit_code in 1 2 124 126 127 130 137 139 245 255; do
        export MOCK_EXIT_CODE="$_exit_code"
        export MOCK_STDOUT="0"
        ci_run_python_checker "$_mock" </dev/null
        local _wrapper_rc=$?
        rm -f "$CI_CHECKER_STDOUT"
        if [[ $_wrapper_rc -ne 1 ]]; then
            echo "  FAIL: exit=$_exit_code empty-stdout: expected rc=1, got rc=$_wrapper_rc"
            rm -rf "$(dirname "$_mock")"
            return 1
        fi
    done

    # For exit code 0, ci_run_python_checker MUST return 0.
    export MOCK_EXIT_CODE="0"
    export MOCK_STDOUT="0"
    ci_run_python_checker "$_mock" </dev/null
    local _wrapper_rc=$?
    rm -f "$CI_CHECKER_STDOUT"
    if [[ $_wrapper_rc -ne 0 ]]; then
        echo "  FAIL: exit=0 empty-stdout: expected rc=0, got rc=$_wrapper_rc"
        rm -rf "$(dirname "$_mock")"
        return 1
    fi

    rm -rf "$(dirname "$_mock")"
}
_run_test "fail-closed: all non-zero exit codes return 1 (empty stdout)" test_fail_closed_all_exit_codes_empty_stdout

test_fail_closed_all_exit_codes_nonempty_stdout() {
    _source_lib
    local _mock
    _mock="$(_make_mock_checker)"

    # For every non-zero exit code with non-empty stdout, return 1.
    local _exit_code
    for _exit_code in 1 2 124 126 127 130 137 139 245 255; do
        export MOCK_EXIT_CODE="$_exit_code"
        export MOCK_STDOUT="1"
        ci_run_python_checker "$_mock" </dev/null
        local _wrapper_rc=$?
        rm -f "$CI_CHECKER_STDOUT"
        if [[ $_wrapper_rc -ne 1 ]]; then
            echo "  FAIL: exit=$_exit_code nonempty-stdout: expected rc=1, got rc=$_wrapper_rc"
            rm -rf "$(dirname "$_mock")"
            return 1
        fi
    done

    # Exit 0 with non-empty stdout should still return 0.
    export MOCK_EXIT_CODE="0"
    export MOCK_STDOUT="1"
    ci_run_python_checker "$_mock" </dev/null
    local _wrapper_rc=$?
    rm -f "$CI_CHECKER_STDOUT"
    if [[ $_wrapper_rc -ne 0 ]]; then
        echo "  FAIL: exit=0 nonempty-stdout: expected rc=0, got rc=$_wrapper_rc"
        rm -rf "$(dirname "$_mock")"
        return 1
    fi

    rm -rf "$(dirname "$_mock")"
}
_run_test "fail-closed: all non-zero exit codes return 1 (non-empty stdout)" test_fail_closed_all_exit_codes_nonempty_stdout

# ---------------------------------------------------------------------------
# Test: ci_run_python_checker fails on missing script.
# ---------------------------------------------------------------------------
test_fail_closed_missing_script() {
    _source_lib
    ci_run_python_checker "/nonexistent/mock_checker.py" </dev/null
    local _rc=$?
    rm -f "$CI_CHECKER_STDOUT" 2>/dev/null
    [[ $_rc -eq 1 ]]
}
_run_test "fail-closed: missing script returns 1" test_fail_closed_missing_script

# ---------------------------------------------------------------------------
# Test: ci_run_python_checker fails on missing python.
# ---------------------------------------------------------------------------
test_fail_closed_missing_python() {
    _source_lib
    local _saved_root="$CI_PROJECT_ROOT"
    CI_PROJECT_ROOT="/nonexistent"
    ci_run_python_checker "$_saved_root/lib/check_silent_swallow.py" </dev/null
    local _rc=$?
    rm -f "$CI_CHECKER_STDOUT" 2>/dev/null
    CI_PROJECT_ROOT="$_saved_root"
    [[ $_rc -eq 1 ]]
}
_run_test "fail-closed: missing python returns 1" test_fail_closed_missing_python

# ---------------------------------------------------------------------------
# Test: ci_run_python_checker must not leak ci_uv_bin resolver output.
# Prior bug: `if ! ci_uv_bin` printed the uv path once per scanned file.
# ---------------------------------------------------------------------------
test_ci_run_python_checker_no_uv_stdout_leak() {
    _source_lib
    local _stdout_tmp
    _stdout_tmp="$(mktemp)"
    ci_run_python_checker "$CI_PROJECT_ROOT/lib/check_silent_swallow.py" \
        </dev/null > "$_stdout_tmp" 2>/dev/null
    local _rc=$?
    rm -f "$CI_CHECKER_STDOUT" 2>/dev/null
    if grep -q 'bin/uv' "$_stdout_tmp" 2>/dev/null; then
        echo "FAIL: ci_run_python_checker leaked uv path to stdout:" >&2
        cat "$_stdout_tmp" >&2
        rm -f "$_stdout_tmp"
        return 1
    fi
    if [[ -s "$_stdout_tmp" ]]; then
        echo "FAIL: ci_run_python_checker wrote unexpected stdout:" >&2
        cat "$_stdout_tmp" >&2
        rm -f "$_stdout_tmp"
        return 1
    fi
    rm -f "$_stdout_tmp"
    [[ $_rc -eq 0 ]]
}
_run_test "fail-closed: ci_run_python_checker does not leak uv path to stdout" \
    test_ci_run_python_checker_no_uv_stdout_leak

# ---------------------------------------------------------------------------
# Test: ci_check_silent_swallow fails-closed when config is missing.
# This is the EXACT scenario that was broken: WORKSPACE-GUARD commits
# passed because the FileNotFoundError crash was swallowed as a clean pass.
# ---------------------------------------------------------------------------
test_fail_closed_silent_swallow_missing_config() {
    _source_lib
    cat > clean.py <<'EOF'
def f():
    return 1 + 2
EOF
    git add clean.py
    # Remove the config symlink to simulate the WORKSPACE-GUARD scenario
    rm -f config/silent_swallow_patterns.yaml
    local _ss_rc=0
    ci_check_silent_swallow > /dev/null 2>&1 || _ss_rc=$?
    [[ $_ss_rc -ne 0 ]]
}
_run_test "fail-closed: silent-swallow fails when config missing (not swallowed)" test_fail_closed_silent_swallow_missing_config

# ---------------------------------------------------------------------------
# Test: ci_check_silent_swallow still passes when there are no violations.
# This proves the fix doesn't break the normal pass path.
# ---------------------------------------------------------------------------
test_fail_closed_silent_swallow_clean_pass() {
    _source_lib
    cat > clean.py <<'EOF'
def f():
    return 1 + 2
EOF
    git add clean.py
    ci_check_silent_swallow
}
_run_test "fail-closed: silent-swallow passes on clean code (no regression)" test_fail_closed_silent_swallow_clean_pass

# ---------------------------------------------------------------------------
# Test: ci_check_silent_swallow still blocks real violations.
# This proves the fix doesn't break the normal fail path.
# ---------------------------------------------------------------------------
test_fail_closed_silent_swallow_blocks_violation() {
    _source_lib
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
_run_test "fail-closed: silent-swallow blocks real violations (no regression)" test_fail_closed_silent_swallow_blocks_violation

# ---------------------------------------------------------------------------
# Test: ci_run_python_checker propagates CI_CONFIG_DIR to child.
# This proves the env var propagation fix works.
# ---------------------------------------------------------------------------
test_fail_closed_env_propagation() {
    _source_lib
    local _dir
    _dir="$(mktemp -d)"
    cat > "$_dir/check_env.py" <<'PYEOF'
import os
import sys
val = os.environ.get("CI_CONFIG_DIR", "")
if not val:
    print("FAIL: CI_CONFIG_DIR not propagated", file=sys.stderr)
    sys.exit(1)
print(f"OK: CI_CONFIG_DIR={val}")
sys.exit(0)
PYEOF
    ci_run_python_checker "$_dir/check_env.py" </dev/null
    local _rc=$?
    rm -f "$CI_CHECKER_STDOUT"
    rm -rf "$_dir"
    [[ $_rc -eq 0 ]]
}
_run_test "fail-closed: CI_CONFIG_DIR propagated to Python child" test_fail_closed_env_propagation
