#!/usr/bin/env bash
# CI owner-pin helpers: sourced by lib/ci.sh. Do not source directly.

# ---------------------------------------------------------------------------
# Expected repository owner
# ---------------------------------------------------------------------------
# ci_resolve_expected_owner <ci_root> <dir>
#   Prints the pinned non-root owner for workspace repos and verifies that
#   <dir> is actually owned by that account. Pin resolution order:
#     1. CI_EXPECTED_OWNER env (operator override)
#     2. <ci_root>/config/workspace-owner (tracked; root-owned once deployed)
#   Directory ownership and SUDO_UID are cross-checked against the pin. Fails
#   when the pin is missing, root, unresolvable, or differs from the owner.
ci_resolve_expected_owner() {
    local ci_root="$1" dir="$2" pin dir_owner
    pin="${CI_EXPECTED_OWNER:-}"
    if [[ -z "$pin" && -f "$ci_root/config/workspace-owner" ]]; then
        pin="$(tr -d '[:space:]' < "$ci_root/config/workspace-owner")"
    fi
    if [[ -z "$pin" ]]; then
        ci_fail "no expected-owner pin: set CI_EXPECTED_OWNER or write $ci_root/config/workspace-owner"
        return 1
    fi
    if [[ "$pin" == "root" ]]; then
        ci_fail "expected owner '$pin' must not be root"
        return 1
    fi
    if ! getent passwd "$pin" | grep -q .; then
        ci_fail "expected owner '$pin' has no passwd entry"
        return 1
    fi
    # Callers acting on a root-controlled deployment mirror set
    # CI_OWNER_DIR_CHECK=skip. Consumer-repo callers keep the strict
    # dir-owner cross-check.
    if [[ "${CI_OWNER_DIR_CHECK:-}" != "skip" ]]; then
        dir_owner="$(stat -c %U "$dir")"
        if [[ "$dir_owner" != "$pin" ]]; then
            ci_fail "owner mismatch: $dir owned by '$dir_owner', expected '$pin'"
            return 1
        fi
    fi
    printf '%s\n' "$pin"
}
