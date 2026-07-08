# scaffold-ci inspection-mode tests (--analyze, --diff, --json,
# --append-makefile, --lax-applicable, --apply-* aliases).
# Sourced by run_tests_unit.sh, requires test_helpers.sh loaded first.

echo ""
echo "=== scaffold-ci inspection tests ==="

_SCI_SCRIPT="$PROJECT_DIR/scripts/scaffold-ci"

test_analyze_no_files_generated() {
    mkdir -p "$TEST_TMP/sci-az"
    cat > "$TEST_TMP/sci-az/ci-profile.yaml" <<'EOF'
version: 1
project: az-test
tier: strict
languages: [any]
hooks:
  pre-commit: [check-unstaged]
EOF
    cd "$PROJECT_DIR"
    bash "$_SCI_SCRIPT" --consumer "$TEST_TMP/sci-az" --analyze > "$TEST_TMP/out" 2>&1
    [[ ! -f "$TEST_TMP/sci-az/.pre-commit-config.yaml" ]] || { echo "analyze wrote pc"; return 1; }
    [[ ! -f "$TEST_TMP/sci-az/Makefile" ]] || { echo "analyze wrote Makefile"; return 1; }
    grep -q 'MISSING' "$TEST_TMP/out" || { echo "analyze missing state info"; return 1; }
    grep -q 'scaffold-ci analyze' "$TEST_TMP/out" || { echo "missing analyze header"; return 1; }
}
_run_test "scaffold: --analyze writes nothing" test_analyze_no_files_generated

test_analyze_default_generates_missing() {
    mkdir -p "$TEST_TMP/sci-ad"
    cat > "$TEST_TMP/sci-ad/ci-profile.yaml" <<'EOF'
version: 1
project: ad-test
tier: strict
languages: [any]
hooks:
  pre-commit: [check-unstaged]
EOF
    cd "$PROJECT_DIR"
    bash "$_SCI_SCRIPT" --consumer "$TEST_TMP/sci-ad" > "$TEST_TMP/out" 2>&1
    [[ -f "$TEST_TMP/sci-ad/.pre-commit-config.yaml" ]] || { echo "default should generate missing pc"; return 1; }
    [[ -f "$TEST_TMP/sci-ad/Makefile" ]] || { echo "default should generate missing Makefile"; return 1; }
    grep -q 'Generated' "$TEST_TMP/out" || { echo "missing summary line"; return 1; }
}
_run_test "scaffold: default generates missing files" test_analyze_default_generates_missing

test_diff_mode_no_files_generated() {
    mkdir -p "$TEST_TMP/sci-df"
    cat > "$TEST_TMP/sci-df/ci-profile.yaml" <<'EOF'
version: 1
project: df-test
tier: strict
languages: [any]
hooks:
  pre-commit: [check-unstaged]
EOF
    cd "$PROJECT_DIR"
    bash "$_SCI_SCRIPT" --consumer "$TEST_TMP/sci-df" --diff > "$TEST_TMP/out" 2>&1
    [[ ! -f "$TEST_TMP/sci-df/.pre-commit-config.yaml" ]] || { echo "diff wrote pc"; return 1; }
    grep -q 'would be created' "$TEST_TMP/out" || { echo "missing 'would be created' line"; return 1; }
}
_run_test "scaffold: --diff writes nothing" test_diff_mode_no_files_generated

test_diff_mode_shows_customized() {
    mkdir -p "$TEST_TMP/sci-dc2"
    cat > "$TEST_TMP/sci-dc2/ci-profile.yaml" <<'EOF'
version: 1
project: dc2-test
tier: strict
languages: [any]
hooks:
  pre-commit: [check-unstaged]
EOF
    cd "$PROJECT_DIR"
    bash "$_SCI_SCRIPT" --consumer "$TEST_TMP/sci-dc2" --yes > "$TEST_TMP/out" 2>&1
    echo "# custom edit" >> "$TEST_TMP/sci-dc2/.pre-commit-config.yaml"
    bash "$_SCI_SCRIPT" --consumer "$TEST_TMP/sci-dc2" --diff > "$TEST_TMP/out2" 2>&1
    grep -q 'on disk' "$TEST_TMP/out2" || { echo "missing diff header for customized"; return 1; }
    grep -q 'custom edit' "$TEST_TMP/out2" || { echo "diff should show custom edit"; return 1; }
}
_run_test "scaffold: --diff shows customized content" test_diff_mode_shows_customized

test_json_mode_valid_output() {
    mkdir -p "$TEST_TMP/sci-js"
    cat > "$TEST_TMP/sci-js/ci-profile.yaml" <<'EOF'
version: 1
project: js-test
tier: strict
languages: [any]
hooks:
  pre-commit: [check-unstaged]
EOF
    cd "$PROJECT_DIR"
    bash "$_SCI_SCRIPT" --consumer "$TEST_TMP/sci-js" --json > "$TEST_TMP/out" 2>/tmp/sci-js-err.txt
    [[ ! -f "$TEST_TMP/sci-js/.pre-commit-config.yaml" ]] || { echo "json wrote pc"; return 1; }
    grep -q '"consumer"' "$TEST_TMP/out" || { echo "missing consumer key"; return 1; }
    grep -q '"files"' "$TEST_TMP/out" || { echo "missing files key"; return 1; }
    grep -q '"makefile_targets"' "$TEST_TMP/out" || { echo "missing makefile_targets key"; return 1; }
    grep -q '"hook_drift"' "$TEST_TMP/out" || { echo "missing hook_drift key"; return 1; }
    # Validate JSON parses with python if available.
    if command -v python3 >/dev/null 2>&1; then
        python3 -c "import json,sys; json.load(open('$TEST_TMP/out'))" || { echo "invalid JSON"; return 1; }
    fi
}
_run_test "scaffold: --json produces valid JSON, writes nothing" test_json_mode_valid_output

