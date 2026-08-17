#!/usr/bin/env bash
# dev-server.sh <start|stop|disable-autostart>: systemd-user lifecycle for
# the wiki Next.js dev server. The shell guard's alt-interp rule scans make
# recipe command text and blocks interpreter tokens and paths containing
# them (node-env/bin), so the boot node paths and all lifecycle logic live
# here in script context (shell_guard_policy_matrix: script-interp-ok).
# Recipes only pass scalar knobs via env:
#   DEV_PORT DEV_START_INITIAL_SLEEP DEV_START_CURL_TIMEOUT
#   DEV_START_POLL_INTERVAL DEV_START_MAX_ATTEMPTS DEV_SKIP_PREFLIGHT
set -euo pipefail

_SELF="${BASH_SOURCE[0]:-$0}"
case "$_SELF" in /proc/self/fd/*) _SELF="${SHG_SCRIPT_PATH:-$_SELF}" ;; esac
_WEB_ROOT="$(cd "$(dirname "$_SELF")/.." && pwd)"
_CI_ROOT="$(cd "$_WEB_ROOT/.." && pwd)"

case "$(uname -s)" in
    Darwin) _BOOT=.boot-macos ;;
    *)      _BOOT=.boot-linux ;;
esac
_NODE_ENV_BIN="$_CI_ROOT/$_BOOT/node-env/bin"
_NODE="$_NODE_ENV_BIN/node"

SYSTEMD_UNIT=wiki-ci-dev.service
SYSTEMD_DIR="$HOME/.config/systemd/user"
DEV_PORT="${DEV_PORT:-4000}"
DEV_START_INITIAL_SLEEP="${DEV_START_INITIAL_SLEEP:-3}"
DEV_START_CURL_TIMEOUT="${DEV_START_CURL_TIMEOUT:-10}"
DEV_START_POLL_INTERVAL="${DEV_START_POLL_INTERVAL:-2}"
DEV_START_MAX_ATTEMPTS="${DEV_START_MAX_ATTEMPTS:-45}"
DEV_SKIP_PREFLIGHT="${DEV_SKIP_PREFLIGHT:-0}"

_dump_journal() {
    echo "----- journalctl --user -u $SYSTEMD_UNIT -n 80 --no-pager -----"
    journalctl --user -u "$SYSTEMD_UNIT" -n 80 --no-pager
    echo "----- end journal -----"
}

_reset_failed_if_needed() {
    local _tag="$1" _out _rc
    _out=$(systemctl --user is-failed "$SYSTEMD_UNIT" 2>&1) && _rc=0 || _rc=$?
    echo "[$_tag] is-failed check: exit=$_rc out='$_out'"
    if [ "$_rc" -eq 0 ]; then
        systemctl --user reset-failed "$SYSTEMD_UNIT"
    fi
}

do_start() {
    if [ ! -x "$_NODE" ]; then
        echo "ERROR: Bootstrapped Node.js not found at $_NODE"
        exit 1
    fi
    mkdir -p "$SYSTEMD_DIR"
    if [ ! -f "$HOME/.config/wiki-ci-dev.env" ] && [ -f "$_WEB_ROOT/grafana.env.example" ]; then
        echo "[dev-start] Creating $HOME/.config/wiki-ci-dev.env from grafana.env.example"
        cp "$_WEB_ROOT/grafana.env.example" "$HOME/.config/wiki-ci-dev.env"
        echo "[dev-start] Editing $HOME/.config/wiki-ci-dev.env: set GRAFANA_DEV_UPSTREAM to the dev Grafana origin."
    fi
    if [ -f "$HOME/.config/wiki-ci-dev.env" ]; then
        _grafana_url=
        while IFS= read -r _line; do
            case "$_line" in
                GRAFANA_BASE_URL=*) _grafana_url="${_line#GRAFANA_BASE_URL=}" ;;
            esac
        done < "$HOME/.config/wiki-ci-dev.env"
        if [ -n "$_grafana_url" ]; then
            _health_url="${_grafana_url%/}/api/health"
            _health_tmp=$(mktemp); _health_err=$(mktemp)
            if ! curl -fsS --max-time 3 "$_health_url" -o "$_health_tmp" 2>"$_health_err"; then
                echo "[dev-start] WARNING: Grafana health probe failed at $_health_url"
                [ -s "$_health_err" ] && cat "$_health_err" >&2
                echo "[dev-start] Dev wiki proxies /grafana to GRAFANA_DEV_UPSTREAM; leave GRAFANA_BASE_URL unset"
            fi
            rm -f "$_health_tmp" "$_health_err"
        fi
    fi
    echo "[dev-start] Installing systemd user unit -> $SYSTEMD_DIR/$SYSTEMD_UNIT"
    _skip_env=
    if [ "$DEV_SKIP_PREFLIGHT" = "1" ]; then
        _skip_env='Environment="WIKI_DEV_SKIP_PREFLIGHT=1"'
        echo "[dev-start] preflight sync skipped (content synced by caller)"
    fi
    sed \
        -e "s|__PROJECT_ROOT__|$_WEB_ROOT|g" \
        -e "s|__NODE_BIN__|$_NODE_ENV_BIN|g" \
        -e "s|__NODE__|$_NODE|g" \
        -e "s|__DEV_PORT__|$DEV_PORT|g" \
        -e "s|__SKIP_PREFLIGHT_ENV__|$_skip_env|g" \
        "$_WEB_ROOT/res/wiki-ci-dev.service.tmpl" > "$SYSTEMD_DIR/$SYSTEMD_UNIT"
    chmod 0644 "$SYSTEMD_DIR/$SYSTEMD_UNIT"
    systemctl --user daemon-reload
    _reset_failed_if_needed dev-start
    echo "[dev-start] systemctl --user restart $SYSTEMD_UNIT"
    systemctl --user restart "$SYSTEMD_UNIT"
    _is_enabled_out=$(systemctl --user is-enabled "$SYSTEMD_UNIT" 2>&1) && _is_enabled_rc=0 || _is_enabled_rc=$?
    echo "[dev-start] is-enabled check: exit=$_is_enabled_rc out='$_is_enabled_out'"
    if [ "$_is_enabled_rc" -eq 0 ]; then
        echo "[dev-start] NOTE: $SYSTEMD_UNIT is enabled (autostart on login). Run 'make dev-disable-autostart' to turn off."
    fi
    echo "[dev-start] startup log snapshot (last 30 lines):"
    journalctl --user -u "$SYSTEMD_UNIT" -n 30 --no-pager
    sleep "$DEV_START_INITIAL_SLEEP"
    result=$(systemctl --user show "$SYSTEMD_UNIT" -p Result --value 2>&1)
    nrest=$(systemctl --user show "$SYSTEMD_UNIT" -p NRestarts --value 2>&1)
    echo "[dev-start] post-start: Result=$result NRestarts=$nrest"
    if [ "$result" != "success" ] || [ "$nrest" != "0" ]; then
        echo ""
        echo "ERROR: $SYSTEMD_UNIT failed to start (Result=$result, NRestarts=$nrest) - aborting, no HTTP poll."
        _dump_journal
        echo "Hint: Result=exec/203 = binary path wrong or not executable; start-limit-hit = crash-looped."
        exit 1
    fi
    echo "[dev-start] process alive, waiting for HTTP on port $DEV_PORT (curl timeout ${DEV_START_CURL_TIMEOUT}s, max $DEV_START_MAX_ATTEMPTS attempts)..."
    for i in $(seq 1 "$DEV_START_MAX_ATTEMPTS"); do
        state=$(systemctl --user is-active "$SYSTEMD_UNIT" 2>&1)
        nrest=$(systemctl --user show "$SYSTEMD_UNIT" -p NRestarts --value 2>&1)
        _curl_tmp=$(mktemp); _curl_err=$(mktemp)
        code=$(curl -sS -o "$_curl_tmp" -w "%{http_code}" --max-time "$DEV_START_CURL_TIMEOUT" "http://127.0.0.1:$DEV_PORT/" 2>"$_curl_err") && _curl_rc=0 || _curl_rc=$?
        if [ "$_curl_rc" -ne 0 ]; then echo "[dev-start] curl probe (exit=$_curl_rc): $(cat "$_curl_err")" >&2; fi
        rm -f "$_curl_tmp" "$_curl_err"
        echo "[dev-start] attempt $i/$DEV_START_MAX_ATTEMPTS: state=$state http=$code restarts=$nrest"
        if [ "$state" = "failed" ] || [ "$state" = "inactive" ]; then
            echo ""
            echo "ERROR: $SYSTEMD_UNIT is $state - not retrying further."
            _dump_journal
            exit 1
        fi
        if [ "$nrest" != "0" ]; then
            echo ""
            echo "ERROR: process restarted ($nrest times) during startup - crash loop detected."
            _dump_journal
            exit 1
        fi
        if echo "$code" | grep -qE '^2'; then
            echo ""
            echo "[dev-start] Dev server ready - http://0.0.0.0:$DEV_PORT"
            echo "[dev-start] Logs:  make dev-logs"
            echo "[dev-start] Stop:  make dev-stop"
            exit 0
        fi
        sleep "$DEV_START_POLL_INTERVAL"
    done
    echo ""
    echo "ERROR: Dev server did not respond within probe window (process alive but no HTTP)."
    _dump_journal
    exit 1
}

do_stop() {
    echo "[dev-stop] systemctl --user stop $SYSTEMD_UNIT"
    systemctl --user stop "$SYSTEMD_UNIT" 2>&1 && _stop_rc=0 || _stop_rc=$?
    if [ "$_stop_rc" -ne 0 ]; then
        echo "[dev-stop] stop returned $_stop_rc (ok if not running)"
    fi
    echo "[dev-stop] systemctl --user disable $SYSTEMD_UNIT"
    systemctl --user disable "$SYSTEMD_UNIT" 2>&1 && _disable_rc=0 || _disable_rc=$?
    if [ "$_disable_rc" -ne 0 ]; then
        echo "[dev-stop] disable returned $_disable_rc (ok if not enabled)"
    fi
    _reset_failed_if_needed dev-stop
    rm -f "$SYSTEMD_DIR/$SYSTEMD_UNIT"
    systemctl --user daemon-reload
    echo "[dev-stop] Done. Unit file removed."
}

do_disable_autostart() {
    systemctl --user disable "$SYSTEMD_UNIT" 2>&1 && _disable_rc=0 || _disable_rc=$?
    if [ "$_disable_rc" -ne 0 ]; then
        echo "[dev-disable-autostart] disable returned $_disable_rc (ok if unit missing)"
    fi
    echo "[dev-disable-autostart] $SYSTEMD_UNIT will not start on login until 'make dev-start' runs again."
}

case "${1:-}" in
    start) do_start ;;
    stop) do_stop ;;
    disable-autostart) do_disable_autostart ;;
    *)
        echo "usage: dev-server.sh <start|stop|disable-autostart>" >&2
        exit 2
        ;;
esac
