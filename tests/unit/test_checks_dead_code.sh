# Unit tests for lib/checks_dead_code.sh helper functions.
# Sourced by run_tests_unit.sh, requires test_helpers.sh loaded first.
#
# Tests the three pure helpers (_dc_in_paths, _dc_name_ignored,
# _dc_load_config_lists) in isolation without invoking dangle.

echo ""
echo "=== checks_dead_code unit tests ==="

# ---------------------------------------------------------------------------
# _dc_in_paths <path> <array_name>
#   Return 0 if $path equals or is a descendant of any entry in the array.
# ---------------------------------------------------------------------------

test_dc_in_paths_exact_match() {
    _source_lib
    local _paths=("ci" "lib")
    _dc_in_paths "ci" _paths
    local rc=$?
    _assert_eq 0 "$rc" "exact match should return 0"
}
_run_test "dc_in_paths: exact match" test_dc_in_paths_exact_match

test_dc_in_paths_descendant_match() {
    _source_lib
    local _paths=("ci" "lib")
    _dc_in_paths "ci/foo.py" _paths
    local rc=$?
    _assert_eq 0 "$rc" "descendant should return 0"
}
_run_test "dc_in_paths: descendant match" test_dc_in_paths_descendant_match

test_dc_in_paths_no_match() {
    _source_lib
    local _paths=("ci" "lib")
    _dc_in_paths "web/src/app.tsx" _paths
    local rc=$?
    _assert_eq 1 "$rc" "non-matching path should return 1"
}
_run_test "dc_in_paths: no match" test_dc_in_paths_no_match

test_dc_in_paths_empty_array() {
    _source_lib
    local _paths=()
    _dc_in_paths "ci/foo.py" _paths
    local rc=$?
    _assert_eq 1 "$rc" "empty array should return 1"
}
_run_test "dc_in_paths: empty array" test_dc_in_paths_empty_array

test_dc_in_paths_blank_entry_skipped() {
    _source_lib
    local _paths=("" "ci" "")
    _dc_in_paths "ci/foo.py" _paths
    local rc=$?
    _assert_eq 0 "$rc" "blank entries should be skipped"
}
_run_test "dc_in_paths: blank entry skipped" test_dc_in_paths_blank_entry_skipped

# ---------------------------------------------------------------------------
# _dc_name_ignored <name>
#   Return 0 if $name matches any literal in _dc_ignored_names or any ERE
#   pattern in _dc_ignored_name_patterns.
# ---------------------------------------------------------------------------

test_dc_name_ignored_exact_match() {
    _source_lib
    local _dc_ignored_names=("main" "cli")
    local _dc_ignored_name_patterns=()
    _dc_name_ignored "main"
    local rc=$?
    _assert_eq 0 "$rc" "exact name match should return 0"
}
_run_test "dc_name_ignored: exact match" test_dc_name_ignored_exact_match

test_dc_name_ignored_no_match() {
    _source_lib
    local _dc_ignored_names=("main" "cli")
    local _dc_ignored_name_patterns=()
    _dc_name_ignored "unused_func"
    local rc=$?
    _assert_eq 1 "$rc" "non-matching name should return 1"
}
_run_test "dc_name_ignored: exact no match" test_dc_name_ignored_no_match

test_dc_name_ignored_regex_test_prefix() {
    _source_lib
    local _dc_ignored_names=()
    local _dc_ignored_name_patterns=("^test_")
    _dc_name_ignored "test_something"
    local rc=$?
    _assert_eq 0 "$rc" "regex ^test_ match should return 0"
}
_run_test "dc_name_ignored: regex ^test_ match" test_dc_name_ignored_regex_test_prefix

test_dc_name_ignored_regex_dunder() {
    _source_lib
    local _dc_ignored_names=()
    local _dc_ignored_name_patterns=("^__.*__$")
    _dc_name_ignored "__init__"
    local rc=$?
    _assert_eq 0 "$rc" "regex dunder match should return 0"
}
_run_test "dc_name_ignored: regex dunder match" test_dc_name_ignored_regex_dunder

test_dc_name_ignored_regex_no_match() {
    _source_lib
    local _dc_ignored_names=()
    local _dc_ignored_name_patterns=("^test_")
    _dc_name_ignored "regular_func"
    local rc=$?
    _assert_eq 1 "$rc" "non-matching regex should return 1"
}
_run_test "dc_name_ignored: regex no match" test_dc_name_ignored_regex_no_match

test_dc_name_ignored_blank_pattern_skipped() {
    _source_lib
    local _dc_ignored_names=()
    local _dc_ignored_name_patterns=("" "^test_")
    _dc_name_ignored "test_foo"
    local rc=$?
    _assert_eq 0 "$rc" "blank pattern should be skipped, ^test_ still matches"
}
_run_test "dc_name_ignored: blank pattern skipped" test_dc_name_ignored_blank_pattern_skipped

# ---------------------------------------------------------------------------
# _dc_load_config_lists <out_array_name> <yaml_key> <yaml_file>
#   Reads a YAML list into a nameref, tolerating a missing key or file.
# ---------------------------------------------------------------------------

test_dc_load_config_lists_populated() {
    _source_lib
    local _cfg="$TEST_TMP/dc_cfg.yaml"
    cat > "$_cfg" <<'YAML'
scan_paths:
  - ci
  - lib
  - tests
YAML
    local arr=()
    _dc_load_config_lists arr scan_paths "$_cfg"
    _assert_eq 3 "${#arr[@]}" "should load 3 items"
    _assert_eq "ci" "${arr[0]}" "first item"
    _assert_eq "lib" "${arr[1]}" "second item"
    _assert_eq "tests" "${arr[2]}" "third item"
}
_run_test "dc_load_config_lists: populated list" test_dc_load_config_lists_populated

test_dc_load_config_lists_missing_key() {
    _source_lib
    local _cfg="$TEST_TMP/dc_cfg_missing_key.yaml"
    cat > "$_cfg" <<'YAML'
scan_paths:
  - ci
YAML
    local arr=("stale")
    _dc_load_config_lists arr ignore_paths "$_cfg"
    _assert_eq 0 "${#arr[@]}" "missing key should yield empty array"
}
_run_test "dc_load_config_lists: missing key" test_dc_load_config_lists_missing_key

test_dc_load_config_lists_missing_file() {
    _source_lib
    local arr=("stale")
    _dc_load_config_lists arr scan_paths "$TEST_TMP/nonexistent_file.yaml"
    _assert_eq 0 "${#arr[@]}" "missing file should yield empty array"
}
_run_test "dc_load_config_lists: missing file" test_dc_load_config_lists_missing_file

test_dc_load_config_lists_multi_item_order() {
    _source_lib
    local _cfg="$TEST_TMP/dc_cfg_multi.yaml"
    cat > "$_cfg" <<'YAML'
ignored_name_patterns:
  - "^__.*__$"
  - "^test_"
  - "^Test"
  - "^fixture_"
YAML
    local arr=()
    _dc_load_config_lists arr ignored_name_patterns "$_cfg"
    _assert_eq 4 "${#arr[@]}" "should load 4 patterns"
    _assert_eq "^__.*__\$" "${arr[0]}" "first pattern"
    _assert_eq "^test_" "${arr[1]}" "second pattern"
    _assert_eq "^Test" "${arr[2]}" "third pattern"
    _assert_eq "^fixture_" "${arr[3]}" "fourth pattern"
}
_run_test "dc_load_config_lists: multi-item order preserved" test_dc_load_config_lists_multi_item_order