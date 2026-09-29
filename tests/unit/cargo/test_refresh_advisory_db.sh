#!/usr/bin/env bash
# scripts/refresh-advisory-db tests.
# Sourced by run_tests_unit.sh; test_helpers.sh is already loaded.

_REFRESH_SCRIPT="$PROJECT_DIR/scripts/refresh-advisory-db"

# _refresh_mock <path> <contents>: write an executable mock.
_refresh_mock() {
    local _path="$1" _body="$2"
    mkdir -p "$(dirname "$_path")"
    printf '%s\n' "$_body" > "$_path"
    chmod +x "$_path"
}

# _refresh_mock_git <bindir> <epoch_file>: git that reports a fixed epoch.
_refresh_mock_git() {
    _refresh_mock "$1/git" "#!/bin/sh
cat \"$2\""
}

# _refresh_mock_deny <cargohome> <args_file> <exit_code>
_refresh_mock_deny() {
    _refresh_mock "$1/bin/cargo-deny" "#!/bin/sh
printf '%s\n' \"\$*\" >> \"$2\"
exit $3"
}

# _refresh_run <dir> <script args...>: run the script with isolated env.
_refresh_run() {
    local _dir="$1"
    shift
    (
        export HOME="$_dir/home"
        export CARGO_HOME="$_dir/cargo"
        export WORKSPACE_ADVISORY_DB_PATH="$_dir/db"
        export WORKSPACE_CARGO_DENY_BIN="$_dir/cargo/bin/cargo-deny"
        export PATH="$_dir/bin:$PATH"
        source "$_REFRESH_SCRIPT" "$@" || exit 1
    )
}

test_refresh_skips_when_fresh() {
    local _dir="$TEST_TMP"
    mkdir -p "$_dir/home" "$_dir/db/advisory-db-mock/.git" "$_dir/bin"
    printf '%s\n' "$(( $(date +%s) + 100000 ))" > "$_dir/epoch"
    _refresh_mock_git "$_dir/bin" "$_dir/epoch"
    _refresh_mock_deny "$_dir/cargo" "$_dir/deny.args" 0

    local _rc=0
    _refresh_run "$_dir" --if-stale >"$_dir/out" 2>"$_dir/err" || _rc=$?

    [[ $_rc -eq 0 ]] || { echo "rc=$_rc"; cat "$_dir/err"; return 1; }
    if [[ -e "$_dir/deny.args" ]]; then
        echo "cargo-deny ran for a fresh database"
        return 1
    fi
    return 0
}

test_refresh_fetches_when_stale() {
    local _dir="$TEST_TMP"
    mkdir -p "$_dir/home" "$_dir/db/advisory-db-old/.git" "$_dir/bin"
    printf '0\n' > "$_dir/epoch"
    _refresh_mock_git "$_dir/bin" "$_dir/epoch"
    _refresh_mock_deny "$_dir/cargo" "$_dir/deny.args" 0

    local _rc=0
    _refresh_run "$_dir" --if-stale >"$_dir/out" 2>"$_dir/err" || _rc=$?

    [[ $_rc -eq 0 ]] || { echo "rc=$_rc"; cat "$_dir/err"; return 1; }
    if [[ ! -f "$_dir/deny.args" ]]; then
        echo "cargo-deny did not run for a stale database"
        return 1
    fi
    if ! grep -q 'fetch db' "$_dir/deny.args"; then
        echo "fetch db not requested: $(cat "$_dir/deny.args")"
        return 1
    fi
    if [[ -e "$_dir/db/advisory-db-old" ]]; then
        echo "cached checkout was not removed before the clone"
        return 1
    fi
    return 0
}

test_refresh_always_fetches_without_flag() {
    local _dir="$TEST_TMP"
    mkdir -p "$_dir/home" "$_dir/db" "$_dir/bin"
    _refresh_mock_deny "$_dir/cargo" "$_dir/deny.args" 0

    local _rc=0
    _refresh_run "$_dir" >"$_dir/out" 2>"$_dir/err" || _rc=$?

    [[ $_rc -eq 0 ]] || { echo "rc=$_rc"; cat "$_dir/err"; return 1; }
    grep -q 'fetch db' "$_dir/deny.args" || { echo "fetch db not requested"; return 1; }
    return 0
}

test_refresh_if_stale_tolerates_fetch_failure() {
    local _dir="$TEST_TMP"
    mkdir -p "$_dir/home" "$_dir/db" "$_dir/bin"
    printf '0\n' > "$_dir/epoch"
    _refresh_mock_git "$_dir/bin" "$_dir/epoch"
    _refresh_mock_deny "$_dir/cargo" "$_dir/deny.args" 1

    local _rc=0
    _refresh_run "$_dir" --if-stale >"$_dir/out" 2>"$_dir/err" || _rc=$?

    [[ $_rc -eq 0 ]] || { echo "rc=$_rc"; cat "$_dir/err"; return 1; }
    grep -q 'keeping the cached advisory database' "$_dir/err" \
        || { echo "no tolerance message"; cat "$_dir/err"; return 1; }
    return 0
}

test_refresh_default_mode_fails_on_fetch_error() {
    local _dir="$TEST_TMP"
    mkdir -p "$_dir/home" "$_dir/db" "$_dir/bin"
    _refresh_mock_deny "$_dir/cargo" "$_dir/deny.args" 1

    local _rc=0
    _refresh_run "$_dir" >"$_dir/out" 2>"$_dir/err" || _rc=$?

    if [[ $_rc -eq 0 ]]; then
        echo "default mode tolerated a failed fetch"
        return 1
    fi
    return 0
}

test_refresh_requires_cargo_deny() {
    local _dir="$TEST_TMP"
    mkdir -p "$_dir/home" "$_dir/db" "$_dir/cargo/bin"

    local _rc=0
    _refresh_run "$_dir" >"$_dir/out" 2>"$_dir/err" || _rc=$?

    if [[ $_rc -eq 0 ]]; then
        echo "missing cargo-deny was accepted"
        return 1
    fi
    grep -q 'cargo-deny not found' "$_dir/err" \
        || { echo "missing diagnostic"; cat "$_dir/err"; return 1; }
    return 0
}

test_refresh_default_db_path_uses_cargo_home() {
    local _dir="$TEST_TMP"
    mkdir -p "$_dir/user" "$_dir/bin"
    _refresh_mock_deny "$_dir/cargo" "$_dir/deny.args" 0

    local _rc=0
    (
        export HOME="$_dir/user"
        export CARGO_HOME="$_dir/cargo"
        export WORKSPACE_CARGO_DENY_BIN="$_dir/cargo/bin/cargo-deny"
        export PATH="$_dir/bin:$PATH"
        unset WORKSPACE_ADVISORY_DB_PATH
        source "$_REFRESH_SCRIPT" || exit 1
    ) >"$_dir/out" 2>"$_dir/err" || _rc=$?

    [[ $_rc -eq 0 ]] || { echo "rc=$_rc"; cat "$_dir/err"; return 1; }
    local _cfg="$_dir/user/.cache/workspace-ci/advisory-db-probe/deny.toml"
    grep -qF "db-path = \"$_dir/cargo/advisory-dbs\"" "$_cfg" \
        || { echo "default db-path is not CARGO_HOME/advisory-dbs: $(cat "$_cfg")"; return 1; }
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
         test_refresh_if_stale_tolerates_fetch_failure \
         test_refresh_default_mode_fails_on_fetch_error \
         test_refresh_default_db_path_uses_cargo_home \
         test_cargo_deny_config_discovers_upward \
         test_refresh_requires_cargo_deny; do
    _run_test "$t" "$t"
done
