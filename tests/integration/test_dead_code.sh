# Integration tests for lib/checks_dead_code.sh: ci_check_dead_code pipeline.
# Sourced by run_tests_integration.sh, requires test_helpers.sh loaded first.
#
# Mock-binary tests (31): exercise the full ci_check_dead_code pipeline with
# a fake dangle script whose stdout/stderr/exit-code are controlled per test.
# Real-dangle tests (7) live in test_dead_code_real.sh, sourced after this
# file so shared helpers (_dc_run, _dc_mock_setup, etc.) are available.

echo ""
echo "=== ci_check_dead_code integration tests ==="

# ---------------------------------------------------------------------------
# Shared setup helpers
# ---------------------------------------------------------------------------

# _dc_mock_setup [exit_code] [stderr_msg]
#   Prepare a clean mock-dangle environment: remove stale fixtures, write
#   an empty dangle_output.txt, create the mock binary with the given exit
#   code (default 0) and optional stderr message, prepend mock bin to PATH.
_dc_mock_setup() {
    _source_lib
    rm -f "$TEST_TMP/dangle_output.txt"
    : > "$TEST_TMP/dangle_output.txt"
    _make_mock_dangle "$TEST_TMP/mock_bin" "$TEST_TMP/dangle_output.txt" "${1:-0}" "${2:-}"
    PATH="$TEST_TMP/mock_bin:$PATH"
}

# _dc_default_config
#   Write a representative dead_code.yaml to the tmpdir config/ dir.
#   Removes the symlinked real config first.
_dc_default_config() {
    rm -f config/dead_code.yaml
    cat > config/dead_code.yaml <<'YAML'
scan_paths:
  - ci
  - lib
ignore_paths:
  - ci/__pycache__
reference_only_paths:
  - tests/
  - conftest.py
ignored_names:
  - "main"
  - "cli"
  - "WORKSPACE_MARKERS"
ignored_name_patterns:
  - "^__.*__$"
  - "^test_"
  - "^Test"
  - "^fixture_"
  - "^conftest$"
YAML
}

# _dc_write_fixture <content...>
#   Write dangle output lines to the fixture file (overwrite).
_dc_write_fixture() {
    printf '%s\n' "$@" > "$TEST_TMP/dangle_output.txt"
}

# _dc_run [CI_CONFIG_DIR_value]
#   Call ci_check_dead_code, capturing combined output to $TEST_TMP/dc_out,
#   and return its exit code via $dc_rc.
_dc_run() {
    dc_rc=0
    if [[ -n "${1:-}" ]]; then
        local _save_ccd="${CI_CONFIG_DIR:-}"
        export CI_CONFIG_DIR="$1"
        ci_check_dead_code > "$TEST_TMP/dc_out" 2>&1 || dc_rc=$?
        if [[ -z "$_save_ccd" ]]; then
            unset CI_CONFIG_DIR
        else
            CI_CONFIG_DIR="$_save_ccd"
        fi
    else
        ci_check_dead_code > "$TEST_TMP/dc_out" 2>&1 || dc_rc=$?
    fi
}

# =========================================================================
# Setup / fallback tests (4)
# =========================================================================

test_dc_config_missing_returns_0() {
    _dc_mock_setup
    rm -f config/dead_code.yaml
    _dc_run
    _assert_eq 0 "$dc_rc" "missing config should return 0"
    grep -q "dead_code.yaml not found" "$TEST_TMP/dc_out" || return 1
}
_run_test "dc: config missing returns 0" test_dc_config_missing_returns_0

test_dc_dangle_missing_returns_0() {
    _dc_mock_setup
    _dc_default_config
    rm -f "$TEST_TMP/mock_bin/dangle"
    local _save_home="$HOME"
    HOME="$TEST_TMP/fake_home_no_cargo"
    mkdir -p "$HOME"
    _dc_run
    HOME="$_save_home"
    _assert_eq 0 "$dc_rc" "missing dangle should return 0"
    grep -q "dangle not installed" "$TEST_TMP/dc_out" || return 1
}
_run_test "dc: dangle missing returns 0" test_dc_dangle_missing_returns_0

