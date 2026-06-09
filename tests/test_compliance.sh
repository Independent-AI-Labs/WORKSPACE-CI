# CI tests: ci_compliance_score
# Sourced by run_tests.sh, requires test_helpers.sh loaded first.

echo ""
echo "=== ci_compliance_score tests ==="

# Helper: set up a project dir inside the test workspace with git init
_setup_project() {
    local name="${1:-testproject}"
    local pdir="$TEST_TMP/workspace/projects/$name"
    mkdir -p "$pdir"
    if [[ ! -d "$pdir/.git" ]]; then
        git -C "$pdir" init -q
        git -C "$pdir" commit --allow-empty -m "feat: init" -q
    fi
    echo "$pdir"
}

# Helper: install fake CI hooks into a project
_install_fake_hooks() {
    local pdir="$1"
    mkdir -p "$pdir/.git/hooks"
    echo '#!/bin/bash' > "$pdir/.git/hooks/pre-commit"
    echo '# CI generated' >> "$pdir/.git/hooks/pre-commit"
    echo '#!/bin/bash' > "$pdir/.git/hooks/pre-push"
    echo '# CI generated' >> "$pdir/.git/hooks/pre-push"
}

# Helper: create a minimal .pre-commit-config.yaml with all required hooks
_write_full_precommit() {
    local pdir="$1"
    cat > "$pdir/.pre-commit-config.yaml" <<'YAML'
repos:
  - repo: local
    hooks:
      - id: block-sensitive-files
        name: Block Sensitive Files
        entry: "bash -c 'echo ok'"
        language: system
      - id: check-banned-words
        name: Check Banned Words
        entry: "bash -c 'echo ok'"
        language: system
      - id: check-commit-message
        name: Check Commit Message
        entry: "bash -c 'echo ok'"
        language: system
        stages: [commit-msg]
      - id: block-coauthored
        name: Block Co-authored
        entry: "bash -c 'echo ok'"
        language: system
        stages: [commit-msg]
  - repo: local
    hooks:
      - id: block-coauthored-history
        name: Block History
        entry: "bash -c 'echo ok'"
        language: system
        stages: [pre-push]
      - id: verify-coverage
        name: Verify Coverage
        entry: "bash -c 'echo ok'"
        language: system
        stages: [pre-push]
      - id: check-markdown-docs
        name: Check Markdown Docs
        entry: "bash -c 'echo ok' --check-remote"
        language: system
        types: [markdown]
YAML
}

# =========================================================================
# Tests
# =========================================================================

test_compliance_empty_project() {
    _source_lib
    local pdir
    pdir="$(_setup_project empty)"
    local rc=0
    ci_compliance_score "$pdir" || rc=$?
    # Empty project should fail (many violations)
    [[ $rc -eq 1 ]]
}
_run_test "compliance: empty project fails" test_compliance_empty_project

test_compliance_perfect_project() {
    _source_lib
    local pdir
    pdir="$(_setup_project perfect)"

    # .pre-commit-config.yaml with all hooks
    _write_full_precommit "$pdir"

    # Native hooks
    _install_fake_hooks "$pdir"

    # Makefile with generate-hooks
    cat > "$pdir/Makefile" <<'MK'
install-hooks:
	bash generate-hooks
MK

    # Coverage config
    mkdir -p "$pdir/config"
    cat > "$pdir/config/coverage_thresholds.yaml" <<'YAML'
unit:
  path: tests/unit
  min_coverage: 90
  source_path: src
YAML

    # .gitignore
    echo '.env' > "$pdir/.gitignore"

    # Test directory
    mkdir -p "$pdir/tests"

    # pyproject.toml (language detection)
    echo '[project]' > "$pdir/pyproject.toml"

    # quality_exceptions.yaml (Q3 — strict-tier mandatory)
    cat > "$pdir/quality_exceptions.yaml" <<'YAML'
version: 1
project: perfect
exceptions: []
YAML

    # Stage all files so git ls-files returns them (not the parent repo)
    git -C "$pdir" add -A 2>/dev/null
    if git -C "$pdir" diff --cached --quiet; then
        :  # nothing staged
    else
        git -C "$pdir" commit -m "feat: init files" -q
    fi 2>/dev/null

    local rc=0
    ci_compliance_score "$pdir" || rc=$?
    [[ $rc -eq 0 ]]
}
_run_test "compliance: perfect project passes" test_compliance_perfect_project

test_compliance_detects_python() {
    _source_lib
    local pdir
    pdir="$(_setup_project pyproj)"
    echo '[project]' > "$pdir/pyproject.toml"

    local output
    local _rc=0; output="$(ci_compliance_score "$pdir" 2>&1)" || _rc=$?
    echo "$output" | grep -q "Language: python"
}
_run_test "compliance: detects python language" test_compliance_detects_python

