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
    # Create a minimal workspace structure so ci.sh doesn't bail
    mkdir -p "$TEST_TMP/workspace/projects/CI/lib"
    mkdir -p "$TEST_TMP/workspace/projects/CI/config"
    # Copy the library files into the fake workspace
    cp "$LIB_DIR"/ci.sh "$TEST_TMP/workspace/projects/CI/lib/"
    cp "$LIB_DIR"/checks.sh "$TEST_TMP/workspace/projects/CI/lib/"
    cp "$LIB_DIR"/checks_*.sh "$TEST_TMP/workspace/projects/CI/lib/"
    cp "$LIB_DIR"/parse_banned_words.awk "$TEST_TMP/workspace/projects/CI/lib/"
    cp "$LIB_DIR"/parse_exceptions.awk "$TEST_TMP/workspace/projects/CI/lib/"
    cp "$LIB_DIR"/check_silent_swallow.py "$TEST_TMP/workspace/projects/CI/lib/"
    cp "$LIB_DIR"/check_silent_swallow_base.py "$TEST_TMP/workspace/projects/CI/lib/"
    cp "$LIB_DIR"/check_silent_swallow_python.py "$TEST_TMP/workspace/projects/CI/lib/"
    cp "$LIB_DIR"/check_silent_swallow_js.py "$TEST_TMP/workspace/projects/CI/lib/"
    cp "$LIB_DIR"/check_silent_swallow_system.py "$TEST_TMP/workspace/projects/CI/lib/"
    cp "$LIB_DIR"/check_silent_swallow_ansible.py "$TEST_TMP/workspace/projects/CI/lib/"
    # Copy config files — skip if no .yaml files exist (safe on fresh checkout)
    shopt -s nullglob
    local yaml_files=("$PROJECT_DIR/config/"*.yaml)
    shopt -u nullglob
    if [[ ${#yaml_files[@]} -gt 0 ]]; then
        cp "${yaml_files[@]}" "$TEST_TMP/workspace/projects/CI/config/"
    fi
    # Minimal pyproject.toml at workspace root
    echo '[project]' > "$TEST_TMP/workspace/pyproject.toml"
    echo 'name = "workspace"' >> "$TEST_TMP/workspace/pyproject.toml"
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
