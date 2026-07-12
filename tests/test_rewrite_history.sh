#!/usr/bin/env bash
# Tests for scripts/rewrite-history
# Each test creates a fresh git repo in a temp dir, makes commits, runs the
# rewriter, and verifies the results.

_REWRITE="$PROJECT_DIR/scripts/rewrite-history"
_TEST_CONFIG="$PROJECT_DIR/config/blocked_commit_patterns.yaml"
export WORKSPACE_GUARD_ADMIN=1

# Helper: create a temp git repo with git config
_make_repo() {
    local repo="$TEST_TMP/repo"
    mkdir -p "$repo"
    cd "$repo"
    git init -q .
    git config user.email "test@test.com"
    git config user.name "Test"
    echo "init" > file.txt
    git add file.txt
    git commit -q -m "feat: initial commit

Initial setup."
}

# Helper: add a commit with a specific message
_add_commit() {
    local msg="$1"
    echo "$RANDOM" >> "$TEST_TMP/repo/file.txt"
    cd "$TEST_TMP/repo"
    git add file.txt
    git commit -q -m "$msg"
}

# Helper: get message of a commit by position from HEAD (0=HEAD, 1=HEAD~1, ...)
_get_msg() {
    local n="${1:-0}"
    cd "$TEST_TMP/repo"
    git log -1 --format=%B "HEAD~${n}" 2>/dev/null | head -c 2000
}

# Helper: count commits
_count_commits() {
    cd "$TEST_TMP/repo"
    git rev-list --count HEAD
}

echo ""
echo "--- test_rewrite_history ---"

# === Test: single offending commit ===
_test_single_offending() {
    _make_repo
    _add_commit "$(printf 'feat: add feature\n\nSome details.\n\nCo-Authored-By: Bot <bot@example.com>')"
    cd "$TEST_TMP/repo"
    bash "$_REWRITE" --execute --yes --config "$_TEST_CONFIG" > /dev/null 2>&1
    local msg
    msg="$(_get_msg 0)"
    # co-authored line should be gone
    if echo "$msg" | grep -qiE 'co.author'; then
        echo "FAIL: co-authored line still present"
        return 1
    fi
    # title and body should be preserved
    if ! echo "$msg" | grep -q 'feat: add feature'; then
        echo "FAIL: title lost"
        return 1
    fi
    if ! echo "$msg" | grep -q 'Some details'; then
        echo "FAIL: body lost"
        return 1
    fi
}
_run_test "rewrite: single offending commit" _test_single_offending

# === Test: multiple offending commits ===
_test_multiple_offending() {
    _make_repo
    _add_commit "$(printf 'feat: clean one\n\nNo issues.')"
    _add_commit "$(printf 'fix: bad one\n\nCo-Authored-By: X <x@x.com>')"
    _add_commit "$(printf 'feat: another bad\n\nnoreply@anthropic.com was here')"
    cd "$TEST_TMP/repo"
    bash "$_REWRITE" --execute --yes --config "$_TEST_CONFIG" > /dev/null 2>&1
    # Check each commit
    local msg0 msg1 msg2
    msg0="$(_get_msg 0)"
    msg1="$(_get_msg 1)"
    msg2="$(_get_msg 2)"
    # HEAD and HEAD~1 should be cleaned
    if echo "$msg0" | grep -qiE 'anthropic'; then return 1; fi
    if echo "$msg1" | grep -qiE 'co.author'; then return 1; fi
    # HEAD~2 should be untouched (clean)
    if ! echo "$msg2" | grep -q 'clean one'; then return 1; fi
}
_run_test "rewrite: multiple offending commits" _test_multiple_offending

# === Test: no offending commits ===
_test_no_offending() {
    _make_repo
    _add_commit "$(printf 'feat: clean\n\nAll good.')"
    _add_commit "$(printf 'fix: also clean\n\nNothing wrong.')"
    cd "$TEST_TMP/repo"
    local rc=0
    bash "$_REWRITE" --config "$_TEST_CONFIG" > /dev/null 2>&1 || rc=$?
    # Should exit 0 (nothing to do)
    _assert_eq "0" "$rc" "expected exit 0 for clean history"
}
_run_test "rewrite: no offending commits" _test_no_offending

