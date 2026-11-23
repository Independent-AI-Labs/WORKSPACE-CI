#!/usr/bin/env bash
# WORKSPACE-CI claim-by-claim QEMU integration tests.
set -euo pipefail
[[ "$(id -u)" -eq 0 ]] || { echo "ERROR: root required" >&2; exit 1; }
[[ -d /mnt/workspace-ro ]] || { echo "ERROR: QEMU guest marker missing" >&2; exit 1; }
CI_SRC="${1:-/opt/workspace/projects/WORKSPACE-CI}"
WORK=/var/tmp/workspace-ci-audit-claims
# Step output goes to this log, kept outside $WORK so it survives cleanup.
LOG=/var/tmp/workspace-ci-audit-claims.log
: > "$LOG"
FAIL=0
COUNT=0
pass() { COUNT=$((COUNT + 1)); printf 'CI CLAIM PASS %s %s\n' "$1" "$2"; }
fail() { COUNT=$((COUNT + 1)); FAIL=$((FAIL + 1)); printf 'CI CLAIM FAIL %s %s\n' "$1" "$2" >&2; }
open() { COUNT=$((COUNT + 1)); printf 'CI CLAIM OPEN %s %s\n' "$1" "$2"; }
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT
rm -rf "$WORK"; install -d -m 0755 "$WORK"

FAKE="$WORK/ansible-playbook"
cat > "$FAKE" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf 'EXECUTED\n' >> /var/tmp/workspace-ci-audit-claims/ansible.executed
for arg in "$@"; do case "$arg" in deploy_output=*) log=${arg#deploy_output=} ;; esac; done
printf 'fake deployment\n' >> "$log"
EOF
chmod 0755 "$FAKE"

new_repo() {
    local repo="$1"
    mkdir -p "$repo/res/ansible" "$repo/scripts"
    : > "$repo/res/ansible/deploy-ci.yml"
    : > "$repo/scripts/deploy-ci"
    git -C "$repo" init -q
    git -C "$repo" -c user.name=Test -c user.email=test@example.com add -A
    git -C "$repo" -c user.name=Test -c user.email=test@example.com commit -q -m fixture
}
run_wrapper() {
    local repo="$1" out rc=0
    out="$(bash "$CI_SRC/scripts/run-deploy-ci" "$repo" "$FAKE" 2>&1)" || rc=$?
    printf '%s' "$out"
    return "$rc"
}

# CI-01: clean path and every dirty class must refuse before Ansible.
new_repo "$WORK/clean"
run_wrapper "$WORK/clean" >>"$LOG"
grep -q EXECUTED "$WORK/ansible.executed" && pass CI-01-CLEAN "clean fixture reaches fake Ansible" || fail CI-01-CLEAN "clean fixture did not execute"
for kind in tracked untracked staged; do
    new_repo "$WORK/$kind"
    case "$kind" in
        tracked) printf '# agent edit\n' >> "$WORK/$kind/scripts/deploy-ci" ;;
        untracked) printf '# agent edit\n' > "$WORK/$kind/scripts/untracked" ;;
        staged) printf '# agent edit\n' >> "$WORK/$kind/scripts/deploy-ci"; git -C "$WORK/$kind" add scripts/deploy-ci ;;
    esac
    rm -f "$WORK/ansible.executed"
    rc=0; out="$(run_wrapper "$WORK/$kind")" || rc=$?
    if [[ $rc -ne 0 && "$out" == *"refusing root deploy"* && ! -e "$WORK/ansible.executed" ]]; then
        pass "CI-01-$kind" "dirty $kind tree refused before execution"
    else
        fail "CI-01-$kind" "dirty $kind tree executed rc=$rc out=$out"
    fi
done

# CI-01 residual: a committed malicious script is clean, and the wrapper does
# not bind HEAD to origin/main. This is the documented bootstrap gap.
new_repo "$WORK/committed"
printf '# committed agent edit\n' >> "$WORK/committed/scripts/deploy-ci"
git -C "$WORK/committed" add scripts/deploy-ci
git -C "$WORK/committed" -c user.name=Test -c user.email=test@example.com commit -q -m malicious
rm -f "$WORK/ansible.executed"
run_wrapper "$WORK/committed" >>"$LOG"
[[ -e "$WORK/ansible.executed" ]] \
    && open CI-01-BOOTSTRAP "committed content executes without origin/main binding; root launcher still required" \
    || fail CI-01-BOOTSTRAP "committed content was unexpectedly refused"

# CI-02: Make selects the sealed lock-repo, never the checkout copy.
mk="$(make -C "$CI_SRC" -n lock-repo 2>&1)"
[[ "$mk" == *'/opt/workspace-ci/scripts/lock-repo --config-only'* ]] \
    && pass CI-02 "lock-repo uses sealed artifact" || fail CI-02 "checkout lock-repo remains: $mk"

# CI-03: immutable-lock failure must be fatal.
new_repo "$WORK/lock"
mkdir -p "$WORK/fakebin"
cat > "$WORK/fakebin/chattr" <<'EOF'
#!/usr/bin/env bash
exit 1
EOF
chmod 0755 "$WORK/fakebin/chattr"
lock_rc=0
lock_out="$(PATH="$WORK/fakebin:/usr/bin:/bin" bash "$CI_SRC/scripts/lock-repo" "$WORK/lock" 2>&1)" || lock_rc=$?
[[ $lock_rc -ne 0 && "$lock_out" == *'refusing ownership-only locking'* ]] \
    && pass CI-03 "chattr failure fails closed" || fail CI-03 "chattr failure did not fail closed rc=$lock_rc out=$lock_out"