test_dc_dangle_crash_returns_0() {
    _dc_mock_setup 2 "boom: invalid config"
    _dc_default_config
    _dc_run
    _assert_eq 0 "$dc_rc" "dangle crash (rc>1) should return 0"
    grep -q "dangle crashed" "$TEST_TMP/dc_out" || return 1
    grep -q "boom: invalid config" "$TEST_TMP/dc_out" || return 1
}
_run_test "dc: dangle crash returns 0 with warning" test_dc_dangle_crash_returns_0

test_dc_clean_output_returns_0() {
    _dc_mock_setup 0
    _dc_default_config
    : > "$TEST_TMP/dangle_output.txt"
    _dc_run
    _assert_eq 0 "$dc_rc"
    grep -q "No dead code detected (dangle)" "$TEST_TMP/dc_out" || return 1
}
_run_test "dc: clean output returns 0 with pass message" test_dc_clean_output_returns_0

# =========================================================================
# Exit code / advisory tests (3)
# =========================================================================

test_dc_violations_return_1() {
    _dc_mock_setup 0
    _dc_default_config
    _dc_write_fixture "ci/dead.py:10:1: function unused_func is not referenced"
    _dc_run
    _assert_eq 1 "$dc_rc"
}
_run_test "dc: violations return 1 (advisory)" test_dc_violations_return_1

test_dc_dangle_rc1_treated_as_normal() {
    _dc_mock_setup 1
    _dc_default_config
    : > "$TEST_TMP/dangle_output.txt"
    _dc_run
    _assert_eq 0 "$dc_rc"
    grep -q "No dead code detected (dangle)" "$TEST_TMP/dc_out" || return 1
}
_run_test "dc: dangle rc=1 treated as normal (not crash)" test_dc_dangle_rc1_treated_as_normal

test_dc_dangle_rc1_with_violations() {
    _dc_mock_setup 1
    _dc_default_config
    _dc_write_fixture "ci/dead.py:10:1: function unused_func is not referenced"
    _dc_run
    _assert_eq 1 "$dc_rc"
    grep -q "unused_func" "$TEST_TMP/dc_out" || return 1
}
_run_test "dc: dangle rc=1 with violations parsed normally" test_dc_dangle_rc1_with_violations

# =========================================================================
# scan_paths filter tests (3)
# =========================================================================

test_dc_scan_paths_file_reported() {
    _dc_mock_setup 0
    _dc_default_config
    _dc_write_fixture "ci/dead.py:10:1: function unused_func is not referenced"
    _dc_run
    _assert_eq 1 "$dc_rc"
    grep -q "ci/dead.py" "$TEST_TMP/dc_out" || return 1
}
_run_test "dc: file under scan_paths reported" test_dc_scan_paths_file_reported

test_dc_scan_paths_file_outside_dropped() {
    _dc_mock_setup 0
    _dc_default_config
    _dc_write_fixture "web/app.tsx:10:1: function unused_comp is not referenced"
    _dc_run
    _assert_eq 0 "$dc_rc" "file outside scan_paths should be dropped"
}
_run_test "dc: file outside scan_paths dropped" test_dc_scan_paths_file_outside_dropped

test_dc_scan_paths_empty_defaults_to_ci() {
    _dc_mock_setup 0
    rm -f config/dead_code.yaml
    cat > config/dead_code.yaml <<'YAML'
# No scan_paths key - should default to ["ci"]
ignored_names: []
ignored_name_patterns: []
ignore_paths: []
reference_only_paths: []
YAML
    _dc_write_fixture "ci/foo.py:5:1: function bar is not referenced"
    _dc_run
    _assert_eq 1 "$dc_rc" "ci/ file should be reported when scan_paths defaults to ci"
    grep -q "ci/foo.py" "$TEST_TMP/dc_out" || return 1
}
_run_test "dc: scan_paths empty defaults to ci" test_dc_scan_paths_empty_defaults_to_ci

