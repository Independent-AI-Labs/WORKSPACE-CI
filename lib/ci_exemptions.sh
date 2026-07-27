#!/usr/bin/env bash
# CI Exemption-File Provenance: fail-closed validation for per-project
# exemption/config files listed in config/exemption_files.yaml.
# Sourced by checks.sh. Requires ci.sh to be loaded first.

# ---------------------------------------------------------------------------
# Exemption-file provenance validation (fail-closed)
# ---------------------------------------------------------------------------

# ci_exemption_file_state <path>
#   Echoes one of: ok, missing, symlink, not-regular, not-root-owned.
#   Anything other than "ok" means the file must NOT be honored by any
#   check. Root ownership is the complete invariant: exemption files are
#   root-owned and only ever edited via the root-gated yaml editor.
ci_exemption_file_state() {
    local _p="$1"
    if [[ -L "$_p" ]]; then echo "symlink"; return 0; fi
    if [[ ! -e "$_p" ]]; then echo "missing"; return 0; fi
    if [[ ! -f "$_p" ]]; then echo "not-regular"; return 0; fi
    local _uid
    if [[ "$(ci_platform_name)" == "darwin" ]]; then
        _uid="$(stat -f %u "$_p")"
    else
        _uid="$(stat -c %u "$_p")"
    fi
    if [[ "$_uid" != "0" ]]; then echo "not-root-owned"; return 0; fi
    echo "ok"
}

# ci_validate_exemption_file <path> [description]
#   Fail-closed: returns 1 (and prints a failure) unless the file exists
#   and is a regular non-symlink file owned by uid 0.
ci_validate_exemption_file() {
    local _p="$1" _what="${2:-exemption file}"
    local _state
    _state="$(ci_exemption_file_state "$_p")"
    if [[ "$_state" == "ok" ]]; then return 0; fi
    ci_fail "$_what not compliant: $_p (state: $_state)"
    echo "  Fix: chown root:root $_p; edit only via 'sudo workspace-yaml-edit'" >&2
    return 1
}

