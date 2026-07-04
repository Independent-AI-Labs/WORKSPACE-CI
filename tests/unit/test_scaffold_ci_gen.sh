# scaffold-ci generation tests.
# Sourced by run_tests_unit.sh, requires test_helpers.sh loaded first.

echo ""
echo "=== scaffold-ci generation tests ==="

_SCI_SCRIPT="$PROJECT_DIR/scripts/scaffold-ci"

test_scaffold_generates_precommit() {
    mkdir -p "$TEST_TMP/sci-gen"
    cat > "$TEST_TMP/sci-gen/ci-profile.yaml" <<'EOF'
version: 1
project: gen-test
tier: strict
languages: [rust]
hooks:
  pre-commit:
    - check-unstaged
  commit-msg:
    - check-commit-message
EOF
    cd "$PROJECT_DIR"
    bash "$_SCI_SCRIPT" --consumer "$TEST_TMP/sci-gen" --force > "$TEST_TMP/out" 2>&1
    [[ -f "$TEST_TMP/sci-gen/.pre-commit-config.yaml" ]] || { echo "no .pre-commit-config.yaml"; return 1; }
    grep -q 'check-unstaged' "$TEST_TMP/sci-gen/.pre-commit-config.yaml" || { echo "missing hook"; return 1; }
    grep -q 'repos:' "$TEST_TMP/sci-gen/.pre-commit-config.yaml" || { echo "missing repos"; return 1; }
}
_run_test "scaffold: generates .pre-commit-config.yaml" test_scaffold_generates_precommit

test_scaffold_generates_makefile() {
    mkdir -p "$TEST_TMP/sci-mf"
    cat > "$TEST_TMP/sci-mf/ci-profile.yaml" <<'EOF'
version: 1
project: mf-test
tier: strict
languages: [rust]
hooks:
  pre-commit: [check-unstaged]
EOF
    cd "$PROJECT_DIR"
    bash "$_SCI_SCRIPT" --consumer "$TEST_TMP/sci-mf" --force > "$TEST_TMP/out" 2>&1
    [[ -f "$TEST_TMP/sci-mf/Makefile" ]] || { echo "no Makefile"; return 1; }
    for t in init install install-ci install-hooks sync check lint type-check test clean preflight; do
        grep -q "^$t:" "$TEST_TMP/sci-mf/Makefile" || { echo "missing target: $t"; return 1; }
    done
}
_run_test "scaffold: generates Makefile with all targets" test_scaffold_generates_makefile

test_scaffold_generates_configs() {
    mkdir -p "$TEST_TMP/sci-cfg"
    cat > "$TEST_TMP/sci-cfg/ci-profile.yaml" <<'EOF'
version: 1
project: cfg-test
tier: strict
languages: [rust]
hooks:
  pre-commit: [check-unstaged]
EOF
    cd "$PROJECT_DIR"
    bash "$_SCI_SCRIPT" --consumer "$TEST_TMP/sci-cfg" --force > "$TEST_TMP/out" 2>&1
    for f in coverage_thresholds.yaml file_length_limits.yaml dead_code.yaml \
             dependency_excludes.yaml duplicate_dependency_excludes.yaml markdown_docs.yaml; do
        [[ -f "$TEST_TMP/sci-cfg/config/$f" ]] || { echo "missing config/$f"; return 1; }
    done
}
_run_test "scaffold: generates config/ defaults" test_scaffold_generates_configs

test_scaffold_coverage_substitution() {
    mkdir -p "$TEST_TMP/sci-cov"
    cat > "$TEST_TMP/sci-cov/ci-profile.yaml" <<'EOF'
version: 1
project: cov-test
tier: strict
languages: [rust]
hooks:
  pre-commit: [check-unstaged]
EOF
    cd "$PROJECT_DIR"
    bash "$_SCI_SCRIPT" --consumer "$TEST_TMP/sci-cov" --force > "$TEST_TMP/out" 2>&1
    grep -q 'source_path: cov-test' "$TEST_TMP/sci-cov/config/coverage_thresholds.yaml" || { echo "missing substitution"; return 1; }
    grep -q 'source_path: ci' "$TEST_TMP/sci-cov/config/coverage_thresholds.yaml" && { echo "old value still present"; return 1; } || true
}
_run_test "scaffold: coverage source_path substituted" test_scaffold_coverage_substitution