# =========================================================================
# ignore_paths filter tests (2)
# =========================================================================

test_dc_ignore_paths_file_dropped() {
    _dc_mock_setup 0
    _dc_default_config
    _dc_write_fixture "ci/__pycache__/cached.py:10:1: function cached_fn is not referenced"
    _dc_run
    _assert_eq 0 "$dc_rc" "file under ignore_paths should be dropped"
}
_run_test "dc: file under ignore_paths dropped" test_dc_ignore_paths_file_dropped

test_dc_ignore_paths_overrides_scan_paths() {
    _dc_mock_setup 0
    _dc_default_config
    _dc_write_fixture "ci/__pycache__/cached.py:10:1: function cached_fn is not referenced" \
                     "ci/live.py:3:1: function real_fn is not referenced"
    _dc_run
    _assert_eq 1 "$dc_rc" "only non-ignored file should survive"
    grep -q "ci/live.py" "$TEST_TMP/dc_out" || return 1
    ! grep -q "__pycache__" "$TEST_TMP/dc_out" || return 1
}
_run_test "dc: ignore_paths overrides scan_paths for same root" test_dc_ignore_paths_overrides_scan_paths

# =========================================================================
# reference_only_paths filter tests (2)
# =========================================================================

test_dc_ref_only_tests_dropped() {
    _dc_mock_setup 0
    _dc_default_config
    _dc_write_fixture "tests/unit/test_foo.py:10:1: function test_bar is not referenced"
    _dc_run
    _assert_eq 0 "$dc_rc" "file under tests/ should be dropped"
}
_run_test "dc: file under reference_only_paths (tests/) dropped" test_dc_ref_only_tests_dropped

test_dc_ref_only_conftest_dropped() {
    _dc_mock_setup 0
    _dc_default_config
    _dc_write_fixture "conftest.py:10:1: function old_fixture is not referenced"
    _dc_run
    _assert_eq 0 "$dc_rc" "conftest.py should be dropped"
}
_run_test "dc: conftest.py under reference_only_paths dropped" test_dc_ref_only_conftest_dropped

# =========================================================================
# ignored_names filter tests (2)
# =========================================================================

test_dc_ignored_names_exact_match() {
    _dc_mock_setup 0
    _dc_default_config
    _dc_write_fixture "ci/app.py:10:1: function main is not referenced"
    _dc_run
    _assert_eq 0 "$dc_rc" "name in ignored_names should be dropped"
}
_run_test "dc: ignored_names exact match dropped" test_dc_ignored_names_exact_match

test_dc_ignored_names_case_sensitive() {
    _dc_mock_setup 0
    _dc_default_config
    _dc_write_fixture "ci/app.py:10:1: function Main is not referenced"
    _dc_run
    _assert_eq 1 "$dc_rc" "case-sensitive: Main != main, should be reported"
}
_run_test "dc: ignored_names case-sensitive (Main not main)" test_dc_ignored_names_case_sensitive

# =========================================================================
# ignored_name_patterns filter tests (3)
# =========================================================================

test_dc_pattern_dunder_dropped() {
    _dc_mock_setup 0
    _dc_default_config
    _dc_write_fixture "ci/mod.py:10:1: function __setup__ is not referenced"
    _dc_run
    _assert_eq 0 "$dc_rc" "dunder matching ^__.*__$ should be dropped"
}
_run_test "dc: pattern ^__.*__$ drops dunder" test_dc_pattern_dunder_dropped

test_dc_pattern_test_prefix_dropped() {
    _dc_mock_setup 0
    _dc_default_config
    _dc_write_fixture "ci/mod.py:10:1: function test_something is not referenced"
    _dc_run
    _assert_eq 0 "$dc_rc" "name matching ^test_ should be dropped"
}
_run_test "dc: pattern ^test_ drops test_ prefix" test_dc_pattern_test_prefix_dropped

test_dc_pattern_Test_class_dropped() {
    _dc_mock_setup 0
    _dc_default_config
    _dc_write_fixture "ci/mod.py:10:1: function TestBar is not referenced"
    _dc_run
    _assert_eq 0 "$dc_rc" "name matching ^Test should be dropped"
}
_run_test "dc: pattern ^Test drops Test prefix" test_dc_pattern_Test_class_dropped

