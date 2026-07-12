# Integration tests for lib/checks_dead_code.sh: real dangle binary.
# Sourced by run_tests_integration.sh AFTER test_dead_code.sh so shared
# helpers (_dc_run) from the mock-binary file are available.
#
# These tests exercise the real dangle binary against fixture git repos
# with known dead/live Python functions.

echo ""
echo "=== ci_check_dead_code real-dangle integration tests ==="

# ---------------------------------------------------------------------------
# Shared helpers (real dangle specific)
# ---------------------------------------------------------------------------

_dc_real_skip() {
    if ! [[ -x "$HOME/.cargo/bin/dangle" ]]; then
        echo "  SKIP: dangle binary not installed"
        return 0
    fi
    return 1
}

_dc_make_real_repo() {
    local _repo="$1"
    _scrub_dir "$_repo"
    mkdir -p "$_repo"
    cd "$_repo"
    git init -q .
    git config user.email "test@test.com"
    git config user.name "test"
}

_dc_real_config() {
    local _dir="$1"
    mkdir -p "$_dir"
    cat > "$_dir/dead_code.yaml" <<'YAML'
scan_paths:
  - src
ignore_paths: []
reference_only_paths:
  - tests/
ignored_names:
  - "main"
ignored_name_patterns:
  - "^__.*__$"
  - "^test_"
  - "^Test"
YAML
}

test_dc_real_dead_function_reported() {
    _dc_real_skip && return 0
    _source_lib
    local _repo="$TEST_TMP/rd_repo1"
    _dc_make_real_repo "$_repo"
    mkdir -p src
    cat > src/dead.py <<'PYEOF'
def unused_function():
    pass
PYEOF
    git add -A
    git commit -q -m "init"
    local _cfgdir="$TEST_TMP/rd_cfg1"
    _dc_real_config "$_cfgdir"
    export CI_CONFIG_DIR="$_cfgdir"
    _dc_run
    unset CI_CONFIG_DIR
    _assert_eq 1 "$dc_rc" "dead function should be reported"
    grep -q "unused_function" "$TEST_TMP/dc_out" || return 1
}
_run_test "dc-real: dead function reported (rc=1)" test_dc_real_dead_function_reported

test_dc_real_live_function_not_reported() {
    _dc_real_skip && return 0
    _source_lib
    local _repo="$TEST_TMP/rd_repo2"
    _dc_make_real_repo "$_repo"
    mkdir -p src
    cat > src/use.py <<'PYEOF'
def helper():
    return 42

def main():
    return helper()
PYEOF
    git add -A
    git commit -q -m "init"
    local _cfgdir="$TEST_TMP/rd_cfg2"
    _dc_real_config "$_cfgdir"
    export CI_CONFIG_DIR="$_cfgdir"
    _dc_run
    unset CI_CONFIG_DIR
    _assert_eq 0 "$dc_rc" "helper is referenced by main; main is ignored"
    ! grep -q "helper" "$TEST_TMP/dc_out" || return 1
}
_run_test "dc-real: live function (referenced by main) not reported" test_dc_real_live_function_not_reported

test_dc_real_tests_reference_not_reported() {
    _dc_real_skip && return 0
    _source_lib
    local _repo="$TEST_TMP/rd_repo3"
    _dc_make_real_repo "$_repo"
    mkdir -p src tests
    cat > src/api.py <<'PYEOF'
def public_api():
    return "hello"
PYEOF
    cat > tests/test_api.py <<'PYEOF'
from src.api import public_api

def test_api():
    assert public_api() == "hello"
PYEOF
    git add -A
    git commit -q -m "init"
    local _cfgdir="$TEST_TMP/rd_cfg3"
    _dc_real_config "$_cfgdir"
    export CI_CONFIG_DIR="$_cfgdir"
    _dc_run
    unset CI_CONFIG_DIR
    _assert_eq 0 "$dc_rc" "function referenced from tests should not be dead"
    ! grep -q "public_api" "$TEST_TMP/dc_out" || return 1
}
_run_test "dc-real: function referenced from tests/ not reported" test_dc_real_tests_reference_not_reported

