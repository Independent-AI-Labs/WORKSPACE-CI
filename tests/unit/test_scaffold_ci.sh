# scaffold-ci unit tests.
# Sourced by run_tests_unit.sh, requires test_helpers.sh loaded first.

echo ""
echo "=== scaffold-ci tests ==="

_SCI_DIR="$PROJECT_DIR/scripts"
_SCI_LIB="$PROJECT_DIR/lib"
_SCI_PARSER="$_SCI_LIB/parse_hook_yaml.awk"
_SCI_REGISTRY="$PROJECT_DIR/config/required_hooks.yaml"

# ── Path computation tests ─────────────────────────────────────────────────

test_rel_path_sibling() {
    local consumer="$TEST_TMP/workspace/projects/GUARD"
    mkdir -p "$consumer"
    local ci_root="$TEST_TMP/workspace/projects/CI"
    mkdir -p "$ci_root"
    local rel
    rel="$(realpath --relative-to="$consumer" "$ci_root")"
    _assert_eq "../CI" "$rel" "sibling path"
}
_run_test "rel_path: sibling (../CI)" test_rel_path_sibling

test_rel_path_nested() {
    local consumer="$TEST_TMP/workspace/projects/groups/sub"
    mkdir -p "$consumer"
    local ci_root="$TEST_TMP/workspace/projects/CI"
    mkdir -p "$ci_root"
    local rel
    rel="$(realpath --relative-to="$consumer" "$ci_root")"
    _assert_eq "../../CI" "$rel" "nested path"
}
_run_test "rel_path: nested (../../CI)" test_rel_path_nested

test_rel_path_same_level() {
    local ci_root="$TEST_TMP/workspace/projects/CI"
    mkdir -p "$ci_root"
    local rel
    rel="$(realpath --relative-to="$ci_root" "$ci_root")"
    _assert_eq "." "$rel" "same level"
}
_run_test "rel_path: same level (.)" test_rel_path_same_level

# ── Parser: profile mode ───────────────────────────────────────────────────

test_parser_profile_basic() {
    cat > "$TEST_TMP/test-profile.yaml" <<'EOF'
version: 1
project: my-project
tier: strict
languages: [rust]
hooks:
  pre-commit: [check-unstaged]
EOF
    local out
    out="$(awk -v mode=profile -f "$_SCI_PARSER" "$TEST_TMP/test-profile.yaml")"
    echo "$out" | grep -q 'S.*version.*1' || { echo "missing version"; return 1; }
    echo "$out" | grep -q 'S.*project.*my-project' || { echo "missing project"; return 1; }
    echo "$out" | grep -q 'S.*tier.*strict' || { echo "missing tier"; return 1; }
}
_run_test "parser_profile: basic scalars" test_parser_profile_basic

test_parser_profile_languages_block() {
    cat > "$TEST_TMP/test-profile.yaml" <<'EOF'
version: 1
project: test
tier: strict
languages:
  - rust
  - python
hooks: {}
EOF
    local out
    out="$(awk -v mode=profile -f "$_SCI_PARSER" "$TEST_TMP/test-profile.yaml")"
    echo "$out" | grep -q 'L.*rust' || { echo "missing rust"; return 1; }
    echo "$out" | grep -q 'L.*python' || { echo "missing python"; return 1; }
}
_run_test "parser_profile: block-style languages" test_parser_profile_languages_block

test_parser_profile_languages_inline() {
    cat > "$TEST_TMP/test-profile.yaml" <<'EOF'
version: 1
project: test
tier: poc
languages: [any]
hooks:
  pre-commit: [check-unstaged]
EOF
    local out
    out="$(awk -v mode=profile -f "$_SCI_PARSER" "$TEST_TMP/test-profile.yaml")"
    echo "$out" | grep -q 'L.*any' || { echo "missing any"; return 1; }
}
_run_test "parser_profile: inline languages" test_parser_profile_languages_inline