# === Test: pattern in middle of body ===
_test_middle_body() {
    _make_repo
    _add_commit "$(printf 'feat: thing\n\nFirst paragraph.\nCo-Authored-By: X <x@x.com>\nSecond paragraph.')"
    cd "$TEST_TMP/repo"
    bash "$_REWRITE" --execute --yes --config "$_TEST_CONFIG" > /dev/null 2>&1
    local msg
    msg="$(_get_msg 0)"
    if echo "$msg" | grep -qiE 'co.author'; then return 1; fi
    if ! echo "$msg" | grep -q 'First paragraph'; then
        echo "FAIL: first paragraph lost"
        return 1
    fi
    if ! echo "$msg" | grep -q 'Second paragraph'; then
        echo "FAIL: second paragraph lost"
        return 1
    fi
}
_run_test "rewrite: pattern in middle of body" _test_middle_body

# === Test: multiple blocked lines in one commit ===
_test_multi_lines() {
    _make_repo
    _add_commit "$(printf 'feat: multi\n\nBody text.\n\nCo-Authored-By: A <a@a.com>\nnoreply@anthropic.com')"
    cd "$TEST_TMP/repo"
    bash "$_REWRITE" --execute --yes --config "$_TEST_CONFIG" > /dev/null 2>&1
    local msg
    msg="$(_get_msg 0)"
    if echo "$msg" | grep -qiE 'co.author|anthropic'; then return 1; fi
    if ! echo "$msg" | grep -q 'Body text'; then return 1; fi
}
_run_test "rewrite: multiple blocked lines in one commit" _test_multi_lines

# === Test: dry-run does not modify ===
_test_dry_run() {
    _make_repo
    _add_commit "$(printf 'feat: bad\n\nCo-Authored-By: X <x@x.com>')"
    cd "$TEST_TMP/repo"
    local before_sha
    before_sha="$(git rev-parse HEAD)"
    local _rewrite_rc=0
    bash "$_REWRITE" --config "$_TEST_CONFIG" > /dev/null 2>&1 || _rewrite_rc=$?
    local after_sha
    after_sha="$(git rev-parse HEAD)"
    _assert_eq "$before_sha" "$after_sha" "dry-run should not change HEAD"
}
_run_test "rewrite: dry-run does not modify" _test_dry_run

# === Test: mixed case patterns ===
_test_mixed_case() {
    _make_repo
    _add_commit "$(printf 'feat: upper\n\nCO-AUTHORED-BY: X <x@x.com>')"
    cd "$TEST_TMP/repo"
    bash "$_REWRITE" --execute --yes --config "$_TEST_CONFIG" > /dev/null 2>&1
    local msg
    msg="$(_get_msg 0)"
    if echo "$msg" | grep -qiE 'co.author'; then return 1; fi
}
_run_test "rewrite: mixed case caught" _test_mixed_case

# === Test: separator variants ===
_test_separators() {
    _make_repo
    _add_commit "$(printf 'feat: sep1\n\nCo_Authored_By: X <x@x.com>')"
    _add_commit "$(printf 'feat: sep2\n\nCo Authored By: Y <y@y.com>')"
    cd "$TEST_TMP/repo"
    bash "$_REWRITE" --execute --yes --config "$_TEST_CONFIG" > /dev/null 2>&1
    local msg0 msg1
    msg0="$(_get_msg 0)"
    msg1="$(_get_msg 1)"
    if echo "$msg0" | grep -qiE 'co.author'; then return 1; fi
    if echo "$msg1" | grep -qiE 'co.author'; then return 1; fi
}
_run_test "rewrite: separator variants caught" _test_separators

# === Test: empty body after removal ===
_test_empty_body() {
    _make_repo
    _add_commit "$(printf 'feat: only trailer\n\nCo-Authored-By: X <x@x.com>')"
    cd "$TEST_TMP/repo"
    bash "$_REWRITE" --execute --yes --config "$_TEST_CONFIG" > /dev/null 2>&1
    local msg
    msg="$(_get_msg 0)"
    # Title should survive
    if ! echo "$msg" | grep -q 'feat: only trailer'; then return 1; fi
}
_run_test "rewrite: empty body after removal" _test_empty_body

# === Test: base SHA limits range ===
_test_base_sha() {
    _make_repo
    _add_commit "$(printf 'feat: old bad\n\nCo-Authored-By: Old <old@x.com>')"
    local base_sha
    cd "$TEST_TMP/repo"
    base_sha="$(git rev-parse HEAD)"
    _add_commit "$(printf 'feat: new bad\n\nCo-Authored-By: New <new@x.com>')"
    bash "$_REWRITE" --execute --yes --base "$base_sha" --config "$_TEST_CONFIG" > /dev/null 2>&1
    local msg_new msg_old
    msg_new="$(_get_msg 0)"
    msg_old="$(_get_msg 1)"
    # New commit should be cleaned
    if echo "$msg_new" | grep -qiE 'co.author'; then
        echo "FAIL: new commit not cleaned"
        return 1
    fi
    # Old commit (before base) should be untouched
    if ! echo "$msg_old" | grep -qiE 'co.author'; then
        echo "FAIL: old commit was rewritten (should be out of range)"
        return 1
    fi
}
_run_test "rewrite: base SHA limits range" _test_base_sha

