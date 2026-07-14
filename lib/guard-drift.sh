# lib/guard-drift.sh - guard install health / drift detection (host-exec)
#
# Sourced by scripts/bootstrap-workspace-guard. NOT a standalone script.
# Depends on parent globals: _guard_dir, divert_is_active.
# host-exec helpers: guard-host-exec.sh (sourced after this file).

GUARD_WORKLOAD_FILE_CAP_STRING='cap_setpcap,cap_chown,cap_dac_override,cap_fowner,cap_fsetid=ep'

# Run command; log failure to stderr; emit captured stdout (may be empty).
_guard_capture() {
    local rc=0 out=""
    out="$("$@" 2>&1)" || rc=$?
    if [ $rc -ne 0 ]; then
        printf 'guard probe: %q failed (rc=%s)\n' "$*" "$rc" >&2
    fi
    printf '%s' "$out"
}

# First line of command output without piping through head.
_guard_capture_line() {
    local out
    out="$(_guard_capture "$@")"
    printf '%s' "${out%%$'\n'*}"
}

# Capture stdout lines from a command without process substitution.
_guard_read_lines() {
    local -n _arr=$1
    shift
    local _tmp _rc=0 _v
    _tmp=$(mktemp) || return 1
    "$@" > "$_tmp" || _rc=$?
    _arr=()
    while IFS= read -r _v; do
        [[ -n "$_v" ]] && _arr+=("$_v")
    done < "$_tmp"
    rm -f "$_tmp"
    return $_rc
}

# Best-effort: run command, log failure, do not abort caller.
_guard_best_effort() {
    local rc=0 err=""
    err="$("$@" 2>&1)" || rc=$?
    if [ $rc -ne 0 ]; then
        [[ -n "$err" ]] && printf '%s\n' "$err" >&2
        printf 'guard best-effort: %q failed (rc=%s)\n' "$*" "$rc" >&2
    fi
}

guard_login_uids() {
    awk -F: '$3>=1000 && $3<65534 && $7 ~ /\/(bash|sh|zsh|fish)$/{print $3}' /etc/passwd
}

guard_git_file_cap_actual() {
    command -v getcap >/dev/null || return 1
    local line caps
    line="$(_guard_capture_line getcap /usr/bin/git)"
    [[ -n "$line" ]] || return 1
    # getcap(8) formats vary:
    #   /usr/bin/git cap_foo,cap_bar=ep
    #   /usr/bin/git = cap_foo,cap_bar=ep
    caps="${line#*cap_}"
    [[ "$caps" == "$line" ]] && return 1
    printf 'cap_%s\n' "$caps"
}

guard_workload_file_cap_string() {
    printf '%s' "$GUARD_WORKLOAD_FILE_CAP_STRING"
}

# Normalize file-cap strings for comparison (order and =ep/+ep suffix).
guard_file_cap_normalize() {
    local raw="${1:-}"
    local caps eff
    raw="${raw#${raw%%cap_*}}"
    [[ "$raw" == cap_* ]] || return 1
    if [[ "$raw" == *"=ep" ]]; then
        caps="${raw%=ep}"
        eff="ep"
    elif [[ "$raw" == *"+ep" ]]; then
        caps="${raw%+ep}"
        eff="ep"
    else
        caps="$raw"
        eff=""
    fi
    caps="$(printf '%s\n' "${caps//,/$'\n'}" | sed '/^$/d' | LC_ALL=C sort | paste -sd, -)"
    if [[ -n "$eff" ]]; then
        printf '%s=%s\n' "$caps" "$eff"
    else
        printf '%s\n' "$caps"
    fi
}

guard_git_has_required_file_caps() {
    local actual expected norm_actual norm_expected
    if ! command -v getcap >/dev/null; then
        return 1
    fi
    actual="$(guard_git_file_cap_actual)"
    expected="$(guard_workload_file_cap_string)"
    [[ -n "$actual" ]] || return 1
    norm_actual="$(guard_file_cap_normalize "$actual")" || return 1
    norm_expected="$(guard_file_cap_normalize "$expected")" || return 1
    [[ "$norm_actual" == "$norm_expected" ]]
}

agent_no_new_privs_enabled() {
    local user="${1:?user}"
    local nnp
    nnp="$(_guard_capture_line agent_cap_status_field_runuser "$user" NoNewPrivs)"
    [[ "$nnp" == "1" ]]
}

agent_cap_status_field_runuser() {
    local user="${1:?user}" field="${2:?field}"
    local status rc=0 value=""
    status="$(runuser -u "$user" -- bash -lc "grep \"^${field}:\" /proc/self/status" 2>&1)" || rc=$?
    if [ $rc -ne 0 ]; then
        printf 'guard probe: cap status %s for %s failed (rc=%s)\n' "$field" "$user" "$rc" >&2
        return $rc
    fi
    value="$(awk '{print $2}' <<<"$status")"
    printf '%s' "$value"
}