test_dc_real_dunder_dropped() {
    _dc_real_skip && return 0
    _source_lib
    local _repo="$TEST_TMP/rd_repo4"
    _dc_make_real_repo "$_repo"
    mkdir -p src
    cat > src/mod.py <<'PYEOF'
def __setup__():
    return None
PYEOF
    git add -A
    git commit -q -m "init"
    local _cfgdir="$TEST_TMP/rd_cfg4"
    _dc_real_config "$_cfgdir"
    export CI_CONFIG_DIR="$_cfgdir"
    _dc_run
    unset CI_CONFIG_DIR
    _assert_eq 0 "$dc_rc" "dunder function should be dropped by ^__.*__$ pattern"
    ! grep -q "__setup__" "$TEST_TMP/dc_out" || return 1
}
_run_test "dc-real: dunder function dropped by pattern" test_dc_real_dunder_dropped

test_dc_real_empty_repo_clean() {
    _dc_real_skip && return 0
    _source_lib
    local _repo="$TEST_TMP/rd_repo5"
    _dc_make_real_repo "$_repo"
    echo "# README" > README.md
    git add -A
    git commit -q -m "init"
    local _cfgdir="$TEST_TMP/rd_cfg5"
    _dc_real_config "$_cfgdir"
    export CI_CONFIG_DIR="$_cfgdir"
    _dc_run
    unset CI_CONFIG_DIR
    _assert_eq 0 "$dc_rc" "repo with no code should have no violations"
}
_run_test "dc-real: empty repo (no code) returns 0" test_dc_real_empty_repo_clean

test_dc_real_scan_paths_excludes_file() {
    _dc_real_skip && return 0
    _source_lib
    local _repo="$TEST_TMP/rd_repo6"
    _dc_make_real_repo "$_repo"
    mkdir -p src other
    cat > src/reported.py <<'PYEOF'
def dead_a():
    pass
PYEOF
    cat > other/hidden.py <<'PYEOF'
def dead_b():
    pass
PYEOF
    git add -A
    git commit -q -m "init"
    local _cfgdir="$TEST_TMP/rd_cfg6"
    _dc_real_config "$_cfgdir"
    export CI_CONFIG_DIR="$_cfgdir"
    _dc_run
    unset CI_CONFIG_DIR
    _assert_eq 1 "$dc_rc" "dead_a in src should be reported"
    grep -q "dead_a" "$TEST_TMP/dc_out" || return 1
    ! grep -q "dead_b" "$TEST_TMP/dc_out" || return 1
}
_run_test "dc-real: scan_paths excludes file outside src" test_dc_real_scan_paths_excludes_file

test_dc_real_multi_file_correct_violations() {
    _dc_real_skip && return 0
    _source_lib
    local _repo="$TEST_TMP/rd_repo7"
    _dc_make_real_repo "$_repo"
    mkdir -p src
    cat > src/dead1.py <<'PYEOF'
def fn_dead_one():
    pass
PYEOF
    cat > src/dead2.py <<'PYEOF'
def fn_dead_two():
    pass
PYEOF
    cat > src/alive.py <<'PYEOF'
def helper():
    return 1

def main():
    return helper()
PYEOF
    git add -A
    git commit -q -m "init"
    local _cfgdir="$TEST_TMP/rd_cfg7"
    _dc_real_config "$_cfgdir"
    export CI_CONFIG_DIR="$_cfgdir"
    _dc_run
    unset CI_CONFIG_DIR
    _assert_eq 1 "$dc_rc" "should find violations"
    grep -q "fn_dead_one" "$TEST_TMP/dc_out" || return 1
    grep -q "fn_dead_two" "$TEST_TMP/dc_out" || return 1
    ! grep -q "helper" "$TEST_TMP/dc_out" || return 1
    ! grep -q "fn_main" "$TEST_TMP/dc_out" 2>/dev/null || return 1
}
_run_test "dc-real: multi-file repo reports exactly dead functions" test_dc_real_multi_file_correct_violations