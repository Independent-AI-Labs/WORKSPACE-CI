#!/usr/bin/env bash
# CI Unit Test Runner (shell only, no git subprocess, fast).
# Sourced by run_tests.sh. Also runnable directly.
#
# Usage: ./tests/run_tests_unit.sh

_SELF="${BASH_SOURCE[0]:-$0}"
case "$_SELF" in /proc/self/fd/*) _SELF="${SHG_SCRIPT_PATH:-$_SELF}" ;; esac
TESTS_DIR="$(cd "$(dirname "$_SELF")" && pwd)"

# Load framework (resolves LIB_DIR from tests/../lib)
source "$TESTS_DIR/test_helpers.sh"

# Run unit test suites
source "$TESTS_DIR/unit/test_core.sh"
source "$TESTS_DIR/unit/test_checks.sh"
source "$TESTS_DIR/unit/test_checks_dead_code.sh"
source "$TESTS_DIR/unit/test_cve_scan.sh"
source "$TESTS_DIR/unit/test_reinstall_hooks.sh"
source "$TESTS_DIR/unit/test_portable_shell.sh"
source "$TESTS_DIR/unit/test_resolve_tool_path.sh"
source "$TESTS_DIR/unit/test_generate_hooks.sh"
source "$TESTS_DIR/unit/test_scaffold_ci.sh"
source "$TESTS_DIR/unit/test_scaffold_ci_gen.sh"
source "$TESTS_DIR/unit/test_scaffold_ci_inspect.sh"
source "$TESTS_DIR/unit/test_scaffold_ci_force.sh"

# Summary
echo ""
echo "==========================================="
echo "  Unit Tests: $_TESTS_RUN  Passed: $_TESTS_PASSED  Failed: $_TESTS_FAILED"
echo "==========================================="

if [[ $_TESTS_FAILED -gt 0 ]]; then
    echo ""
    echo "Failed tests:"
    for f in "${_FAILURES[@]}"; do
        echo "  - $f"
    done
    exit 1
fi

echo ""
echo "All unit tests passed."
exit 0
