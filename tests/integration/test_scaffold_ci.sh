#!/usr/bin/env bash
# scaffold-ci integration tests.
# Sourced by run_tests_integration.sh, requires test_helpers.sh loaded first.
#
# These tests create real temp directories, run the scaffold-ci script
# end-to-end, and assert on filesystem state.

echo ""
echo "=== scaffold-ci integration tests ==="

_SCI_SCRIPT="$PROJECT_DIR/scripts/scaffold-ci"

# ── Full end-to-end scaffold ───────────────────────────────────────────────

test_scaffold_full_e2e() {
    local consumer="$TEST_TMP/workspace/projects/CONSUMER-E2E"
    mkdir -p "$consumer"
    cat > "$consumer/ci-profile.yaml" <<'EOF'
version: 1
project: consumer-e2e
tier: strict
languages: [rust]
hooks:
  pre-commit:
    - check-unstaged
    - gitleaks
  commit-msg:
    - check-commit-message
  pre-push:
    - ci-check-push
EOF
    cd "$PROJECT_DIR"
    bash "$_SCI_SCRIPT" --consumer "$consumer" > "$TEST_TMP/out" 2>&1

    [[ -f "$consumer/.pre-commit-config.yaml" ]] || { echo "no .pre-commit-config.yaml"; return 1; }
    [[ -f "$consumer/Makefile" ]] || { echo "no Makefile"; return 1; }
    [[ -f "$consumer/config/coverage_thresholds.yaml" ]] || { echo "no coverage_thresholds"; return 1; }
    [[ -f "$consumer/config/dead_code.yaml" ]] || { echo "no dead_code"; return 1; }
    [[ -f "$consumer/quality_exceptions.yaml" ]] || { echo "no quality_exceptions"; return 1; }

    grep -q 'check-unstaged' "$consumer/.pre-commit-config.yaml" || { echo "missing check-unstaged"; return 1; }
    grep -q 'gitleaks' "$consumer/.pre-commit-config.yaml" || { echo "missing gitleaks"; return 1; }
    grep -q 'check-commit-message' "$consumer/.pre-commit-config.yaml" || { echo "missing check-commit-message"; return 1; }
    grep -q 'ci-check-push' "$consumer/.pre-commit-config.yaml" || { echo "missing ci-check-push"; return 1; }

    grep -q 'source_path: consumer-e2e' "$consumer/config/coverage_thresholds.yaml" || { echo "coverage not substituted"; return 1; }
    grep -q 'scan_paths: \[src\]' "$consumer/config/dead_code.yaml" || { echo "dead_code not substituted"; return 1; }
    grep -q 'project: consumer-e2e' "$consumer/quality_exceptions.yaml" || { echo "qe project not substituted"; return 1; }

    for t in init install install-ci install-hooks sync check lint type-check test clean preflight; do
        grep -q "^$t:" "$consumer/Makefile" || { echo "missing Makefile target: $t"; return 1; }
    done
}
_run_test "scaffold_full: end-to-end strict rust" test_scaffold_full_e2e

# ── Dry-run writes nothing ─────────────────────────────────────────────────

test_scaffold_dry_run_integration() {
    local consumer="$TEST_TMP/workspace/projects/DRY-RUN-TEST"
    mkdir -p "$consumer"
    cat > "$consumer/ci-profile.yaml" <<'EOF'
version: 1
project: dry-run-test
tier: strict
languages: [any]
hooks:
  pre-commit: [check-unstaged]
EOF
    cd "$PROJECT_DIR"
    bash "$_SCI_SCRIPT" --consumer "$consumer" --dry-run > "$TEST_TMP/out" 2>&1

    [[ ! -f "$consumer/.pre-commit-config.yaml" ]] || { echo "dry-run wrote .pre-commit-config.yaml"; return 1; }
    [[ ! -f "$consumer/Makefile" ]] || { echo "dry-run wrote Makefile"; return 1; }
    [[ ! -f "$consumer/quality_exceptions.yaml" ]] || { echo "dry-run wrote quality_exceptions"; return 1; }
    [[ ! -d "$consumer/config" ]] || { echo "dry-run wrote config/"; return 1; }

    grep -q 'Would write' "$TEST_TMP/out" || { echo "missing dry-run header"; return 1; }
    grep -q 'check-unstaged' "$TEST_TMP/out" || { echo "missing hook in dry-run output"; return 1; }
}
_run_test "scaffold_dry_run: writes nothing to disk" test_scaffold_dry_run_integration

