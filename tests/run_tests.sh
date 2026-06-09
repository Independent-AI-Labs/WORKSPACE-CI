#!/usr/bin/env bash
# CI Test Runner
# Runs all test suites and prints a summary.
#
# Usage: ./tests/run_tests.sh

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load framework
source "$TESTS_DIR/test_helpers.sh"

# Run test suites
source "$TESTS_DIR/test_core.sh"
source "$TESTS_DIR/test_checks.sh"
source "$TESTS_DIR/test_blocked_patterns.sh"
# SKIP: rewrite tests use git filter-branch which RUST-GUARD blocks
# source "$TESTS_DIR/test_rewrite_history.sh"
source "$TESTS_DIR/test_compliance.sh"
source "$TESTS_DIR/test_silent_swallow.sh"

# Summary
echo ""
echo "==========================================="
echo "  Tests: $_TESTS_RUN  Passed: $_TESTS_PASSED  Failed: $_TESTS_FAILED"
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
echo "All tests passed."
exit 0
