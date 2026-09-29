#!/usr/bin/env bash
# scripts/refresh-advisory-db tests.
# Sourced by run_tests_unit.sh; test_helpers.sh is already loaded.

_REFRESH_SCRIPT="$PROJECT_DIR/scripts/refresh-advisory-db"
_REFRESH_DIR="advisory-db-3157b0e258782691"

# _refresh_mock <path> <contents>: write an executable mock.
_refresh_mock() {
    local _path="$1" _body="$2"
    mkdir -p "$(dirname "$_path")"
    printf '%s\n' "$_body" > "$_path"
    chmod +x "$_path"
}

# _refresh_mock_git <bindir> <epoch_file> <clone_log>: git that reports a
# fixed epoch for `log` and records successful `clone` invocations, creating
# the destination with the shape the script expects.
_refresh_mock_git() {
    _refresh_mock "$1/git" "#!/bin/sh
if [ \"\$1\" = \"-C\" ]; then
    cat \"$2\"
    exit 0
fi
if [ \"\$1\" = \"clone\" ]; then
    printf '%s\n' \"\$*\" >> \"$3\"
    mkdir -p \"\$5/.git\" \"\$5/crates\"
    exit 0
fi
exit 0"
}

# _refresh_mock_git_fail_clone <bindir> <epoch_file>: git that reports a
# fixed epoch but fails every clone.
_refresh_mock_git_fail_clone() {
    _refresh_mock "$1/git" "#!/bin/sh
if [ \"\$1\" = \"-C\" ]; then
    cat \"$2\"
    exit 0
fi
exit 1"
}

# _refresh_run <dir> <script args...>: run the script with isolated env.
_refresh_run() {
    local _dir="$1"
    shift
    (
        export HOME="$_dir/home"
        export CARGO_HOME="$_dir/cargo"
        export WORKSPACE_ADVISORY_DB_PATH="$_dir/db"
        export PATH="$_dir/bin:$PATH"
        source "$_REFRESH_SCRIPT" "$@" || exit 1
    )
}

test_refresh_skips_when_fresh() {
    local _dir="$TEST_TMP"
    mkdir -p "$_dir/home" "$_dir/db/$_REFRESH_DIR/.git" "$_dir/bin"
    printf '%s\n' "$(( $(date +%s) + 100000 ))" > "$_dir/epoch"
    _refresh_mock_git "$_dir/bin" "$_dir/epoch" "$_dir/clone.log"

    local _rc=0
    _refresh_run "$_dir" --if-stale >"$_dir/out" 2>"$_dir/err" || _rc=$?

    [[ $_rc -eq 0 ]] || { echo "rc=$_rc"; cat "$_dir/err"; return 1; }
    if [[ -e "$_dir/clone.log" ]]; then
        echo "cloned for a fresh database"
        return 1
    fi
    return 0
}

test_refresh_fetches_when_stale() {
    local _dir="$TEST_TMP"
    mkdir -p "$_dir/home" "$_dir/db/$_REFRESH_DIR/.git" "$_dir/bin"
    printf '0\n' > "$_dir/epoch"
    _refresh_mock_git "$_dir/bin" "$_dir/epoch" "$_dir/clone.log"

    local _rc=0
    _refresh_run "$_dir" --if-stale >"$_dir/out" 2>"$_dir/err" || _rc=$?

    [[ $_rc -eq 0 ]] || { echo "rc=$_rc"; cat "$_dir/err"; return 1; }
    if [[ ! -f "$_dir/clone.log" ]]; then
        echo "no clone for a stale database"
        return 1
    fi
    if ! grep -qF 'https://github.com/rustsec/advisory-db' "$_dir/clone.log"; then
        echo "clone did not target the RustSec url: $(cat "$_dir/clone.log")"
        return 1
    fi
    if [[ ! -d "$_dir/db/$_REFRESH_DIR/crates" ]]; then
        echo "refreshed checkout has no crates directory"
        return 1
    fi
    return 0
}

test_refresh_always_fetches_without_flag() {
    local _dir="$TEST_TMP"
    mkdir -p "$_dir/home" "$_dir/db" "$_dir/bin"
    printf '0\n' > "$_dir/epoch"
    _refresh_mock_git "$_dir/bin" "$_dir/epoch" "$_dir/clone.log"

    local _rc=0
    _refresh_run "$_dir" >"$_dir/out" 2>"$_dir/err" || _rc=$?

    [[ $_rc -eq 0 ]] || { echo "rc=$_rc"; cat "$_dir/err"; return 1; }
    grep -q 'clone' "$_dir/clone.log" || { echo "no clone recorded"; return 1; }
    [[ -d "$_dir/db/$_REFRESH_DIR/crates" ]] || { echo "no checkout"; return 1; }
    return 0
}

test_refresh_if_stale_keeps_database_on_failure() {
    local _dir="$TEST_TMP"
    mkdir -p "$_dir/home" "$_dir/db/$_REFRESH_DIR/.git" "$_dir/bin"
    printf '0\n' > "$_dir/epoch"
    printf 'keep\n' > "$_dir/db/$_REFRESH_DIR/marker"
    _refresh_mock_git_fail_clone "$_dir/bin" "$_dir/epoch"

    local _rc=0
    _refresh_run "$_dir" --if-stale >"$_dir/out" 2>"$_dir/err" || _rc=$?

    [[ $_rc -eq 0 ]] || { echo "rc=$_rc"; cat "$_dir/err"; return 1; }
    grep -q 'keeping the cached advisory database' "$_dir/err" \
        || { echo "no tolerance message"; cat "$_dir/err"; return 1; }
    if [[ ! -e "$_dir/db/$_REFRESH_DIR/marker" ]]; then
        echo "failed refresh removed the cached database"
        return 1
    fi
    return 0
}

test_refresh_default_mode_fails_on_fetch_error() {
    local _dir="$TEST_TMP"
    mkdir -p "$_dir/home" "$_dir/db" "$_dir/bin"
    printf '0\n' > "$_dir/epoch"
    _refresh_mock_git_fail_clone "$_dir/bin" "$_dir/epoch"

    local _rc=0
    _refresh_run "$_dir" >"$_dir/out" 2>"$_dir/err" || _rc=$?

    if [[ $_rc -eq 0 ]]; then
        echo "default mode tolerated a failed clone"
        return 1
    fi
    return 0
}

test_refresh_rejects_missing_crates() {
    local _dir="$TEST_TMP"
    mkdir -p "$_dir/home" "$_dir/db" "$_dir/bin"
    _refresh_mock "$_dir/bin/git" "#!/bin/sh
if [ \"\$1\" = \"clone\" ]; then
    mkdir -p \"\$5/.git\"
    exit 0
fi
exit 0"

    local _rc=0
    _refresh_run "$_dir" >"$_dir/out" 2>"$_dir/err" || _rc=$?

    if [[ $_rc -eq 0 ]]; then
        echo "accepted a checkout without crates"
        return 1
    fi
    grep -q 'no crates directory' "$_dir/err" \
        || { echo "missing diagnostic"; cat "$_dir/err"; return 1; }
    return 0
}

test_refresh_default_db_path_uses_cargo_home() {
    local _dir="$TEST_TMP"
    mkdir -p "$_dir/user" "$_dir/bin"
    printf '0\n' > "$_dir/epoch"
    _refresh_mock_git "$_dir/bin" "$_dir/epoch" "$_dir/clone.log"

    local _rc=0
    (
        export HOME="$_dir/user"
        export CARGO_HOME="$_dir/cargo"
        export PATH="$_dir/bin:$PATH"
        unset WORKSPACE_ADVISORY_DB_PATH
        source "$_REFRESH_SCRIPT" || exit 1
    ) >"$_dir/out" 2>"$_dir/err" || _rc=$?

    [[ $_rc -eq 0 ]] || { echo "rc=$_rc"; cat "$_dir/err"; return 1; }
    [[ -d "$_dir/cargo/advisory-dbs/$_REFRESH_DIR/crates" ]] \
        || { echo "default db-path is not CARGO_HOME/advisory-dbs"; return 1; }
    return 0
}

test_cargo_deny_config_discovers_upward() {
    # shellcheck source=lib/checks_cargo.sh
    source "$PROJECT_DIR/lib/checks_cargo.sh" || return 1
    local _dir="$TEST_TMP" _found
    mkdir -p "$_dir/repo/sub"
    printf '[advisories]\n' > "$_dir/repo/deny.toml"
    if ! _found="$(_ci_cargo_deny_config "$_dir/repo/sub")"; then
        echo "parent deny.toml was not discovered"
        return 1
    fi
    [[ "$_found" == "$_dir/repo/deny.toml" ]] || {
        echo "wrong config: $_found"
        return 1
    }
    rm -f "$_dir/repo/deny.toml"
    if [[ -n "$(_ci_cargo_deny_config "$_dir/repo/sub")" ]]; then
        echo "config reported with none on disk"
        return 1
    fi
    return 0
}

echo ""
echo "=== refresh-advisory-db tests ==="

for t in test_refresh_skips_when_fresh \
         test_refresh_fetches_when_stale \
         test_refresh_always_fetches_without_flag \
         test_refresh_if_stale_keeps_database_on_failure \
         test_refresh_default_mode_fails_on_fetch_error \
         test_refresh_rejects_missing_crates \
         test_refresh_default_db_path_uses_cargo_home \
         test_cargo_deny_config_discovers_upward; do
    _run_test "$t" "$t"
done
