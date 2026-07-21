#!/usr/bin/env bash
# CI Dependency Vulnerability Scanning: osv-scanner wrapper.
#
# Sourced by checks.sh. Requires ci.sh to be loaded first.
#
# Implements REQ-CVE-SCAN FR-2: recursive lockfile scan against the live
# OSV.dev database. Fail-closed on findings, fail-open (WARN, exit 0)
# when the scanner or network is unavailable so offline development is
# never blocked.

# --- ci_scan_vulnerabilities ---
# Scans the repo for supported lockfiles (uv.lock, package-lock.json,
# pnpm-lock.yaml, yarn.lock, bun.lock, Cargo.lock, go.mod) and checks
# them against the live OSV.dev vulnerability database.
#
# Exit contract:
#   0: scan completed with no findings, OR scan unavailable (offline,
#      binary missing) -- unavailability is always a loud WARN.
#   1: scan completed and found vulnerabilities.
#
# Environment:
#   OSV_SCANNER_FORMAT  : "json" emits the scanner JSON report (default:
#                         human-readable vertical output).
#   OSV_SCANNER_OUTPUT  : file path for JSON report (default: stdout).
ci_scan_vulnerabilities() {
    local _vs_bin
    _vs_bin="$(command -v osv-scanner)" || {
        ci_warn "osv-scanner not found on PATH; vulnerability scan SKIPPED"
        echo "  Fix: run scripts/bootstrap-osv-scanner (or make install)" >&2
        return 0
    }

    local _vs_root
    _vs_root="$(git rev-parse --show-toplevel)"

    # Discover supported lockfiles, excluding binary/vendored trees.
    local _vs_lockfiles
    _vs_lockfiles="$(find "$_vs_root" \
        \( -name .git -o -name "$CI_BOOT_NAME" -o -name .venv \
           -o -name node_modules -o -name dist -o -name build \
           -o -name .next \) -prune \
        -o -type f \( -name uv.lock -o -name package-lock.json \
           -o -name pnpm-lock.yaml -o -name yarn.lock -o -name bun.lock \
           -o -name Cargo.lock -o -name go.mod \) -print)"

    if [[ -z "$_vs_lockfiles" ]]; then
        ci_pass "vulnerability scan: no supported lockfiles; skipped"
        return 0
    fi

    local _vs_count
    _vs_count="$(printf '%s\n' "$_vs_lockfiles" | grep -c .)"

    local -a _vs_args=(scan source)
    local _vs_lf
    while IFS= read -r _vs_lf; do
        _vs_args+=(--lockfile="$_vs_lf")
    done <<< "$_vs_lockfiles"
    if [[ "${OSV_SCANNER_FORMAT:-}" == "json" ]]; then
        _vs_args+=(--format=json)
        if [[ -n "${OSV_SCANNER_OUTPUT:-}" ]]; then
            _vs_args+=(--output-file="$OSV_SCANNER_OUTPUT")
        fi
    else
        _vs_args+=(--format=vertical)
    fi
    if [[ -f "$_vs_root/osv-scanner.toml" ]]; then
        _vs_args+=(--config="$_vs_root/osv-scanner.toml")
    fi

    local _vs_err _vs_rc=0
    _vs_err="$(mktemp)"
    "$_vs_bin" "${_vs_args[@]}" 2>"$_vs_err" || _vs_rc=$?

    if [[ "$_vs_rc" -eq 0 ]]; then
        ci_pass "vulnerability scan: no known vulnerabilities in $_vs_count lockfile(s)"
        rm -f "$_vs_err"
        return 0
    fi

    # Distinguish findings (fail-closed) from infrastructure/network
    # failure (fail-open). osv-scanner exits 1 for vulnerabilities;
    # higher codes indicate operational errors. Network signatures are
    # also matched on stderr for exit-1 runs that failed mid-scan.
    if [[ "$_vs_rc" -gt 1 ]] || grep -qiE 'dial tcp|no such host|connection refused|timeout|temporary failure|network is unreachable|EOF' "$_vs_err"; then
        ci_warn "vulnerability scan UNAVAILABLE (offline or scanner error); SKIPPED"
        cat "$_vs_err" >&2
        rm -f "$_vs_err"
        return 0
    fi

    ci_fail "vulnerability scan: advisories found in dependencies (scan output above)"
    echo "  Fix: upgrade affected packages, or suppress via osv-scanner.toml with a reason." >&2
    rm -f "$_vs_err"
    return 1
}
