# lib/guard-host-exec.sh - host-exec deployment class for git guard
#
# Sourced by scripts/bootstrap-workspace-guard after guard-drift.sh.
# Depends on: _guard_dir, log_*, guard_* helpers from guard-drift.sh.

GUARD_DEPLOYMENT_CLASS_FILE="/usr/lib/workspace-guard/deployment-class"
GUARD_PRIOR_DELIVERY_MODE_FILE="/usr/lib/workspace-guard/delivery.mode"
GUARD_HOST_EXEC_CLASS="host-exec"
GUARD_PAM_CAP_AUTH_LINE='auth optional pam_cap.so defer keepcaps'
GUARD_CAPABILITY_CONF_MARKERS=(
    "# workspace-guard ambient caps (managed by make install-guard)"
    "# workspace-guard ambient caps (managed by make install-guard-host-exec)"
)
GUARD_CAPABILITY_CONF_END="# end workspace-guard ambient caps"

guard_host_short_name() {
    local short rc=0
    short="$(hostname -s 2>&1)" || rc=$?
    if [ $rc -eq 0 ] && [[ -n "$short" ]]; then
        printf '%s\n' "$short"
        return 0
    fi
    if [ $rc -ne 0 ]; then
        printf 'guard probe: hostname -s failed (rc=%s)\n' "$rc" >&2
    fi
    hostname
}

guard_host_profiles_file() {
    printf '%s/config/guard-host-profiles.yaml\n' "$_guard_dir"
}

# Emit deployment class for hostname from guard-host-profiles.yaml (empty if unknown).
guard_host_profile_class() {
    local host="${1:?host}"
    local profiles
    profiles="$(guard_host_profiles_file)"
    [[ -f "$profiles" ]] || return 1
    local line key val
    while IFS= read -r line; do
        line="${line%%#*}"
        [[ "$line" =~ ^[[:space:]]*profiles:[[:space:]]*$ ]] && continue
        [[ "$line" =~ ^[[:space:]]*([^:[:space:]]+)[[:space:]]*:[[:space:]]*([^[:space:]]+) ]] || continue
        key="${BASH_REMATCH[1]}"
        val="${BASH_REMATCH[2]}"
        if [[ "$key" == "$host" ]]; then
            printf '%s\n' "$val"
            return 0
        fi
    done < "$profiles"
    return 1
}

guard_assert_host_profile_host_exec() {
    local host expected actual
    host="$(guard_host_short_name)"
    expected="$(_guard_capture_line guard_host_profile_class "$host")"
    if [[ -z "$expected" ]]; then
        log_error "Hostname '$host' not in $(guard_host_profiles_file)"
        log_error "Add a profiles entry for this host or run on a bound fleet host."
        return 1
    fi
    if [[ "$expected" != "$GUARD_HOST_EXEC_CLASS" ]]; then
        log_error "Host '$host' is bound to class '$expected', not host-exec"
        log_error "Refusing install-guard-host-exec on wrong deployment class."
        return 1
    fi
    actual="$(_guard_capture_line guard_read_deployment_class)"
    if [[ -n "$actual" && "$actual" != "$GUARD_HOST_EXEC_CLASS" ]]; then
        log_error "Installed deployment class is '$actual' (expected host-exec)"
        log_error "Run: sudo make uninstall-guard, then sudo make install-guard-host-exec"
        return 1
    fi
    return 0
}

guard_clear_prior_delivery_mode() {
    rm -f "$GUARD_PRIOR_DELIVERY_MODE_FILE"
}

guard_read_deployment_class() {
    if [[ -f "$GUARD_DEPLOYMENT_CLASS_FILE" ]]; then
        tr -d '[:space:]' < "$GUARD_DEPLOYMENT_CLASS_FILE"
        return 0
    fi
    if [[ -f "$GUARD_PRIOR_DELIVERY_MODE_FILE" ]]; then
        local prior_mode
        prior_mode="$(tr -d '[:space:]' < "$GUARD_PRIOR_DELIVERY_MODE_FILE")"
        if [[ "$prior_mode" == "file-cap" ]]; then
            printf '%s\n' "$GUARD_HOST_EXEC_CLASS"
            return 0
        fi
    fi
    return 1
}

guard_write_deployment_class() {
    local class="${1:?class}"
    mkdir -p /usr/lib/workspace-guard
    printf '%s\n' "$class" > "$GUARD_DEPLOYMENT_CLASS_FILE"
    chmod 0644 "$GUARD_DEPLOYMENT_CLASS_FILE"
    rm -f "$GUARD_PRIOR_DELIVERY_MODE_FILE"
}

