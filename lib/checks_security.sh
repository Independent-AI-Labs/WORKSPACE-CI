#!/usr/bin/env bash
# Bounded, fail-closed dependency vulnerability scan.

ci_scan_vulnerabilities() {
    local root scanner config validator lockfiles output errors rc=0 size first_lockfile
    root="$(git rev-parse --show-toplevel)" || return 1
    scanner="$(ci_resolve_tool_path "$root" osv-scanner)" || {
        ci_fail "osv-scanner is required"
        return 1
    }
    config="$root/osv-scanner.toml"
    validator="$CI_PROJECT_ROOT/ci/validate_osv_config.py"
    [[ -f "$config" ]] || { ci_fail "missing OSV configuration: $config"; return 1; }
    if ! ci_uv_run "$validator" "$config"; then
        ci_fail "invalid OSV suppression configuration"
        return 1
    fi

    lockfiles="$(mktemp)"
    output="$(mktemp)"
    errors="$(mktemp)"
    trap 'rm -f "$lockfiles" "$output" "$errors"' RETURN
    find "$root" \
        \( -name .git -o -name "$CI_BOOT_NAME" -o -name .venv -o -name node_modules -o -name target -o -name .next \) -prune \
        -o -type f \( -name uv.lock -o -name package-lock.json -o -name Cargo.lock -o -name go.mod \) -print \
        | sort > "$lockfiles"
    [[ -s "$lockfiles" ]] || { ci_fail "vulnerability scan found no lockfiles"; return 1; }

    # Refresh is visible but non-authoritative; validation below is always offline.
    # osv-scanner rejects --download-offline-databases unless offline mode is on,
    # and each ecosystem database is fetched only when its lockfile is scanned,
    # so refresh every lockfile with a cold-download-sized timeout.
    while IFS= read -r first_lockfile; do
        timeout --signal=TERM --kill-after=10s 300s "$scanner" scan source \
            --offline --offline-vulnerabilities --download-offline-databases \
            --config="$config" --lockfile="$first_lockfile" \
            --format=json --output-file="$output" \
            || ci_warn "OSV database refresh failed for $first_lockfile; using cached database"
    done < "$lockfiles"

    local args=(scan source --offline --offline-vulnerabilities --config="$config" --format=json --output-file="$output")
    while IFS= read -r lockfile; do args+=(--lockfile="$lockfile"); done < "$lockfiles"
    : > "$output"
    (
        ulimit -f 2048
        ulimit -v 1048576
        timeout --signal=TERM --kill-after=5s 120s "$scanner" "${args[@]}"
    ) 2> "$errors" || rc=$?
    size="$(wc -c < "$output")"
    if [[ "$size" -gt 1048576 ]]; then
        ci_fail "OSV output exceeded 1 MiB"
        return 1
    fi
    if [[ "$rc" -ne 0 ]]; then
        cat "$errors" >&2
        ci_fail "vulnerability scan failed or advisories found (exit $rc)"
        return 1
    fi
    [[ -s "$output" ]] || { ci_fail "OSV scanner produced no result"; return 1; }
    ci_pass "offline vulnerability scan completed without findings"
}