# === Test: preserves commit metadata ===
_test_preserves_metadata() {
    _make_repo
    cd "$TEST_TMP/repo"
    git config user.name "SpecificAuthor"
    git config user.email "specific@author.com"
    _add_commit "$(printf 'feat: authored\n\nDetails.\n\nCo-Authored-By: X <x@x.com>')"
    local before_author before_date
    before_author="$(git log -1 --format='%an <%ae>')"
    before_date="$(git log -1 --format='%aI')"
    bash "$_REWRITE" --execute --yes --config "$_TEST_CONFIG" > /dev/null 2>&1
    local after_author after_date
    after_author="$(git log -1 --format='%an <%ae>')"
    after_date="$(git log -1 --format='%aI')"
    _assert_eq "$before_author" "$after_author" "author changed"
    _assert_eq "$before_date" "$after_date" "date changed"
}
_run_test "rewrite: preserves author and date" _test_preserves_metadata

# === Test: backup branch created ===
_test_backup_created() {
    _make_repo
    _add_commit "$(printf 'feat: bad\n\nCo-Authored-By: X <x@x.com>')"
    cd "$TEST_TMP/repo"
    local before_sha
    before_sha="$(git rev-parse HEAD)"
    bash "$_REWRITE" --execute --yes --config "$_TEST_CONFIG" > /dev/null 2>&1
    # A refs/backup/pre-rewrite-* ref should exist
    local backup_ref
    backup_ref="$(git for-each-ref --format='%(refname)' 'refs/backup/pre-rewrite-*' | head -1)"
    if [[ -z "$backup_ref" ]]; then
        echo "FAIL: no backup ref found"
        return 1
    fi
    # Backup should point to the original HEAD
    local backup_sha
    backup_sha="$(git rev-parse "$backup_ref")"
    _assert_eq "$before_sha" "$backup_sha" "backup does not point to original HEAD"
}
_run_test "rewrite: backup branch created" _test_backup_created

# === Test: backup restore works ===
_test_backup_restore() {
    _make_repo
    _add_commit "$(printf 'feat: bad\n\nCo-Authored-By: X <x@x.com>')"
    cd "$TEST_TMP/repo"
    local before_sha
    before_sha="$(git rev-parse HEAD)"
    bash "$_REWRITE" --execute --yes --config "$_TEST_CONFIG" > /dev/null 2>&1
    # HEAD should have changed
    local after_sha
    after_sha="$(git rev-parse HEAD)"
    if [[ "$before_sha" == "$after_sha" ]]; then
        echo "FAIL: HEAD unchanged after rewrite"
        return 1
    fi
    # Restore: point current branch at backup SHA via update-ref
    local backup_ref backup_sha _branch
    backup_ref="$(git for-each-ref --format='%(refname)' 'refs/backup/pre-rewrite-*' | head -1)"
    backup_sha="$(git rev-parse "$backup_ref")"
    _branch="$(git symbolic-ref HEAD)"
    git update-ref "$_branch" "$backup_sha"
    local restored_sha
    restored_sha="$(git rev-parse HEAD)"
    _assert_eq "$before_sha" "$restored_sha" "restore did not recover original"
}
_run_test "rewrite: backup restore recovers original" _test_backup_restore

# === Test: dirty worktree rejected ===
_test_dirty_worktree() {
    _make_repo
    _add_commit "$(printf 'feat: bad\n\nCo-Authored-By: X <x@x.com>')"
    cd "$TEST_TMP/repo"
    echo "dirty" >> file.txt  # unstaged change
    local rc=0
    bash "$_REWRITE" --execute --yes --config "$_TEST_CONFIG" > /dev/null 2>&1 || rc=$?
    if [[ $rc -eq 0 ]]; then
        echo "FAIL: should have rejected dirty worktree"
        return 1
    fi
    # Verify no backup was created (rejected before rewrite)
    local backup_count
    backup_count="$(git for-each-ref 'refs/backup/pre-rewrite-*' | wc -l | tr -d ' ')"
    _assert_eq "0" "$backup_count" "backup should not exist after rejection"
}
_run_test "rewrite: dirty worktree rejected" _test_dirty_worktree