_guard_capability_conf_strip_managed_blocks() {
    local cap_conf="$1"
    [[ -f "$cap_conf" ]] || return 0
    local tmp marker
    tmp="$(mktemp)"
    awk -v end="$GUARD_CAPABILITY_CONF_END" '
        function is_marker(line,    m) {
            if (line == "# workspace-guard ambient caps (managed by make install-guard)") return 1
            if (line == "# workspace-guard ambient caps (managed by make install-guard-host-exec)") return 1
            return 0
        }
        is_marker($0) { skip = 1; next }
        $0 == end { skip = 0; next }
        !skip { print }
    ' "$cap_conf" > "$tmp"
    mv "$tmp" "$cap_conf"
}

_guard_pam_remove_managed_auth_cap() {
    local target="$1"
    [[ -f "$target" ]] || return 0
    local tmp
    tmp="$(mktemp)"
    if ! grep -vE '^[[:space:]]*auth[[:space:]]+optional[[:space:]]+pam_cap\.so[[:space:]]+defer' \
        "$target" > "$tmp"; then
        local rc=$?
        if [ $rc -gt 1 ]; then
            printf 'guard probe: grep filter %s failed (rc=%s)\n' "$target" "$rc" >&2
            rm -f "$tmp"
            return $rc
        fi
    fi
    if ! cmp -s "$target" "$tmp"; then
        mv "$tmp" "$target"
        log_info "Removed pam_cap.so auth line from $target"
    else
        rm -f "$tmp"
    fi
}

guard_scrub_pam_artifacts() {
    _guard_capability_conf_strip_managed_blocks /etc/security/capability.conf
    _guard_pam_remove_managed_auth_cap /etc/pam.d/common-auth
    _guard_pam_remove_managed_auth_cap /etc/pam.d/su
    _guard_pam_remove_managed_auth_cap /etc/pam.d/sshd
    local target
    for target in /etc/pam.d/common-session /etc/pam.d/common-session-noninteractive \
        /etc/pam.d/login /etc/pam.d/sshd /etc/pam.d/su; do
        [[ -f "$target" ]] || continue
        if grep -qE '^[[:space:]]*session[[:space:]]+optional[[:space:]]+pam_cap\.so' "$target"; then
            local tmp
            tmp="$(mktemp)"
            grep -vE '^[[:space:]]*session[[:space:]]+optional[[:space:]]+pam_cap\.so' \
                "$target" > "$tmp"
            mv "$tmp" "$target"
            log_info "Removed session pam_cap.so from $target"
        fi
    done
}

agent_git_works_runuser() {
    local user="${1:?user}"
    local _out _rc=0
    _out="$(runuser -u "$user" -- git --version 2>&1)" || _rc=$?
    [[ $_rc -eq 0 ]] && ! grep -q 'missing workload capabilities' <<<"$_out"
}

guard_verify_user_run_runuser() {
    local user="$1" cmd="$2" stderr_file="$3"
    local rc=0
    runuser -u "$user" -- bash -lc "$cmd" 2>"$stderr_file" >/dev/null || rc=$?
    return $rc
}

install_guard_host_exec() {
    if ! command -v setcap >/dev/null || ! command -v getcap >/dev/null; then
        log_error "host-exec requires setcap and getcap (libcap2-bin)"
        return 1
    fi

    guard_scrub_pam_artifacts
    guard_clear_prior_delivery_mode
    guard_assert_host_profile_host_exec || return 1

    local cap_str
    cap_str="$(guard_workload_file_cap_string)"

    if command -v chattr >/dev/null && [[ -f /usr/bin/git ]]; then
        _guard_best_effort chattr -i /usr/bin/git
    fi
    _guard_best_effort setcap -r /usr/bin/git

    local _setcap_err
    _setcap_err="$(mktemp)"
    if ! setcap "$cap_str" /usr/bin/git 2>"$_setcap_err"; then
        log_error "Failed to set file capabilities on /usr/bin/git: $cap_str"
        [[ -s "$_setcap_err" ]] && log_error "$(cat "$_setcap_err")"
        rm -f "$_setcap_err"
        return 1
    fi
    rm -f "$_setcap_err"
    if ! guard_git_has_required_file_caps; then
        local _gc_full
        _gc_full="$(_guard_capture getcap /usr/bin/git)"
        log_error "File capabilities on /usr/bin/git do not match expected: $cap_str"
        log_error "getcap output: ${_gc_full:-<empty>}"
        return 1
    fi

    guard_write_deployment_class "$GUARD_HOST_EXEC_CLASS"
    log_info "Deployment class: host-exec (file capabilities on /usr/bin/git)"

    local verify_user
    verify_user="$(_guard_capture_line guard_verify_login_user)"
    if [[ -z "$verify_user" ]]; then
        log_error "No login user for host-exec functional verification"
        return 1
    fi
    if agent_no_new_privs_enabled "$verify_user"; then
        log_error "Agent $verify_user has NoNewPrivs=1; file-cap delivery unavailable"
        return 1
    fi
    if ! agent_git_works_runuser "$verify_user"; then
        log_error "runuser -u $verify_user -- git --version failed (host-exec delivery)"
        return 1
    fi
    log_info "host-exec verified: runuser -u $verify_user -- git --version"
    return 0
}