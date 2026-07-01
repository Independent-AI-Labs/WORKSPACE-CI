#!/usr/bin/env bash
# CI Unit Test Runner (shell only, no git subprocess, fast).
# Sourced by run_tests.sh. Also runnable directly.
#
# Usage: ./tests/run_tests_unit.sh

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load framework (resolves LIB_DIR from tests/../lib)
source "$TESTS_DIR/test_helpers.sh"

# Run unit test suites
source "$TESTS_DIR/unit/test_core.sh"
source "$TESTS_DIR/unit/test_checks.sh"
source "$TESTS_DIR/unit/test_portable_shell.sh"

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