# ── Force overwrites .pre-commit-config.yaml and Makefile ──────────────────

test_scaffold_force_overwrites() {
    local consumer="$TEST_TMP/workspace/projects/FORCE-TEST"
    mkdir -p "$consumer"
    cat > "$consumer/ci-profile.yaml" <<'EOF'
version: 1
project: force-test
tier: strict
languages: [any]
hooks:
  pre-commit: [check-unstaged]
EOF
    echo "old content" > "$consumer/.pre-commit-config.yaml"
    echo "old makefile" > "$consumer/Makefile"

    cd "$PROJECT_DIR"
    # --force-precommit overwrites the pre-commit config (a backup is written);
    # the customised Makefile is NOT touched by --force-precommit.
    bash "$_SCI_SCRIPT" --consumer "$consumer" --force-precommit --yes > "$TEST_TMP/out" 2>&1
    grep -q 'old content' "$consumer/.pre-commit-config.yaml" && { echo "config not overwritten"; return 1; } || true
    grep -q 'AUTO-GENERATED' "$consumer/.pre-commit-config.yaml" || { echo "config not generated"; return 1; }
    # Makefile preserved (force-precommit must not touch it).
    grep -q 'old makefile' "$consumer/Makefile" || { echo "Makefile was touched by --force-precommit"; return 1; }
    # A customised Makefile must REFUSE --force-all (5a guard).
    local rc=0
    bash "$_SCI_SCRIPT" --consumer "$consumer" --force-all --yes > "$TEST_TMP/out2" 2>&1 || rc=$?
    [[ $rc -ne 0 ]] || { echo "customised Makefile was overwritten by --force-all"; return 1; }
    grep -q 'customised' "$TEST_TMP/out2" || { echo "missing customised refusal"; return 1; }
    grep -q 'old makefile' "$consumer/Makefile" || { echo "Makefile changed despite refusal"; return 1; }
}
_run_test "scaffold_force: granular force + customised Makefile refused" test_scaffold_force_overwrites

# ── No --force preserves existing files ────────────────────────────────────

test_scaffold_no_force_preserves() {
    local consumer="$TEST_TMP/workspace/projects/NO-FORCE-TEST"
    mkdir -p "$consumer"
    cat > "$consumer/ci-profile.yaml" <<'EOF'
version: 1
project: no-force-test
tier: strict
languages: [any]
hooks:
  pre-commit: [check-unstaged]
EOF
    echo "custom config" > "$consumer/.pre-commit-config.yaml"
    echo "custom makefile" > "$consumer/Makefile"

    cd "$PROJECT_DIR"
    bash "$_SCI_SCRIPT" --consumer "$consumer" > "$TEST_TMP/out" 2>&1

    grep -q 'custom config' "$consumer/.pre-commit-config.yaml" || { echo "config was overwritten"; return 1; }
    grep -q 'custom makefile' "$consumer/Makefile" || { echo "Makefile was overwritten"; return 1; }
    grep -q 'Skipped' "$TEST_TMP/out" || { echo "missing skip message"; return 1; }
}
_run_test "scaffold_no_force: preserves existing files" test_scaffold_no_force_preserves

# ── quality_exceptions.yaml never overwritten ──────────────────────────────

test_scaffold_qe_preserved() {
    local consumer="$TEST_TMP/workspace/projects/QE-TEST"
    mkdir -p "$consumer"
    cat > "$consumer/ci-profile.yaml" <<'EOF'
version: 1
project: qe-test
tier: strict
languages: [any]
hooks:
  pre-commit: [check-unstaged]
EOF
    echo "custom exceptions" > "$consumer/quality_exceptions.yaml"

    cd "$PROJECT_DIR"
    bash "$_SCI_SCRIPT" --consumer "$consumer" > "$TEST_TMP/out" 2>&1

    grep -q 'custom exceptions' "$consumer/quality_exceptions.yaml" || { echo "quality_exceptions was overwritten"; return 1; }
    grep -q 'quality_exceptions' "$TEST_TMP/out" || { echo "missing skip message"; return 1; }
}
_run_test "scaffold_qe: never overwritten even with --force" test_scaffold_qe_preserved

# ── Vendored tier exits clean ──────────────────────────────────────────────

