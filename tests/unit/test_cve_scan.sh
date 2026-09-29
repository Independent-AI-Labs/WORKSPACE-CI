#!/usr/bin/env bash
# CVE scan tests: ci_scan_vulnerabilities exit-code contract (REQ-CVE-SCAN
# FR-2). Uses a fake osv-scanner binary placed first on PATH so tests are
# deterministic and network-free.
#
# Sourced by run_tests_unit.sh: test_helpers.sh is already loaded. Do NOT
# re-source it here (would reset the global test counters).

# Write a fake osv-scanner into $TEST_TMP/bin. $1 = exit code,
# $2 = stderr text, $3 = args capture file (optional), $4 = output-file body.
_make_fake_osv_scanner() {
    local rc="$1" err="$2" capture="${3:-}" body="${4:-}"
    mkdir -p "$TEST_TMP/bin"
    cat > "$TEST_TMP/bin/osv-scanner" <<EOF
#!/usr/bin/env bash
$( [[ -n "$capture" ]] && printf 'printf "%%s\\n" "$@" > %q\n' "$capture" )
for arg in "\$@"; do
    case "\$arg" in --output-file=*) printf '%s' '$body' > "\${arg#*=}" ;; esac
done
printf '%s' '$err' >&2
exit $rc
EOF
    chmod +x "$TEST_TMP/bin/osv-scanner"
}

_prepare_osv_config() {
    mkdir -p "$CI_PROJECT_ROOT/ci"
    if ! cmp -s "$PROJECT_DIR/ci/validate_osv_config.py" "$CI_PROJECT_ROOT/ci/validate_osv_config.py"; then
        cp "$PROJECT_DIR/ci/validate_osv_config.py" "$CI_PROJECT_ROOT/ci/"
    fi
    if ! cmp -s "$PROJECT_DIR/osv-scanner.toml" "$CI_PROJECT_ROOT/osv-scanner.toml"; then
        cp "$PROJECT_DIR/osv-scanner.toml" "$CI_PROJECT_ROOT/"
    fi
}

# T1: missing binary -> failure
test_cve_scan_missing_binary() {
    _source_lib
    _prepare_osv_config
    local out rc=0
    out="$(PATH="/usr/bin:/bin" ci_scan_vulnerabilities 2>&1)" || rc=$?
    [[ "$rc" -eq 1 && "$out" == *"osv-scanner is required"* ]] || {
        echo "  expected rc=1 + missing-binary failure, got rc=$rc: $out"
        return 1
    }
}

# T2: no lockfiles -> failure
test_cve_scan_no_lockfiles() {
    _source_lib
    _prepare_osv_config
    _make_fake_osv_scanner 0 ""
    local out rc=0
    out="$(PATH="$TEST_TMP/bin:$PATH" ci_scan_vulnerabilities 2>&1)" || rc=$?
    [[ "$rc" -eq 1 && "$out" == *"found no lockfiles"* ]] || {
        echo "  expected rc=1 + no-lockfiles failure, got rc=$rc: $out"
        return 1
    }
}

# T3: clean scan -> pass, exit 0
test_cve_scan_clean() {
    _source_lib
    _prepare_osv_config
    touch uv.lock
    _make_fake_osv_scanner 0 "" "" '{"results":[]}'
    local out rc=0
    out="$(PATH="$TEST_TMP/bin:$PATH" ci_scan_vulnerabilities 2>&1)" || rc=$?
    [[ "$rc" -eq 0 && "$out" == *"without findings"* ]] || {
        echo "  expected rc=0 + clean pass, got rc=$rc: $out"
        return 1
    }
}

# T4: findings -> FAIL, exit 1, and the advisory identities are reported
# (osv-scanner exits 1 on findings with empty stderr and JSON in the output
# file; the refresh pass must not misreport that as a database failure).
test_cve_scan_findings() {
    _source_lib
    _prepare_osv_config
    touch uv.lock
    _make_fake_osv_scanner 1 "" "" \
        '{"results":[{"packages":[{"package":{"name":"undici","version":"8.9.0"}}],"vulnerabilities":[{"id":"GHSA-3wwx-pv8p-q78v"}]}]}'
    local out rc=0
    out="$(PATH="$TEST_TMP/bin:$PATH" ci_scan_vulnerabilities 2>&1)" || rc=$?
    [[ "$rc" -eq 1 && "$out" == *"found advisories"* ]] || {
        echo "  expected rc=1 + findings FAIL, got rc=$rc: $out"
        return 1
    }
    [[ "$out" == *"GHSA-3wwx-pv8p-q78v"* ]] || {
        echo "  findings do not name the advisory: $out"
        return 1
    }
    [[ "$out" != *"refresh error"* ]] || {
        echo "  a finding was misreported as a database refresh error: $out"
        return 1
    }
}

# T5: scanner failure remains blocking and is distinct from a finding
test_cve_scan_offline() {
    _source_lib
    _prepare_osv_config
    touch uv.lock
    _make_fake_osv_scanner 1 "Post https://api.osv.dev/v1/querybatch: dial tcp: no such host" "" ""
    local out rc=0
    out="$(PATH="$TEST_TMP/bin:$PATH" ci_scan_vulnerabilities 2>&1)" || rc=$?
    [[ "$rc" -eq 1 && "$out" == *"scan failed"* ]] || {
        echo "  expected rc=1 + scanner failure, got rc=$rc: $out"
        return 1
    }
    [[ "$out" == *"database refresh error"* ]] || {
        echo "  a real refresh error was not reported: $out"
        return 1
    }
}

# T6: osv-scanner.toml present -> --config passed to scanner
test_cve_scan_config_passthrough() {
    _source_lib
    _prepare_osv_config
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

_run_test "cve-scan: missing binary fails closed"      test_cve_scan_missing_binary
_run_test "cve-scan: no lockfiles fails"               test_cve_scan_no_lockfiles
_run_test "cve-scan: clean scan passes"                test_cve_scan_clean
_run_test "cve-scan: findings fail closed"             test_cve_scan_findings
_run_test "cve-scan: scanner failure blocks"           test_cve_scan_offline
_run_test "cve-scan: config passthrough"               test_cve_scan_config_passthrough
_run_test "cve-scan: source hygiene (no banned shell)" test_cve_scan_source_hygiene