guard_host_exec_functional_healthy() {
    local verify_user="${1:-}"
    if [[ -z "$verify_user" ]]; then
        verify_user="$(_guard_capture_line guard_verify_login_user)"
    fi
    [[ -n "$verify_user" ]] || return 1
    ! agent_no_new_privs_enabled "$verify_user" \
        && guard_git_has_required_file_caps \
        && agent_git_works_runuser "$verify_user"
}

guard_verify_user_run() {
    local user="$1" cmd="$2" stderr_file="$3"
    guard_verify_user_run_runuser "$user" "$cmd" "$stderr_file"
}

guard_verify_login_user() {
    if [[ -n "${SUDO_USER:-}" ]]; then
        local uid
        uid="$(_guard_capture_line id -u "$SUDO_USER")"
        if [[ -n "$uid" && "$uid" -ge 1000 && "$uid" -lt 65534 ]]; then
            printf '%s\n' "$SUDO_USER"
            return 0
        fi
    fi
    awk -F: '$3>=1000 && $3<65534 && $7 ~ /\/(bash|sh|zsh|fish)$/{print $1; exit}' /etc/passwd
}

_resolve_guard_bin() {
    if [[ -n "${GUARD_BIN:-}" && -f "$GUARD_BIN" ]]; then
        printf '%s\n' "$GUARD_BIN"
        return 0
    fi
    local candidate
    for candidate in \
        "$_guard_dir/target/release/workspace-guard" \
        "$_guard_dir/target/x86_64-unknown-linux-musl/release/workspace-guard"; do
        if [[ -f "$candidate" ]]; then
            printf '%s\n' "$candidate"
            return 0
        fi
    done
    return 1
}

_guard_reference_mode() {
    local ref_bin="${1:-}"
    if [[ -n "$ref_bin" && -f "${ref_bin}.mode" ]]; then
        cat "${ref_bin}.mode"
        return 0
    fi
    if [[ -f /usr/bin/git.original ]]; then
        local cls
        cls="$(_guard_capture_line guard_read_deployment_class)"
        if [[ "$cls" == "host-exec" ]]; then
            printf '%s\n' capability
            return 0
        fi
        if divert_is_active || [[ -f /etc/apt/apt.conf.d/99workspace-guard ]]; then
            printf '%s\n' capability
            return 0
        fi
        printf '%s\n' root-only
        return 0
    fi
    printf '%s\n' unknown
}

