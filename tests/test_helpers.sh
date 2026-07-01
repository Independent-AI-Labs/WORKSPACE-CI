#!/usr/bin/env bash
# Shared test framework for CI tests.
# Sourced by run_tests.sh. Not executed directly.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LIB_DIR="$PROJECT_DIR/lib"

# ---------------------------------------------------------------------------
# Test framework
# ---------------------------------------------------------------------------
_TESTS_RUN=0
_TESTS_PASSED=0
_TESTS_FAILED=0
_FAILURES=()

_setup_tmpdir() {
    TEST_TMP="$(mktemp -d)"
    local _ci_dir="$TEST_TMP/workspace/projects/CI"
    # Create a minimal workspace structure so ci.sh doesn't bail
    mkdir -p "$_ci_dir/lib" "$_ci_dir/config"
    # Symlink library files instead of copying: eliminates ~25 file copies
    # per test (the dominant cost under PRoot's slow filesystem). Tests that
    # create NEW files in lib/ (e.g. test_portable_shell.sh's evil_test.sh)
    # write regular files into the symlinked directory; the new files are
    # real, the symlinked originals are read-only references.
    local f
    for f in ci.sh checks.sh checks_*.sh check_banned_words.py \
             check_silent_swallow.py check_silent_swallow_base.py \
             check_silent_swallow_python.py check_silent_swallow_js.py \
             check_silent_swallow_system.py check_silent_swallow_ansible.py; do
        local src
        for src in "$LIB_DIR"/$f; do
            [[ -f "$src" ]] && ln -s "$src" "$_ci_dir/lib/$(basename "$src")"
        done
    done
    # Symlink config files (skip if no .yaml files exist, fresh checkout)
    shopt -s nullglob
    local yaml_files=("$PROJECT_DIR/config/"*.yaml)
    shopt -u nullglob
    if [[ ${#yaml_files[@]} -gt 0 ]]; then
        for f in "${yaml_files[@]}"; do
            ln -s "$f" "$_ci_dir/config/$(basename "$f")"
        done
    fi
    # Minimal pyproject.toml at workspace root
    echo '[project]' > "$TEST_TMP/workspace/pyproject.toml"
    echo 'name = "workspace"' >> "$TEST_TMP/workspace/pyproject.toml"
    # Symlink the real .venv/ so ci_check_silent_swallow's e2e tests can
    # find bin/python (the classifier requires a working interpreter).
    ln -s "$PROJECT_DIR/.venv" "$_ci_dir/.venv"
}

_teardown_tmpdir() {
    rm -rf "$TEST_TMP"
}

_assert_eq() {
    local expected="$1" actual="$2" msg="${3:-}"
    if [[ "$expected" != "$actual" ]]; then
        echo "  ASSERTION FAILED: expected='$expected' actual='$actual' $msg"
        return 1
    fi
}

_run_test() {
    local name="$1"
    shift
    _TESTS_RUN=$((_TESTS_RUN + 1))

    _setup_tmpdir

    local rc=0
    "$@" > "$TEST_TMP/stdout" 2>&1 || rc=$?

    if [[ $rc -eq 0 ]]; then
        _TESTS_PASSED=$((_TESTS_PASSED + 1))
        echo -e "  \033[32mPASS\033[0m  $name"
    else
        _TESTS_FAILED=$((_TESTS_FAILED + 1))
        _FAILURES+=("$name")
        echo -e "  \033[31mFAIL\033[0m  $name"
        # Show output on failure
        sed 's/^/    | /' "$TEST_TMP/stdout"
    fi

    _teardown_tmpdir
}

# Helper: source checks.sh from the fake workspace
_source_lib() {
    cd "$TEST_TMP/workspace/projects/CI"
    # Re-initialize git so ci_file_list works
    if [[ ! -d ".git" ]]; then
        git init -q .
    fi
    source lib/checks.sh
}
