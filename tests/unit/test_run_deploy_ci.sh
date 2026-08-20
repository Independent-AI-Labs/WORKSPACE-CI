#!/usr/bin/env bash
set -euo pipefail

root=$(mktemp -d)
trap 'rm -rf "$root"' EXIT
mkdir -p "$root/res/ansible"
: > "$root/res/ansible/deploy-ci.yml"

fake="$root/ansible-playbook"
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

output=$(scripts/run-deploy-ci "$root" "$fake")
[[ $output == *"first line"* ]]
[[ $output == *"final line"* ]]

set +e
failure_output=$(TEST_LOG_FILE="$root/failed-log.path" FAKE_EXIT=17 \
    scripts/run-deploy-ci "$root" "$fake")
status=$?
set -e
[[ $status -eq 17 ]]
[[ $failure_output == *"final line"* ]]
failed_log=$(<"$root/failed-log.path")
[[ -s $failed_log ]]
rm -f "$failed_log"

pid_file="$root/child.pid"
log_file="$root/log.path"
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
    scripts/run-deploy-ci "$root" "$fake" > "$root/interrupted.out" &
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
