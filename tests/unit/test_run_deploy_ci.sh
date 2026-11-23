#!/usr/bin/env bash
set -euo pipefail

# No fixture identity: the git guard blocks `git config user.*` and
# supplies the committer itself.

root=$(mktemp -d)
work=$(mktemp -d)
trap 'rm -rf "$root" "$work"' EXIT
mkdir -p "$root/res/ansible"
: > "$root/res/ansible/deploy-ci.yml"
git -C "$root" init -q

fake="$work/ansible-playbook"
cat > "$fake" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
for arg in "$@"; do
    case "$arg" in deploy_output=*) log=${arg#deploy_output=} ;; esac
done
[[ -z ${TEST_LOG_FILE:-} ]] || printf '%s\n' "$log" > "$TEST_LOG_FILE"
printf 'first line\n' >> "$log"
printf 'final line\n' >> "$log"
exit "${FAKE_EXIT:-0}"
EOF
chmod +x "$fake"
git -C "$root" add -A
git -C "$root" commit -q -m "test fixture"

output=$(scripts/run-deploy-ci "$root" "$fake")
[[ $output == *"first line"* ]]
[[ $output == *"final line"* ]]

set +e
failure_output=$(TEST_LOG_FILE="$work/failed-log.path" FAKE_EXIT=17 \
    scripts/run-deploy-ci "$root" "$fake")
status=$?
set -e
[[ $status -eq 17 ]]
[[ $failure_output == *"final line"* ]]
failed_log=$(<"$work/failed-log.path")
[[ -s $failed_log ]]
rm -f "$failed_log"

pid_file="$work/child.pid"
log_file="$work/log.path"
cat > "$fake" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
for arg in "$@"; do
    case "$arg" in deploy_output=*) log=${arg#deploy_output=} ;; esac
done
printf '%s\n' "$BASHPID" > "$TEST_PID_FILE"
printf '%s\n' "$log" > "$TEST_LOG_FILE"
printf 'running\n' >> "$log"
sleep 30
EOF
chmod +x "$fake"

TEST_PID_FILE="$pid_file" TEST_LOG_FILE="$log_file" \
    scripts/run-deploy-ci "$root" "$fake" > "$work/interrupted.out" &
wrapper_pid=$!
for _ in {1..100}; do
    [[ -s $pid_file && -s $log_file ]] && break
    sleep 0.01
done
[[ -s $pid_file && -s $log_file ]]
child_pid=$(<"$pid_file")
deployment_log=$(<"$log_file")
kill -TERM "$wrapper_pid"
set +e
wait "$wrapper_pid"
status=$?
set -e
[[ $status -ne 0 ]]
[[ ! -d /proc/$child_pid ]]
[[ ! -e $deployment_log ]]

dirty_root="$work/dirty"
mkdir -p "$dirty_root/res/ansible"
: > "$dirty_root/res/ansible/deploy-ci.yml"
git -C "$dirty_root" init -q
git -C "$dirty_root" add -A
git -C "$dirty_root" commit -q -m "clean fixture"
printf '# untracked change\n' >> "$dirty_root/res/ansible/deploy-ci.yml"
set +e
dirty_output=$(scripts/run-deploy-ci "$dirty_root" "$fake" 2>&1)
dirty_status=$?
set -e
[[ $dirty_status -eq 1 ]]
[[ $dirty_output == *"refusing root deploy"* ]]
