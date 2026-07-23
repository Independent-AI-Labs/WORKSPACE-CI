# CI e2e tests: banned words, file length, coverage devolution.
# Sourced by run_tests_integration.sh, requires test_helpers.sh loaded first.
#
# These tests exercise the real bash functions via actual git staging,
# covering critical CI check paths that had no integration coverage.

echo ""
echo "=== ci e2e checks tests ==="

# ---------------------------------------------------------------------------
# ci_check_banned_words e2e
# ---------------------------------------------------------------------------
test_e2e_banned_words_clean_file_passes() {
    _source_lib
    cat > clean.py <<'EOF'
def hello() -> str:
    return "world"
EOF
    git add clean.py
    ci_check_banned_words
}
_run_test "e2e_banned_words: clean file passes" test_e2e_banned_words_clean_file_passes

test_e2e_banned_words_noqa_blocked() {
    _source_lib
    printf 'x = 1  # %s\n' 'noqa: E501' > bad.py
    git add bad.py
    local rc=0
    ci_check_banned_words > /dev/null || rc=$?
    [[ $rc -ne 0 ]]
}
_run_test "e2e_banned_words: noqa blocked" test_e2e_banned_words_noqa_blocked

test_e2e_banned_words_type_ignore_blocked() {
    _source_lib
    printf 'x: int = "str"  # %s\n' 'type: ignore' > bad.py
    git add bad.py
    local rc=0
    ci_check_banned_words > /dev/null || rc=$?
    [[ $rc -ne 0 ]]
}
_run_test "e2e_banned_words: type: ignore blocked" test_e2e_banned_words_type_ignore_blocked

test_e2e_banned_words_multiple_files() {
    _source_lib
    cat > ok.py <<'EOF'
y = 2
EOF
    printf 'z = 3  # %s\n' 'noqa' > bad.py
    git add ok.py bad.py
    local rc=0
    ci_check_banned_words > /dev/null || rc=$?
    [[ $rc -ne 0 ]]
}
_run_test "e2e_banned_words: one bad file among many blocked" test_e2e_banned_words_multiple_files

test_e2e_banned_words_no_staged_files_passes() {
    _source_lib
    ci_check_banned_words
}
_run_test "e2e_banned_words: no staged files passes" test_e2e_banned_words_no_staged_files_passes

# ---------------------------------------------------------------------------
# ci_check_file_length e2e
# ---------------------------------------------------------------------------
test_e2e_file_length_normal_file_passes() {
    _source_lib
    cat > small.py <<'EOF'
def f() -> int:
    return 42
EOF
    git add small.py
    ci_check_file_length
}
_run_test "e2e_file_length: small file passes" test_e2e_file_length_normal_file_passes

test_e2e_file_length_oversized_file_blocked() {
    _source_lib
    # Generate a file exceeding 512 lines
    {
        echo 'def big() -> int:'
        for i in $(seq 1 520); do
            echo "    x${i} = ${i}"
        done
    } > big.py
    git add big.py
    local rc=0
    ci_check_file_length > /dev/null || rc=$?
    [[ $rc -ne 0 ]]
}
_run_test "e2e_file_length: oversized file blocked" test_e2e_file_length_oversized_file_blocked

test_e2e_file_length_no_staged_files_passes() {
    _source_lib
    ci_check_file_length
}
_run_test "e2e_file_length: no staged files passes" test_e2e_file_length_no_staged_files_passes

# ---------------------------------------------------------------------------
# ci_check_coverage_thresholds_no_devolution e2e
# ---------------------------------------------------------------------------
test_e2e_coverage_devolution_unchanged_passes() {
    _source_lib
    # config/coverage_thresholds.yaml is symlinked from real config; no
    # staged changes to it means the check should pass.
    ci_check_coverage_thresholds_no_devolution
}
_run_test "e2e_coverage_devolution: unchanged config passes" test_e2e_coverage_devolution_unchanged_passes

