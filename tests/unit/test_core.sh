# CI tests: ci.sh core, block_coauthored, block_sensitive_files, check_file_length
# Sourced by run_tests.sh, requires test_helpers.sh loaded first.

# =========================================================================
# ci.sh core tests
# =========================================================================
echo ""
echo "=== ci.sh core tests ==="

test_ci_read_yaml_flat() {
    cat > "$TEST_TMP/workspace/projects/WORKSPACE-CI/config/test.yaml" <<'EOF'
max_lines: 512
extensions:
  - .py
  - .rs
EOF
    _source_lib
    local val
    val="$(ci_read_yaml "$TEST_TMP/workspace/projects/WORKSPACE-CI/config/test.yaml" "max_lines")"
    _assert_eq "512" "$val" "flat key"
}
_run_test "ci_read_yaml flat key" test_ci_read_yaml_flat

test_ci_read_yaml_dotpath() {
    cat > "$TEST_TMP/workspace/projects/WORKSPACE-CI/config/test.yaml" <<'EOF'
unit:
  min_coverage: 90
  path: "tests/unit"
integration:
  min_coverage: 50
  path: "tests/integration"
EOF
    _source_lib
    local val1 val2
    val1="$(ci_read_yaml "$TEST_TMP/workspace/projects/WORKSPACE-CI/config/test.yaml" "unit.min_coverage")"
    val2="$(ci_read_yaml "$TEST_TMP/workspace/projects/WORKSPACE-CI/config/test.yaml" "integration.path")"
    _assert_eq "90" "$val1" "unit.min_coverage"
    _assert_eq "tests/integration" "$val2" "integration.path"
}
_run_test "ci_read_yaml dotpath" test_ci_read_yaml_dotpath

test_ci_tool_version() {
    _source_lib
    mkdir -p "$CI_PROJECT_ROOT/res"
    cat > "$CI_PROJECT_ROOT/res/dependency-pins.yaml" <<'EOF'
gitleaks:
  version: "8.30.1"
  minimum_version: "8.22.0"
EOF
    _assert_eq "8.30.1" "$(ci_tool_version gitleaks)" "tool version"
    _assert_eq "8.22.0" "$(ci_tool_version gitleaks minimum_version)" "tool minimum"
}
_run_test "ci_tool_version reads catalog" test_ci_tool_version

test_ci_cloc_artifact() {
    _source_lib
    mkdir -p "$CI_PROJECT_ROOT/res"
    cat > "$CI_PROJECT_ROOT/res/dependency-pins.yaml" <<'EOF'
cloc:
  version: "2.10"
  artifacts:
    - asset: "cloc-2.10.pl"
      sha256: "first-checksum"
    - asset: "cloc-other.pl"
      sha256: "second-checksum"
EOF
    _assert_eq "cloc-2.10.pl" "$(ci_cloc_artifact asset)" "selected cloc asset"
    _assert_eq "first-checksum" "$(ci_cloc_artifact sha256)" "selected cloc checksum"
}
_run_test "ci_cloc_artifact reads selected catalog artifact" test_ci_cloc_artifact

test_ci_read_yaml_list() {
    cat > "$TEST_TMP/workspace/projects/WORKSPACE-CI/config/test.yaml" <<'EOF'
extensions:
  - .py
  - .rs
  - .ts
other: 42
EOF
    _source_lib
    local items
    items="$(ci_read_yaml_list "$TEST_TMP/workspace/projects/WORKSPACE-CI/config/test.yaml" "extensions")"
    local count
    count="$(echo "$items" | wc -l)"
    _assert_eq "3" "$count" "list count"
    echo "$items" | grep -q '\.py' || { echo "missing .py"; return 1; }
    echo "$items" | grep -q '\.rs' || { echo "missing .rs"; return 1; }
}
_run_test "ci_read_yaml_list" test_ci_read_yaml_list

test_ci_filter_ext() {
    _source_lib
    local result
    result="$(printf 'a.py\nb.js\nc.rs\nd.txt\ne.ts\n' | ci_filter_ext .py .ts)"
    _assert_eq "$(printf 'a.py\ne.ts')" "$result" "filter .py .ts"
}
_run_test "ci_filter_ext" test_ci_filter_ext

test_ci_file_list_with_args() {
    _source_lib
    local result
    result="$(ci_file_list "foo.py" "bar.rs")"
    _assert_eq "$(printf 'foo.py\nbar.rs')" "$result" "file list from args"
}
_run_test "ci_file_list with args" test_ci_file_list_with_args

# =========================================================================
# ci_block_coauthored tests
# =========================================================================
echo ""
echo "=== ci_block_coauthored tests ==="

test_coauthored_clean() {
    _source_lib
    echo "Fix bug in login flow" > "$TEST_TMP/msg"
    ci_block_coauthored "$TEST_TMP/msg"
}
_run_test "block_coauthored: clean message passes" test_coauthored_clean

test_coauthored_standard() {
    _source_lib
    printf "Fix bug\n\nCo-authored-by: Someone <a@b.com>\n" > "$TEST_TMP/msg"
    ! ci_block_coauthored "$TEST_TMP/msg"
}
_run_test "block_coauthored: Co-authored-by blocked" test_coauthored_standard

