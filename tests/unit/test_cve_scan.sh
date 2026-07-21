#!/usr/bin/env bash
# CVE scan tests: ci_scan_vulnerabilities exit-code contract (REQ-CVE-SCAN
# FR-2). Uses a fake osv-scanner binary placed first on PATH so tests are
# deterministic and network-free.
#
# Sourced by run_tests_unit.sh: test_helpers.sh is already loaded. Do NOT
# re-source it here (would reset the global test counters).

# Write a fake osv-scanner into $TEST_TMP/bin. $1 = exit code,
# $2 = stderr text, $3 = args capture file (optional).
_make_fake_osv_scanner() {
    local rc="$1" err="$2" capture="${3:-}"
    mkdir -p "$TEST_TMP/bin"
    cat > "$TEST_TMP/bin/osv-scanner" <<EOF
#!/usr/bin/env bash
$( [[ -n "$capture" ]] && printf 'printf "%%s\\n" "$@" > %q\n' "$capture" )
printf '%s' '$err' >&2
exit $rc
EOF
    chmod +x "$TEST_TMP/bin/osv-scanner"
}

# T1: missing binary -> WARN, exit 0 (fail-open)
test_cve_scan_missing_binary() {
    _source_lib
    local out rc=0
    out="$(PATH="/nonexistent" ci_scan_vulnerabilities 2>&1)" || rc=$?
    [[ "$rc" -eq 0 && "$out" == *"osv-scanner not found"* ]] || {
        echo "  expected rc=0 + missing-binary WARN, got rc=$rc: $out"
        return 1
    }
}

# T2: no lockfiles -> pass, exit 0
test_cve_scan_no_lockfiles() {
    _source_lib
    _make_fake_osv_scanner 0 ""
    local out rc=0
    out="$(PATH="$TEST_TMP/bin:$PATH" ci_scan_vulnerabilities 2>&1)" || rc=$?
    [[ "$rc" -eq 0 && "$out" == *"no supported lockfiles"* ]] || {
        echo "  expected rc=0 + no-lockfiles pass, got rc=$rc: $out"
        return 1
    }
}

# T3: clean scan -> pass, exit 0
test_cve_scan_clean() {
    _source_lib
    touch uv.lock
    _make_fake_osv_scanner 0 ""
    local out rc=0
    out="$(PATH="$TEST_TMP/bin:$PATH" ci_scan_vulnerabilities 2>&1)" || rc=$?
    [[ "$rc" -eq 0 && "$out" == *"no known vulnerabilities"* ]] || {
        echo "  expected rc=0 + clean pass, got rc=$rc: $out"
        return 1
    }
}

# T4: findings -> FAIL, exit 1 (fail-closed)
test_cve_scan_findings() {
    _source_lib
    touch uv.lock
    _make_fake_osv_scanner 1 "CVE-2099-0001: bad package"
    local out rc=0
    out="$(PATH="$TEST_TMP/bin:$PATH" ci_scan_vulnerabilities 2>&1)" || rc=$?
    [[ "$rc" -eq 1 && "$out" == *"advisories found"* ]] || {
        echo "  expected rc=1 + findings FAIL, got rc=$rc: $out"
        return 1
    }
}

# T5: network error on stderr -> WARN, exit 0 (fail-open offline)
test_cve_scan_offline() {
    _source_lib
    touch uv.lock
    _make_fake_osv_scanner 1 "Post https://api.osv.dev/v1/querybatch: dial tcp: no such host"
    local out rc=0
    out="$(PATH="$TEST_TMP/bin:$PATH" ci_scan_vulnerabilities 2>&1)" || rc=$?
    [[ "$rc" -eq 0 && "$out" == *"UNAVAILABLE"* ]] || {
        echo "  expected rc=0 + offline WARN, got rc=$rc: $out"
        return 1
    }
}

# T6: osv-scanner.toml present -> --config passed to scanner
test_cve_scan_config_passthrough() {
    _source_lib
    touch uv.lock
    printf '# suppressions\n' > osv-scanner.toml
    _make_fake_osv_scanner 0 "" "$TEST_TMP/args.txt"
    PATH="$TEST_TMP/bin:$PATH" ci_scan_vulnerabilities >/dev/null 2>&1 || true
    grep -q -- "--config=.*/osv-scanner.toml" "$TEST_TMP/args.txt" || {
        echo "  expected --config passthrough, got args:"
        sed 's/^/    | /' "$TEST_TMP/args.txt"
        return 1
    }
}

# T7: no banned patterns in the new sources (swallow canon + procsub ban)
test_cve_scan_source_hygiene() {
    local bad
    bad="$(grep -nE '2>/dev/null|>/dev/null 2>&1|< <\(|> >\(' \
        "$LIB_DIR/checks_security.sh" "$PROJECT_DIR/scripts/bootstrap-osv-scanner" \
        | grep -v '^[^:]*:[0-9]*:[[:space:]]*#' || true)"
    if [[ -n "$bad" ]]; then
        echo "  banned shell pattern in CVE-scan sources:"
        echo "$bad" | sed 's/^/    /'
        return 1
    fi
    return 0
}

_run_test "cve-scan: missing binary fails open"        test_cve_scan_missing_binary
_run_test "cve-scan: no lockfiles passes"              test_cve_scan_no_lockfiles
_run_test "cve-scan: clean scan passes"                test_cve_scan_clean
_run_test "cve-scan: findings fail closed"             test_cve_scan_findings
_run_test "cve-scan: offline fails open"               test_cve_scan_offline
_run_test "cve-scan: config passthrough"               test_cve_scan_config_passthrough
_run_test "cve-scan: source hygiene (no banned shell)" test_cve_scan_source_hygiene
