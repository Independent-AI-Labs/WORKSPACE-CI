#!/usr/bin/env bash
# ci_resolve_tool_path and resolve-cloudflared.sh tests.
# Sourced by run_tests_unit.sh; test_helpers.sh is already loaded.

test_resolve_tool_path_walks_up() {
    _setup_tmpdir
    local _ws="$TEST_TMP/workspace"
    local _ci="$TEST_TMP/workspace/projects/WORKSPACE-CI"
    local _boot="$TEST_TMP/workspace/.boot-linux/bin"
    mkdir -p "$_boot" "$_ci/nested/deep"
    printf '#!/bin/sh\necho fake-cloudflared\n' > "$_boot/cloudflared"
    chmod +x "$_boot/cloudflared"

    _source_lib
    local _resolved
    _resolved="$(ci_resolve_tool_path "$_ci/nested/deep" cloudflared)"
    _teardown_tmpdir

    if [[ "$_resolved" != "$_boot/cloudflared" ]]; then
        echo "  expected $_boot/cloudflared, got $_resolved"
        return 1
    fi
    return 0
}

test_resolve_cloudflared_honors_env() {
    _setup_tmpdir
    local _bin="$TEST_TMP/fake-cloudflared"
    printf '#!/bin/sh\necho ok\n' > "$_bin"
    chmod +x "$_bin"

    local _out
    _out="$(CLOUDFLARED_BIN="$_bin" bash "$PROJECT_DIR/scripts/resolve-cloudflared.sh")"
    _teardown_tmpdir

    if [[ "$_out" != "$_bin" ]]; then
        echo "  expected $_bin, got $_out"
        return 1
    fi
    return 0
}

test_resolve_cloudflared_script_walks_up() {
    _setup_tmpdir
    local _ws="$TEST_TMP/workspace"
    local _ci="$TEST_TMP/workspace/projects/WORKSPACE-CI"
    local _boot="$TEST_TMP/workspace/.boot-linux/bin"
    mkdir -p "$_boot" "$_ci"
    printf '#!/bin/sh\necho ok\n' > "$_boot/cloudflared"
    chmod +x "$_boot/cloudflared"
    ln -s "$PROJECT_DIR/lib" "$_ci/lib"
    ln -s "$PROJECT_DIR/scripts" "$_ci/scripts"

    local _out
    _out="$(unset CLOUDFLARED_BIN; CI_PROJECT_ROOT="$_ci" bash "$_ci/scripts/resolve-cloudflared.sh")"
    _teardown_tmpdir

    if [[ "$_out" != "$_boot/cloudflared" ]]; then
        echo "  expected $_boot/cloudflared, got $_out"
        return 1
    fi
    return 0
}

echo ""
echo "=== resolve tool path tests ==="

_RESOLVE_OUT="$(mktemp)"
_RESOLVE_ERR="$(mktemp)"

for t in test_resolve_tool_path_walks_up test_resolve_cloudflared_honors_env \
         test_resolve_cloudflared_script_walks_up; do
    _TESTS_RUN=$((_TESTS_RUN + 1))
    _rc=0
    "$t" > "$_RESOLVE_OUT" 2>"$_RESOLVE_ERR" || _rc=$?
    if [[ $_rc -eq 0 ]]; then
        _TESTS_PASSED=$((_TESTS_PASSED + 1))
        echo -e "  \033[32mPASS\033[0m  $t"
    else
        _TESTS_FAILED=$((_TESTS_FAILED + 1))
        _FAILURES+=("$t")
        echo -e "  \033[31mFAIL\033[0m  $t"
        sed 's/^/    | /' "$_RESOLVE_OUT"
        sed 's/^/    | /' "$_RESOLVE_ERR"
    fi
done

rm -f "$_RESOLVE_OUT" "$_RESOLVE_ERR"