test_parser_profile_hooks_block() {
    cat > "$TEST_TMP/test-profile.yaml" <<'EOF'
version: 1
project: test
tier: strict
languages: [any]
hooks:
  pre-commit:
    - check-unstaged
    - gitleaks
  commit-msg:
    - check-commit-message
  pre-push:
    - ci-check-push
EOF
    local out
    out="$(awk -v mode=profile -f "$_SCI_PARSER" "$TEST_TMP/test-profile.yaml")"
    local pc_count
    pc_count="$(echo "$out" | grep -c 'H.*pre-commit')"
    _assert_eq "2" "$pc_count" "pre-commit hooks"
    local cm_count
    cm_count="$(echo "$out" | grep -c 'H.*commit-msg')"
    _assert_eq "1" "$cm_count" "commit-msg hooks"
    local pp_count
    pp_count="$(echo "$out" | grep -c 'H.*pre-push')"
    _assert_eq "1" "$pp_count" "pre-push hooks"
}
_run_test "parser_profile: block-style hooks" test_parser_profile_hooks_block

test_parser_profile_hooks_inline() {
    cat > "$TEST_TMP/test-profile.yaml" <<'EOF'
version: 1
project: test
tier: strict
languages: [any]
hooks:
  pre-commit: [check-unstaged, gitleaks]
  commit-msg: [check-commit-message]
  pre-push: [ci-check-push]
EOF
    local out
    out="$(awk -v mode=profile -f "$_SCI_PARSER" "$TEST_TMP/test-profile.yaml")"
    echo "$out" | grep -q 'H.*pre-commit.*check-unstaged' || { echo "missing check-unstaged"; return 1; }
    echo "$out" | grep -q 'H.*pre-commit.*gitleaks' || { echo "missing gitleaks"; return 1; }
    echo "$out" | grep -q 'H.*commit-msg.*check-commit-message' || { echo "missing check-commit-message"; return 1; }
    echo "$out" | grep -q 'H.*pre-push.*ci-check-push' || { echo "missing ci-check-push"; return 1; }
}
_run_test "parser_profile: inline hooks" test_parser_profile_hooks_inline

test_parser_profile_overrides() {
    cat > "$TEST_TMP/test-profile.yaml" <<'EOF'
version: 1
project: test
tier: strict
languages: [any]
hooks:
  pre-commit: [check-markdown-docs]
overrides:
  check-markdown-docs:
    entry: "custom entry"
    pass_filenames: false
EOF
    local out
    out="$(awk -v mode=profile -f "$_SCI_PARSER" "$TEST_TMP/test-profile.yaml")"
    echo "$out" | grep -q 'O.*check-markdown-docs.*entry.*custom entry' || { echo "missing override entry"; return 1; }
    echo "$out" | grep -q 'O.*check-markdown-docs.*pass_filenames.*false' || { echo "missing override pass_filenames"; return 1; }
}
_run_test "parser_profile: overrides" test_parser_profile_overrides

# ── Parser: registry mode ──────────────────────────────────────────────────

test_parser_registry_basic() {
    local out
    out="$(awk -v mode=registry -f "$_SCI_PARSER" "$_SCI_REGISTRY")"
    echo "$out" | grep -q 'check-unstaged' || { echo "missing check-unstaged"; return 1; }
    echo "$out" | grep -q 'gitleaks' || { echo "missing gitleaks"; return 1; }
    echo "$out" | grep -q 'ci-check-push' || { echo "missing ci-check-push"; return 1; }
}
_run_test "parser_registry: basic hooks present" test_parser_registry_basic

test_parser_registry_count() {
    local out
    out="$(awk -v mode=registry -f "$_SCI_PARSER" "$_SCI_REGISTRY")"
    local count
    count="$(echo "$out" | wc -l)"
    [[ "$count" -ge 15 ]] || { echo "expected >=15 hooks, got $count"; return 1; }
}
_run_test "parser_registry: hook count" test_parser_registry_count

test_parser_registry_fields() {
    local out
    out="$(awk -v mode=registry -f "$_SCI_PARSER" "$_SCI_REGISTRY")"
    local line
    line="$(echo "$out" | grep '^check-unstaged' || true)"
    [[ -n "$line" ]] || { echo "check-unstaged line missing"; return 1; }
    local id kind entry stage
    IFS=$'\034' read -r id kind entry stage _ <<< "$line"
    _assert_eq "check-unstaged" "$id" "id"
    _assert_eq "shell" "$kind" "kind"
    _assert_eq "ci_check_unstaged" "$entry" "entry"
    _assert_eq "pre-commit" "$stage" "stage"
}
_run_test "parser_registry: field values" test_parser_registry_fields

