#!/usr/bin/env bash
# Integration tests for ci_check_deletion_consumers (AUDIT-CAPABILITY-LOSS
# 2026-08-23): three historical breakage classes as fixtures.
# 1. Delete a script a sibling Makefile calls -> must fail.
# 2. Delete a test whose verified target ships in /opt -> must fail.
# 3. Clean superseded deletion with no consumers -> must pass.
# 4. Deletion-Review line exempts a file -> must pass.
echo ""
echo "--- test_deletion_consumers ---"

_dc_home() {
    cd "$TEST_TMP/workspace/projects/WORKSPACE-CI"
}

_dc_repo() {
    local repo="$TEST_TMP/dcrepo"
    _scrub_dir "$repo"
    mkdir -p "$repo/scripts" "$repo/lib" "$repo/tests/unit"
    git -C "$repo" init -q .
    echo "# helper" > "$repo/scripts/tool-shipped"
    echo "# live" > "$repo/scripts/live-target"
    echo "# test" > "$repo/tests/unit/test_live_target.py"
    git -C "$repo" add -A
    git -C "$repo" commit -q -m "$(printf 'feat: init\n\nSetup.')"
    echo "$repo"
}

_dc_write_msg() {
    echo "$1" > "$TEST_TMP/dcmsg.txt"
}

# === clean deletion passes ===
_test_dc_clean_deletion_passes() {
    local repo; repo=$(_dc_repo)
    _source_lib
    rm "$repo/tests/unit/test_live_target.py"
    git -C "$repo" rm --cached -q tests/unit/test_live_target.py; rm -f "$repo/tests/unit/test_live_target.py"
    _dc_write_msg "$(printf 'refactor: drop\n\nBody.')"
    cd "$repo"
    CI_COMMIT_MSG_FILE="$TEST_TMP/dcmsg.txt" ci_check_deletion_consumers
    _dc_home
}
_run_test "deletion-consumers: clean deletion passes" _test_dc_clean_deletion_passes

# === deletion with intra-repo consumer fails ===
_test_dc_intra_repo_consumer_fails() {
    local repo; repo=$(_dc_repo)
    _source_lib
    echo "bash scripts/tool-shipped" > "$repo/Makefile"
    git -C "$repo" add Makefile
    git -C "$repo" commit -q -m "$(printf 'feat: mk\n\nAdd target.')"
    rm "$repo/scripts/tool-shipped"
    git -C "$repo" rm --cached -q scripts/tool-shipped; rm -f "$repo/scripts/tool-shipped"
    _dc_write_msg "$(printf 'refactor: drop tool\n\nBody.')"
    cd "$repo"
    local rc=0
    CI_COMMIT_MSG_FILE="$TEST_TMP/dcmsg.txt" \
        ci_check_deletion_consumers > /dev/null 2>&1 || rc=$?
    _dc_home
    _assert_eq "1" "$rc" "should reject deletion with consumer"
}
_run_test "deletion-consumers: intra-repo consumer rejected" _test_dc_intra_repo_consumer_fails

# === consumer updated in same commit passes ===
_test_dc_carried_consumer_passes() {
    local repo; repo=$(_dc_repo)
    _source_lib
    echo "bash scripts/tool-shipped" > "$repo/Makefile"
    git -C "$repo" add Makefile
    git -C "$repo" commit -q -m "$(printf 'feat: mk\n\nAdd target.')"
    rm "$repo/scripts/tool-shipped"
    git -C "$repo" rm --cached -q scripts/tool-shipped; rm -f "$repo/scripts/tool-shipped"
    echo "# target removed" > "$repo/Makefile"
    git -C "$repo" add Makefile
    _dc_write_msg "$(printf 'refactor: drop tool\n\nBody.')"
    cd "$repo"
    CI_COMMIT_MSG_FILE="$TEST_TMP/dcmsg.txt" ci_check_deletion_consumers
    _dc_home
}
_run_test "deletion-consumers: carried consumer passes" _test_dc_carried_consumer_passes

# === Deletion-Review line exempts ===
_test_dc_review_line_exempts() {
    local repo; repo=$(_dc_repo)
    _source_lib
    echo "bash scripts/tool-shipped" > "$repo/Makefile"
    git -C "$repo" add Makefile
    git -C "$repo" commit -q -m "$(printf 'feat: mk\n\nAdd target.')"
    rm "$repo/scripts/tool-shipped"
    git -C "$repo" rm --cached -q scripts/tool-shipped; rm -f "$repo/scripts/tool-shipped"
    _dc_write_msg "$(printf 'refactor: drop tool\n\nBody.\n\nDeletion-Review: scripts/tool-shipped consumer moves next commit')"
    cd "$repo"
    CI_COMMIT_MSG_FILE="$TEST_TMP/dcmsg.txt" ci_check_deletion_consumers
    _dc_home
}
_run_test "deletion-consumers: Deletion-Review exempts" _test_dc_review_line_exempts

# === deletion of still-deployed file fails ===
_test_dc_deployed_file_fails() {
    local repo; repo=$(_dc_repo)
    _source_lib
    if [[ -f /opt/workspace-ci/scripts/verify-immutable ]]; then
        # Seed the repo with a file that also ships in /opt, then delete it.
        cp /opt/workspace-ci/scripts/verify-immutable "$repo/scripts/verify-immutable"
        git -C "$repo" add scripts/verify-immutable
        git -C "$repo" commit -q -m "$(printf 'feat: add probe\n\nSetup.')"
        rm -f "$repo/scripts/verify-immutable"
        git -C "$repo" rm --cached -q scripts/verify-immutable
        _dc_write_msg "$(printf 'refactor: drop\n\nBody.')"
        cd "$repo"
        local rc=0
        CI_COMMIT_MSG_FILE="$TEST_TMP/dcmsg.txt" \
            ci_check_deletion_consumers > /dev/null 2>&1 || rc=$?
        _dc_home
        _assert_eq "1" "$rc" "should reject still-deployed deletion"
    else
        ci_info "skipping deployed-file probe (no /opt artifact)"
    fi
}
_run_test "deletion-consumers: still-deployed deletion rejected" _test_dc_deployed_file_fails