test_scaffold_dead_code_rust() {
    mkdir -p "$TEST_TMP/sci-dc"
    cat > "$TEST_TMP/sci-dc/ci-profile.yaml" <<'EOF'
version: 1
project: dc-test
tier: strict
languages: [rust]
hooks:
  pre-commit: [check-unstaged]
EOF
    cd "$PROJECT_DIR"
    bash "$_SCI_SCRIPT" --consumer "$TEST_TMP/sci-dc" --force > "$TEST_TMP/out" 2>&1
    grep -q 'scan_paths: \[src\]' "$TEST_TMP/sci-dc/config/dead_code.yaml" || { echo "missing src scan_paths"; return 1; }
}
_run_test "scaffold: dead_code rust gets [src]" test_scaffold_dead_code_rust

test_scaffold_dead_code_python() {
    mkdir -p "$TEST_TMP/sci-dcp"
    cat > "$TEST_TMP/sci-dcp/ci-profile.yaml" <<'EOF'
version: 1
project: dcp-test
tier: strict
languages: [python]
hooks:
  pre-commit: [check-unstaged]
EOF
    cd "$PROJECT_DIR"
    bash "$_SCI_SCRIPT" --consumer "$TEST_TMP/sci-dcp" --force > "$TEST_TMP/out" 2>&1
    grep -q 'scan_paths: \[\]' "$TEST_TMP/sci-dcp/config/dead_code.yaml" || { echo "missing empty scan_paths"; return 1; }
}
_run_test "scaffold: dead_code python gets []" test_scaffold_dead_code_python

test_scaffold_generates_qe() {
    mkdir -p "$TEST_TMP/sci-qe"
    cat > "$TEST_TMP/sci-qe/ci-profile.yaml" <<'EOF'
version: 1
project: qe-test
tier: strict
languages: [rust]
hooks:
  pre-commit: [check-unstaged]
EOF
    cd "$PROJECT_DIR"
    bash "$_SCI_SCRIPT" --consumer "$TEST_TMP/sci-qe" --force > "$TEST_TMP/out" 2>&1
    [[ -f "$TEST_TMP/sci-qe/quality_exceptions.yaml" ]] || { echo "no quality_exceptions.yaml"; return 1; }
    grep -q 'project: qe-test' "$TEST_TMP/sci-qe/quality_exceptions.yaml" || { echo "missing project name"; return 1; }
}
_run_test "scaffold: generates quality_exceptions.yaml" test_scaffold_generates_qe

test_scaffold_qe_not_overwritten() {
    mkdir -p "$TEST_TMP/sci-qe2"
    cat > "$TEST_TMP/sci-qe2/ci-profile.yaml" <<'EOF'
version: 1
project: qe-test2
tier: strict
languages: [rust]
hooks:
  pre-commit: [check-unstaged]
EOF
    echo "existing qe file" > "$TEST_TMP/sci-qe2/quality_exceptions.yaml"
    cd "$PROJECT_DIR"
    bash "$_SCI_SCRIPT" --consumer "$TEST_TMP/sci-qe2" --force > "$TEST_TMP/out" 2>&1
    grep -q 'existing qe file' "$TEST_TMP/sci-qe2/quality_exceptions.yaml" || { echo "qe was overwritten"; return 1; }
}
_run_test "scaffold: quality_exceptions.yaml never overwritten" test_scaffold_qe_not_overwritten

test_scaffold_auto_insert_mandatory() {
    mkdir -p "$TEST_TMP/sci-auto"
    cat > "$TEST_TMP/sci-auto/ci-profile.yaml" <<'EOF'
version: 1
project: auto-test
tier: strict
languages: [any]
hooks:
  pre-commit: [check-unstaged]
EOF
    cd "$PROJECT_DIR"
    bash "$_SCI_SCRIPT" --consumer "$TEST_TMP/sci-auto" --force > "$TEST_TMP/out" 2>&1
    grep -q 'block-sensitive-files' "$TEST_TMP/sci-auto/.pre-commit-config.yaml" || { echo "missing auto-inserted block-sensitive-files"; return 1; }
    grep -q 'ci-lint' "$TEST_TMP/sci-auto/.pre-commit-config.yaml" || { echo "missing auto-inserted ci-lint"; return 1; }
    grep -q 'check-commit-message' "$TEST_TMP/sci-auto/.pre-commit-config.yaml" || { echo "missing auto-inserted check-commit-message"; return 1; }
}
_run_test "scaffold: auto-inserts mandatory hooks" test_scaffold_auto_insert_mandatory