test_parser_registry_kinds() {
    local out
    out="$(awk -v mode=registry -f "$_SCI_PARSER" "$_SCI_REGISTRY")"
    echo "$out" | grep -q $'\034shell\034' || { echo "missing shell kind"; return 1; }
    echo "$out" | grep -q $'\034python_module\034' || { echo "missing python_module kind"; return 1; }
    echo "$out" | grep -q $'\034makefile_target\034' || { echo "missing makefile_target kind"; return 1; }
    echo "$out" | grep -q $'\034shell_with_arg\034' || { echo "missing shell_with_arg kind"; return 1; }
    echo "$out" | grep -q $'\034python_module_files\034' || { echo "missing python_module_files kind"; return 1; }
}
_run_test "parser_registry: all kinds present" test_parser_registry_kinds

test_parser_registry_stages() {
    local out
    out="$(awk -v mode=registry -f "$_SCI_PARSER" "$_SCI_REGISTRY")"
    echo "$out" | grep -q $'\034pre-commit\034' || { echo "missing pre-commit stage"; return 1; }
    echo "$out" | grep -q $'\034commit-msg\034' || { echo "missing commit-msg stage"; return 1; }
    echo "$out" | grep -q $'\034pre-push\034' || { echo "missing pre-push stage"; return 1; }
}
_run_test "parser_registry: all stages present" test_parser_registry_stages

test_parser_registry_applicable() {
    local out
    out="$(awk -v mode=registry -f "$_SCI_PARSER" "$_SCI_REGISTRY")"
    local line
    line="$(echo "$out" | grep '^check-dead-code' || true)"
    [[ -n "$line" ]] || { echo "check-dead-code line missing"; return 1; }
    local _app
    _app="$(echo "$line" | awk -F'\034' '{print $9}')"
    _assert_eq "any" "$_app" "applicable_to for check-dead-code"
}
_run_test "parser_registry: applicable_to field" test_parser_registry_applicable

# ── Validation tests (via scaffold-ci script) ──────────────────────────────

test_validate_version_pass() {
    mkdir -p "$TEST_TMP/sci-test"
    cat > "$TEST_TMP/sci-test/ci-profile.yaml" <<'EOF'
version: 1
project: test
tier: vendored
languages: [any]
EOF
    cd "$PROJECT_DIR"
    local rc=0
    bash scripts/scaffold-ci --consumer "$TEST_TMP/sci-test" > "$TEST_TMP/out" 2>&1 || rc=$?
    [[ $rc -eq 0 ]] || { cat "$TEST_TMP/out"; return 1; }
}
_run_test "validate: version=1 passes" test_validate_version_pass

test_validate_version_fail() {
    mkdir -p "$TEST_TMP/sci-test"
    cat > "$TEST_TMP/sci-test/ci-profile.yaml" <<'EOF'
version: 2
project: test
tier: strict
languages: [any]
hooks: {}
EOF
    cd "$PROJECT_DIR"
    local rc=0
    bash scripts/scaffold-ci --consumer "$TEST_TMP/sci-test" > "$TEST_TMP/out" 2>&1 || rc=$?
    [[ $rc -ne 0 ]] || { echo "expected failure"; return 1; }
}
_run_test "validate: version=2 fails" test_validate_version_fail

test_validate_tier_valid() {
    for t in strict poc vendored; do
        mkdir -p "$TEST_TMP/sci-test-$t"
        cat > "$TEST_TMP/sci-test-$t/ci-profile.yaml" <<EOF
version: 1
project: test-$t
tier: $t
languages: [any]
EOF
        cd "$PROJECT_DIR"
        local rc=0
        bash scripts/scaffold-ci --consumer "$TEST_TMP/sci-test-$t" > "$TEST_TMP/out" 2>&1 || rc=$?
        [[ $rc -eq 0 ]] || { echo "tier=$t failed"; cat "$TEST_TMP/out"; return 1; }
    done
}
_run_test "validate: all valid tiers pass" test_validate_tier_valid

