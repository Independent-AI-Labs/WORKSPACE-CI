# scaffold-ci granular force-flag tests.
# Sourced by run_tests_unit.sh, requires test_helpers.sh loaded first.

echo ""
echo "=== scaffold-ci force-flag tests ==="

_SCI_SCRIPT="$PROJECT_DIR/scripts/scaffold-ci"

test_bare_force_is_hard_error() {
    mkdir -p "$TEST_TMP/sci-bf"
    cat > "$TEST_TMP/sci-bf/ci-profile.yaml" <<'EOF'
version: 1
project: bf-test
tier: strict
languages: [any]
hooks: {}
EOF
    cd "$PROJECT_DIR"
    local rc=0
    bash "$_SCI_SCRIPT" --consumer "$TEST_TMP/sci-bf" --force > "$TEST_TMP/out" 2>&1 || rc=$?
    [[ $rc -ne 0 ]] || { echo "bare --force should hard-error"; cat "$TEST_TMP/out"; return 1; }
    grep -q -- '--force is removed' "$TEST_TMP/out" || { echo "missing removal message"; cat "$TEST_TMP/out"; return 1; }
    grep -q -- '--force-precommit' "$TEST_TMP/out" || { echo "missing --force-precommit hint"; return 1; }
    grep -q -- '--force-all'        "$TEST_TMP/out" || { echo "missing --force-all hint"; return 1; }
}
_run_test "scaffold: bare --force is a hard error" test_bare_force_is_hard_error

test_force_without_yes_non_tty_refuses() {
    mkdir -p "$TEST_TMP/sci-ny"
    cat > "$TEST_TMP/sci-ny/ci-profile.yaml" <<'EOF'
version: 1
project: ny-test
tier: strict
languages: [any]
hooks: {}
EOF
    touch "$TEST_TMP/sci-ny/.pre-commit-config.yaml"
    cd "$PROJECT_DIR"
    # stdout redirected to a file: not a TTY, and --yes omitted -> must refuse.
    local rc=0
    bash "$_SCI_SCRIPT" --consumer "$TEST_TMP/sci-ny" --force-precommit > "$TEST_TMP/out" 2>&1 || rc=$?
    [[ $rc -ne 0 ]] || { echo "should refuse without --yes on non-TTY"; return 1; }
    grep -q 'cannot confirm' "$TEST_TMP/out" || { echo "missing non-TTY message"; return 1; }
}
_run_test "scaffold: --force-precommit without --yes on non-TTY refuses" test_force_without_yes_non_tty_refuses

test_makefile_customised_refused() {
    mkdir -p "$TEST_TMP/sci-mf2"
    cat > "$TEST_TMP/sci-mf2/ci-profile.yaml" <<'EOF'
version: 1
project: mf2-test
tier: strict
languages: [any]
hooks:
  pre-commit: [check-unstaged]
EOF
    # First scaffold generates a fresh template Makefile.
    cd "$PROJECT_DIR"
    bash "$_SCI_SCRIPT" --consumer "$TEST_TMP/sci-mf2" --yes > "$TEST_TMP/out" 2>&1
    [[ -f "$TEST_TMP/sci-mf2/Makefile" ]] || { echo "initial Makefile not generated"; return 1; }
    # Customise it by hand.
    echo "# my custom target" >> "$TEST_TMP/sci-mf2/Makefile"
    local _before
    _before="$(cat "$TEST_TMP/sci-mf2/Makefile")"
    # Now force the Makefile: must refuse because it differs from template.
    local rc=0
    bash "$_SCI_SCRIPT" --consumer "$TEST_TMP/sci-mf2" --force-makefile --yes > "$TEST_TMP/out" 2>&1 || rc=$?
    [[ $rc -ne 0 ]] || { echo "customised Makefile was overwritten"; return 1; }
    grep -q 'customised' "$TEST_TMP/out" || { echo "missing refusal message"; cat "$TEST_TMP/out"; return 1; }
    # File on disk unchanged.
    local _after
    _after="$(cat "$TEST_TMP/sci-mf2/Makefile")"
    [[ "$_before" == "$_after" ]] || { echo "Makefile changed despite refusal"; return 1; }
}
_run_test "scaffold: --force-makefile refuses customised Makefile" test_makefile_customised_refused

