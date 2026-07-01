#!/usr/bin/env bash
# CI Test Runner
# Runs unit tests first (fast, no git), then integration tests (slower,
# real git repos). Prints a combined summary.
#
# Usage: ./tests/run_tests.sh

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Run unit and integration suites as separate processes so their
# test counters are independent. Combined summary at the end.
_unit_rc=0
_integration_rc=0

bash "$TESTS_DIR/run_tests_unit.sh" || _unit_rc=$?
bash "$TESTS_DIR/run_tests_integration.sh" || _integration_rc=$?

echo ""
echo "==========================================="
if [[ $_unit_rc -eq 0 && $_integration_rc -eq 0 ]]; then
    echo "  All shell tests passed."
    echo "==========================================="
    exit 0
fi

echo "  FAILURES (unit_rc=$_unit_rc, integration_rc=$_integration_rc)"
echo "==========================================="
exit 1
