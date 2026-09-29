#!/usr/bin/env bash
# Bounded, fail-closed dependency vulnerability scan.

ci_scan_vulnerabilities() {
    local root scanner config validator lockfiles output errors refresh_err rc=0 size first_lockfile
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
    refresh_err="$(mktemp)"
    trap 'rm -f "$lockfiles" "$output" "$errors" "$refresh_err"' RETURN
    find "$root" \
        \( -name .git -o -name "$CI_BOOT_NAME" -o -name .venv -o -name node_modules -o -name target -o -name .next \) -prune \
        -o -type f \( -name uv.lock -o -name package-lock.json -o -name Cargo.lock -o -name go.mod \) -print \
        | sort > "$lockfiles"
    [[ -s "$lockfiles" ]] || { ci_fail "vulnerability scan found no lockfiles"; return 1; }

    # Refresh is visible but non-authoritative; validation below is always
    # offline. osv-scanner rejects --download-offline-databases unless offline
    # mode is on, and each ecosystem database is fetched only when its lockfile
    # is scanned, so refresh every lockfile. osv-scanner exits 1 both for
    # findings and for errors, so a non-zero refresh is only a database failure
    # when it writes to stderr; a finding is left to the offline validation.
    while IFS= read -r first_lockfile; do
        if ! timeout --signal=TERM --kill-after=10s 300s "$scanner" scan source \
            --offline --offline-vulnerabilities --download-offline-databases \
            --config="$config" --lockfile="$first_lockfile" \
            --format=json --output-file="$output" \
            2>"$refresh_err"; then
            if [[ -s "$refresh_err" ]]; then
                ci_warn "OSV database refresh error for $first_lockfile; using cached database"
                cat "$refresh_err" >&2
            fi
        fi
    done < "$lockfiles"

    local args=(scan source --offline --offline-vulnerabilities --config="$config" --format=json --output-file="$output")
    while IFS= read -r lockfile; do args+=(--lockfile="$lockfile"); done < "$lockfiles"
    : > "$output"
    (
        ulimit -f 2048
        ulimit -v 2097152
        timeout --signal=TERM --kill-after=5s 120s "$scanner" "${args[@]}"
    ) 2> "$errors" || rc=$?
    size="$(wc -c < "$output")"
    if [[ "$size" -gt 1048576 ]]; then
        ci_fail "OSV output exceeded 1 MiB"
        return 1
    fi
    if [[ "$rc" -ne 0 ]]; then
        if [[ -s "$output" ]]; then
            {
                echo "osv-scanner reported the following findings:"
                cat "$output"
            } >&2
            ci_fail "vulnerability scan found advisories (exit $rc)"
        else
            cat "$errors" >&2
            ci_fail "vulnerability scan failed (exit $rc)"
        fi
        return 1
    fi
    [[ -s "$output" ]] || { ci_fail "OSV scanner produced no result"; return 1; }
    ci_pass "offline vulnerability scan completed without findings"
}
