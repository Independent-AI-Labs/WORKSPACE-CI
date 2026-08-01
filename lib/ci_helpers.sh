#!/usr/bin/env bash
# Supplemental CI helpers sourced by ci.sh (keeps ci.sh under file-length limit).

# ci_relative_path <from_dir> <to_dir>
#   Computes the relative path from from_dir to to_dir using pure bash.
ci_relative_path() {
    local _from="$1" _to="$2"

    _from="${_from%/}"
    _to="${_to%/}"

    local _from_parts _to_parts
    IFS='/' read -ra _from_parts <<< "${_from#"/"}"
    IFS='/' read -ra _to_parts <<< "${_to#"/"}"

    local _i=0
    while [[ $_i -lt ${#_from_parts[@]} && $_i -lt ${#_to_parts[@]} ]]; do
        [[ "${_from_parts[$_i]}" == "${_to_parts[$_i]}" ]] || break
        ((_i++))
    done

    local _result=""
    local _ups=$((${#_from_parts[@]} - _i))
    for ((; _ups > 0; _ups--)); do
        _result="../${_result}"
    done
    for ((; _i < ${#_to_parts[@]}; _i++)); do
        _result="${_result}${_to_parts[$_i]}/"
    done

    _result="${_result%/}"
    [[ -z "$_result" ]] && _result="."
    echo "$_result"
}

# ci_has_cmd <name>
#   Returns 0 when <name> is on PATH (no stdout/stderr discard).
ci_has_cmd() {
    local _cmd="$1" _path=""
    _path="$(command -v "${_cmd}" 2>&1)" || return 1
    return 0
}

# ci_uv_bin: resolve uv from exactly one source: the CI installation
# boot dir. Tool installs belong to the CI installation (this lib), not
# the consuming project, so resolve the lib's physical location; a
# symlinked fixture lib still finds the real boot dir under the shell
# guard's reset PATH. Single source, hard error when absent.
ci_uv_bin() {
    local _lib_phys
    _lib_phys="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
    local _inst_uv="${_lib_phys}/../$(ci_boot_name)/bin/uv"
    if [[ ! -x "$_inst_uv" ]]; then
        echo "ERROR: uv not found at $_inst_uv; run: make install-boot-tools (in the CI installation)" >&2
        return 1
    fi
    echo "$_inst_uv"
}

# ci_uv_run [args...]: hermetic `uv run python` against CI_PROJECT_ROOT,
# preserving the caller's cwd (relative path args belong to the caller).
ci_uv_run() {
    local _uv _root="${CI_PROJECT_ROOT:-}"
    _uv="$(ci_uv_bin)" || return 1
    if [[ -z "$_root" || ! -f "$_root/pyproject.toml" ]]; then
        ci_fail "ci_uv_run: CI_PROJECT_ROOT/pyproject.toml not found"
        return 1
    fi
    "$_uv" run --project "$_root" --no-sync python "$@"
}