# =========================================================================
# Combined filter tests (2)
# =========================================================================

test_dc_combo_scan_and_pattern() {
    _dc_mock_setup 0
    _dc_default_config
    _dc_write_fixture "ci/mod.py:10:1: function test_helper is not referenced"
    _dc_run
    _assert_eq 0 "$dc_rc" "violation in scan_paths but matching ^test_ pattern should be dropped"
}
_run_test "dc: combo - scan_paths + pattern filter" test_dc_combo_scan_and_pattern

test_dc_combo_multiple_filters() {
    _dc_mock_setup 0
    _dc_default_config
    _dc_write_fixture \
        "ci/__pycache__/skipped.py:10:1: function fn1 is not referenced" \
        "ci/kept.py:20:1: function real_dead is not referenced" \
        "ci/mod.py:30:1: function main is not referenced" \
        "web/out.tsx:5:1: function ext is not referenced"
    _dc_run
    _assert_eq 1 "$dc_rc" "exactly one violation should survive"
    grep -q "ci/kept.py" "$TEST_TMP/dc_out" || return 1
    ! grep -q "__pycache__" "$TEST_TMP/dc_out" || return 1
    ! grep -q "main is not" "$TEST_TMP/dc_out" || return 1
    ! grep -q "web/out.tsx" "$TEST_TMP/dc_out" || return 1
}
_run_test "dc: combo - multiple filters interact correctly" test_dc_combo_multiple_filters

# =========================================================================
# Output format tests (5)
# =========================================================================

test_dc_output_contains_candidate_count() {
    _dc_mock_setup 0
    _dc_default_config
    _dc_write_fixture \
        "ci/a.py:10:1: function fn_a is not referenced" \
        "ci/b.py:20:1: function fn_b is not referenced"
    _dc_run
    grep -q "Dead code candidates (2)" "$TEST_TMP/dc_out" || return 1
}
_run_test "dc: output contains 'Dead code candidates (N)'" test_dc_output_contains_candidate_count

test_dc_output_contains_formatted_lines() {
    _dc_mock_setup 0
    _dc_default_config
    _dc_write_fixture "ci/utils.py:42:1: function dead_fn is not referenced"
    _dc_run
    grep -q "ci/utils.py:42  function dead_fn" "$TEST_TMP/dc_out" || return 1
}
_run_test "dc: output formats line as 'file:line  kind name'" test_dc_output_contains_formatted_lines

test_dc_output_contains_advisory_note() {
    _dc_mock_setup 0
    _dc_default_config
    _dc_write_fixture "ci/dead.py:1:1: function foo is not referenced"
    _dc_run
    grep -q "advisory; dead code does not block the push" "$TEST_TMP/dc_out" || return 1
}
_run_test "dc: output contains advisory note" test_dc_output_contains_advisory_note

test_dc_clean_output_contains_pass() {
    _dc_mock_setup 0
    _dc_default_config
    : > "$TEST_TMP/dangle_output.txt"
    _dc_run
    grep -q "No dead code detected (dangle)" "$TEST_TMP/dc_out" || return 1
}
_run_test "dc: clean output contains 'No dead code detected'" test_dc_clean_output_contains_pass

test_dc_crash_output_contains_exit_code() {
    _dc_mock_setup 2 "config error"
    _dc_default_config
    _dc_run
    _assert_eq 0 "$dc_rc"
    grep -q "dangle crashed (exit 2)" "$TEST_TMP/dc_out" || return 1
}
_run_test "dc: crash output contains 'dangle crashed (exit N)'" test_dc_crash_output_contains_exit_code

# =========================================================================
# Malformed line rejection tests (3)
# =========================================================================

