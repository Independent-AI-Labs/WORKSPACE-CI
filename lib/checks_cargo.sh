#!/usr/bin/env bash
# Cargo fleet hooks: formatting, lints, and dependency policy.
# Sourced by lib/checks.sh alongside the other check modules.
#
# Each function runs from the repository root so the workspace manifest and
# deny.toml apply. The advisory-database refresh in ci_check_cargo_deny is
# time-bounded; the check itself always runs offline and fails closed when the
# database is missing or older than cargo-deny's staleness window.

# ci_check_cargo_fmt: verify rustfmt formatting across the workspace.
ci_check_cargo_fmt() {
    local root cargo_bin
    root="$(git rev-parse --show-toplevel)" || return 1
    if ! cargo_bin="$(command -v cargo)"; then
        ci_fail "cargo is required but not on PATH"
        return 1
    fi
    if ! (cd "$root" && "$cargo_bin" fmt --all -- --check); then
        ci_fail "cargo fmt found unformatted files"
        return 1
    fi
    ci_pass "cargo fmt is clean"
}

# ci_check_cargo_clippy: run clippy for all targets with warnings denied.
ci_check_cargo_clippy() {
    local root cargo_bin
    root="$(git rev-parse --show-toplevel)" || return 1
    if ! cargo_bin="$(command -v cargo)"; then
        ci_fail "cargo is required but not on PATH"
        return 1
    fi
    if ! (cd "$root" && "$cargo_bin" clippy --workspace --all-targets --all-features -- -D warnings); then
        ci_fail "cargo clippy reported findings"
        return 1
    fi
    ci_pass "cargo clippy is clean"
}

# _ci_cargo_deny_config: print the deny.toml cargo-deny would discover, or
# return non-zero. cargo-deny walks up from the manifest directory looking for
# deny.toml, .deny.toml, then .cargo/deny.toml; with no file it uses its
# built-in defaults, whose empty license allowlist denies every crate, so only
# the advisory check is meaningful without a config.
_ci_cargo_deny_config() {
    local dir="$1" name
    while :; do
        for name in deny.toml .deny.toml .cargo/deny.toml; do
            if [[ -f "$dir/$name" ]]; then
                printf '%s\n' "$dir/$name"
                return 0
            fi
        done
        [[ "$dir" == "/" ]] && break
        dir="$(dirname "$dir")"
    done
    return 1
}

# ci_check_cargo_deny: refresh the advisory database when it is stale, then
# run the offline dependency-policy check (advisories only when the repository
# declares no deny.toml).
ci_check_cargo_deny() {
    local root cargo_bin refresh config
    root="$(git rev-parse --show-toplevel)" || return 1
    if ! cargo_bin="$(command -v cargo)"; then
        ci_fail "cargo is required but not on PATH"
        return 1
    fi
    refresh="$CI_PROJECT_ROOT/scripts/refresh-advisory-db"
    if [[ -x "$refresh" ]]; then
        "$refresh" --if-stale \
            || ci_warn "advisory database refresh unavailable; using the cached database"
    fi
    if config="$(_ci_cargo_deny_config "$root")"; then
        if ! (cd "$root" && "$cargo_bin" deny --offline --no-default-features check); then
            ci_fail "cargo deny check failed"
            return 1
        fi
    else
        ci_warn "no deny.toml found under $root; checking advisories only"
        if ! (cd "$root" && "$cargo_bin" deny --offline --no-default-features check advisories); then
            ci_fail "cargo deny advisories check failed"
            return 1
        fi
    fi
    ci_pass "cargo deny check is clean"
}