test_makefile_template_match_overwritten() {
    mkdir -p "$TEST_TMP/sci-mf3"
    cat > "$TEST_TMP/sci-mf3/ci-profile.yaml" <<'EOF'
version: 1
project: mf3-test
tier: strict
languages: [any]
hooks:
  pre-commit: [check-unstaged]
EOF
    cd "$PROJECT_DIR"
    bash "$_SCI_SCRIPT" --consumer "$TEST_TMP/sci-mf3" --yes > "$TEST_TMP/out" 2>&1
    [[ -f "$TEST_TMP/sci-mf3/Makefile" ]] || { echo "initial Makefile not generated"; return 1; }
    # A second --force-makefile run: the existing Makefile differs from the
    # freshly rendered template ONLY by the auto-generated timestamp comment.
    # The 5a guard diffs modulo that line, so this is a safe refresh and MUST
    # succeed (FR-SC-13.1/13.2: consecutive runs differ only by timestamp).
    bash "$_SCI_SCRIPT" --consumer "$TEST_TMP/sci-mf3" --force-makefile --yes > "$TEST_TMP/out" 2>&1 \
        || { echo "refresh of un-customised Makefile failed"; cat "$TEST_TMP/out"; return 1; }
    grep -q 'customised' "$TEST_TMP/out" && { echo "should not report customised"; cat "$TEST_TMP/out"; return 1; } || true
    # A backup of the previous (timestamp-only-different) Makefile is written.
    ls "$TEST_TMP/sci-mf3"/Makefile.scaffold-bak.* 2>/dev/null >/dev/null || { echo "no Makefile backup written"; return 1; }
}
_run_test "scaffold: --force-makefile refreshes un-customised Makefile (modulo timestamp)" test_makefile_template_match_overwritten

test_force_makefile_does_not_touch_configs() {
    mkdir -p "$TEST_TMP/sci-isol-mf"
    cat > "$TEST_TMP/sci-isol-mf/ci-profile.yaml" <<'EOF'
version: 1
project: isol-mf
tier: strict
languages: [any]
hooks:
  pre-commit: [check-unstaged]
EOF
    cd "$PROJECT_DIR"
    bash "$_SCI_SCRIPT" --consumer "$TEST_TMP/sci-isol-mf" --yes > "$TEST_TMP/out" 2>&1
    [[ -f "$TEST_TMP/sci-isol-mf/config/coverage_thresholds.yaml" ]] || { echo "configs not generated"; return 1; }
    # Customise a config file.
    echo "# local edit" >> "$TEST_TMP/sci-isol-mf/config/coverage_thresholds.yaml"
    local _cfg_before
    _cfg_before="$(cat "$TEST_TMP/sci-isol-mf/config/coverage_thresholds.yaml")"
    # Delete Makefile so --force-makefile regenerates it (no refusal path).
    rm -f "$TEST_TMP/sci-isol-mf/Makefile"
    bash "$_SCI_SCRIPT" --consumer "$TEST_TMP/sci-isol-mf" --force-makefile --yes > "$TEST_TMP/out" 2>&1
    # The customised config MUST be untouched (force-makefile must not touch configs).
    local _cfg_after
    _cfg_after="$(cat "$TEST_TMP/sci-isol-mf/config/coverage_thresholds.yaml")"
    [[ "$_cfg_before" == "$_cfg_after" ]] || { echo "configs changed under --force-makefile"; return 1; }
    [[ -f "$TEST_TMP/sci-isol-mf/Makefile" ]] || { echo "Makefile not regenerated"; return 1; }
}
_run_test "scaffold: --force-makefile does not touch config/*.yaml" test_force_makefile_does_not_touch_configs