# === Test: default is dry-run (no --execute) ===
_test_default_dryrun() {
    _make_repo
    _add_commit "$(printf 'feat: bad\n\nCo-Authored-By: X <x@x.com>')"
    cd "$TEST_TMP/repo"
    local before_sha
    before_sha="$(git rev-parse HEAD)"
    local _rewrite_rc=0
    bash "$_REWRITE" --config "$_TEST_CONFIG" > /dev/null 2>&1 || _rewrite_rc=$?
    local after_sha
    after_sha="$(git rev-parse HEAD)"
    _assert_eq "$before_sha" "$after_sha" "default mode should not change HEAD"
    # No backup should exist
    local backup_count
    backup_count="$(git for-each-ref 'refs/backup/pre-rewrite-*' | wc -l | tr -d ' ')"
    _assert_eq "0" "$backup_count" "no backup in dry-run"
}
_run_test "rewrite: default is dry-run" _test_default_dryrun

# === Test: confirmation rejected ===
_test_confirmation_no() {
    _make_repo
    _add_commit "$(printf 'feat: bad\n\nCo-Authored-By: X <x@x.com>')"
    cd "$TEST_TMP/repo"
    local before_sha
    before_sha="$(git rev-parse HEAD)"
    local _echo_rewrite_rc=0
    echo "n" | bash "$_REWRITE" --execute --config "$_TEST_CONFIG" > /dev/null 2>&1 || _echo_rewrite_rc=$?
    local after_sha
    after_sha="$(git rev-parse HEAD)"
    _assert_eq "$before_sha" "$after_sha" "rejected confirmation should not change HEAD"
}
_run_test "rewrite: confirmation rejected aborts" _test_confirmation_no

# === Test: unicode in message preserved ===
_test_unicode() {
    _make_repo
    _add_commit "$(printf 'feat: add emoji support\n\nHandles chars.\n\nCo-Authored-By: X <x@x.com>')"
    cd "$TEST_TMP/repo"
    bash "$_REWRITE" --execute --yes --config "$_TEST_CONFIG" > /dev/null 2>&1
    local msg
    msg="$(_get_msg 0)"
    if ! echo "$msg" | grep -q 'emoji'; then return 1; fi
    if echo "$msg" | grep -qiE 'co.author'; then return 1; fi
}
_run_test "rewrite: unicode preserved" _test_unicode

# === Test: backup ref does not pollute verification ===
_test_backup_no_pollute() {
    _make_repo
    _add_commit "$(printf 'feat: bad\n\nCo-Authored-By: X <x@x.com>')"
    cd "$TEST_TMP/repo"
    local output
    output="$(bash "$_REWRITE" --execute --yes --config "$_TEST_CONFIG" 2>&1)"
    # Should report success, not "still contain blocked patterns"
    if echo "$output" | grep -q 'still contain'; then
        echo "FAIL: verification falsely reports remaining patterns (backup ref pollution)"
        echo "$output"
        return 1
    fi
    if ! echo "$output" | grep -q 'All blocked patterns removed'; then
        echo "FAIL: expected success message"
        echo "$output"
        return 1
    fi
}
_run_test "rewrite: backup ref does not pollute verification" _test_backup_no_pollute

# === Test: second run after rewrite reports clean ===
_test_idempotent() {
    _make_repo
    _add_commit "$(printf 'feat: bad\n\nCo-Authored-By: X <x@x.com>')"
    cd "$TEST_TMP/repo"
    bash "$_REWRITE" --execute --yes --config "$_TEST_CONFIG" > /dev/null 2>&1
    # Second run should find nothing
    local rc=0
    bash "$_REWRITE" --config "$_TEST_CONFIG" > /dev/null 2>&1 || rc=$?
    _assert_eq "0" "$rc" "second run should find no violations"
}
_run_test "rewrite: idempotent second run" _test_idempotent

# === Test: rewrite actually removes the line ===
_test_line_actually_removed() {
    _make_repo
    _add_commit "$(printf 'feat: thing\n\nGood body.\n\nCo-Authored-By: Bot <bot@x.com>')"
    cd "$TEST_TMP/repo"
    bash "$_REWRITE" --execute --yes --config "$_TEST_CONFIG" > /dev/null 2>&1
    # Grep the entire HEAD history for the pattern
    local found
    local _grep_rc=0
    found="$(git log --format=%B HEAD | grep -ciE 'co[- _]?author')" || _grep_rc=$?
    _assert_eq "0" "$found" "blocked pattern still in HEAD history after rewrite"
}
_run_test "rewrite: line actually removed from history" _test_line_actually_removed