test_coauthored_underscore() {
    _source_lib
    printf "Fix bug\n\nCo_authored_by: Someone <a@b.com>\n" > "$TEST_TMP/msg"
    ! ci_block_coauthored "$TEST_TMP/msg"
}
_run_test "block_coauthored: Co_authored_by blocked" test_coauthored_underscore

test_coauthored_nospace() {
    _source_lib
    printf "Fix bug\n\nCoauthoredby: Someone\n" > "$TEST_TMP/msg"
    ! ci_block_coauthored "$TEST_TMP/msg"
}
_run_test "block_coauthored: Coauthoredby blocked" test_coauthored_nospace

test_coauthored_anthropic() {
    _source_lib
    printf "Fix bug\n\nnoreply@anthropic.com\n" > "$TEST_TMP/msg"
    ! ci_block_coauthored "$TEST_TMP/msg"
}
_run_test "block_coauthored: anthropic email blocked" test_coauthored_anthropic

test_coauthored_case_insensitive() {
    _source_lib
    printf "Fix bug\n\nCO-AUTHORED-BY: Someone\n" > "$TEST_TMP/msg"
    ! ci_block_coauthored "$TEST_TMP/msg"
}
_run_test "block_coauthored: case insensitive" test_coauthored_case_insensitive

test_coauthored_no_file() {
    _source_lib
    ! ci_block_coauthored "/nonexistent/file"
}
_run_test "block_coauthored: missing file returns error" test_coauthored_no_file

# =========================================================================
# ci_block_sensitive_files tests
# =========================================================================
echo ""
echo "=== ci_block_sensitive_files tests ==="

test_sensitive_clean() {
    _source_lib
    ci_block_sensitive_files "src/main.py" "README.md" "pyproject.toml"
}
_run_test "sensitive_files: safe files pass" test_sensitive_clean

test_sensitive_env_file() {
    _source_lib
    ! ci_block_sensitive_files ".env"
}
_run_test "sensitive_files: .env blocked" test_sensitive_env_file

test_sensitive_env_local() {
    _source_lib
    ! ci_block_sensitive_files ".env.local"
}
_run_test "sensitive_files: .env.local blocked" test_sensitive_env_local

test_sensitive_hidden_yaml() {
    _source_lib
    ! ci_block_sensitive_files ".secrets.yaml"
}
_run_test "sensitive_files: hidden .secrets.yaml blocked" test_sensitive_hidden_yaml

test_sensitive_keyword_json() {
    _source_lib
    ! ci_block_sensitive_files "credentials.json"
}
_run_test "sensitive_files: credentials.json blocked" test_sensitive_keyword_json

test_sensitive_password_yaml() {
    _source_lib
    ! ci_block_sensitive_files "password.yaml"
}
_run_test "sensitive_files: password.yaml blocked" test_sensitive_password_yaml

test_sensitive_key_pem() {
    _source_lib
    ! ci_block_sensitive_files "server.key"
}
_run_test "sensitive_files: server.key blocked" test_sensitive_key_pem

test_sensitive_safe_exceptions() {
    _source_lib
    ci_block_sensitive_files "pyproject.toml" "package.json" "tsconfig.json" ".pre-commit-config.yaml" "Cargo.toml" "alembic.ini"
}
_run_test "sensitive_files: safe exceptions pass" test_sensitive_safe_exceptions

test_sensitive_regular_yaml() {
    _source_lib
    # A yaml file without sensitive keywords should pass
    ci_block_sensitive_files "deploy.yaml"
}
_run_test "sensitive_files: regular deploy.yaml passes" test_sensitive_regular_yaml

test_sensitive_token_toml() {
    _source_lib
    ! ci_block_sensitive_files "token.toml"
}
_run_test "sensitive_files: token.toml blocked" test_sensitive_token_toml

# =========================================================================
# ci_check_file_length tests
# =========================================================================
echo ""
echo "=== ci_check_file_length tests ==="

test_file_length_pass() {
    _source_lib
    cat > "$CI_CONFIG_DIR/file_length_limits.yaml" <<'EOF'
max_lines: 10
extensions:
  - .py
EOF
    mkdir -p src
    for i in $(seq 1 5); do echo "line $i" >> src/short.py; done
    ci_check_file_length src/short.py
}
_run_test "file_length: short file passes" test_file_length_pass

test_file_length_fail() {
    _source_lib
    cat > "$CI_CONFIG_DIR/file_length_limits.yaml" <<'EOF'
max_lines: 10
extensions:
  - .py
EOF
    mkdir -p src
    for i in $(seq 1 20); do echo "line $i" >> src/long.py; done
    ! ci_check_file_length src/long.py
}
_run_test "file_length: long file fails" test_file_length_fail

