# CI tests: check_init_files, check_banned_words, verify_coverage
# Sourced by run_tests.sh, requires test_helpers.sh loaded first.

# =========================================================================
# ci_check_init_files tests
# =========================================================================
echo ""
echo "=== ci_check_init_files tests ==="

test_init_empty_passes() {
    _source_lib
    touch __init__.py
    ci_check_init_files __init__.py
}
_run_test "init_files: empty file passes" test_init_empty_passes

test_init_imports_fail() {
    _source_lib
    cat > __init__.py <<'EOF'
import os
from pathlib import Path

__all__ = ["something"]
__version__ = "1.0.0"
EOF
    ! ci_check_init_files __init__.py
}
_run_test "init_files: imports + dunders blocked" test_init_imports_fail

test_init_function_fails() {
    _source_lib
    cat > __init__.py <<'EOF'
def setup():
    pass
EOF
    ! ci_check_init_files __init__.py
}
_run_test "init_files: function def blocked" test_init_function_fails

test_init_class_fails() {
    _source_lib
    cat > __init__.py <<'EOF'
class Foo:
    pass
EOF
    ! ci_check_init_files __init__.py
}
_run_test "init_files: class def blocked" test_init_class_fails

test_init_assignment_fails() {
    _source_lib
    cat > __init__.py <<'EOF'
registry = {}
EOF
    ! ci_check_init_files __init__.py
}
_run_test "init_files: variable assignment blocked" test_init_assignment_fails

test_init_non_init_skipped() {
    _source_lib
    cat > main.py <<'EOF'
def main():
    pass
EOF
    ci_check_init_files main.py
}
_run_test "init_files: non-init file skipped" test_init_non_init_skipped

test_init_comments_fail() {
    _source_lib
    cat > __init__.py <<'EOF'
# This is a comment
# Another comment
EOF
    ! ci_check_init_files __init__.py
}
_run_test "init_files: comments blocked" test_init_comments_fail

test_init_if_block_fails() {
    _source_lib
    cat > __init__.py <<'EOF'
if True:
    x = 1
EOF
    ! ci_check_init_files __init__.py
}
_run_test "init_files: if block blocked" test_init_if_block_fails

# =========================================================================
# ci_check_banned_words tests
# =========================================================================
echo ""
echo "=== ci_check_banned_words tests ==="

test_banned_words_clean() {
    _source_lib
    cat > "$CI_CONFIG_DIR/banned_words.yaml" <<'EOF'
version: "4.0.0"
banned:
  - pattern: '\bTODO\b'
    reason: "No TODOs allowed."
  - pattern: '\bFIXME\b'
    reason: "No FIXMEs allowed."
filename_rules: []
EOF
    mkdir -p src
    cat > src/clean.py <<'EOF'
def hello():
    return "world"
EOF
    ci_check_banned_words src/clean.py
}
_run_test "banned_words: clean file passes" test_banned_words_clean

test_banned_words_todo() {
    _source_lib
    cat > "$CI_CONFIG_DIR/banned_words.yaml" <<'EOF'
version: "4.0.0"
banned:
  - pattern: '\bTODO\b'
    reason: "No TODOs allowed."
EOF
    mkdir -p src
    cat > src/bad.py <<'EOF'
# TODO fix this later
def hello():
    return "world"
EOF
    ! ci_check_banned_words src/bad.py
}
_run_test "banned_words: TODO detected" test_banned_words_todo

test_banned_words_universal_exception() {
    _source_lib
    cat > "$CI_CONFIG_DIR/banned_words.yaml" <<'EOF'
version: "4.0.0"
universal_exceptions:
  - paths: ['tests/']
    patterns:
      - '\bmock\b'
banned:
  - pattern: '\bmock\b'
    reason: "No mocks in prod."
EOF
    mkdir -p tests
    cat > tests/test_foo.py <<'EOF'
mock_data = {"key": "value"}
EOF
    ci_check_banned_words tests/test_foo.py
}
_run_test "banned_words: universal exception exempts file" test_banned_words_universal_exception

test_banned_words_no_exception() {
    _source_lib
    cat > "$CI_CONFIG_DIR/banned_words.yaml" <<'EOF'
version: "4.0.0"
universal_exceptions:
  - paths: ['tests/']
    patterns:
      - '\bmock\b'
banned:
  - pattern: '\bmock\b'
    reason: "No mocks in prod."
EOF
    mkdir -p src
    cat > src/service.py <<'EOF'
x = mock
EOF
    ! ci_check_banned_words src/service.py
}
_run_test "banned_words: non-exempted file caught" test_banned_words_no_exception