test_dc_malformed_no_suffix_discarded() {
    _dc_mock_setup 0
    _dc_default_config
    _dc_write_fixture "ci/dead.py:10:1: function unused_func is unreferenced"
    _dc_run
    _assert_eq 0 "$dc_rc" "line without 'is not referenced' suffix should be discarded"
}
_run_test "dc: malformed - no 'is not referenced' suffix discarded" test_dc_malformed_no_suffix_discarded

test_dc_malformed_missing_col_discarded() {
    _dc_mock_setup 0
    _dc_default_config
    _dc_write_fixture "ci/dead.py:10: function unused_func is not referenced"
    _dc_run
    _assert_eq 0 "$dc_rc" "line missing column should be discarded"
}
_run_test "dc: malformed - missing column discarded" test_dc_malformed_missing_col_discarded

test_dc_malformed_extra_trailing_text_discarded() {
    _dc_mock_setup 0
    _dc_default_config
    _dc_write_fixture "ci/dead.py:10:1: function unused_func is not referenced extra trailing"
    _dc_run
    _assert_eq 0 "$dc_rc" "line with extra trailing text should be discarded"
}
_run_test "dc: malformed - extra trailing text discarded" test_dc_malformed_extra_trailing_text_discarded

# =========================================================================
# Hygiene / config tests (3)
# =========================================================================

test_dc_stderr_no_stdout_leak() {
    _dc_mock_setup 0 "INTERNAL_STDERR_MESSAGE"
    _dc_default_config
    : > "$TEST_TMP/dangle_output.txt"
    _dc_run
    ! grep -q "INTERNAL_STDERR_MESSAGE" "$TEST_TMP/dc_out" || return 1
}
_run_test "dc: dangle stderr does not leak to stdout on normal run" test_dc_stderr_no_stdout_leak

test_dc_config_dir_env_var_fallback() {
    _dc_mock_setup 0
    rm -f config/dead_code.yaml
    local _custom_dir="$TEST_TMP/custom_config"
    mkdir -p "$_custom_dir"
    cat > "$_custom_dir/dead_code.yaml" <<'YAML'
scan_paths:
  - custom_src
ignore_paths: []
reference_only_paths: []
ignored_names: []
ignored_name_patterns: []
YAML
    _dc_write_fixture "custom_src/app.py:5:1: function dead_fn is not referenced"
    _dc_run "$_custom_dir"
    _assert_eq 1 "$dc_rc" "CI_CONFIG_DIR config should be used"
    grep -q "custom_src/app.py" "$TEST_TMP/dc_out" || return 1
}
_run_test "dc: CI_CONFIG_DIR env var overrides config path" test_dc_config_dir_env_var_fallback

test_dc_mktemp_coverage_thresholds_preserved() {
    _dc_mock_setup 0
    _dc_default_config
    _dc_write_fixture "ci/dead.py:1:1: function foo is not referenced"
    local _before _after
    _before=$(find /tmp -maxdepth 1 -type f 2>/dev/null | wc -l)
    _dc_run
    _after=$(find /tmp -maxdepth 1 -type f 2>/dev/null | wc -l)
    _assert_eq "$_before" "$_after" "temp files should be cleaned up"
}
_run_test "dc: temp files cleaned up after run" test_dc_mktemp_coverage_thresholds_preserved

# =========================================================================
# Custom config basic test (1)
# =========================================================================

test_dc_custom_config_multi_scan_paths() {
    _dc_mock_setup 0
    rm -f config/dead_code.yaml
    cat > config/dead_code.yaml <<'YAML'
scan_paths:
  - ci
  - lib
ignore_paths: []
reference_only_paths: []
ignored_names: []
ignored_name_patterns: []
YAML
    _dc_write_fixture \
        "ci/a.py:1:1: function dead_a is not referenced" \
        "lib/b.py:1:1: function dead_b is not referenced"
    _dc_run
    _assert_eq 1 "$dc_rc"
    grep -q "ci/a.py" "$TEST_TMP/dc_out" || return 1
    grep -q "lib/b.py" "$TEST_TMP/dc_out" || return 1
}
_run_test "dc: custom config multi scan_paths (ci+lib) both reported" test_dc_custom_config_multi_scan_paths