# Emit one drift reason per line (empty output means healthy).
guard_install_drift_reasons() {
    local ref_bin="${1:-}"
    local -a reasons=()

    if [[ -z "$ref_bin" ]]; then
        ref_bin="$(_guard_capture_line _resolve_guard_bin)"
    fi

    local install_mode
    install_mode="$(_guard_reference_mode "$ref_bin")"

    if [[ ! -f /usr/bin/git.original ]]; then
        reasons+=("guard not installed: /usr/bin/git.original missing")
        printf '%s\n' "${reasons[@]}"
        return 0
    fi

    local gmode gowner
    gmode="$(_guard_capture stat -c '%a' /usr/bin/git.original)"
    gowner="$(_guard_capture stat -c '%U:%G' /usr/bin/git.original)"
    if [[ "$gmode" != "700" || "$gowner" != "root:root" ]]; then
        reasons+=("/usr/bin/git.original wrong permissions (expected 0700 root:root, got ${gmode} ${gowner})")
    fi

    if [[ ! -x /usr/bin/git ]]; then
        reasons+=("/usr/bin/git missing or not executable")
    else
        local guard_mode guard_owner
        guard_mode="$(_guard_capture stat -c '%a' /usr/bin/git)"
        guard_owner="$(_guard_capture stat -c '%U:%G' /usr/bin/git)"
        if [[ "$guard_owner" != "root:root" ]]; then
            reasons+=("/usr/bin/git wrong owner (expected root:root, got $guard_owner)")
        fi
        if [[ "$guard_mode" != "755" ]]; then
            reasons+=("/usr/bin/git wrong mode (expected 0755, got $guard_mode)")
        fi
        if [[ -n "$ref_bin" && -f "$ref_bin" ]]; then
            local installed_hash ref_hash
            installed_hash=$(sha256sum /usr/bin/git | awk '{print $1}')
            ref_hash=$(sha256sum "$ref_bin" | awk '{print $1}')
            if [[ "$installed_hash" != "$ref_hash" ]]; then
                reasons+=("installed guard binary stale (sha256 differs from built binary)")
            fi
        fi
    fi

    if [[ "$install_mode" == "capability" ]]; then
        local deployed_cls
        deployed_cls="$(_guard_capture_line guard_read_deployment_class)"
        if [[ -z "$deployed_cls" ]]; then
            reasons+=("deployment-class missing (/usr/lib/workspace-guard/deployment-class)")
        elif [[ "$deployed_cls" != "host-exec" ]]; then
            reasons+=("deployment-class is '$deployed_cls' (expected host-exec)")
        fi

        if ! divert_is_active; then
            reasons+=("dpkg-divert for /usr/bin/git not active")
        fi

        if command -v getcap >/dev/null; then
            local _gc
            _gc="$(_guard_capture_line guard_git_file_cap_actual)"
            if ! guard_git_has_required_file_caps; then
                reasons+=("host-exec requires ${GUARD_WORKLOAD_FILE_CAP_STRING} on /usr/bin/git (got: ${_gc:-none})")
            fi
        fi

        if [[ -f /etc/security/capability.conf ]] \
            && grep -q 'workspace-guard ambient caps' /etc/security/capability.conf; then
            reasons+=("pam_cap artifact still present in /etc/security/capability.conf (run install-guard-host-exec to scrub)")
        fi

        if [[ ! -f /etc/apt/apt.conf.d/99workspace-guard ]]; then
            reasons+=("apt post-invoke hook missing (/etc/apt/apt.conf.d/99workspace-guard)")
        fi

        local _verify_user
        _verify_user="$(_guard_capture_line guard_verify_login_user)"
        if [[ -n "$_verify_user" ]] && ! guard_host_exec_functional_healthy "$_verify_user"; then
            reasons+=("agent $_verify_user cannot run git via runuser (host-exec file-cap delivery ineffective)")
        fi

        if command -v lsattr >/dev/null; then
            if [[ -f /usr/bin/git ]]; then
                local _attrs _arc=0
                _attrs="$(lsattr /usr/bin/git 2>&1)" || _arc=$?
                if [ $_arc -eq 0 ] && ! grep -q '^....i' <<<"$_attrs"; then
                    reasons+=("immutable flag not set on /usr/bin/git")
                elif [ $_arc -ne 0 ]; then
                    printf 'guard probe: lsattr /usr/bin/git failed (rc=%s)\n' "$_arc" >&2
                fi
            fi
            if [[ -f /usr/bin/git.original ]]; then
                local _attrs_o _orc=0
                _attrs_o="$(lsattr /usr/bin/git.original 2>&1)" || _orc=$?
                if [ $_orc -eq 0 ] && ! grep -q '^....i' <<<"$_attrs_o"; then
                    reasons+=("immutable flag not set on /usr/bin/git.original")
                elif [ $_orc -ne 0 ]; then
                    printf 'guard probe: lsattr /usr/bin/git.original failed (rc=%s)\n' "$_orc" >&2
                fi
            fi
        fi
    fi

    if [[ ${#reasons[@]} -gt 0 ]]; then
        printf '%s\n' "${reasons[@]}"
    fi
}

guard_install_healthy() {
    local ref_bin="${1:-}"
    local -a drift=()
    _guard_read_lines drift guard_install_drift_reasons "$ref_bin"
    [[ ${#drift[@]} -eq 0 ]]
}