# CI banned-words checker tests (schema v5 final model).
# Sourced by run_tests_unit.sh, requires test_helpers.sh loaded first.

# =========================================================================
# ci_check_banned_words tests
# =========================================================================
echo ""
echo "=== ci_check_banned_words tests ==="

test_banned_words_clean() {
    _source_lib
    cat > "$CI_CONFIG_DIR/banned_words.yaml" <<'EOF'
version: "5.0.0"
rules:
  - id: no-todo
    mode: raw-regex
    case: sensitive
    pattern: '\bTODO\b'
    reason: "No TODOs allowed."
  - id: no-fixme
    mode: raw-regex
    case: sensitive
    pattern: '\bFIXME\b'
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
version: "5.0.0"
rules:
  - id: no-todo
    mode: raw-regex
    case: sensitive
    pattern: '\bTODO\b'
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
version: "5.0.0"
rules:
  - id: no-mock
    mode: raw-regex
    case: sensitive
    pattern: '\bmock\b'
    reason: "No mocks in prod."
exceptions:
  - rule: no-mock
    path: '^tests/test_foo\.py$'
    rationale: "Test fixture file quoting the rule."
    owner: workspace-ci
    review_date: "2026-09-05"
    removal: "When no longer quoted."
EOF
    mkdir -p tests
    cat > tests/test_foo.py <<'EOF'
mock_data = {"key": "value"}
EOF
    ci_check_banned_words tests/test_foo.py
}
_run_test "banned_words: exact exception exempts file" test_banned_words_universal_exception

test_banned_words_no_exception() {
    _source_lib
    cat > "$CI_CONFIG_DIR/banned_words.yaml" <<'EOF'
version: "5.0.0"
rules:
  - id: no-mock
    mode: raw-regex
    case: sensitive
    pattern: '\bmock\b'
    reason: "No mocks in prod."
exceptions:
  - rule: no-mock
    path: '^tests/test_foo\.py$'
    rationale: "Test fixture file quoting the rule."
    owner: workspace-ci
    review_date: "2026-09-05"
    removal: "When no longer quoted."
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
version: "5.0.0"
rules:
  - id: no-todo
    mode: raw-regex
    case: sensitive
    pattern: '\bTODO\b'
    reason: "No TODOs allowed."
EOF
    cat > noted.py <<'EOF'
# TODO this is still blocked
EOF
    ! ci_check_banned_words noted.py
}
_run_test "banned_words: non-exempted file caught" test_banned_words_non_exempted

_INTERPRETER_RULE_CONFIG='version: "5.0.0"
rules:
  - id: protected-system-interpreter
    mode: raw-regex
    case: fold
    pattern: "(?:^|[;&|]|\\$\\(|`|\\b(?:if|elif|while|until|then|do)\\s+)\\s*!?\\s*(?:(?:sudo|env|exec|nice|nohup|setsid|stdbuf|timeout|xargs)\\s+)*(?:[A-Za-z_][A-Za-z0-9_]*=\\S+\\s+)*\\/(?:usr\\/)?bin\\/(?:python[0-9.]*|perl[0-9.]*|ruby[0-9.]*|node|nodejs|lua[0-9.]*|php[0-9.]*)\\b"
    reason: "Hermetic tooling only."
    non_exemptible: true
'

test_banned_words_system_interpreter_path_independent() {
    _source_lib
    printf '%s\n' "$_INTERPRETER_RULE_CONFIG" > "$CI_CONFIG_DIR/banned_words.yaml"
    local path
    for path in root-level arbitrary/deep/new-name renamed.tool extensionless; do
        mkdir -p "$(dirname "$path")"
        printf '/usr/bin/python3 helper.py\n' > "$path"
        ! ci_check_banned_words "$path" || return 1
    done
}
_run_test "banned_words: system interpreter enforcement is path independent" test_banned_words_system_interpreter_path_independent