test_validate_tier_invalid() {
    mkdir -p "$TEST_TMP/sci-test"
    cat > "$TEST_TMP/sci-test/ci-profile.yaml" <<'EOF'
version: 1
project: test
tier: bogus
languages: [any]
hooks: {}
EOF
    cd "$PROJECT_DIR"
    local rc=0
    bash scripts/scaffold-ci --consumer "$TEST_TMP/sci-test" > "$TEST_TMP/out" 2>&1 || rc=$?
    [[ $rc -ne 0 ]] || { echo "expected failure"; return 1; }
}
_run_test "validate: invalid tier fails" test_validate_tier_invalid

test_validate_languages_any_exclusive() {
    mkdir -p "$TEST_TMP/sci-test"
    cat > "$TEST_TMP/sci-test/ci-profile.yaml" <<'EOF'
version: 1
project: test
tier: strict
languages:
  - any
  - rust
hooks:
  pre-commit: [check-unstaged]
EOF
    cd "$PROJECT_DIR"
    local rc=0
    bash scripts/scaffold-ci --consumer "$TEST_TMP/sci-test" > "$TEST_TMP/out" 2>&1 || rc=$?
    [[ $rc -ne 0 ]] || { echo "expected failure"; return 1; }
}
_run_test "validate: any cannot coexist with others" test_validate_languages_any_exclusive

test_validate_project_regex() {
    mkdir -p "$TEST_TMP/sci-test"
    cat > "$TEST_TMP/sci-test/ci-profile.yaml" <<'EOF'
version: 1
project: "bad project"
tier: strict
languages: [any]
hooks:
  pre-commit: [check-unstaged]
EOF
    cd "$PROJECT_DIR"
    local rc=0
    bash scripts/scaffold-ci --consumer "$TEST_TMP/sci-test" > "$TEST_TMP/out" 2>&1 || rc=$?
    [[ $rc -ne 0 ]] || { echo "expected failure"; return 1; }
}
_run_test "validate: project with spaces fails" test_validate_project_regex

test_validate_unknown_hook() {
    mkdir -p "$TEST_TMP/sci-test"
    cat > "$TEST_TMP/sci-test/ci-profile.yaml" <<'EOF'
version: 1
project: test
tier: strict
languages: [any]
hooks:
  pre-commit:
    - nonexistent-hook
EOF
    cd "$PROJECT_DIR"
    local rc=0
    bash scripts/scaffold-ci --consumer "$TEST_TMP/sci-test" > "$TEST_TMP/out" 2>&1 || rc=$?
    [[ $rc -ne 0 ]] || { echo "expected failure"; return 1; }
    grep -q 'not registered' "$TEST_TMP/out" || { echo "wrong error message"; return 1; }
}
_run_test "validate: unknown hook ID fails" test_validate_unknown_hook

test_validate_vendored_exits_clean() {
    mkdir -p "$TEST_TMP/sci-test"
    cat > "$TEST_TMP/sci-test/ci-profile.yaml" <<'EOF'
version: 1
project: vendored-project
tier: vendored
languages: [any]
EOF
    cd "$PROJECT_DIR"
    local rc=0
    bash scripts/scaffold-ci --consumer "$TEST_TMP/sci-test" > "$TEST_TMP/out" 2>&1 || rc=$?
    [[ $rc -eq 0 ]] || { echo "expected exit 0"; cat "$TEST_TMP/out"; return 1; }
    grep -q 'no CI integration' "$TEST_TMP/out" || { echo "missing vendored message"; return 1; }
}
_run_test "validate: vendored exits 0" test_validate_vendored_exits_clean

test_validate_vendored_with_hooks_fails() {
    mkdir -p "$TEST_TMP/sci-test"
    cat > "$TEST_TMP/sci-test/ci-profile.yaml" <<'EOF'
version: 1
project: test
tier: vendored
languages: [any]
hooks:
  pre-commit: [check-unstaged]
EOF
    cd "$PROJECT_DIR"
    local rc=0
    bash scripts/scaffold-ci --consumer "$TEST_TMP/sci-test" > "$TEST_TMP/out" 2>&1 || rc=$?
    [[ $rc -ne 0 ]] || { echo "expected failure"; return 1; }
}
_run_test "validate: vendored with hooks fails" test_validate_vendored_with_hooks_fails