test_scaffold_vendored_exits_clean() {
    local consumer="$TEST_TMP/workspace/projects/VENDORED-TEST"
    mkdir -p "$consumer"
    cat > "$consumer/ci-profile.yaml" <<'EOF'
version: 1
project: vendored-test
tier: vendored
languages: [any]
EOF
    cd "$PROJECT_DIR"
    local rc=0
    bash "$_SCI_SCRIPT" --consumer "$consumer" > "$TEST_TMP/out" 2>&1 || rc=$?
    [[ $rc -eq 0 ]] || { echo "expected exit 0, got $rc"; cat "$TEST_TMP/out"; return 1; }
    [[ ! -f "$consumer/.pre-commit-config.yaml" ]] || { echo "should not write for vendored"; return 1; }
    [[ ! -f "$consumer/Makefile" ]] || { echo "should not write for vendored"; return 1; }
    grep -q 'no CI integration' "$TEST_TMP/out" || { echo "missing vendored message"; return 1; }
}
_run_test "scaffold_vendored: exits 0, writes nothing" test_scaffold_vendored_exits_clean

# ── Missing profile file ───────────────────────────────────────────────────

test_scaffold_missing_profile() {
    local consumer="$TEST_TMP/workspace/projects/NO-PROFILE"
    mkdir -p "$consumer"
    cd "$PROJECT_DIR"
    local rc=0
    bash "$_SCI_SCRIPT" --consumer "$consumer" > "$TEST_TMP/out" 2>&1 || rc=$?
    [[ $rc -ne 0 ]] || { echo "expected non-zero exit"; return 1; }
    grep -q 'Profile not found' "$TEST_TMP/out" || { echo "wrong error message"; return 1; }
}
_run_test "scaffold_missing: profile not found fails" test_scaffold_missing_profile

# ── Unknown hook ID ────────────────────────────────────────────────────────

test_scaffold_unknown_hook() {
    local consumer="$TEST_TMP/workspace/projects/UNKNOWN-HOOK"
    mkdir -p "$consumer"
    cat > "$consumer/ci-profile.yaml" <<'EOF'
version: 1
project: unknown-test
tier: strict
languages: [any]
hooks:
  pre-commit:
    - nonexistent-hook
EOF
    cd "$PROJECT_DIR"
    local rc=0
    bash "$_SCI_SCRIPT" --consumer "$consumer" > "$TEST_TMP/out" 2>&1 || rc=$?
    [[ $rc -ne 0 ]] || { echo "expected non-zero exit"; return 1; }
    grep -q 'not registered' "$TEST_TMP/out" || { echo "missing not-registered message"; return 1; }
}
_run_test "scaffold_unknown_hook: fails with diagnostic" test_scaffold_unknown_hook

# ── Auto-inserted mandatory hooks appear in output ─────────────────────────

test_scaffold_auto_insert_appears() {
    local consumer="$TEST_TMP/workspace/projects/AUTO-INSERT"
    mkdir -p "$consumer"
    cat > "$consumer/ci-profile.yaml" <<'EOF'
version: 1
project: auto-insert-test
tier: strict
languages: [any]
hooks:
  pre-commit: [check-unstaged]
EOF
    cd "$PROJECT_DIR"
    bash "$_SCI_SCRIPT" --consumer "$consumer" > "$TEST_TMP/out" 2>&1

    grep -q 'auto-inserted' "$TEST_TMP/out" || { echo "missing auto-insert message"; return 1; }
    grep -q 'block-sensitive-files' "$consumer/.pre-commit-config.yaml" || { echo "missing block-sensitive-files"; return 1; }
    grep -q 'ci-lint' "$consumer/.pre-commit-config.yaml" || { echo "missing ci-lint"; return 1; }
    grep -q 'block-coauthored' "$consumer/.pre-commit-config.yaml" || { echo "missing block-coauthored"; return 1; }
    grep -q 'block-coauthored-history' "$consumer/.pre-commit-config.yaml" || { echo "missing block-coauthored-history"; return 1; }
}
_run_test "scaffold_auto_insert: mandatory hooks in output" test_scaffold_auto_insert_appears

# ── POC tier only inserts safety hooks ─────────────────────────────────────

