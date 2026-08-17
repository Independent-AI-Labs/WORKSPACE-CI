#!/usr/bin/env bash
# CI Deploy Lock Library: sourced by ci.sh. Passive; defines
# ci_acquire_deploy_lock only.
# Usage: source /path/to/ci_deploy_lock.sh

# ---------------------------------------------------------------------------
# Deploy lock (M1, SECURITY-AUDIT-2026-07-18-EXEMPTION-TAMPERING)
# ---------------------------------------------------------------------------
# Serialize deploy operations: without a shared lock, a
# concurrent hook installation can interleave with generation activation and
# operate on a half-written tree. fd 9 stays open for the lifetime of the
# calling shell, so the lock releases automatically on exit.
ci_acquire_deploy_lock() {
    local lock_dir lock_file
    # Re-entrancy: a lock holder calls helpers that take
    # the same lock; flock is not reentrant across separate open file
    # descriptions, so the child would deadlock against its parent.
    if [[ "${CI_DEPLOY_LOCK_HELD:-}" == "1" ]]; then
        ci_info "deploy lock already held (inherited)"
        return 0
    fi
    lock_dir="/run/lock"
    lock_file="$lock_dir/workspace-ci-deploy.lock"
    if [[ ! -d "$lock_dir" ]]; then
        if ! mkdir -p "$lock_dir"; then
            ci_fail "cannot create lock dir $lock_dir"
            return 1
        fi
    fi
    if ! exec 9>"$lock_file"; then
        ci_fail "cannot open deploy lock $lock_file"
        return 1
    fi
    local timeout_s="${CI_DEPLOY_LOCK_TIMEOUT:-120}"
    if ! [[ "$timeout_s" =~ ^[0-9]+$ ]]; then
        ci_fail "invalid CI_DEPLOY_LOCK_TIMEOUT: $timeout_s"
        return 1
    fi
    if ! flock -w "$timeout_s" 9; then
        ci_fail "timed out after ${timeout_s}s acquiring deploy lock $lock_file"
        return 1
    fi
    export CI_DEPLOY_LOCK_HELD=1
    ci_info "Holding deploy lock $lock_file"
}