test_file_length_wrong_ext_ignored() {
    _source_lib
    cat > "$CI_CONFIG_DIR/file_length_limits.yaml" <<'EOF'
max_lines: 5
extensions:
  - .py
EOF
    mkdir -p src
    for i in $(seq 1 100); do echo "line $i" >> src/long.txt; done
    ci_check_file_length src/long.txt
}
_run_test "file_length: wrong extension ignored" test_file_length_wrong_ext_ignored

test_file_length_default_512() {
    _source_lib
    rm -f "$CI_CONFIG_DIR/file_length_limits.yaml"
    mkdir -p src
    for i in $(seq 1 500); do echo "line $i" >> src/ok.py; done
    ci_check_file_length src/ok.py
}
_run_test "file_length: default 512 works" test_file_length_default_512

# =========================================================================
# ci_check_module_size tests
# =========================================================================
echo ""
echo "=== ci_check_module_size tests ==="

test_module_size_byte_limit() {
    _source_lib
    cat > "$CI_CONFIG_DIR/file_length_limits.yaml" <<'EOF'
max_file_bytes: 10
extensions:
  - .py
EOF
    mkdir -p src
    printf '12345678901' > src/large.py
    git add src/large.py
    ! ci_check_module_size
}
_run_test "module_size: byte limit blocks oversized source" test_module_size_byte_limit

test_module_size_file_count_limit() {
    _source_lib
    cat > "$CI_CONFIG_DIR/file_length_limits.yaml" <<'EOF'
max_source_files_per_module: 1
extensions:
  - .py
EOF
    mkdir -p src
    : > src/one.py
    : > src/two.py
    git add src/one.py src/two.py
    ! ci_check_module_size
}
_run_test "module_size: direct source-file count is enforced" test_module_size_file_count_limit

test_module_size_submodule_limit() {
    _source_lib
    cat > "$CI_CONFIG_DIR/file_length_limits.yaml" <<'EOF'
max_submodules_per_module: 1
extensions:
  - .py
EOF
    mkdir -p src/one src/two
    : > src/one/one.py
    : > src/two/two.py
    git add src/one/one.py src/two/two.py
    ! ci_check_module_size
}
_run_test "module_size: direct submodule count is enforced" test_module_size_submodule_limit

test_module_size_depth_limit() {
    _source_lib
    cat > "$CI_CONFIG_DIR/file_length_limits.yaml" <<'EOF'
max_module_depth: 2
extensions:
  - .py
EOF
    mkdir -p src/one/two
    : > src/one/two/deep.py
    git add src/one/two/deep.py
    ! ci_check_module_size
}
_run_test "module_size: module depth is enforced" test_module_size_depth_limit

test_module_size_ignored_and_non_source_pass() {
    _source_lib
    cat > "$CI_CONFIG_DIR/file_length_limits.yaml" <<'EOF'
max_source_files_per_module: 1
extensions:
  - .py
EOF
    mkdir -p vendor/one vendor/two docs
    : > vendor/one/one.py
    : > vendor/two/two.py
    : > docs/readme.md
    git add vendor/one/one.py vendor/two/two.py docs/readme.md
    ci_check_module_size
}
_run_test "module_size: ignored and non-source files do not count" test_module_size_ignored_and_non_source_pass

test_module_size_override() {
    _source_lib
    cat > "$CI_CONFIG_DIR/file_length_limits.yaml" <<'EOF'
max_source_files_per_module: 1
extensions:
  - .py
module_overrides:
  - path: src/legacy
    max_source_files: 2
EOF
    mkdir -p src/legacy
    : > src/legacy/one.py
    : > src/legacy/two.py
    git add src/legacy/one.py src/legacy/two.py
    ci_check_module_size
}
_run_test "module_size: path override permits documented exception" test_module_size_override

test_module_size_submodule_override() {
    _source_lib
    cat > "$CI_CONFIG_DIR/file_length_limits.yaml" <<'EOF'
max_submodules_per_module: 1
extensions:
  - .py
module_overrides:
  - path: src
    max_submodules: 2
EOF
    mkdir -p src/one src/two
    : > src/one/one.py
    : > src/two/two.py
    git add src/one/one.py src/two/two.py
    ci_check_module_size
}
_run_test "module_size: submodule-only override is honored" test_module_size_submodule_override

test_module_size_invalid_limit() {
    _source_lib
    cat > "$CI_CONFIG_DIR/file_length_limits.yaml" <<'EOF'
max_module_depth: 0
EOF
    ! ci_check_module_size
}
_run_test "module_size: invalid limits fail closed" test_module_size_invalid_limit

test_module_size_config_path_override() {
    _source_lib
    local override="$TEST_TMP/workspace/projects/WORKSPACE-CI/config/size-override.yaml"
    cat > "$override" <<'EOF'
max_source_files_per_module: 2
extensions:
  - .py
EOF
    mkdir -p src
    : > src/one.py
    : > src/two.py
    unset '_CI_CONFIG_PATH_CACHE[file_length_limits|./config/file_length_limits.yaml]'
    git add src/one.py src/two.py
    CI_CONFIG_PATH_FILE_LENGTH_LIMITS="$override" ci_check_module_size
}
_run_test "module_size: standard config-path override is honored" test_module_size_config_path_override