test_scaffold_poc_only_safety() {
    local consumer="$TEST_TMP/workspace/projects/POC-TEST"
    mkdir -p "$consumer"
    cat > "$consumer/ci-profile.yaml" <<'EOF'
version: 1
project: poc-test
tier: poc
languages: [any]
hooks:
  pre-commit: [check-unstaged]
EOF
    cd "$PROJECT_DIR"
    bash "$_SCI_SCRIPT" --consumer "$consumer" > "$TEST_TMP/out" 2>&1

    grep -q 'check-unstaged' "$consumer/.pre-commit-config.yaml" || { echo "missing user hook"; return 1; }
    grep -q 'gitleaks' "$consumer/.pre-commit-config.yaml" || { echo "missing safety hook gitleaks"; return 1; }
    grep -q 'block-sensitive-files' "$consumer/.pre-commit-config.yaml" || { echo "missing safety block-sensitive-files"; return 1; }

    grep -q 'ci-lint' "$consumer/.pre-commit-config.yaml" && { echo "ci-lint should NOT be in poc tier"; return 1; } || true
    grep -q 'ci-type-check' "$consumer/.pre-commit-config.yaml" && { echo "ci-type-check should NOT be in poc tier"; return 1; } || true
    grep -q 'check-file-length' "$consumer/.pre-commit-config.yaml" && { echo "check-file-length should NOT be in poc tier"; return 1; } || true
}
_run_test "scaffold_poc: only safety mandatory hooks" test_scaffold_poc_only_safety

# ─--emit-template generates full template ─────────────────────────────────

test_scaffold_emit_template() {
    cd "$PROJECT_DIR"
    bash "$_SCI_SCRIPT" --emit-template --dry-run > "$TEST_TMP/out" 2>&1

    grep -q 'pre-commit:' "$TEST_TMP/out" || { echo "missing pre-commit stage"; return 1; }
    grep -q 'commit-msg:' "$TEST_TMP/out" || { echo "missing commit-msg stage"; return 1; }
    grep -q 'pre-push:' "$TEST_TMP/out" || { echo "missing pre-push stage"; return 1; }
    grep -q 'check-unstaged' "$TEST_TMP/out" || { echo "missing check-unstaged"; return 1; }
    grep -q 'ci-check-push' "$TEST_TMP/out" || { echo "missing ci-check-push"; return 1; }
    grep -q 'Total hooks:' "$TEST_TMP/out" || { echo "missing total"; return 1; }

    local hook_count
    hook_count="$(grep -c '  - ' "$TEST_TMP/out")"
    [[ "$hook_count" -ge 15 ]] || { echo "expected >=15 hooks, got $hook_count"; return 1; }
}
_run_test "scaffold_emit_template: full template with all hooks" test_scaffold_emit_template

# ── Generated Makefile passes contract-check ───────────────────────────────

test_scaffold_makefile_contract() {
    local consumer="$TEST_TMP/workspace/projects/CONTRACT-TEST"
    mkdir -p "$consumer"
    cat > "$consumer/ci-profile.yaml" <<'EOF'
version: 1
project: contract-test
tier: strict
languages: [any]
hooks:
  pre-commit: [check-unstaged]
EOF
    cd "$PROJECT_DIR"
    bash "$_SCI_SCRIPT" --consumer "$consumer" > "$TEST_TMP/out" 2>&1

    for t in init install install-ci install-hooks sync check lint type-check test clean preflight; do
        if ! grep -q "^$t:" "$consumer/Makefile"; then
            echo "missing target: $t"
            return 1
        fi
    done

    grep -q 'makefile_contract.mk' "$consumer/Makefile" || { echo "missing contract include"; return 1; }
    grep -q 'CI_DIR' "$consumer/Makefile" || { echo "missing CI_DIR"; return 1; }
    grep -q 'generate-hooks' "$consumer/Makefile" || { echo "missing generate-hooks ref"; return 1; }
}
_run_test "scaffold_makefile: contract targets present" test_scaffold_makefile_contract

# ── Generated config has correct relative paths ───────────────────────────

test_scaffold_relative_paths() {
    local consumer="$TEST_TMP/workspace/projects/REL-PATH-TEST"
    mkdir -p "$consumer"
    cat > "$consumer/ci-profile.yaml" <<'EOF'
version: 1
project: rel-path-test
tier: strict
languages: [any]
hooks:
  pre-commit: [check-unstaged]
EOF
    cd "$PROJECT_DIR"
    bash "$_SCI_SCRIPT" --consumer "$consumer" > "$TEST_TMP/out" 2>&1

    local rel_ci
    rel_ci="$(realpath --relative-to="$consumer" "$PROJECT_DIR")"
    grep -q "$rel_ci" "$consumer/.pre-commit-config.yaml" || { echo "missing rel path in precommit"; return 1; }
    grep -q "$rel_ci" "$consumer/Makefile" || { echo "missing rel path in Makefile"; return 1; }
}
_run_test "scaffold_rel_paths: correct relative paths in output" test_scaffold_relative_paths

