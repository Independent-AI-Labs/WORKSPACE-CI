#!/usr/bin/env bash
# Tests for config-driven blocked commit patterns.
# Tests ci_block_coauthored (commit-msg) and ci_block_coauthored_history (pre-push).

_TEST_CONFIG="$PROJECT_DIR/config/blocked_commit_patterns.yaml"

# Helper: create a temp git repo
_make_bp_repo() {
    local repo="$TEST_TMP/repo"
    mkdir -p "$repo"
    cd "$repo"
    git init -q .
    git config user.email "test@test.com"
    git config user.name "Test"
    echo "init" > file.txt
    git add file.txt
    git commit -q -m "$(printf 'feat: initial\n\nSetup.')"
}

# Helper: write a commit message to a temp file
_write_msg() {
    echo "$1" > "$TEST_TMP/msg.txt"
}

echo ""
echo "--- test_blocked_patterns ---"

# === commit-msg: clean message passes ===
_test_bp_clean() {
    _source_lib
    _write_msg "$(printf 'feat: add feature\n\nSome details here.')"
    ci_block_coauthored "$TEST_TMP/msg.txt"
}
_run_test "blocked: clean message passes" _test_bp_clean

# === commit-msg: co-authored-by blocked ===
_test_bp_coauthored() {
    _source_lib
    _write_msg "$(printf 'feat: thing\n\nBody.\n\nCo-Authored-By: X <x@x.com>')"
    local rc=0
    ci_block_coauthored "$TEST_TMP/msg.txt" > /dev/null || rc=$?
    _assert_eq "1" "$rc" "should reject co-authored-by"
}
_run_test "blocked: co-authored-by caught" _test_bp_coauthored

# === commit-msg: anthropic email blocked ===
_test_bp_anthropic() {
    _source_lib
    _write_msg "$(printf 'feat: thing\n\nFrom noreply@anthropic.com')"
    local rc=0
    ci_block_coauthored "$TEST_TMP/msg.txt" > /dev/null || rc=$?
    _assert_eq "1" "$rc" "should reject anthropic email"
}
_run_test "blocked: anthropic email caught" _test_bp_anthropic

# === commit-msg: claude attribution blocked ===
_test_bp_claude() {
    _source_lib
    _write_msg "$(printf 'feat: thing\n\nGenerated with Claude Code')"
    local rc=0
    ci_block_coauthored "$TEST_TMP/msg.txt" > /dev/null || rc=$?
    _assert_eq "1" "$rc" "should reject claude attribution"
}
_run_test "blocked: claude attribution caught" _test_bp_claude

# === commit-msg: case insensitive ===
_test_bp_case() {
    _source_lib
    _write_msg "$(printf 'feat: thing\n\nCO-AUTHORED-BY: X <x@x.com>')"
    local rc=0
    ci_block_coauthored "$TEST_TMP/msg.txt" > /dev/null || rc=$?
    _assert_eq "1" "$rc" "should catch uppercase"
}
_run_test "blocked: case insensitive" _test_bp_case

# === commit-msg: separator variants ===
_test_bp_underscore() {
    _source_lib
    _write_msg "$(printf 'feat: thing\n\nCo_Authored_By: X <x@x.com>')"
    local rc=0
    ci_block_coauthored "$TEST_TMP/msg.txt" > /dev/null || rc=$?
    _assert_eq "1" "$rc" "should catch underscore variant"
}
_run_test "blocked: underscore separator caught" _test_bp_underscore

# Helper: simulate git pre-push stdin for a push range.
# Usage: _push_stdin <local_sha> [remote_sha]
# If remote_sha is omitted, uses null SHA (new branch).
_push_stdin() {
    local local_sha="$1"
    local zero="0000000000000000000000000000000000000000"
    local remote_sha="${2:-$zero}"
    echo "refs/heads/main $local_sha refs/heads/main $remote_sha"
}

# === history: clean history passes ===
_test_bph_clean() {
    _make_bp_repo
    echo "a" >> file.txt && git add file.txt
    git commit -q -m "$(printf 'feat: clean\n\nAll good.')"
    local head_sha; head_sha="$(git rev-parse HEAD)"
    source "$PROJECT_DIR/lib/checks.sh"
    local rc=0
    _push_stdin "$head_sha" | ci_block_coauthored_history > /dev/null || rc=$?
    _assert_eq "0" "$rc" "clean history should pass"
}
_run_test "blocked-history: clean history passes" _test_bph_clean

# === history: catches violation anywhere ===
_test_bph_violation() {
    _make_bp_repo
    local base_sha; base_sha="$(git rev-parse HEAD)"
    echo "a" >> file.txt && git add file.txt
    git commit -q -m "$(printf 'feat: bad\n\nCo-Authored-By: X <x@x.com>')"
    echo "b" >> file.txt && git add file.txt
    git commit -q -m "$(printf 'feat: clean after\n\nOK.')"
    local head_sha; head_sha="$(git rev-parse HEAD)"
    source "$PROJECT_DIR/lib/checks.sh"
    local rc=0
    _push_stdin "$head_sha" "$base_sha" | ci_block_coauthored_history > /dev/null || rc=$?
    _assert_eq "1" "$rc" "should catch violation in push range"
}
_run_test "blocked-history: catches violation anywhere" _test_bph_violation

# === history: multiple violations counted ===
_test_bph_multi() {
    _make_bp_repo
    local base_sha; base_sha="$(git rev-parse HEAD)"
    echo "a" >> file.txt && git add file.txt
    git commit -q -m "$(printf 'feat: bad1\n\nCo-Authored-By: A <a@a.com>')"
    echo "b" >> file.txt && git add file.txt
    git commit -q -m "$(printf 'feat: bad2\n\nnoreply@anthropic.com')"
    local head_sha; head_sha="$(git rev-parse HEAD)"
    source "$PROJECT_DIR/lib/checks.sh"
    local rc=0
    local output
    local _stdout=""
    _stdout="$(_push_stdin "$head_sha" "$base_sha" | ci_block_coauthored_history 2>"$TEST_TMP/err")" || rc=$?
    output="${_stdout}$(cat "$TEST_TMP/err")"
    _assert_eq "1" "$rc" "should fail with multiple violations"
    if ! echo "$output" | grep -q '2 commit'; then
        echo "FAIL: should report 2 violations"
        echo "$output"
        return 1
    fi
}
_run_test "blocked-history: multiple violations counted" _test_bph_multi

# === history: new branch (null remote sha) ===
_test_bph_new_branch() {
    _make_bp_repo
    echo "a" >> file.txt && git add file.txt
    git commit -q -m "$(printf 'feat: clean\n\nOK.')"
    local head_sha; head_sha="$(git rev-parse HEAD)"
    source "$PROJECT_DIR/lib/checks.sh"
    local rc=0
    _push_stdin "$head_sha" | ci_block_coauthored_history > /dev/null || rc=$?
    _assert_eq "0" "$rc" "clean new branch should pass"
}
_run_test "blocked-history: new branch handles null sha" _test_bph_new_branch
