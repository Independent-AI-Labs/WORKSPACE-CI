# lib/guard-host-exec.sh - host-exec deployment class for git guard
#
# Sourced by scripts/bootstrap-workspace-guard after guard-drift.sh.
# Depends on: _guard_dir, log_*, guard_* helpers from guard-drift.sh.

guard_state_dir() {
    printf '%s\n' "${WORKSPACE_GUARD_STATE_DIR:-/usr/lib/workspace-guard}"
}

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
    while IFS= read -r line || [[ -n "$line" ]]; do
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

guard_host_provision_config_file() {
    if [[ -n "${WORKSPACE_HOST_PROVISION_FILE:-}" ]]; then
        printf '%s\n' "$WORKSPACE_HOST_PROVISION_FILE"
        return 0
    fi
    printf '%s/config/host-provision.yaml\n' "$_guard_dir"
}

guard_host_provision_marker_file() {
    local base="${WORKSPACE_GUARD_STATE_DIR:-/usr/lib/workspace-guard}"
    printf '%s/host-provision.ok\n' "$base"
}

guard_host_provision_user_mgmt_enabled() {
    local cfg
    cfg="$(guard_host_provision_config_file)"
    [[ -f "$cfg" ]] || return 1
    local HP_CONFIG="$cfg" HP_REPO_ROOT="$_guard_dir"
    local enabled=""
    enabled="$(_guard_capture_line awk '
        /^[[:space:]]*user_management:[[:space:]]*$/ { in_um=1; next }
        in_um && /^[[:space:]]*enabled:/ {
            v=$0; sub(/^[^:]*:[[:space:]]*/, "", v); gsub(/["'\'']/, "", v)
            print v; exit
        }
        /^[^[:space:]#]/ { in_um=0 }
    ' "$cfg")"
    [[ "${enabled:-true}" == "true" || "${enabled:-true}" == "1" || "${enabled:-true}" == "yes" ]]
}

guard_host_provision_fleet_file() {
    local cfg rel
    cfg="$(guard_host_provision_config_file)"
    [[ -f "$cfg" ]] || return 1
    rel="$(_guard_capture_line awk '
        /^[[:space:]]*fleet_users_file:/ {
            v=$0; sub(/^[^:]*:[[:space:]]*/, "", v); gsub(/["'\'']/, "", v); print v; exit
        }
    ' "$cfg")"
    [[ -z "$rel" ]] && rel="config/home-lock-users.yaml"
    if [[ "$rel" != /* ]]; then
        printf '%s/%s\n' "$_guard_dir" "$rel"
    else
        printf '%s\n' "$rel"
    fi
}

guard_host_provision_fleet_in_sudo() {
    local fleet user _users_file _awk_rc=0
    fleet="$(_guard_capture_line guard_host_provision_fleet_file)" || return 1
    [[ -f "$fleet" ]] || return 1
    getent group sudo >/dev/null 2>&1 || return 1
    _users_file="$(mktemp)"
    awk '
        /^[[:space:]]*-[[:space:]]*name:/ {
            v=$0; sub(/^[^:]*:[[:space:]]*/, "", v); gsub(/["'\'']/, "", v)
            if (v) print v
        }
    ' "$fleet" >"$_users_file" || _awk_rc=$?
    if [[ $_awk_rc -ne 0 ]]; then
        rm -f "$_users_file"
        return 1
    fi
    while IFS= read -r user; do
        [[ -z "$user" ]] && continue
        if id -nG "$user" 2>/dev/null | tr ' ' '\n' | grep -qx sudo; then
            rm -f "$_users_file"
            printf '%s\n' "$user"
            return 0
        fi
    done < "$_users_file"
    rm -f "$_users_file"
    return 1
}

guard_assert_host_provision_complete() {
    guard_host_provision_user_mgmt_enabled || return 0
    local marker cfg_admin marker_admin offender
    marker="$(guard_host_provision_marker_file)"
    if [[ ! -f "$marker" ]]; then
        log_error "Host provision incomplete: $marker missing"
        log_error "Run: sudo make provision-host  (or sudo make install-host-stack)"
        return 1
    fi
    cfg_admin="$(_guard_capture_line awk '
        /^[[:space:]]*admin:[[:space:]]*$/ { in_a=1; next }
        in_a && /^[[:space:]]*name:/ {
            v=$0; sub(/^[^:]*:[[:space:]]*/, "", v); gsub(/["'\'']/, "", v); print v; exit
        }
        /^[^[:space:]#]/ { in_a=0 }
    ' "$(guard_host_provision_config_file)")"
    marker_admin="$(_guard_capture_line awk -F= '$1=="admin"{print $2; exit}' "$marker")"
    if [[ -n "$cfg_admin" && -n "$marker_admin" && "$cfg_admin" != "$marker_admin" ]]; then
        log_error "Host provision marker admin=$marker_admin does not match config ($cfg_admin)"
        log_error "Re-run: sudo make provision-host"
        return 1
    fi
    offender="$(_guard_capture_line guard_host_provision_fleet_in_sudo)" || offender=""
    if [[ -n "$offender" ]]; then
        log_error "Fleet user '$offender' is still in group sudo"
        log_error "Run: sudo make provision-host"
        return 1
    fi
    return 0
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
    rm -f "$(guard_state_dir)/delivery.mode"
}

guard_read_deployment_class() {
    local base class_file prior_file
    base="$(guard_state_dir)"
    class_file="$base/deployment-class"
    prior_file="$base/delivery.mode"
    if [[ -f "$class_file" ]]; then
        tr -d '[:space:]' < "$class_file"
        return 0
    fi
    if [[ -f "$prior_file" ]]; then
        local prior_mode
        prior_mode="$(tr -d '[:space:]' < "$prior_file")"
        if [[ "$prior_mode" == "file-cap" ]]; then
            printf '%s\n' "$GUARD_HOST_EXEC_CLASS"
            return 0
        fi
    fi
    return 1
}

guard_write_deployment_class() {
    local class="${1:?class}" base
    base="$(guard_state_dir)"
    mkdir -p "$base"
    printf '%s\n' "$class" > "$base/deployment-class"
    chmod 0644 "$base/deployment-class"
    rm -f "$base/delivery.mode"
}

guard_remove_git_install_artifacts() {
    local base
    base="$(guard_state_dir)"
    rm -f "$base/deployment-class" "$base/git-ssh-wrapper" "$base/delivery.mode"
    if [[ "$base" != "/usr/lib/workspace-guard" ]]; then
        rm -f /usr/lib/workspace-guard/deployment-class \
            /usr/lib/workspace-guard/git-ssh-wrapper \
            /usr/lib/workspace-guard/delivery.mode
    fi
}

purge_guard_state() {
    local base
    base="$(guard_state_dir)"
    if [[ "${GUARD_PURGE_CONFIRM:-}" != "1" ]]; then
        log_error "Refusing purge: export GUARD_PURGE_CONFIRM=1 to destroy all guard state"
        log_error "This removes: $base (host-provision.ok, ssh-keys/, identities), guard logs"
        log_error "Then run: sudo make install-host-stack"
        return 1
    fi
    log_warn "Purging all workspace-guard state under $base"
    rm -rf "$base"
    rm -rf /usr/lib/ami-git-guard
    rm -rf /var/log/workspace-guard
    rm -rf /var/log/ami-git-guard
    log_info "Guard state purged"
}

guard_install_git_ssh_wrapper() {
    local src="" candidate dest
    dest="$(guard_state_dir)/git-ssh-wrapper"
    for candidate in \
        "$_guard_dir/target/x86_64-unknown-linux-musl/release/workspace-git-ssh" \
        "$_guard_dir/target/release/workspace-git-ssh"; do
        if [[ -f "$candidate" ]]; then
            src="$candidate"
            break
        fi
    done
    if [[ -z "$src" ]]; then
        log_warn "workspace-git-ssh binary not found; git fetch/push SSH wrapper skipped"
        log_warn "Rebuild: make build-guard"
        return 0
    fi
    if ! command -v setcap >/dev/null; then
        log_error "git-ssh-wrapper requires setcap (libcap2-bin)"
        return 1
    fi
    mkdir -p /usr/lib/workspace-guard
    install -m 0755 -o root -g root "$src" "$dest"
    if ! setcap cap_dac_override=ep "$dest" 2>/dev/null; then
        log_error "Failed to set cap_dac_override on $dest"
        return 1
    fi
    log_info "Installed git SSH wrapper: $dest (cap_dac_override=ep)"
}

guard_install_agent_git_identity() {
    local src="${_guard_dir}/config/agent-git-identity"
    local dest
    dest="$(guard_state_dir)/agent-git-identity"
    if [[ ! -f "$src" ]]; then
        log_error "Agent git identity missing: $src"
        log_error "Copy and edit locally: cp config/agent-git-identity.example config/agent-git-identity"
        log_error "(config/agent-git-identity is gitignored - never commit real emails/names)"
        return 1
    fi
    mkdir -p /usr/lib/workspace-guard
    install -m 0644 -o root -g root "$src" "$dest"
    log_info "Installed agent git identity: $dest"
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
    guard_assert_host_provision_complete || return 1
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
    guard_install_git_ssh_wrapper || return 1
    guard_install_agent_git_identity || return 1
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