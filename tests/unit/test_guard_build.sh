#!/bin/bash
# Sourced by run_tests_unit.sh; test_helpers.sh is already loaded.

source "$LIB_DIR/guard-build.sh"

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