test_banned_words_system_interpreter_wrapper_variants() {
    _source_lib
    printf '%s\n' "$_INTERPRETER_RULE_CONFIG" > "$CI_CONFIG_DIR/banned_words.yaml"
    cat > arbitrary-name <<'EOF'
env MODE=check /USR/BIN/PYTHON3.13 helper.py
safe && /bin/perl helper.pl
if ! /usr/bin/python3 helper.py; then exit 1; fi
while /bin/ruby helper.rb; do break; done
value=$(/usr/bin/node helper.js)
EOF
    ! ci_check_banned_words arbitrary-name
}
_run_test "banned_words: system interpreter wrappers and case blocked" test_banned_words_system_interpreter_wrapper_variants

test_banned_words_system_interpreter_exact_exemption() {
    _source_lib
    { printf '%s\n' "$_INTERPRETER_RULE_CONFIG"
      printf '%s\n' "exceptions:"
      printf '%s\n' "  - rule: protected-system-interpreter"
      printf '%s\n' "    path: '^quoted-fixture\\.md$'"
      printf '%s\n' "    rationale: \"Quoted rejection example.\""
      printf '%s\n' "    owner: workspace-ci"
      printf '%s\n' "    review_date: \"2026-09-05\""
      printf '%s\n' "    removal: \"When no longer quoted.\""
    } > "$CI_CONFIG_DIR/banned_words.yaml"
    printf '/usr/bin/python3 helper.py\n' > quoted-fixture.md
    ! ci_check_banned_words quoted-fixture.md
}
_run_test "banned_words: non-exemptible interpreter rule rejects any exemption" test_banned_words_system_interpreter_exact_exemption

test_banned_words_system_interpreter_broad_exemption_rejected() {
    _source_lib
    { printf '%s\n' "$_INTERPRETER_RULE_CONFIG"
      printf '%s\n' "exceptions:"
      printf '%s\n' "  - rule: protected-system-interpreter"
      printf '%s\n' "    path: '^.*\\.md$'"
      printf '%s\n' "    rationale: \"Wildcard attempt.\""
      printf '%s\n' "    owner: workspace-ci"
      printf '%s\n' "    review_date: \"2026-09-05\""
      printf '%s\n' "    removal: \"Never.\""
    } > "$CI_CONFIG_DIR/banned_words.yaml"
    printf '/usr/bin/python3 helper.py\n' > quoted-fixture.md
    ! ci_check_banned_words quoted-fixture.md
}
_run_test "banned_words: broad protected-rule exemption rejected" test_banned_words_system_interpreter_broad_exemption_rejected

test_banned_words_hermetic_python_path_independent() {
    _source_lib
    printf '%s\n' "$_INTERPRETER_RULE_CONFIG" > "$CI_CONFIG_DIR/banned_words.yaml"
    mkdir -p newly-created
    cat > newly-created/arbitrary <<'EOF'
/opt/workspace-ci/.boot-linux/bin/uv run --project /opt/workspace-ci --no-sync python -m ci.checks
EOF
    ci_check_banned_words newly-created/arbitrary
}
_run_test "banned_words: hermetic Python remains path independent" test_banned_words_hermetic_python_path_independent

test_banned_words_filename_rule() {
    _source_lib
    cat > "$CI_CONFIG_DIR/banned_words.yaml" <<'EOF'
version: "5.0.0"
rules: []
filename_rules:
  - id: filename-old-suffix
    mode: filename
    case: fold
    pattern: '_old\.'
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
version: "5.0.0"
rules: []
directory_rules:
  tests:
    - id: tests-no-incomplete
      mode: raw-regex
      case: sensitive
      pattern: 'not implemented yet'
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
version: "5.0.0"
rules: []
directory_rules:
  tests:
    - id: tests-no-incomplete
      mode: raw-regex
      case: sensitive
      pattern: 'not implemented yet'
      reason: "Implement the test or delete it."
EOF
    mkdir -p src
    cat > src/main.py <<'EOF'
# not implemented yet
EOF
    ci_check_banned_words src/main.py
}
_run_test "banned_words: directory rule skips other dirs" test_banned_words_directory_rule_skip_other

