# lib/guard-build.sh - build_guard_binary helper
#
# Sourced by scripts/bootstrap-workspace-guard. NOT a standalone script.
# Depends on the parent script's globals: WORKSPACE_ROOT, _CI_ROOT,
# _guard_dir, and the log_info / log_warn / log_error helpers. Inherits
# `set -euo pipefail` from the sourcing shell; do not add a shebang or
# `set` here. Keep this file under the 512-line source-length gate per
# AGENTS.md Rule 4.

build_guard_binary() {
    log_info "Building workspace-guard Rust binary..."
    local _boot_name
    case "$(uname -s | tr 'A-Z' 'a-z')" in darwin) _boot_name=".boot-macos" ;; *) _boot_name=".boot-linux" ;; esac
    local ws_boot_rust="${WORKSPACE_ROOT}/$_boot_name/bin"
    local ws_rust_home="${WORKSPACE_ROOT}/$_boot_name/rust"
    local ci_boot_rust="${_CI_ROOT}/$_boot_name/bin"
    local ci_rust_home="${_CI_ROOT}/$_boot_name/rust"
    local boot_rust="$ws_boot_rust"
    local rust_home="$ws_rust_home"
    if [[ ! -x "$boot_rust/cargo" && -x "$ci_boot_rust/cargo" ]]; then
        boot_rust="$ci_boot_rust"
        rust_home="$ci_rust_home"
    fi
    export PATH="$boot_rust:$PATH"
    export RUSTUP_HOME="$rust_home"
    export CARGO_HOME="$rust_home"

    if ! command -v cargo >/dev/null; then
        log_warn "cargo not on PATH: bootstrapping Rust..."
        bash "${_CI_ROOT}/scripts/bootstrap-rust" || {
            log_error "Rust installation failed"
            return 1
        }
        if [[ -x "$ci_boot_rust/cargo" ]]; then
            boot_rust="$ci_boot_rust"
            rust_home="$ci_rust_home"
            export PATH="$boot_rust:$PATH"
            export RUSTUP_HOME="$rust_home"
            export CARGO_HOME="$rust_home"
        fi
        if ! command -v cargo >/dev/null; then
            log_error "cargo still not found after bootstrap: check $ws_boot_rust/ or $ci_boot_rust/"
            return 1
        fi
        log_info "Rust bootstrapped successfully"
    fi

    if command -v rustup >/dev/null; then
        # rc-capture: rustup show active-toolchain prints the active
        # toolchain name to stdout (we don't need it). On rc!=0 (rustup
        # broken, or no default toolchain configured), surface stderr
        # and fall through to the install-stable path.
        local _at_out _at_err _at_rc=0
        _at_out="$(mktemp)"; _at_err="$(mktemp)"
        rustup show active-toolchain >"$_at_out" 2>"$_at_err" || _at_rc=$?
        if [[ $_at_rc -ne 0 ]]; then
            if [[ -s "$_at_err" ]]; then
                log_warn "rustup show active-toolchain failed (rc=$_at_rc): $(head -1 "$_at_err")"
            else
                log_warn "rustup show active-toolchain failed (rc=$_at_rc, no stderr)"
            fi
            rm -f "$_at_out" "$_at_err"
            log_warn "rustup found but no default toolchain configured: installing stable"
            rustup default stable || {
                log_error "Failed to set default Rust toolchain"
                return 1
            }
            log_info "Rust stable toolchain installed"
        else
            rm -f "$_at_out" "$_at_err"
        fi
    fi

    if [[ ! -f "$_guard_dir/Cargo.toml" ]]; then
        log_error "WORKSPACE-GUARD project not found at $_guard_dir"
        log_error "Run 'make ensure-repos' or 'make sync-package' first to clone workspace repos"
        return 1
    fi

    cd "$_guard_dir"

    local -a build_features=()
    local build_mode_env="${BUILD_MODE:-}"
    if [[ "$build_mode_env" == "root-only" ]]; then
        log_warn "BUILD_MODE=root-only: building root-only (NON-ROOT USERS CANNOT RUN GIT)"
        build_features=(--no-default-features --features root-only)
    else
        log_info "Building capability-mode binary (default; non-root users supported via filecaps)"
    fi

    local guard_bin=""
    local has_rustup=0
    if command -v rustup >/dev/null; then
        has_rustup=1
    fi
    if [[ "$has_rustup" -eq 1 ]]; then
        local installed_targets
        installed_targets=$(rustup target list --installed)
        if echo "$installed_targets" | grep -q musl; then
            log_info "Building statically linked binary (musl)..."
            cargo build --release --target x86_64-unknown-linux-musl "${build_features[@]}"
            guard_bin="target/x86_64-unknown-linux-musl/release/workspace-guard"
        else
            log_info "Building dynamically linked binary (gnu)..."
            PATH="/usr/bin:/usr/sbin:/usr/local/bin:$PATH" CC=gcc cargo build --release "${build_features[@]}"
            guard_bin="target/release/workspace-guard"
        fi
    else
        log_info "Building dynamically linked binary (gnu, no rustup)..."
        PATH="/usr/bin:/usr/sbin:/usr/local/bin:$PATH" CC=gcc cargo build --release "${build_features[@]}"
        guard_bin="target/release/workspace-guard"
    fi

    if [[ ! -f "$guard_bin" ]]; then
        log_error "Build failed: binary not found at $guard_bin"
        return 1
    fi
    if ! file "$guard_bin" | grep -q ELF; then
        log_error "Build produced invalid ELF binary"
        return 1
    fi
    if [[ ! -s "$guard_bin" ]]; then
        log_error "Build produced empty binary"
        return 1
    fi
    log_info "Build successful: $(file "$guard_bin" | cut -d: -f2)"

    GUARD_BIN="$guard_bin"
    GUARD_BUILD_MODE="capability"
    if [[ ${#build_features[@]} -gt 0 ]]; then
        GUARD_BUILD_MODE="root-only"
    fi
    printf '%s\n' "$GUARD_BUILD_MODE" > "${GUARD_BIN}.mode"
    log_info "Wrote build-mode marker: ${GUARD_BIN}.mode ($GUARD_BUILD_MODE)"

    # When invoked under sudo (operator: `sudo --preserve-env=HOME,SSH_AUTH_SOCK
    # make build-guard`), cargo writes target/ as root. The guard's file-cap
    # grant reaches only /usr/bin/git -- cargo gets NO cap elevation -- so
    # leaving target/ root-owned would block the agent (uid 1000) from later
    # incremental rebuilds. Re-home the entire target tree to the original
    # user so cargo's fingerprint cache and incremental artifacts stay
    # usable across uid boundaries. No-op when the script runs as the agent
    # directly (SUDO_USER unset / EUID!=0).
    if [[ $EUID -eq 0 && -n "${SUDO_USER:-}" ]]; then
        chown -R "$SUDO_USER" "$_guard_dir/target" || log_warn "chown target/ -> $SUDO_USER failed (some files may remain root-owned)"
        log_info "Re-homed target/ -> $SUDO_USER (build ran under sudo)"
    fi
    return 0
}