# ── Override entry is written verbatim ─────────────────────────────────────

test_scaffold_override_verbatim() {
    local consumer="$TEST_TMP/workspace/projects/OVERRIDE-TEST"
    mkdir -p "$consumer"
    cat > "$consumer/ci-profile.yaml" <<'EOF'
version: 1
project: override-test
tier: strict
languages: [any]
hooks:
  pre-commit:
    - check-unstaged
    - check-markdown-docs
overrides:
  check-markdown-docs:
    entry: "my-custom-entry --flag"
EOF
    cd "$PROJECT_DIR"
    bash "$_SCI_SCRIPT" --consumer "$consumer" > "$TEST_TMP/out" 2>&1

    grep -q 'my-custom-entry --flag' "$consumer/.pre-commit-config.yaml" || { echo "missing override entry"; return 1; }
}
_run_test "scaffold_override: entry written verbatim" test_scaffold_override_verbatim

# ── Python language gets empty dead_code scan_paths ────────────────────────

test_scaffold_python_dead_code() {
    local consumer="$TEST_TMP/workspace/projects/PY-DC-TEST"
    mkdir -p "$consumer"
    cat > "$consumer/ci-profile.yaml" <<'EOF'
version: 1
project: py-dc-test
tier: strict
languages: [python]
hooks:
  pre-commit: [check-unstaged]
EOF
    cd "$PROJECT_DIR"
    bash "$_SCI_SCRIPT" --consumer "$consumer" > "$TEST_TMP/out" 2>&1

    grep -q 'scan_paths: \[\]' "$consumer/config/dead_code.yaml" || { echo "missing empty scan_paths"; return 1; }
}
_run_test "scaffold_python: dead_code gets empty scan_paths" test_scaffold_python_dead_code

# ── Rust language gets [src] dead_code scan_paths ──────────────────────────

test_scaffold_rust_dead_code() {
    local consumer="$TEST_TMP/workspace/projects/RS-DC-TEST"
    mkdir -p "$consumer"
    cat > "$consumer/ci-profile.yaml" <<'EOF'
version: 1
project: rs-dc-test
tier: strict
languages: [rust]
hooks:
  pre-commit: [check-unstaged]
EOF
    cd "$PROJECT_DIR"
    bash "$_SCI_SCRIPT" --consumer "$consumer" > "$TEST_TMP/out" 2>&1

    grep -q 'scan_paths: \[src\]' "$consumer/config/dead_code.yaml" || { echo "missing [src] scan_paths"; return 1; }
}
_run_test "scaffold_rust: dead_code gets [src]" test_scaffold_rust_dead_code

# ── Idempotency: running twice with --force produces same output ──────────

test_scaffold_idempotent() {
    local consumer="$TEST_TMP/workspace/projects/IDEMPOTENT-TEST"
    mkdir -p "$consumer"
    cat > "$consumer/ci-profile.yaml" <<'EOF'
version: 1
project: idempotent-test
tier: strict
languages: [any]
hooks:
  pre-commit: [check-unstaged]
EOF
    cd "$PROJECT_DIR"
    bash "$_SCI_SCRIPT" --consumer "$consumer" --force-precommit --yes > "$TEST_TMP/out1" 2>&1
    local first_hash
    first_hash="$(grep -v 'AUTO-GENERATED' "$consumer/.pre-commit-config.yaml" | md5sum)"
    bash "$_SCI_SCRIPT" --consumer "$consumer" --force-precommit --yes > "$TEST_TMP/out2" 2>&1
    local second_hash
    second_hash="$(grep -v 'AUTO-GENERATED' "$consumer/.pre-commit-config.yaml" | md5sum)"

    [[ "$first_hash" == "$second_hash" ]] || { echo "not idempotent: $first_hash != $second_hash"; return 1; }
}
_run_test "scaffold_idempotent: --force-precommit twice produces same output" test_scaffold_idempotent
