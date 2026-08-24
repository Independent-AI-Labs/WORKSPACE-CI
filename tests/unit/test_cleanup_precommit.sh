#!/usr/bin/env bash
# Unit tests for scripts/cleanup-precommit (operator-only migration aid
# restored from 89cd3e1^ per AUDIT-CAPABILITY-LOSS-2026-08-23).
#
# The script refuses non-interactive contexts; the agent test runner is
# one, so the refusal itself is the agent-runnable coverage. File-removal
# behavior is exercised with a fake HOME and a scratch repo inside the
# refusal-free paths via direct function sourcing is NOT possible (the
# refusal is top-level), so path behavior is verified structurally.

echo "=== cleanup-precommit tests ==="

_CLEANUP="$PROJECT_DIR/scripts/cleanup-precommit"

test_cleanup_precommit_refuses_non_interactive_agent_context() {
    # The test runner is non-interactive (no tty on stdin) and exports
    # a recognizable environment: the operator-only refusal must fire.
    local out rc=0
    out="$(bash "$_CLEANUP" </dev/null 2>&1)" || rc=$?
    [[ $rc -ne 0 ]] || { echo "expected refusal outside an interactive operator shell"; return 1; }
    echo "$out" | grep -q "operator-only"
}

test_cleanup_precommit_refusal_precedes_any_removal() {
    # Even with --remove-config and a present cache, a refused context
    # must not delete anything: the refusal is the first effectful check
    # after sourcing.
    local fake_home="$TEST_TMP/cpc-home"
    mkdir -p "$fake_home/.cache/pre-commit"
    touch "$fake_home/.cache/pre-commit/marker"
    local out rc=0
    out="$(HOME="$fake_home" bash "$_CLEANUP" --remove-config </dev/null 2>&1)" || rc=$?
    [[ $rc -ne 0 ]] || { echo "expected refusal"; return 1; }
    [[ -f "$fake_home/.cache/pre-commit/marker" ]] \
        || { echo "refused run still deleted the cache"; return 1; }
}

test_cleanup_precommit_keeps_config_source_semantics() {
    # The script must keep .pre-commit-config.yaml unless --remove-config
    # is passed: it is the config source for generate-hooks.
    local script
    script="$(cat "$_CLEANUP")"
    echo "$script" | grep -q -- '--remove-config'
    echo "$script" | grep -q 'rm -f .pre-commit-config.yaml'
    # Config removal must be gated behind the flag, not unconditional.
    echo "$script" | grep -q 'if \[\[ \$_remove_config -eq 1 \]\]; then' \
        || { echo "config removal gate missing"; return 1; }
    local ungated
    ungated="$(echo "$script" | grep -c 'rm -f .pre-commit-config.yaml')"
    [[ "$ungated" -eq 1 ]] \
        || { echo "config removal must appear exactly once (inside the gate)"; return 1; }
}

_run_test "cleanup-precommit refuses non-interactive agent context" test_cleanup_precommit_refuses_non_interactive_agent_context
_run_test "cleanup-precommit refusal precedes any removal" test_cleanup_precommit_refusal_precedes_any_removal
_run_test "cleanup-precommit keeps config source semantics" test_cleanup_precommit_keeps_config_source_semantics
