#!/usr/bin/env bash
# CI Deploy Lock Library: sourced by ci.sh. Passive; defines
# ci_acquire_deploy_lock only.
# Usage: source /path/to/ci_deploy_lock.sh

# ---------------------------------------------------------------------------
# Deploy lock (M1, SECURITY-AUDIT-2026-07-18-EXEMPTION-TAMPERING)
# ---------------------------------------------------------------------------
# Serialize unseal/reseal/deploy operations: without a shared lock, a
# concurrent install-hooks-recursive can interleave with deploy-ci and
# operate on a half-unsealed tree. fd 9 stays open for the lifetime of the
# calling shell, so the lock releases automatically on exit.
ci_acquire_deploy_lock() {
    local lock_dir lock_file
    # Re-entrancy: a lock holder (e.g. deploy-ci) calls helpers that take
    # the same lock; flock is not reentrant across separate open file
    # descriptions, so the child would deadlock against its parent.
    if [[ "${CI_DEPLOY_LOCK_HELD:-}" == "1" ]]; then
        ci_info "deploy lock already held (inherited)"
        return 0
    fi
    lock_dir="${CI_DEPLOY_LOCK_DIR:-/run/lock}"
    lock_file="$lock_dir/ci-deploy.lock"
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
    if ! flock 9; then
        ci_fail "cannot acquire deploy lock $lock_file (held by another process)"
        return 1
    fi
    export CI_DEPLOY_LOCK_HELD=1
    ci_info "Holding deploy lock $lock_file"
}