test_e2e_coverage_devolution_lowered_blocked() {
    _source_lib
    # Replace symlink with real file and commit original config so
    # the check has a HEAD baseline to compare against.
    local cfg="config/coverage_thresholds.yaml"
    rm -f "$cfg"
    cat > "$cfg" <<'YAML'
unit:
  path: tests/unit
  min_coverage: 90
  source_path: src
integration:
  path: tests/integration
  min_coverage: 5
YAML
    git add "$cfg"
    git commit -q -m "initial config"
    # Now lower the integration threshold and stage
    cat > "$cfg" <<'YAML'
unit:
  path: tests/unit
  min_coverage: 90
  source_path: src
integration:
  path: tests/integration
  min_coverage: 1
YAML
    git add "$cfg"
    local rc=0
    ci_check_coverage_thresholds_no_devolution > /dev/null || rc=$?
    [[ $rc -ne 0 ]]
}
_run_test "e2e_coverage_devolution: lowered threshold blocked" test_e2e_coverage_devolution_lowered_blocked

test_e2e_coverage_devolution_raised_passes() {
    _source_lib
    local cfg="config/coverage_thresholds.yaml"
    rm -f "$cfg"
    cat > "$cfg" <<'YAML'
unit:
  path: tests/unit
  min_coverage: 90
  source_path: src
integration:
  path: tests/integration
  min_coverage: 5
YAML
    git add "$cfg"
    git commit -q -m "initial config"
    # Raise integration threshold above the committed value (5 -> 10)
    cat > "$cfg" <<'YAML'
unit:
  path: tests/unit
  min_coverage: 90
  source_path: src
integration:
  path: tests/integration
  min_coverage: 10
YAML
    git add "$cfg"
    ci_check_coverage_thresholds_no_devolution
}
_run_test "e2e_coverage_devolution: raised threshold passes" test_e2e_coverage_devolution_raised_passes

test_e2e_coverage_devolution_path_changed_passes() {
    _source_lib
    local cfg="config/coverage_thresholds.yaml"
    rm -f "$cfg"
    cat > "$cfg" <<'YAML'
unit:
  path: tests/unit
  min_coverage: 90
  source_path: src
integration:
  path: tests/integration
  min_coverage: 5
YAML
    git add "$cfg"
    git commit -q -m "initial config"
    # Change path but keep threshold low: path-change exception should apply
    cat > "$cfg" <<'YAML'
unit:
  path: tests/new_unit
  min_coverage: 50
  source_path: src
integration:
  path: tests/integration
  min_coverage: 5
YAML
    git add "$cfg"
    ci_check_coverage_thresholds_no_devolution
}
_run_test "e2e_coverage_devolution: path changed with lower threshold passes" test_e2e_coverage_devolution_path_changed_passes

# ---------------------------------------------------------------------------
# ci_check_banned_words e2e: real config AI slop / business bullshit
# ---------------------------------------------------------------------------
test_e2e_banned_words_real_ai_slop_blocked() {
    _source_lib
    cat > slop.py <<'EOF'
# We leverage synergy for a paradigm shift
x = 1
EOF
    git add slop.py
    local rc=0
    ci_check_banned_words > /dev/null || rc=$?
    [[ $rc -ne 0 ]]
}
_run_test "e2e_banned_words: real config blocks AI slop words" test_e2e_banned_words_real_ai_slop_blocked

test_e2e_banned_words_real_business_bullshit_blocked() {
    _source_lib
    cat > bs.py <<'EOF'
# Pick the low-hanging fruit as our north star
# Follow best practices to move the needle
x = 1
EOF
    git add bs.py
    local rc=0
    ci_check_banned_words > /dev/null || rc=$?
    [[ $rc -ne 0 ]]
}
_run_test "e2e_banned_words: real config blocks business bullshit" test_e2e_banned_words_real_business_bullshit_blocked

test_e2e_banned_words_real_multiword_blocked() {
    _source_lib
    cat > phrase.py <<'EOF'
# harness the power of the platform
# navigate the complexity of the system
x = 1
EOF
    git add phrase.py
    local rc=0
    ci_check_banned_words > /dev/null || rc=$?
    [[ $rc -ne 0 ]]
}
_run_test "e2e_banned_words: real config blocks multi-word AI slop" test_e2e_banned_words_real_multiword_blocked

test_e2e_banned_words_real_technical_term_allowed() {
    _source_lib
    cat > tech.py <<'EOF'
# The underscore char is used for private names
# Dynamic imports load modules at runtime
x = 1
EOF
    git add tech.py
    ci_check_banned_words
}
_run_test "e2e_banned_words: real config allows technical terms" test_e2e_banned_words_real_technical_term_allowed