test_scaffold_dry_run_no_files() {
    mkdir -p "$TEST_TMP/sci-dry"
    cat > "$TEST_TMP/sci-dry/ci-profile.yaml" <<'EOF'
version: 1
project: dry-test
tier: strict
languages: [any]
hooks:
  pre-commit: [check-unstaged]
EOF
    cd "$PROJECT_DIR"
    bash "$_SCI_SCRIPT" --consumer "$TEST_TMP/sci-dry" --dry-run > "$TEST_TMP/out" 2>&1
    [[ ! -f "$TEST_TMP/sci-dry/.pre-commit-config.yaml" ]] || { echo "dry-run wrote file"; return 1; }
    [[ ! -f "$TEST_TMP/sci-dry/Makefile" ]] || { echo "dry-run wrote Makefile"; return 1; }
    grep -q 'Would write' "$TEST_TMP/out" || { echo "missing dry-run header"; return 1; }
}
_run_test "scaffold: dry-run writes nothing" test_scaffold_dry_run_no_files

test_scaffold_no_force_skips() {
    mkdir -p "$TEST_TMP/sci-nf"
    cat > "$TEST_TMP/sci-nf/ci-profile.yaml" <<'EOF'
version: 1
project: nf-test
tier: strict
languages: [any]
hooks:
  pre-commit: [check-unstaged]
EOF
    echo "existing" > "$TEST_TMP/sci-nf/.pre-commit-config.yaml"
    cd "$PROJECT_DIR"
    bash "$_SCI_SCRIPT" --consumer "$TEST_TMP/sci-nf" > "$TEST_TMP/out" 2>&1
    grep -q 'existing' "$TEST_TMP/sci-nf/.pre-commit-config.yaml" || { echo "file was overwritten without --force"; return 1; }
}
_run_test "scaffold: no --force skips existing" test_scaffold_no_force_skips

test_scaffold_force_overwrites() {
    mkdir -p "$TEST_TMP/sci-fc"
    cat > "$TEST_TMP/sci-fc/ci-profile.yaml" <<'EOF'
version: 1
project: fc-test
tier: strict
languages: [any]
hooks:
  pre-commit: [check-unstaged]
EOF
    echo "old content" > "$TEST_TMP/sci-fc/.pre-commit-config.yaml"
    cd "$PROJECT_DIR"
    bash "$_SCI_SCRIPT" --consumer "$TEST_TMP/sci-fc" --force > "$TEST_TMP/out" 2>&1
    grep -q 'old content' "$TEST_TMP/sci-fc/.pre-commit-config.yaml" && { echo "file not overwritten with --force"; return 1; } || true
    grep -q 'AUTO-GENERATED' "$TEST_TMP/sci-fc/.pre-commit-config.yaml" || { echo "file not generated"; return 1; }
}
_run_test "scaffold: --force overwrites" test_scaffold_force_overwrites

test_scaffold_entry_shell_kind() {
    mkdir -p "$TEST_TMP/sci-kind"
    cat > "$TEST_TMP/sci-kind/ci-profile.yaml" <<'EOF'
version: 1
project: kind-test
tier: strict
languages: [any]
hooks:
  pre-commit: [check-unstaged]
EOF
    cd "$PROJECT_DIR"
    bash "$_SCI_SCRIPT" --consumer "$TEST_TMP/sci-kind" --force > "$TEST_TMP/out" 2>&1
    grep -q "bash -c" "$TEST_TMP/sci-kind/.pre-commit-config.yaml" || { echo "missing shell entry"; return 1; }
    grep -q "checks.sh" "$TEST_TMP/sci-kind/.pre-commit-config.yaml" || { echo "missing checks.sh source"; return 1; }
}
_run_test "scaffold: shell kind renders bash -c entry" test_scaffold_entry_shell_kind

test_scaffold_entry_makefile_target() {
    mkdir -p "$TEST_TMP/sci-mk"
    cat > "$TEST_TMP/sci-mk/ci-profile.yaml" <<'EOF'
version: 1
project: mk-test
tier: strict
languages: [any]
hooks:
  pre-commit:
    - check-unstaged
    - ci-lint
EOF
    cd "$PROJECT_DIR"
    bash "$_SCI_SCRIPT" --consumer "$TEST_TMP/sci-mk" --force > "$TEST_TMP/out" 2>&1
    grep -q 'make lint' "$TEST_TMP/sci-mk/.pre-commit-config.yaml" || { echo "missing make lint entry"; return 1; }
}
_run_test "scaffold: makefile_target renders make entry" test_scaffold_entry_makefile_target

test_scaffold_entry_python_module() {
    mkdir -p "$TEST_TMP/sci-pm"
    cat > "$TEST_TMP/sci-pm/ci-profile.yaml" <<'EOF'
version: 1
project: pm-test
tier: strict
languages: [any]
hooks:
  pre-commit:
    - check-unstaged
    - check-required-hooks-present
EOF
    cd "$PROJECT_DIR"
    bash "$_SCI_SCRIPT" --consumer "$TEST_TMP/sci-pm" --force > "$TEST_TMP/out" 2>&1
    grep -q 'python -m ci.check_required_hooks_present' "$TEST_TMP/sci-pm/.pre-commit-config.yaml" || { echo "missing python module entry"; return 1; }
}
_run_test "scaffold: python_module renders venv python entry" test_scaffold_entry_python_module