# CI-05: root generation reads consumer config but never executes custom code.
mkdir -p "$WORK/consumer" "$WORK/generated"
git -C "$WORK/consumer" init -q
cat > "$WORK/consumer/pwn.sh" <<'EOF'
#!/usr/bin/env bash
printf 'EXECUTED\n' > /var/tmp/workspace-ci-audit-claims/custom.executed
EOF
chmod 0755 "$WORK/consumer/pwn.sh"
printf 'repos:\n  - repo: local\n    hooks:\n      - id: custom\n        name: Custom\n        entry: "%s"\n        language: system\n        stages: [pre-commit]\n' "$WORK/consumer/pwn.sh" > "$WORK/consumer/.pre-commit-config.yaml"
(cd "$WORK/consumer" && bash "$CI_SRC/scripts/generate-hooks" --output-dir "$WORK/generated") >>"$LOG"
[[ ! -e "$WORK/custom.executed" ]] && pass CI-05-NO_EXEC "custom entry did not execute during generation" || fail CI-05-NO_EXEC "custom entry executed"
grep -q "$WORK/consumer/pwn.sh" "$WORK/generated/pre-commit" \
    && pass CI-05-INPUT "consumer config is rendered as input" || fail CI-05-INPUT "custom entry missing"
grep -q 'runuser -u "$_hook_owner"' "$WORK/generated/pre-commit" \
    && pass CI-05-OWNER "generated hook re-execs as repository owner" || fail CI-05-OWNER "owner re-exec missing"
printf 'repos:\n  - repo: local\n    hooks:\n      - id: inline\n        entry: "bash -c true"\n        language: system\n        stages: [pre-commit]\n' > "$WORK/consumer/.pre-commit-config.yaml"
(cd "$WORK/consumer" && bash "$CI_SRC/scripts/generate-hooks" --output-dir "$WORK/generated") >>"$LOG" 2>&1 \
    && fail CI-05-INLINE "inline custom command accepted" || pass CI-05-INLINE "inline custom command rejected"

# CI-06: inherited override cannot select scaffold policy; CLI remains separate.
printf 'not: [valid\n' > "$WORK/evil-hooks.yaml"
env CI_CONFIG_PATH_REQUIRED_HOOKS="$WORK/evil-hooks.yaml" \
    bash "$CI_SRC/scripts/scaffold-ci" --emit-template >>"$LOG" \
    && pass CI-06-SCAFFOLD "inherited override ignored" || fail CI-06-SCAFFOLD "inherited override selected hostile registry"
# grep -l exits 1 for "no match" (an expected result) and 2+ for a real error.
grep_rc=0
other="$(grep -l 'ci_config_path' "$CI_SRC"/scripts/*)" || grep_rc=$?
if [[ $grep_rc -gt 1 ]]; then
    echo "ERROR: grep failed (rc=$grep_rc) scanning $CI_SRC/scripts" >&2
    exit 1
fi
other="${other//$CI_SRC\/scripts\/scaffold-ci/}"
other="${other//$'\n'/}"
[[ -z "$other" ]] && pass CI-06-ENTRYPOINTS "no other script entry point resolves overrides" || fail CI-06-ENTRYPOINTS "unreviewed entry points: $other"
grep -q 'source /opt/workspace-ci/lib/ci.sh' "$WORK/generated/pre-commit" \
    && pass CI-06-HOOK "generated hook uses sealed CI library" || fail CI-06-HOOK "generated hook library unpinned"

# CI-04/E2E-4/E2E-5: this source-side suite runs in QEMU, not the sealed host copy.
[[ "$CI_SRC" == /opt/workspace/projects/WORKSPACE-CI ]] \
    && pass CI-04 "CI source claims executed in QEMU" || fail CI-04 "wrong CI source root"
[[ -f /opt/workspace/projects/WORKSPACE-CI/scripts/run-deploy-ci ]] \
    && pass E2E-5 "guest tests checkout source, not only sealed artifact" || fail E2E-5 "checkout source absent"
open E2E-4 "full guest deploy-ci plus hook installation still needs a dedicated integration scenario"

# CI-07: current deployment notes and code agree on the core invariants.
grep -q 'exclusion of dirty worktree content' "$CI_SRC/docs/requirements/REQ-DEPLOYMENT.md" \
    && pass CI-07-DIRTY "deployment requirements include dirty exclusion" || fail CI-07-DIRTY "dirty exclusion not documented"
grep -q 'source HEAD must equal origin/main' "$CI_SRC/scripts/deploy-ci" \
    && pass CI-07-ORIGIN "deploy script retains origin/main binding" || fail CI-07-ORIGIN "origin/main binding missing"
if grep -R '../../.boot-linux/bin/ansible-playbook' "$CI_SRC/docs/requirements" "$CI_SRC/docs/specifications" "$CI_SRC/docs/runbooks" "$CI_SRC/docs/decisions" "$CI_SRC/Makefile" >>"$LOG" 2>&1; then
    fail CI-07-ANSIBLE "stale checkout Ansible path documented"
else
    pass CI-07-ANSIBLE "no stale checkout Ansible path outside historical audit"
fi

printf 'CI AUDIT CLAIMS TOTAL=%d FAIL=%d (step output: %s)\n' "$COUNT" "$FAIL" "$LOG"
[[ $FAIL -eq 0 ]] || exit 1