test_banned_words_ai_slop_single_word() {
    _source_lib
    cat > "$CI_CONFIG_DIR/banned_words.yaml" <<'EOF'
version: "5.0.0"
rules:
  - id: no-leverage
    mode: raw-regex
    case: sensitive
    pattern: '\bleverage\b'
    reason: "Business bullshit."
  - id: no-synergy
    mode: raw-regex
    case: sensitive
    pattern: '\bsynerg'
    reason: "Business bullshit."
EOF
    mkdir -p src
    cat > src/slop.py <<'EOF'
# We leverage synergy for results
x = 1
EOF
    ! ci_check_banned_words src/slop.py
}
_run_test "banned_words: AI slop single word blocked" test_banned_words_ai_slop_single_word

test_banned_words_multiword_phrase_blocked() {
    _source_lib
    cat > "$CI_CONFIG_DIR/banned_words.yaml" <<'EOF'
version: "5.0.0"
rules:
  - id: no-harness-power-phrase
    mode: raw-regex
    case: sensitive
    pattern: 'harness the power of'
    reason: "AI slop phrase."
  - id: no-move-needle
    mode: raw-regex
    case: sensitive
    pattern: 'move the needle'
    reason: "Business bullshit phrase."
EOF
    mkdir -p src
    cat > src/phrase.py <<'EOF'
# harness the power of the platform to move the needle
x = 1
EOF
    ! ci_check_banned_words src/phrase.py
}
_run_test "banned_words: multi-word phrase blocked" test_banned_words_multiword_phrase_blocked

test_banned_words_universal_exception_protects() {
    _source_lib
    cat > "$CI_CONFIG_DIR/banned_words.yaml" <<'EOF'
version: "5.0.0"
rules:
  - id: no-underscore-slop
    mode: raw-regex
    case: sensitive
    pattern: '\bunderscore\b'
    reason: "No slop."
exceptions:
  - rule: no-underscore-slop
    path: '^src/tech\.py$'
    rationale: "Technical term in this exact file."
    owner: workspace-ci
    review_date: "2026-09-05"
    removal: "When no longer used."
EOF
    mkdir -p src
    cat > src/tech.py <<'EOF'
# The underscore character is used for private vars
x = 1
EOF
    ci_check_banned_words src/tech.py
}
_run_test "banned_words: exact exception protects technical term" test_banned_words_universal_exception_protects

test_banned_words_universal_exception_no_leak() {
    _source_lib
    cat > "$CI_CONFIG_DIR/banned_words.yaml" <<'EOF'
version: "5.0.0"
rules:
  - id: no-underscore-slop
    mode: raw-regex
    case: sensitive
    pattern: '\bunderscore\b'
    reason: "No slop."
exceptions:
  - rule: no-underscore-slop
    path: '^tests/test_tech\.py$'
    rationale: "Technical term in this exact file."
    owner: workspace-ci
    review_date: "2026-09-05"
    removal: "When no longer used."
EOF
    mkdir -p src
    cat > src/slop.py <<'EOF'
# The underscore is a special character
x = 1
EOF
    ! ci_check_banned_words src/slop.py
}
_run_test "banned_words: scoped exception does not leak to other dirs" test_banned_words_universal_exception_no_leak

test_banned_words_business_bullshit_blocked() {
    _source_lib
    cat > "$CI_CONFIG_DIR/banned_words.yaml" <<'EOF'
version: "5.0.0"
rules:
  - id: no-low-hanging-fruit
    mode: raw-regex
    case: sensitive
    pattern: 'low-hanging fruit'
    reason: "Business bullshit."
  - id: no-north-star
    mode: raw-regex
    case: sensitive
    pattern: 'north star'
    reason: "Business bullshit."
  - id: no-best-practices
    mode: raw-regex
    case: sensitive
    pattern: 'best practices'
    reason: "Business bullshit."
EOF
    mkdir -p src
    cat > src/bullshit.py <<'EOF'
# Pick the low-hanging fruit as our north star
# Follow best practices for quality
x = 1
EOF
    ! ci_check_banned_words src/bullshit.py
}
_run_test "banned_words: business bullshit phrases blocked" test_banned_words_business_bullshit_blocked

