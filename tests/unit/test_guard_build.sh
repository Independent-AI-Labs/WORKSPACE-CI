#!/bin/bash
# Sourced by run_tests_unit.sh; test_helpers.sh is already loaded.

source "$LIB_DIR/guard-build.sh"
source "$LIB_DIR/guard-drift.sh"

# The git-guard package split moved the privileged binary's release tree to
# $_guard_dir/git-guard/target; the top-level tools package (workspace-git-ssh)
# stays in $_guard_dir/target. These tests pin that two-package contract so a
# future flattening cannot silently point build/drift at the wrong tree.
test_guard_target_dirs_lists_both_package_trees() {
    _guard_dir="/tmp/guard-split"
    local out expected
    expected="/tmp/guard-split/target
/tmp/guard-split/git-guard/target"
    out="$(_guard_target_dirs)"
    _assert_eq "$expected" "$out" "guard target dirs" || return 1
}

test_resolve_guard_bin_prefers_git_guard_release_tree() {
    local bin
    _guard_dir="$TEST_TMP/guard"
    bin="$_guard_dir/git-guard/target/release/workspace-guard"
    mkdir -p "$(dirname "$bin")"
    : > "$bin"
    unset GUARD_BIN
    local out status=0
    out="$(_resolve_guard_bin)" || status=$?
    _assert_eq "0" "$status" "resolve status" || return 1
    _assert_eq "$bin" "$out" "resolved path" || return 1
}

test_resolve_guard_bin_accepts_musl_tree() {
    local bin
    _guard_dir="$TEST_TMP/guard"
    bin="$_guard_dir/git-guard/target/x86_64-unknown-linux-musl/release/workspace-guard"
    mkdir -p "$(dirname "$bin")"
    : > "$bin"
    unset GUARD_BIN
    local out status=0
    out="$(_resolve_guard_bin)" || status=$?
    _assert_eq "0" "$status" "resolve status" || return 1
    _assert_eq "$bin" "$out" "resolved musl path" || return 1
}

test_resolve_guard_bin_honours_explicit_override() {
    local bin
    _guard_dir="$TEST_TMP/guard"
    bin="$TEST_TMP/override-workspace-guard"
    : > "$bin"
    GUARD_BIN="$bin"
    local out status=0
    out="$(_resolve_guard_bin)" || status=$?
    unset GUARD_BIN
    _assert_eq "0" "$status" "resolve status" || return 1
    _assert_eq "$bin" "$out" "override path" || return 1
}

test_resolve_guard_bin_fails_when_absent() {
    _guard_dir="$TEST_TMP/empty-guard"
    mkdir -p "$_guard_dir"
    unset GUARD_BIN
    local out status=0
    out="$(_resolve_guard_bin)" || status=$?
    _assert_eq "1" "$status" "resolve failure status" || return 1
    _assert_eq "" "$out" "no path on failure" || return 1
}

test_guard_cargo_release_build_propagates_failure() {
    cargo() {
        return 42
    }

    local rc=0
    _guard_cargo_release_build build --release || rc=$?
    unset -f cargo

    _assert_eq "42" "$rc" "cargo failure status"
}

test_guard_cargo_release_build_accepts_success() {
    cargo() {
        return 0
    }

    _guard_cargo_release_build build --release
    local rc=$?
    unset -f cargo

    _assert_eq "0" "$rc" "cargo success status"
}

_run_test "guard build propagates Cargo failure" test_guard_cargo_release_build_propagates_failure
_run_test "guard build accepts Cargo success" test_guard_cargo_release_build_accepts_success
_run_test "guard target dirs lists both package trees" test_guard_target_dirs_lists_both_package_trees
_run_test "resolve guard bin prefers git-guard release tree" test_resolve_guard_bin_prefers_git_guard_release_tree
_run_test "resolve guard bin accepts musl tree" test_resolve_guard_bin_accepts_musl_tree
_run_test "resolve guard bin honours explicit override" test_resolve_guard_bin_honours_explicit_override
_run_test "resolve guard bin fails when absent" test_resolve_guard_bin_fails_when_absent
