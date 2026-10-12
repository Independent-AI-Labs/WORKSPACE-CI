# CI secret-scan tests. Sourced by run_tests_unit.sh.

echo ""
echo "=== ci_scan_secrets tests ==="

# _secrets_mock_gitleaks <bindir>: fake gitleaks that captures the --config
# file into $GITLEAKS_CONFIG_CAPTURE and logs the argv into $GITLEAKS_CALL_LOG.
_secrets_mock_gitleaks() {
    local _mock_bin="$1"
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
}

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
    grep -Fq 'useDefault = true' "$GITLEAKS_CONFIG_CAPTURE" || { echo "FAIL: default rules not enabled"; return 1; }
    grep -Fq "(^|/)ignored\\[one\\]\\.txt$" "$GITLEAKS_CONFIG_CAPTURE"
    grep -Fq "(^|/)ignored-dir(?:/.*)?$" "$GITLEAKS_CONFIG_CAPTURE"
}
_run_test "secrets: one process with global allowlist" test_secrets_uses_one_process_and_global_allowlist

test_secrets_no_ignored_paths_omits_allowlist() {
    _source_lib
    printf 'clean\n' > clean.txt
    git add clean.txt
    git commit -q -m fixture

    local _mock_bin="$TEST_TMP/mock-gitleaks"
    mkdir -p "$_mock_bin"
    cat >"$_mock_bin/gitleaks" <<'MOCK_EOF'
#!/bin/sh
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
    export GITLEAKS_CONFIG_CAPTURE="$TEST_TMP/gitleaks-config"

    ci_scan_secrets
    if grep -Fq '[[allowlists]]' "$GITLEAKS_CONFIG_CAPTURE"; then
        echo "FAIL: empty allowlist emitted when no paths are git-ignored"
        return 1
    fi
}
_run_test "secrets: no ignored paths omits empty allowlist" test_secrets_no_ignored_paths_omits_allowlist

test_secrets_repo_allowlist_concatenated() {
    _source_lib
    printf 'clean\n' > clean.txt
    printf '[[allowlists]]\ndescription = "repo-marker"\npaths = ["""^vendor/"""]\n' > .gitleaks.toml
    git add clean.txt .gitleaks.toml
    git commit -q -m fixture
    _secrets_mock_gitleaks "$TEST_TMP/mock-gitleaks-repo"

    ci_scan_secrets
    # The repo allowlist must survive AND the default rules must be present.
    grep -Fq 'repo-marker' "$GITLEAKS_CONFIG_CAPTURE" || { echo "FAIL: repo allowlist dropped"; return 1; }
    grep -Fq 'useDefault = true' "$GITLEAKS_CONFIG_CAPTURE" || { echo "FAIL: fail-open, default rules missing"; return 1; }
}
_run_test "secrets: repo allowlist concatenated with default rules" test_secrets_repo_allowlist_concatenated

test_secrets_repo_extend_stripped_defaults_forced() {
    _source_lib
    printf 'clean\n' > clean.txt
    cat > .gitleaks.toml <<'CFG'
title = "consumer gitleaks config"

[extend]
useDefault = false

[[allowlists]]
description = "repo-marker"
paths = ["""^vendor/"""]
CFG
    git add clean.txt .gitleaks.toml
    git commit -q -m fixture
    _secrets_mock_gitleaks "$TEST_TMP/mock-gitleaks-extend"

    local rc=0
    ci_scan_secrets >"$TEST_TMP/out" 2>&1 || rc=$?
    _assert_eq 0 "$rc" 'extend/title-bearing repo config must be accepted'
    # Default rules are forced on regardless of the repo file.
    grep -Fq 'useDefault = true' "$GITLEAKS_CONFIG_CAPTURE" || { echo "FAIL: useDefault not forced"; return 1; }
    # No second [extend] table survives to override the forced defaults.
    _assert_eq 1 "$(grep -c '^\[extend\]' "$GITLEAKS_CONFIG_CAPTURE")" 'extend table not stripped'
    if grep -Fq 'useDefault = false' "$GITLEAKS_CONFIG_CAPTURE"; then
        echo "FAIL: repo useDefault not stripped"
        return 1
    fi
    if grep -Fq 'title = ' "$GITLEAKS_CONFIG_CAPTURE"; then
        echo "FAIL: repo title not stripped"
        return 1
    fi
    grep -Fq 'repo-marker' "$GITLEAKS_CONFIG_CAPTURE" || { echo "FAIL: repo allowlist dropped"; return 1; }
}
_run_test "secrets: repo [extend] stripped, defaults forced" test_secrets_repo_extend_stripped_defaults_forced

test_secrets_rejects_rule_bearing_repo_config() {
    _source_lib
    printf 'clean\n' > clean.txt
    printf '[[rules]]\nid = "x"\nregex = "x"\n' > .gitleaks.toml
    git add clean.txt .gitleaks.toml
    git commit -q -m fixture
    _secrets_mock_gitleaks "$TEST_TMP/mock-gitleaks-rules"

    local rc=0
    ci_scan_secrets >"$TEST_TMP/out" 2>&1 || rc=$?
    _assert_eq 1 "$rc" 'rule-bearing repo .gitleaks.toml must be rejected'
}
_run_test "secrets: rule-bearing repo .gitleaks.toml rejected" test_secrets_rejects_rule_bearing_repo_config

test_secrets_accepts_agent_owned_repo_config() {
    _source_lib
    printf 'clean\n' > clean.txt
    printf '[[allowlists]]\ndescription = "agent-owned-marker"\npaths = ["""^vendor/"""]\n' > .gitleaks.toml
    git add clean.txt .gitleaks.toml
    git commit -q -m fixture
    _secrets_mock_gitleaks "$TEST_TMP/mock-gitleaks-owned"

    local rc=0
    ci_scan_secrets >"$TEST_TMP/out" 2>&1 || rc=$?
    _assert_eq 0 "$rc" 'a tracked, reviewable repo config must not require root ownership'
    grep -Fq 'agent-owned-marker' "$GITLEAKS_CONFIG_CAPTURE" || { echo "FAIL: repo allowlist dropped"; return 1; }
}
_run_test "secrets: agent-owned repo config accepted" test_secrets_accepts_agent_owned_repo_config
