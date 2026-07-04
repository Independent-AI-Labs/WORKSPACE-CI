#!/usr/bin/env bash
# CI Integration Test Runner (real git repos, subprocess spawns, slower).
# Sourced by run_tests.sh. Also runnable directly.
#
# Usage: ./tests/run_tests_integration.sh

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load framework (resolves LIB_DIR from tests/../lib)
source "$TESTS_DIR/test_helpers.sh"

# Run integration test suites
source "$TESTS_DIR/integration/test_blocked_patterns.sh"
# SKIP: rewrite tests use git filter-branch which WORKSPACE-GUARD blocks
# source "$TESTS_DIR/integration/test_rewrite_history.sh"
source "$TESTS_DIR/integration/test_compliance.sh"
source "$TESTS_DIR/integration/test_e2e_checks.sh"
source "$TESTS_DIR/integration/test_silent_swallow.sh"
source "$TESTS_DIR/integration/test_fail_closed.sh"

# Summary
echo ""
echo "==========================================="
echo "  Integration Tests: $_TESTS_RUN  Passed: $_TESTS_PASSED  Failed: $_TESTS_FAILED"
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
echo "All integration tests passed."
exit 0
