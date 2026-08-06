# CI secret-scan tests. Sourced by run_tests_unit.sh.

echo ""
echo "=== ci_scan_secrets tests ==="

test_secrets_uses_one_process_and_global_allowlist() {
    _source_lib
    printf 'ignored[one].txt\nignored-dir/\n' > .gitignore
    printf 'clean\n' > clean.txt
    printf 'ignored\n' > 'ignored[one].txt'
    mkdir -p ignored-dir/private
    printf 'ignored directory\n' > ignored-dir/private/secret.txt
    git add .gitignore clean.txt
    git add -f 'ignored[one].txt'
    git commit -q -m fixture

    local _mock_bin="$TEST_TMP/mock-gitleaks"
    mkdir -p "$_mock_bin"
    cat >"$_mock_bin/gitleaks" <<'MOCK_EOF'
#!/bin/sh
printf '%s\n' "$# $*" > "$GITLEAKS_CALL_LOG"
config=''
while [ "$#" -gt 0 ]; do
    if [ "$1" = "--config" ]; then
        config="$2"
        break
    fi
    shift
done
cp "$config" "$GITLEAKS_CONFIG_CAPTURE"
exit 0
MOCK_EOF
    chmod +x "$_mock_bin/gitleaks"
    export PATH="$_mock_bin:$PATH"
    export GITLEAKS_CALL_LOG="$TEST_TMP/gitleaks-call"
    export GITLEAKS_CONFIG_CAPTURE="$TEST_TMP/gitleaks-config"

    ci_scan_secrets
    _assert_eq 1 "$(wc -l < "$GITLEAKS_CALL_LOG")" 'one gitleaks invocation'
    grep -Fq 'dir . --config' "$GITLEAKS_CALL_LOG"
    grep -Fq -- '--no-banner --redact --verbose --log-level=error' "$GITLEAKS_CALL_LOG"
    grep -Fq '[[allowlists]]' "$GITLEAKS_CONFIG_CAPTURE"
    grep -Fq "(^|/)ignored\\[one\\]\\.txt$" "$GITLEAKS_CONFIG_CAPTURE"
    grep -Fq "(^|/)ignored-dir(?:/.*)?$" "$GITLEAKS_CONFIG_CAPTURE"
}
_run_test "secrets: one process with global allowlist" test_secrets_uses_one_process_and_global_allowlist
