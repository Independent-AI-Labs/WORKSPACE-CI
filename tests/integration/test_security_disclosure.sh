#!/usr/bin/env bash
# Tests for ci_check_security_commit_disclosure (AUDIT R-5/R-6):
# security-control commits require the operator-review trailer and a
# known-defects statement in the commit message.
# All writes use absolute temp-repo paths: _source_lib changes cwd to
# the mirrored workspace, so relative writes would escape the sandbox.

echo ""
echo "--- test_security_commit_disclosure ---"

_sec_repo() {
    local repo="$TEST_TMP/secrepo"
    _scrub_dir "$repo"
    mkdir -p "$repo/lib" "$repo/docs" "$repo/config"
    git -C "$repo" init -q .
    echo "init" > "$repo/lib/seed.txt"
    git -C "$repo" add lib/seed.txt
    git -C "$repo" commit -q -m "$(printf 'feat: initial\n\nSetup.')"
    echo "$repo"
}

_write_msg() {
    echo "$1" > "$TEST_TMP/secmsg.txt"
}

# === non-security path: no trailer needed ===
_test_sec_plain_path_passes() {
    local repo; repo=$(_sec_repo)
    _source_lib
    echo "x" > "$repo/plain.txt"
    git -C "$repo" add plain.txt
    cd "$repo"
    _write_msg "$(printf 'feat: plain\n\nSome details here.')"
    ci_check_security_commit_disclosure "$TEST_TMP/secmsg.txt"
}
_run_test "sec-disclosure: non-security path passes" _test_sec_plain_path_passes

# === security path without trailer: rejected ===
_test_sec_missing_trailer_rejected() {
    local repo; repo=$(_sec_repo)
    _source_lib
    echo "x" > "$repo/lib/checks_core.sh"
    git -C "$repo" add lib/checks_core.sh
    cd "$repo"
    _write_msg "$(printf 'fix: gate\n\nSome details here.')"
    local rc=0
    ci_check_security_commit_disclosure "$TEST_TMP/secmsg.txt" > /dev/null 2>&1 || rc=$?
    _assert_eq "1" "$rc" "should reject missing trailer"
}
_run_test "sec-disclosure: missing trailer rejected" _test_sec_missing_trailer_rejected

# === security path without defects statement: rejected ===
_test_sec_missing_defects_rejected() {
    local repo; repo=$(_sec_repo)
    _source_lib
    echo "x" > "$repo/config/banned_words.yaml"
    git -C "$repo" add config/banned_words.yaml
    cd "$repo"
    _write_msg "$(printf 'fix: policy\n\nBody.\n\nOperator-Review: op 2026-08-21')"
    local rc=0
    ci_check_security_commit_disclosure "$TEST_TMP/secmsg.txt" > /dev/null 2>&1 || rc=$?
    _assert_eq "1" "$rc" "should reject missing defects statement"
}
_run_test "sec-disclosure: missing defects rejected" _test_sec_missing_defects_rejected

# === security path with both: passes ===
_test_sec_complete_passes() {
    local repo; repo=$(_sec_repo)
    _source_lib
    echo "x" > "$repo/lib/checks_core.sh"
    git -C "$repo" add lib/checks_core.sh
    cd "$repo"
    _write_msg "$(printf 'fix: gate\n\nBody.\n\nOperator-Review: op 2026-08-21\nNo known defects.')"
    ci_check_security_commit_disclosure "$TEST_TMP/secmsg.txt"
}
_run_test "sec-disclosure: trailer plus defects passes" _test_sec_complete_passes

# === known defects variant also passes ===
_test_sec_defects_variant_passes() {
    local repo; repo=$(_sec_repo)
    _source_lib
    echo "x" > "$repo/AGENTS.md"
    git -C "$repo" add AGENTS.md
    cd "$repo"
    _write_msg "$(printf 'docs: rules\n\nBody.\n\nOperator-Review: op 2026-08-21\nKnown defects: none observed in review window.')"
    ci_check_security_commit_disclosure "$TEST_TMP/secmsg.txt"
}
_run_test "sec-disclosure: Known defects variant passes" _test_sec_defects_variant_passes

# === requirements path also treated as security ===
_test_sec_spec_path_rejected_without_trailer() {
    local repo; repo=$(_sec_repo)
    _source_lib
    mkdir -p "$repo/docs/requirements"
    echo "x" > "$repo/docs/requirements/REQ-X.md"
    git -C "$repo" add docs/requirements/REQ-X.md
    cd "$repo"
    _write_msg "$(printf 'docs: req\n\nBody.')"
    local rc=0
    ci_check_security_commit_disclosure "$TEST_TMP/secmsg.txt" > /dev/null 2>&1 || rc=$?
    _assert_eq "1" "$rc" "should reject requirements change without trailer"
}
_run_test "sec-disclosure: requirements path covered" _test_sec_spec_path_rejected_without_trailer
