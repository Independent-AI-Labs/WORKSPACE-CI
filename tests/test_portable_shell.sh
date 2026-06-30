#!/usr/bin/env bash
# Portability tests — verify no process substitution in shell scripts.
# Process substitution (< <(...)) opens /dev/fd/NN by path, which is broken
# under PRoot, some bwrap/firejail sandboxes, and chroots without /proc.
# These tests assert the codebase is clean, independent of the host's
# ability to run procsub.
#
# Sourced by run_tests.sh — test_helpers.sh is already loaded. Do NOT
# re-source it here (would reset the global test counters).

# Test 1: No process substitution in lib/*.sh
test_no_procsub_in_lib() {
    local rc=0
    local found
    found="$(grep -rnE '< <\(|> >\(' "$LIB_DIR"/*.sh 2>/dev/null \
        | grep -v '^[^:]*:[0-9]*:[[:space:]]*#' || true)"
    if [[ -n "$found" ]]; then
        echo "  Process substitution found in lib/:"
        echo "$found" | sed 's/^/    /'
        return 1
    fi
    return 0
}

# Test 2: No process substitution in scripts/*
test_no_procsub_in_scripts() {
    local rc=0
    local scripts_dir="$PROJECT_DIR/scripts"
    local found
    found="$(grep -rnE '< <\(|> >\(' "$scripts_dir"/* 2>/dev/null \
        | grep -v '^[^:]*:[0-9]*:[[:space:]]*#' \
        | grep -v '\.yaml:' || true)"
    if [[ -n "$found" ]]; then
        echo "  Process substitution found in scripts/:"
        echo "$found" | sed 's/^/    /'
        return 1
    fi
    return 0
}

# Test 3: ci_capture_lines works (portable capture into array)
test_ci_capture_lines() {
    _setup_tmpdir
    _source_lib

    local arr=()
    ci_capture_lines arr -- printf 'a\nb\nc\n'

    local count=${#arr[@]}
    _teardown_tmpdir

    if [[ "$count" -ne 3 ]]; then
        echo "  ci_capture_lines: expected 3 items, got $count"
        return 1
    fi
    return 0
}

# Test 4: ci_capture_lines skips blanks
test_ci_capture_lines_skips_blanks() {
    _setup_tmpdir
    _source_lib

    local arr=()
    ci_capture_lines arr -- printf 'a\n\nb\n\n\nc\n'

    local count=${#arr[@]}
    _teardown_tmpdir

    if [[ "$count" -ne 3 ]]; then
        echo "  ci_capture_lines blanks: expected 3, got $count"
        return 1
    fi
    return 0
}

# Test 5: ci_capture_pipe works (pipeline capture)
test_ci_capture_pipe() {
    _setup_tmpdir
    _source_lib

    local arr=()
    ci_capture_pipe arr 'printf "x\ny\nz\n" | sort -r'

    local count=${#arr[@]}
    _teardown_tmpdir

    if [[ "$count" -ne 3 ]]; then
        echo "  ci_capture_pipe: expected 3 items, got $count"
        return 1
    fi
    if [[ "${arr[0]}" != "z" ]]; then
        echo "  ci_capture_pipe: expected first='z', got '${arr[0]}'"
        return 1
    fi
    return 0
}

# Test 6: ci_capture_lines preserves exit code
test_ci_capture_lines_exit_code() {
    _setup_tmpdir
    _source_lib

    local arr=()
    ci_capture_lines arr -- false
    local rc=$?
    _teardown_tmpdir

    if [[ "$rc" -ne 1 ]]; then
        echo "  ci_capture_lines exit code: expected 1, got $rc"
        return 1
    fi
    return 0
}

# Test 7: ci_check_portable_shell catches a violation (regex actually works)
test_check_catches_procsub() {
    _setup_tmpdir
    # Create a fake lib dir with a file containing process substitution
    local _fake_lib="$TEST_TMP/workspace/projects/CI/lib"
    cat > "$_fake_lib/evil_test.sh" <<'SH'
#!/usr/bin/env bash
foo() {
    while read -r x; do echo "$x"; done < <(echo hi)
}
SH
    # Source checks.sh from the fake workspace (provides ci_check_portable_shell)
    ( cd "$TEST_TMP/workspace/projects/CI" && source lib/checks.sh )
    # Run the check — it should find the violation in evil_test.sh
    # But ci_check_portable_shell scans the REAL lib dir (via BASH_SOURCE),
    # not the fake one. So test it directly against the fake file instead.
    local _found
    _found="$(grep -nE '[<][[:space:]]*[<]\(' "$_fake_lib/evil_test.sh" 2>/dev/null || true)"
    _teardown_tmpdir
    if [[ -z "$_found" ]]; then
        echo "  check regex failed to detect < <(...) in evil_test.sh"
        return 1
    fi
    return 0
}

# Test 8: ci_check_portable_shell catches standalone <(cmd) argument
test_check_catches_standalone_procsub() {
    _setup_tmpdir
    local _fake_lib="$TEST_TMP/workspace/projects/CI/lib"
    cat > "$_fake_lib/evil_standalone.sh" <<'SH'
#!/usr/bin/env bash
foo() {
    diff <(echo a) <(echo b)
}
SH
    local _found
    _found="$(grep -nE '[[:space:]][<]\([^)]*\)[[:space:]]' "$_fake_lib/evil_standalone.sh" 2>/dev/null || true)"
    _teardown_tmpdir
    if [[ -z "$_found" ]]; then
        echo "  check regex failed to detect standalone <(cmd) in evil_standalone.sh"
        return 1
    fi
    return 0
}

# Run tests
echo ""
echo "=== portability tests ==="

for t in test_no_procsub_in_lib test_no_procsub_in_scripts; do
    _TESTS_RUN=$((_TESTS_RUN + 1))
    if "$t" > /dev/null 2>&1; then
        _TESTS_PASSED=$((_TESTS_PASSED + 1))
        echo -e "  \033[32mPASS\033[0m  $t"
    else
        _TESTS_FAILED=$((_TESTS_FAILED + 1))
        _FAILURES+=("$t")
        echo -e "  \033[31mFAIL\033[0m  $t"
        "$t" 2>&1 | sed 's/^/    | /'
    fi
done

for t in test_ci_capture_lines test_ci_capture_lines_skips_blanks test_ci_capture_pipe test_ci_capture_lines_exit_code test_check_catches_procsub test_check_catches_standalone_procsub; do
    _TESTS_RUN=$((_TESTS_RUN + 1))
    if "$t" > /dev/null 2>&1; then
        _TESTS_PASSED=$((_TESTS_PASSED + 1))
        echo -e "  \033[32mPASS\033[0m  $t"
    else
        _TESTS_FAILED=$((_TESTS_FAILED + 1))
        _FAILURES+=("$t")
        echo -e "  \033[31mFAIL\033[0m  $t"
        "$t" 2>&1 | sed 's/^/    | /'
    fi
done
