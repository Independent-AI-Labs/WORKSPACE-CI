#!/usr/bin/env bash
# CI seal/unseal helpers: sourced by lib/ci.sh. Do not source directly.

# ---------------------------------------------------------------------------
# chattr capability probe (M4, SECURITY-AUDIT-2026-07-18-EXEMPTION-TAMPERING)
# ---------------------------------------------------------------------------
# ci_probe_chattr_support <dir>
#   Verifies chattr +i/-i actually works in <dir> BEFORE any unseal runs.
#   Without this probe, a filesystem without immutable-bit support (overlay,
#   tmpfs, some fuse mounts) lets the unseal half complete and then kills
#   the script at the first chattr -i, leaving a half-unsealed tree.
#   Returns 0 when the probe round-trips, 1 otherwise.
ci_probe_chattr_support() {
    local dir="$1" probe
    if ! command -v chattr | grep -q .; then
        ci_fail "chattr not found on PATH"
        return 1
    fi
    probe="$(mktemp "$dir/.chattr-probe.XXXXXX")"
    if ! chattr +i "$probe" 2>&1; then
        rm -f "$probe"
        ci_fail "chattr +i unsupported in $dir (refusing to unseal)"
        return 1
    fi
    if ! chattr -i "$probe" 2>&1; then
        rm -f "$probe"
        ci_fail "chattr -i failed in $dir after a successful +i probe"
        return 1
    fi
    rm -f "$probe"
    return 0
}
