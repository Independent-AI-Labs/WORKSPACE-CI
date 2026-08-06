#!/usr/bin/env bash
# generate-hooks emission tests.
# Sourced by run_tests_unit.sh; test_helpers.sh is already loaded.
#
# Covers the boot-PATH bootstrap: the workspace shell guard resets PATH on
# every exec, so generated hooks must export _CI_HOOK_BOOT_PATH in the
# header and re-establish PATH inside every emitted `bash -c '...'` body.
#
# These tests execute the generator. Under the live workspace shell guard
# the agent cannot run the generator, so they skip on guard-protected hosts
# and run in CI/QEMU where the guard is absent.

echo ""
echo "=== generate-hooks emission tests ==="

_GH_SCRIPT="$PROJECT_DIR/scripts/generate-hooks"

_gh_guard_active() {
    local _getcap
    for _getcap in /usr/sbin/getcap /sbin/getcap; do
        [[ -x "$_getcap" ]] || continue
        "$_getcap" /usr/bin/bash 2>/dev/null | grep -q 'cap_dac_override' && return 0
    done
    return 1
}

_gh_fixture() {
    local _dir="$1"
    mkdir -p "$_dir"
    cd "$_dir"
    git init -q .
    cat > .pre-commit-config.yaml <<'EOF'
repos:
  - repo: local
    hooks:
      - id: check-unstaged
        name: check-unstaged
        entry: "bash -c 'source lib/checks.sh && ci_check_unstaged'"
        language: system
        stages: [pre-commit]
        pass_filenames: false
        always_run: true
      - id: check-markdown-docs
        name: check-markdown-docs
        entry: "uv run --project ../CI --no-sync python -m ci.check_markdown_docs --all-md --check-remote"
        language: system
        stages: [pre-commit]
        pass_filenames: false
        always_run: true
EOF
}

test_gh_header_exports_hook_boot_path() {
    if _gh_guard_active; then
        echo "  SKIP: workspace shell guard active (generator runs as root/in CI)"
        return 0
    fi
    _gh_fixture "$TEST_TMP/gh-hdr"
    local _out
    _out="$(bash "$_GH_SCRIPT" --dry-run 2>&1)"

    grep -q '_CI_HOOK_BOOT_PATH="$PATH"' <<< "$_out" || { echo "missing _CI_HOOK_BOOT_PATH header assignment"; return 1; }
    grep -q 'export _CI_HOOK_BOOT_PATH' <<< "$_out" || { echo "missing _CI_HOOK_BOOT_PATH export"; return 1; }
    return 0
}
_run_test "generate-hooks: header exports _CI_HOOK_BOOT_PATH" test_gh_header_exports_hook_boot_path

test_gh_injects_path_bootstrap_into_bash_c_body() {
    if _gh_guard_active; then
        echo "  SKIP: workspace shell guard active (generator runs as root/in CI)"
        return 0
    fi
    _gh_fixture "$TEST_TMP/gh-body"
    local _out
    _out="$(bash "$_GH_SCRIPT" --dry-run 2>&1)"

    grep -qF '"$BASH" -c '\''PATH="$_CI_HOOK_BOOT_PATH"; export PATH; source "$PWD/../CI/lib/checks.sh" && ci_check_unstaged'\''' <<< "$_out" \
        || { echo "missing PATH bootstrap in emitted -c body"; return 1; }
    return 0
}
_run_test "generate-hooks: injects PATH bootstrap into bash -c bodies" test_gh_injects_path_bootstrap_into_bash_c_body

test_gh_non_bash_c_entry_unchanged() {
    if _gh_guard_active; then
        echo "  SKIP: workspace shell guard active (generator runs as root/in CI)"
        return 0
    fi
    _gh_fixture "$TEST_TMP/gh-raw"
    local _out
    _out="$(bash "$_GH_SCRIPT" --dry-run 2>&1)"

    grep -qF 'uv run --project ../CI --no-sync python -m ci.check_markdown_docs --all-md --check-remote' <<< "$_out" \
        || { echo "non-bash-c entry was mangled"; return 1; }
    # The raw entry must NOT gain a PATH bootstrap (no -c body to inject into)
    grep -qF 'PATH="$_CI_HOOK_BOOT_PATH"; export PATH; uv run' <<< "$_out" \
        && { echo "PATH bootstrap leaked into non-bash-c entry"; return 1; }
    return 0
}
_run_test "generate-hooks: non-bash-c entries pass through unchanged" test_gh_non_bash_c_entry_unchanged

test_gh_has_no_immutable_hook_workaround() {
    ! grep -q 'chattr -i\|chattr +i\|lsattr' "$_GH_SCRIPT" \
        || { echo "obsolete immutable-hook handling remains in generator"; return 1; }
}
_run_test "generate-hooks: consumer hooks use ownership-only policy" test_gh_has_no_immutable_hook_workaround
