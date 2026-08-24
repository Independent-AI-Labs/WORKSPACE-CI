#!/usr/bin/env bash
# Tests for ci_check_unstaged pre-stage semantics (AGENTS.md Code §8).
#
# git decides "anything to commit?" from its pre-hook index snapshot
# (stock git 2.43, proven 2026-08-24). ci_check_unstaged therefore:
#   1. When nothing is pre-staged: stages everything, then FAILS with
#      instructions to re-run the same command. The retry succeeds.
#   2. When something is pre-staged: hook-time staging rides the
#      commit (git's post-hook index re-read) and the check passes.
#
# Each test builds a scratch repo with a minimal pre-commit hook that
# sources lib/checks_core.sh and runs ci_check_unstaged, mirroring the
# deployed hook's first gate.

: "${PROJECT_DIR:?test framework must be sourced first}"
_CI_ROOT="$PROJECT_DIR"
source "${_CI_ROOT}/tests/test_helpers.sh" 2>/dev/null || true

export GIT_AUTHOR_EMAIL="test@test.com"
export GIT_AUTHOR_NAME="Test"
export GIT_COMMITTER_EMAIL="test@test.com"
export GIT_COMMITTER_NAME="Test"

# Build a scratch repo whose pre-commit hook runs only ci_check_unstaged.
# Uses the framework TEST_TMP (set by _run_test's _setup_tmpdir); leaves
# cwd inside the scratch repo.
_make_scratch_repo() {
    local repo="$TEST_TMP/unstaged-repo"
    _scrub_dir "$repo"
    mkdir -p "$repo/.git/hooks"
    cd "$repo" || return 1
    git init -q .
    echo "init" > file.txt
    git add file.txt
    git commit -q -m "feat: initial commit

Setup."
    cat > .git/hooks/pre-commit <<HOOK
#!/usr/bin/env bash
set -uo pipefail
source "${_CI_ROOT}/lib/ci.sh"
source "${_CI_ROOT}/lib/checks_core.sh"
ci_check_unstaged
HOOK
    chmod +x .git/hooks/pre-commit
}

# === Test: nothing pre-staged -> hook stages, fails with instructions ===
_test_unstaged_fail() {
    _make_scratch_repo
    echo "change" >> file.txt
    echo "new" > new.txt
    local out rc
    out="$(git commit -q -m "feat: bad attempt

Body." 2>&1)"
    rc=$?
    if [[ $rc -eq 0 ]]; then
        echo "FAIL: commit succeeded on first attempt with nothing pre-staged"
        return 1
    fi
    if ! echo "$out" | grep -q "Nothing was pre-staged"; then
        echo "FAIL: instructions missing from hook failure output"
        return 1
    fi
    # Content must now be staged: the retry succeeds by design.
    if git diff --cached --quiet; then
        echo "FAIL: hook did not stage the content"
        return 1
    fi
    if ! git commit -q -m "feat: retry succeeds

Body."; then
        echo "FAIL: retry commit failed"
        return 1
    fi
}
_run_test "ci_check_unstaged: nothing pre-staged stages then fails with instructions" _test_unstaged_fail

# === Test: pre-staged content -> hook adds the rest, commit proceeds ===
_test_prestaged_proceeds() {
    _make_scratch_repo
    echo "change" >> file.txt
    echo "new" > new.txt
    git add file.txt
    if ! git commit -q -m "feat: prestaged proceeds

Body."; then
        echo "FAIL: commit failed despite pre-staged content"
        return 1
    fi
    # The hook must have staged the untracked file into the same commit.
    if ! git ls-files --error-unmatch new.txt > /dev/null 2>&1; then
        echo "FAIL: untracked file not staged by hook"
        return 1
    fi
}
_run_test "ci_check_unstaged: pre-staged content lets commit proceed" _test_prestaged_proceeds

# === Test: clean tree -> no-op ===
_test_clean_tree() {
    _make_scratch_repo
    if ! git diff --cached --quiet; then
        echo "FAIL: unexpected staged content in fresh repo"
        return 1
    fi
    # Direct function invocation on a clean tree must pass.
    (
        cd "$TEST_TMP/unstaged-repo" || exit 1
        source "${_CI_ROOT}/lib/ci.sh"
        source "${_CI_ROOT}/lib/checks_core.sh"
        ci_check_unstaged
    )
    if [[ $? -ne 0 ]]; then
        echo "FAIL: ci_check_unstaged failed on a clean tree"
        return 1
    fi
}
_run_test "ci_check_unstaged: clean tree is a no-op" _test_clean_tree