test_append_makefile_adds_missing() {
    mkdir -p "$TEST_TMP/sci-am"
    cat > "$TEST_TMP/sci-am/ci-profile.yaml" <<'EOF'
version: 1
project: am-test
tier: strict
languages: [any]
hooks:
  pre-commit: [check-unstaged]
EOF
    # Create a Makefile with only one template target.
    printf 'init:\n\t@echo partial\n' > "$TEST_TMP/sci-am/Makefile"
    cd "$PROJECT_DIR"
    bash "$_SCI_SCRIPT" --consumer "$TEST_TMP/sci-am" --append-makefile --yes > "$TEST_TMP/out" 2>&1
    # existing target must survive.
    grep -q '^init:' "$TEST_TMP/sci-am/Makefile" || { echo "existing target lost"; return 1; }
    # missing template target (lint) must be appended now.
    grep -q '^lint:' "$TEST_TMP/sci-am/Makefile" || { echo "lint target not appended"; return 1; }
    grep -q 'Appended by scaffold-ci' "$TEST_TMP/sci-am/Makefile" || { echo "missing append marker"; return 1; }
}
_run_test "scaffold: --append-makefile adds missing targets" test_append_makefile_adds_missing

test_append_makefile_no_changes_when_complete() {
    mkdir -p "$TEST_TMP/sci-am2"
    cat > "$TEST_TMP/sci-am2/ci-profile.yaml" <<'EOF'
version: 1
project: am2-test
tier: strict
languages: [any]
hooks:
  pre-commit: [check-unstaged]
EOF
    cd "$PROJECT_DIR"
    # Generate the full Makefile first.
    bash "$_SCI_SCRIPT" --consumer "$TEST_TMP/sci-am2" --yes > "$TEST_TMP/out" 2>&1
    local _before
    _before="$(cat "$TEST_TMP/sci-am2/Makefile")"
    # Run append on the complete Makefile -- nothing should change.
    bash "$_SCI_SCRIPT" --consumer "$TEST_TMP/sci-am2" --append-makefile --yes > "$TEST_TMP/out2" 2>&1
    grep -q 'no missing targets' "$TEST_TMP/out2" || { echo "should report no missing targets"; return 1; }
    local _after
    _after="$(cat "$TEST_TMP/sci-am2/Makefile")"
    [[ "$_before" == "$_after" ]] || { echo "append modified a complete Makefile"; return 1; }
}
_run_test "scaffold: --append-makefile no-op when complete" test_append_makefile_no_changes_when_complete

test_apply_alias_matches_force() {
    mkdir -p "$TEST_TMP/sci-aa"
    cat > "$TEST_TMP/sci-aa/ci-profile.yaml" <<'EOF'
version: 1
project: aa-test
tier: strict
languages: [any]
hooks:
  pre-commit: [check-unstaged]
EOF
    echo "old content" > "$TEST_TMP/sci-aa/.pre-commit-config.yaml"
    cd "$PROJECT_DIR"
    bash "$_SCI_SCRIPT" --consumer "$TEST_TMP/sci-aa" --apply-precommit --yes > "$TEST_TMP/out" 2>&1
    grep -q 'AUTO-GENERATED' "$TEST_TMP/sci-aa/.pre-commit-config.yaml" || { echo "apply-precommit failed to overwrite"; return 1; }
}
_run_test "scaffold: --apply-precommit alias overwrites" test_apply_alias_matches_force

test_lax_applicable_downgrades_error() {
    mkdir -p "$TEST_TMP/sci-la"
    cat > "$TEST_TMP/sci-la/ci-profile.yaml" <<'EOF'
version: 1
project: la-test
tier: strict
languages: [rust]
hooks:
  pre-commit:
    - check-unstaged
    - check-dead-code
EOF
    cd "$PROJECT_DIR"
    # Without --lax-applicable this is a hard error (check-dead-code is [python], profile is rust).
    local rc=0
    bash "$_SCI_SCRIPT" --consumer "$TEST_TMP/sci-la" > "$TEST_TMP/out" 2>&1 || rc=$?
    [[ $rc -ne 0 ]] || { echo "strict applicable should error"; return 1; }
    grep -q 'applicable_to' "$TEST_TMP/out" || { echo "missing applicable_to hint"; return 1; }
    # With --lax-applicable the error becomes a warning and scaffold succeeds.
    rc=0
    bash "$_SCI_SCRIPT" --consumer "$TEST_TMP/sci-la" --lax-applicable --yes > "$TEST_TMP/out2" 2>&1 || rc=$?
    [[ $rc -eq 0 ]] || { echo "lax-applicable should succeed"; cat "$TEST_TMP/out2"; return 1; }
    grep -q 'WARNING' "$TEST_TMP/out2" || { echo "lax-applicable should emit warning"; return 1; }
}
_run_test "scaffold: --lax-applicable downgrades error to warning" test_lax_applicable_downgrades_error