test_compliance_detects_node() {
    _source_lib
    local pdir
    pdir="$(_setup_project nodeproj)"
    echo '{}' > "$pdir/package.json"

    local output
    local _rc=0; output="$(ci_compliance_score "$pdir" 2>&1)" || _rc=$?
    echo "$output" | grep -q "Language: node"
}
_run_test "compliance: detects node language" test_compliance_detects_node

test_compliance_detects_rust() {
    _source_lib
    local pdir
    pdir="$(_setup_project rustproj)"
    echo '[package]' > "$pdir/Cargo.toml"

    local output
    local _rc=0; output="$(ci_compliance_score "$pdir" 2>&1)" || _rc=$?
    echo "$output" | grep -q "Language: rust"
}
_run_test "compliance: detects rust language" test_compliance_detects_rust

test_compliance_r5_skipped_no_tests() {
    _source_lib
    local pdir
    pdir="$(_setup_project notests)"
    _write_full_precommit "$pdir"

    local output
    local _rc=0; output="$(ci_compliance_score "$pdir" 2>&1)" || _rc=$?
    # R5 should show N/A, not a failure
    echo "$output" | grep -q '\[~\].*R5'
}
_run_test "compliance: R5 skipped when no test dir" test_compliance_r5_skipped_no_tests

test_compliance_missing_hooks_fails_h2_h3() {
    _source_lib
    local pdir
    pdir="$(_setup_project nohooks)"
    _write_full_precommit "$pdir"
    # Don't install hooks, H2 and H3 should fail

    local output
    local _rc=0; output="$(ci_compliance_score "$pdir" 2>&1)" || _rc=$?
    echo "$output" | grep -q '\[ \].*H2'
    echo "$output" | grep -q '\[ \].*H3'
}
_run_test "compliance: missing hooks fails H2/H3" test_compliance_missing_hooks_fails_h2_h3

test_compliance_missing_coverage_config() {
    _source_lib
    local pdir
    pdir="$(_setup_project nocov)"
    mkdir -p "$pdir/tests"
    # No config/coverage_thresholds.yaml, C1 should fail

    local output
    local _rc=0; output="$(ci_compliance_score "$pdir" 2>&1)" || _rc=$?
    echo "$output" | grep -q '\[ \].*C1'
}
_run_test "compliance: missing coverage config fails C1" test_compliance_missing_coverage_config

test_compliance_score_in_output() {
    _source_lib
    local pdir
    pdir="$(_setup_project scorecheck)"

    local output
    local _rc=0; output="$(ci_compliance_score "$pdir" 2>&1)" || _rc=$?
    # Should contain COMPLIANCE: XX% format
    echo "$output" | grep -qE 'COMPLIANCE: [0-9]+%'
}
_run_test "compliance: score percentage in output" test_compliance_score_in_output

test_compliance_tier_in_output() {
    _source_lib
    local pdir
    pdir="$(_setup_project tiercheck)"

    local output
    local _rc=0; output="$(ci_compliance_score "$pdir" 2>&1)" || _rc=$?
    # Should contain Tier A through Tier F
    echo "$output" | grep -qE 'Tier [A-F]'
}
_run_test "compliance: tier in output" test_compliance_tier_in_output

# ── enforcement_mode resolution (shell mirror of Python tests) ─────────────

test_enforcement_mode_default_warn_when_missing() {
    _source_lib
    local _out
    _out="$(ci_resolve_enforcement_mode /tmp/no-such-registry-$$ 2>&1)"
    [[ "$_out" == "warn" ]]
}
_run_test "enforcement_mode: default 'warn' when registry missing" test_enforcement_mode_default_warn_when_missing

test_enforcement_mode_reads_warn() {
    _source_lib
    local _f
    _f="$(mktemp)"
    cat > "$_f" <<'YAML'
version: 1
enforcement_mode: warn
defaults:
  tier: strict
YAML
    local _out
    _out="$(ci_resolve_enforcement_mode "$_f")"
    rm -f "$_f"
    [[ "$_out" == "warn" ]]
}
_run_test "enforcement_mode: reads 'warn' from registry" test_enforcement_mode_reads_warn

test_enforcement_mode_reads_enforce() {
    _source_lib
    local _f
    _f="$(mktemp)"
    cat > "$_f" <<'YAML'
version: 1
enforcement_mode: enforce
defaults:
  tier: strict
YAML
    local _out
    _out="$(ci_resolve_enforcement_mode "$_f")"
    rm -f "$_f"
    [[ "$_out" == "enforce" ]]
}
_run_test "enforcement_mode: reads 'enforce' from registry" test_enforcement_mode_reads_enforce

test_enforcement_mode_unknown_falls_back_to_warn() {
    _source_lib
    local _f
    _f="$(mktemp)"
    cat > "$_f" <<'YAML'
version: 1
enforcement_mode: bogus
defaults:
  tier: strict
YAML
    local _out
    _out="$(ci_resolve_enforcement_mode "$_f")"
    rm -f "$_f"
    [[ "$_out" == "warn" ]]
}
_run_test "enforcement_mode: unknown value falls back to warn" test_enforcement_mode_unknown_falls_back_to_warn