test_banned_words_non_exempted() {
    _source_lib
    cat > "$CI_CONFIG_DIR/banned_words.yaml" <<'EOF'
version: "4.0.0"
banned:
  - pattern: '\bTODO\b'
    reason: "No TODOs allowed."
EOF
    cat > noted.py <<'EOF'
# TODO this is still blocked
EOF
    ! ci_check_banned_words noted.py
}
_run_test "banned_words: non-exempted file caught" test_banned_words_non_exempted

test_banned_words_filename_rule() {
    _source_lib
    cat > "$CI_CONFIG_DIR/banned_words.yaml" <<'EOF'
version: "4.0.0"
banned: []
filename_rules:
  - pattern: '_old\.'
    reason: "No _old files."
EOF
    mkdir -p src
    echo "pass" > src/handler_old.py
    ! ci_check_banned_words src/handler_old.py
}
_run_test "banned_words: filename rule catches _old" test_banned_words_filename_rule

test_banned_words_directory_rule() {
    _source_lib
    cat > "$CI_CONFIG_DIR/banned_words.yaml" <<'EOF'
version: "4.0.0"
banned: []
directory_rules:
  tests:
    - pattern: 'not implemented yet'
      reason: "Implement the test or delete it."
EOF
    mkdir -p tests
    cat > tests/test_incomplete.py <<'EOF'
def test_something():
    pytest.skip(reason="not implemented yet")
EOF
    ! ci_check_banned_words tests/test_incomplete.py
}
_run_test "banned_words: directory rule catches in tests/" test_banned_words_directory_rule

test_banned_words_directory_rule_skip_other() {
    _source_lib
    cat > "$CI_CONFIG_DIR/banned_words.yaml" <<'EOF'
version: "4.0.0"
banned: []
directory_rules:
  tests:
    - pattern: 'not implemented yet'
      reason: "Implement the test or delete it."
EOF
    mkdir -p src
    cat > src/main.py <<'EOF'
# not implemented yet
EOF
    ci_check_banned_words src/main.py
}
_run_test "banned_words: directory rule skips other dirs" test_banned_words_directory_rule_skip_other

# =========================================================================
# ci_verify_coverage tests (mock runner)
# =========================================================================
echo ""
echo "=== ci_verify_coverage tests ==="

test_verify_coverage_pass() {
    _source_lib
    mkdir -p "$TEST_TMP/workspace/projects/CI/tests/unit"
    cat > "$TEST_TMP/workspace/projects/CI/config/coverage_thresholds.yaml" <<EOF
unit:
  path: tests/unit
  min_coverage: 80
  source_path: .
  runner: "true"
EOF
    cd "$TEST_TMP/workspace/projects/CI"
    ci_verify_coverage "$TEST_TMP/workspace/projects/CI/config/coverage_thresholds.yaml"
}
_run_test "verify_coverage: passing runner succeeds" test_verify_coverage_pass

test_verify_coverage_fail() {
    _source_lib
    mkdir -p "$TEST_TMP/workspace/projects/CI/tests/unit"
    cat > "$TEST_TMP/workspace/projects/CI/config/coverage_thresholds.yaml" <<EOF
unit:
  path: tests/unit
  min_coverage: 80
  source_path: .
  runner: "false"
EOF
    cd "$TEST_TMP/workspace/projects/CI"
    ! ci_verify_coverage "$TEST_TMP/workspace/projects/CI/config/coverage_thresholds.yaml"
}
_run_test "verify_coverage: failing runner fails" test_verify_coverage_fail

test_verify_coverage_no_config() {
    _source_lib
    cd "$TEST_TMP/workspace/projects/CI"
    ! ci_verify_coverage "/nonexistent/config.yaml"
}
_run_test "verify_coverage: missing config fails" test_verify_coverage_no_config

test_verify_coverage_multi_suite() {
    _source_lib
    mkdir -p "$TEST_TMP/workspace/projects/CI/tests/unit"
    mkdir -p "$TEST_TMP/workspace/projects/CI/tests/integration"
    cat > "$TEST_TMP/workspace/projects/CI/config/coverage_thresholds.yaml" <<EOF
unit:
  path: tests/unit
  min_coverage: 80
  source_path: .
  runner: "true"
integration:
  path: tests/integration
  min_coverage: 50
  source_path: .
  runner: "false"
EOF
    cd "$TEST_TMP/workspace/projects/CI"
    ! ci_verify_coverage "$TEST_TMP/workspace/projects/CI/config/coverage_thresholds.yaml"
}
_run_test "verify_coverage: partial suite failure fails overall" test_verify_coverage_multi_suite