test_force_configs_does_not_touch_makefile() {
    mkdir -p "$TEST_TMP/sci-isol-cfg"
    cat > "$TEST_TMP/sci-isol-cfg/ci-profile.yaml" <<'EOF'
version: 1
project: isol-cfg
tier: strict
languages: [any]
hooks:
  pre-commit: [check-unstaged]
EOF
    cd "$PROJECT_DIR"
    bash "$_SCI_SCRIPT" --consumer "$TEST_TMP/sci-isol-cfg" --yes > "$TEST_TMP/out" 2>&1
    # Customise the Makefile by hand.
    echo "# my custom Makefile edit" >> "$TEST_TMP/sci-isol-cfg/Makefile"
    local _mf_before
    _mf_before="$(cat "$TEST_TMP/sci-isol-cfg/Makefile")"
    # Force configs only.
    bash "$_SCI_SCRIPT" --consumer "$TEST_TMP/sci-isol-cfg" --force-configs --yes > "$TEST_TMP/out" 2>&1
    local _mf_after
    _mf_after="$(cat "$TEST_TMP/sci-isol-cfg/Makefile")"
    [[ "$_mf_before" == "$_mf_after" ]] || { echo "Makefile changed under --force-configs"; return 1; }
    # And stdout must not contain a backup line for the Makefile.
    grep -q 'Makefile.scaffold-bak' "$TEST_TMP/out" && { echo "Makefile backed up under --force-configs"; return 1; } || true
}
_run_test "scaffold: --force-configs does not touch Makefile" test_force_configs_does_not_touch_makefile

test_no_backup_suppressed() {
    mkdir -p "$TEST_TMP/sci-nb"
    cat > "$TEST_TMP/sci-nb/ci-profile.yaml" <<'EOF'
version: 1
project: nb-test
tier: strict
languages: [any]
hooks:
  pre-commit: [check-unstaged]
EOF
    echo "old content" > "$TEST_TMP/sci-nb/.pre-commit-config.yaml"
    cd "$PROJECT_DIR"
    bash "$_SCI_SCRIPT" --consumer "$TEST_TMP/sci-nb" --force-precommit --yes --no-backup > "$TEST_TMP/out" 2>&1
    # No backup file should exist.
    ls "$TEST_TMP/sci-nb"/.pre-commit-config.yaml.scaffold-bak.* 2>/dev/null && { echo "backup written despite --no-backup"; return 1; } || true
    grep -q 'Backups written' "$TEST_TMP/out" && { echo "backups summary printed despite --no-backup"; return 1; } || true
}
_run_test "scaffold: --no-backup suppresses backups" test_no_backup_suppressed

test_force_configs_backs_up_customised() {
    mkdir -p "$TEST_TMP/sci-cb"
    cat > "$TEST_TMP/sci-cb/ci-profile.yaml" <<'EOF'
version: 1
project: cb-test
tier: strict
languages: [any]
hooks:
  pre-commit: [check-unstaged]
EOF
    cd "$PROJECT_DIR"
    bash "$_SCI_SCRIPT" --consumer "$TEST_TMP/sci-cb" --yes > "$TEST_TMP/out" 2>&1
    echo "# my custom threshold" >> "$TEST_TMP/sci-cb/config/coverage_thresholds.yaml"
    bash "$_SCI_SCRIPT" --consumer "$TEST_TMP/sci-cb" --force-configs --yes > "$TEST_TMP/out" 2>&1
    local _bak
    _bak="$(ls "$TEST_TMP/sci-cb"/config/coverage_thresholds.yaml.scaffold-bak.* 2>/dev/null | head -1)"
    [[ -n "$_bak" ]] || { echo "no backup for customised config"; return 1; }
    grep -q '# my custom threshold' "$_bak" || { echo "backup missing custom edit"; return 1; }
}
_run_test "scaffold: --force-configs backs up customised config" test_force_configs_backs_up_customised