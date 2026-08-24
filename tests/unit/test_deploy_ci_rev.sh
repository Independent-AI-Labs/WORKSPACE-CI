#!/usr/bin/env bash
# Unit tests for the reviewed-ancestor rollback REV argument handling in
# scripts/deploy-ci (DECISION-REVIEWED-ANCESTOR-ROLLBACK-2026-08-24).
#
# Agent-runnable coverage: argument-parser refusals (validated before the
# root check by design) and source-structure assertions for the ancestry
# enforcement block. Functional ancestry refusal and the happy-path
# rollback deploy run in root/podman tiers (same split as
# tests/test_rewrite_history.sh).

echo "=== deploy-ci REV tests ==="

_DEPLOY="$PROJECT_DIR/scripts/deploy-ci"

# deploy-ci resolves its source root from the working directory; run the
# functional refusals from the real repository so they reach the argument
# parser (which precedes the root check) instead of dying at rev-parse.
_cd_repo() { cd "$PROJECT_DIR" || return 1; }

test_deploy_ci_rejects_unknown_argument() {
    _cd_repo
    local out rc=0
    out="$(bash "$_DEPLOY" --from-ansible --bogus 2>&1)" || rc=$?
    [[ $rc -ne 0 ]] || { echo "expected failure for unknown argument"; return 1; }
    echo "$out" | grep -q "unknown argument: --bogus"
}

test_deploy_ci_rejects_empty_rev() {
    _cd_repo
    local out rc=0
    out="$(bash "$_DEPLOY" --from-ansible --rev "" 2>&1)" || rc=$?
    [[ $rc -ne 0 ]] || { echo "expected failure for empty REV"; return 1; }
    echo "$out" | grep -q -- "--rev requires a commit argument"
    rc=0
    out="$(bash "$_DEPLOY" --from-ansible --rev= 2>&1)" || rc=$?
    [[ $rc -ne 0 ]] || { echo "expected failure for empty --rev="; return 1; }
    echo "$out" | grep -q -- "--rev requires a commit argument"
}

test_deploy_ci_rejects_missing_from_ansible() {
    _cd_repo
    local out rc=0
    out="$(bash "$_DEPLOY" --rev abc123 2>&1)" || rc=$?
    [[ $rc -ne 0 ]] || { echo "expected failure without --from-ansible"; return 1; }
    echo "$out" | grep -q "invoke through: make deploy-ci"
}

test_deploy_ci_arg_validation_precedes_root_check() {
    # Refusals must be reachable in unprivileged contexts: the parser
    # runs before the EUID gate (the two tests above prove it live;
    # this assertion pins the ordering so a reorder cannot regress it).
    local script
    script="$(cat "$_DEPLOY")"
    local parser_line root_line
    parser_line="$(echo "$script" | grep -n "unknown argument" | head -1 | cut -d: -f1)"
    root_line="$(echo "$script" | grep -n 'EUID -eq 0' | head -1 | cut -d: -f1)"
    [[ -n "$parser_line" && -n "$root_line" && "$parser_line" -lt "$root_line" ]] \
        || { echo "argument parser must precede the root check"; return 1; }
}

test_deploy_ci_rev_flow_enforces_ancestry() {
    local script
    script="$(cat "$_DEPLOY")"
    echo "$script" | grep -q 'merge-base --is-ancestor "$_rev" "origin/$BRANCH"' \
        || { echo "ancestry verification missing"; return 1; }
    echo "$script" | grep -q "REV is not a committed ancestor" \
        || { echo "ancestry refusal message missing"; return 1; }
    echo "$script" | grep -q "REV does not resolve to a commit" \
        || { echo "resolution refusal message missing"; return 1; }
    # The candidate must check out the resolved REV head, and the
    # default (no REV) path must keep the HEAD == origin/main check.
    echo "$script" | grep -q 'checkout --detach "$head"' \
        || { echo "candidate checkout must use the resolved head"; return 1; }
    echo "$script" | grep -q 'source HEAD must equal origin/main' \
        || { echo "default-path HEAD equality check missing"; return 1; }
}

test_run_deploy_ci_accepts_rev_argument() {
    local script
    script="$(cat "$PROJECT_DIR/scripts/run-deploy-ci")"
    echo "$script" | grep -q '\$# -eq 2 || \$# -eq 3' \
        || { echo "run-deploy-ci must accept an optional REV"; return 1; }
    echo "$script" | grep -q 'deploy_rev=' \
        || { echo "run-deploy-ci must pass deploy_rev through"; return 1; }
}

test_makefile_passes_rev() {
    local makefile
    makefile="$(cat "$PROJECT_DIR/Makefile")"
    echo "$makefile" | grep -q 'run-deploy-ci .*"\$(REV)"' \
        || { echo "Makefile must pass REV through"; return 1; }
}

_run_test "deploy-ci REV: rejects unknown argument" test_deploy_ci_rejects_unknown_argument
_run_test "deploy-ci REV: rejects empty REV" test_deploy_ci_rejects_empty_rev
_run_test "deploy-ci REV: rejects missing --from-ansible" test_deploy_ci_rejects_missing_from_ansible
_run_test "deploy-ci REV: arg validation precedes root check" test_deploy_ci_arg_validation_precedes_root_check
_run_test "deploy-ci REV: ancestry enforcement present" test_deploy_ci_rev_flow_enforces_ancestry
_run_test "run-deploy-ci: accepts and passes REV" test_run_deploy_ci_accepts_rev_argument
_run_test "Makefile: passes REV to run-deploy-ci" test_makefile_passes_rev
