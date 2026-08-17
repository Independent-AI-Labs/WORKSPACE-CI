#!/usr/bin/env bash

test_reinstall_hooks_exists() {
    [[ -x "$PROJECT_DIR/scripts/reinstall-hooks" ]]
}
_run_test "reinstall-hooks exists" test_reinstall_hooks_exists