test_banned_words_phrase_exempted_word_still_blocked() {
    _source_lib
    cat > "$CI_CONFIG_DIR/banned_words.yaml" <<'EOF'
version: "5.0.0"
rules:
  - id: no-harness-word
    mode: raw-regex
    case: sensitive
    pattern: '\bharness\b'
    reason: "No slop."
  - id: no-harness-power-phrase
    mode: raw-regex
    case: sensitive
    pattern: 'harness the power of'
    reason: "AI slop phrase."
exceptions:
  - rule: no-harness-word
    path: '^src/tech_ok\.py$'
    rationale: "Legitimate test-harness vocabulary in this exact file."
    owner: workspace-ci
    review_date: "2026-09-05"
    removal: "When no longer used."
EOF
    mkdir -p src
    cat > src/tech_ok.py <<'EOF'
# The test harness runs all suites
x = 1
EOF
    cat > src/slop_bad.py <<'EOF'
# harness the power of the cloud
x = 1
EOF
    ci_check_banned_words src/tech_ok.py
    ! ci_check_banned_words src/slop_bad.py
}
_run_test "banned_words: exempted word in banned phrase still caught" test_banned_words_phrase_exempted_word_still_blocked

# =========================================================================
# ci_verify_coverage tests (mock runner)
# =========================================================================
echo ""
echo "=== ci_verify_coverage tests ==="

test_verify_coverage_pass() {
    _source_lib
    mkdir -p "$TEST_TMP/workspace/projects/WORKSPACE-CI/tests/unit"
    cat > "$TEST_TMP/workspace/projects/WORKSPACE-CI/config/coverage_thresholds.yaml" <<EOF
unit:
  path: tests/unit
  min_coverage: 80
  source_path: .
  runner: "true"
EOF
    cd "$TEST_TMP/workspace/projects/WORKSPACE-CI"
    ci_verify_coverage "$TEST_TMP/workspace/projects/WORKSPACE-CI/config/coverage_thresholds.yaml"
}
_run_test "verify_coverage: passing runner succeeds" test_verify_coverage_pass

test_verify_coverage_fail() {
    _source_lib
    mkdir -p "$TEST_TMP/workspace/projects/WORKSPACE-CI/tests/unit"
    cat > "$TEST_TMP/workspace/projects/WORKSPACE-CI/config/coverage_thresholds.yaml" <<EOF
unit:
  path: tests/unit
  min_coverage: 80
  source_path: .
  runner: "false"
EOF
    cd "$TEST_TMP/workspace/projects/WORKSPACE-CI"
    ! ci_verify_coverage "$TEST_TMP/workspace/projects/WORKSPACE-CI/config/coverage_thresholds.yaml"
}
_run_test "verify_coverage: failing runner fails" test_verify_coverage_fail

test_verify_coverage_no_config() {
    _source_lib
    cd "$TEST_TMP/workspace/projects/WORKSPACE-CI"
    ! ci_verify_coverage "/nonexistent/config.yaml"
}
_run_test "verify_coverage: missing config fails" test_verify_coverage_no_config

test_verify_coverage_multi_suite() {
    _source_lib
    mkdir -p "$TEST_TMP/workspace/projects/WORKSPACE-CI/tests/unit"
    mkdir -p "$TEST_TMP/workspace/projects/WORKSPACE-CI/tests/integration"
    cat > "$TEST_TMP/workspace/projects/WORKSPACE-CI/config/coverage_thresholds.yaml" <<EOF
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
    cd "$TEST_TMP/workspace/projects/WORKSPACE-CI"
    ! ci_verify_coverage "$TEST_TMP/workspace/projects/WORKSPACE-CI/config/coverage_thresholds.yaml"
}
_run_test "verify_coverage: partial suite failure fails overall" test_verify_coverage_multi_suite