test_scaffold_entry_shell_with_arg() {
    mkdir -p "$TEST_TMP/sci-swa"
    cat > "$TEST_TMP/sci-swa/ci-profile.yaml" <<'EOF'
version: 1
project: swa-test
tier: strict
languages: [any]
hooks:
  pre-commit: [check-unstaged]
  commit-msg: [check-commit-message]
EOF
    cd "$PROJECT_DIR"
    bash "$_SCI_SCRIPT" --consumer "$TEST_TMP/sci-swa" --force > "$TEST_TMP/out" 2>&1
    grep -q 'check-commit-message' "$TEST_TMP/sci-swa/.pre-commit-config.yaml" || { echo "missing commit-msg hook"; return 1; }
    grep -q '"\$1"' "$TEST_TMP/sci-swa/.pre-commit-config.yaml" || { echo "missing \$1 arg"; return 1; }
}
_run_test "scaffold: shell_with_arg renders with \$1" test_scaffold_entry_shell_with_arg

test_scaffold_override_entry() {
    mkdir -p "$TEST_TMP/sci-ov"
    cat > "$TEST_TMP/sci-ov/ci-profile.yaml" <<'EOF'
version: 1
project: ov-test
tier: strict
languages: [any]
hooks:
  pre-commit: [check-unstaged]
overrides:
  check-unstaged:
    entry: "custom-command-here"
EOF
    cd "$PROJECT_DIR"
    bash "$_SCI_SCRIPT" --consumer "$TEST_TMP/sci-ov" --force > "$TEST_TMP/out" 2>&1
    grep -q 'custom-command-here' "$TEST_TMP/sci-ov/.pre-commit-config.yaml" || { echo "missing override entry"; return 1; }
    grep -q 'ci_check_unstaged' "$TEST_TMP/sci-ov/.pre-commit-config.yaml" && { echo "original entry should not be present"; return 1; } || true
}
_run_test "scaffold: override entry replaces default" test_scaffold_override_entry

test_scaffold_poc_tier() {
    mkdir -p "$TEST_TMP/sci-poc"
    cat > "$TEST_TMP/sci-poc/ci-profile.yaml" <<'EOF'
version: 1
project: poc-test
tier: poc
languages: [any]
hooks:
  pre-commit: [check-unstaged]
EOF
    cd "$PROJECT_DIR"
    bash "$_SCI_SCRIPT" --consumer "$TEST_TMP/sci-poc" --force > "$TEST_TMP/out" 2>&1
    [[ -f "$TEST_TMP/sci-poc/.pre-commit-config.yaml" ]] || { echo "no output for poc"; return 1; }
    grep -q 'ci-lint' "$TEST_TMP/sci-poc/.pre-commit-config.yaml" && { echo "ci-lint should not be in poc tier"; return 1; } || true
    grep -q 'check-unstaged' "$TEST_TMP/sci-poc/.pre-commit-config.yaml" || { echo "missing safety hook"; return 1; }
}
_run_test "scaffold: poc tier excludes non-safety mandatory" test_scaffold_poc_tier

test_emit_template_generates() {
    cd "$PROJECT_DIR"
    bash "$_SCI_SCRIPT" --emit-template --dry-run > "$TEST_TMP/out" 2>&1
    grep -q 'check-unstaged' "$TEST_TMP/out" || { echo "missing check-unstaged in template"; return 1; }
    grep -q 'ci-check-push' "$TEST_TMP/out" || { echo "missing ci-check-push in template"; return 1; }
    grep -q 'Total hooks:' "$TEST_TMP/out" || { echo "missing total count"; return 1; }
}
_run_test "emit-template: generates all hooks" test_emit_template_generates

test_emit_template_dry_run_no_write() {
    cd "$PROJECT_DIR"
    local before=""
    if [[ -f "$PROJECT_DIR/templates/ci-profile.template.yaml" ]]; then
        before="$(cat "$PROJECT_DIR/templates/ci-profile.template.yaml")"
    fi
    bash "$_SCI_SCRIPT" --emit-template --dry-run > "$TEST_TMP/out" 2>&1
    if [[ -n "$before" ]]; then
        local after
        after="$(cat "$PROJECT_DIR/templates/ci-profile.template.yaml")"
        [[ "$before" == "$after" ]] || { echo "dry-run modified template file"; return 1; }
    fi
}
_run_test "emit-template: dry-run does not write" test_emit_template_dry_run_no_write
