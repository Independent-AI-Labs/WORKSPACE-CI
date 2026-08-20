#!/usr/bin/env bash

test_verify_immutable_native_batches() {
    _setup_tmpdir
    local mock_bin="$TEST_TMP/bin"
    local inventory="$TEST_TMP/inventory"
    local output="$TEST_TMP/output"
    mkdir -p "$mock_bin"
    cat > "$mock_bin/lsattr" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
shift 2
for path in "$@"; do
    case $path in
        *mutable*) attributes=--------------e------- ;;
        *worker-failure*) exit 9 ;;
        *) attributes=----i---------e------- ;;
    esac
    printf '%s %s\n' "$attributes" "$path"
done
EOF
    chmod +x "$mock_bin/lsattr"

    printf '%s\0' 'space name' $'line\nbreak' > "$inventory"
    PATH="$mock_bin:$PATH" "$PROJECT_DIR/scripts/verify-immutable" \
        "$inventory" 2 > "$output"
    grep -q '2/2 (100%)' "$output"
    ! grep -q 'space name' "$output"
    ! grep -q 'line' "$output"
}

test_verify_immutable_rejects_mutable_path() {
    local inventory="$TEST_TMP/mutable-inventory"
    local output="$TEST_TMP/mutable-output"
    printf '%s\0' 'mutable path' > "$inventory"

    ! PATH="$TEST_TMP/bin:$PATH" "$PROJECT_DIR/scripts/verify-immutable" \
        "$inventory" 2 > "$output" 2>&1
    grep -q 'immutable flag missing' "$output"
}

test_verify_immutable_rejects_worker_failure() {
    local inventory="$TEST_TMP/worker-inventory"
    local output="$TEST_TMP/worker-output"
    printf '%s\0' 'worker-failure' > "$inventory"

    ! PATH="$TEST_TMP/bin:$PATH" "$PROJECT_DIR/scripts/verify-immutable" \
        "$inventory" 2 > "$output" 2>&1
}

echo "=== native immutable verifier tests ==="
_run_test test_verify_immutable_native_batches
_run_test test_verify_immutable_rejects_mutable_path
_run_test test_verify_immutable_rejects_worker_failure
