#!/usr/bin/env bash
# Config path resolution for CI shell hooks.
# Sourced by ci.sh after CI_LIB_DIR and CI_CONFIG_DIR are set.

declare -g -A _CI_CONFIG_PATH_CACHE=()

# ci_config_path <stem> [consumer_path]
#
# Resolve a CI config YAML path using the same precedence as ci/paths.py:
#   1. CI_CONFIG_PATH_{STEM}  (pure bash)
#   2. CI_CONFIG_OVERRIDES manifest  (lib/resolve_config_path.py when set)
#   3. CI_CONFIG_DIR/{stem}.yaml  (pure bash)
#   4. consumer_path when provided and the file exists  (pure bash)
ci_config_path() {
    local _stem="${1%.yaml}"
    local _consumer_path="${2:-}"
    local _cache_key="${_stem}|${_consumer_path}"

    if [[ -n "${_CI_CONFIG_PATH_CACHE[$_cache_key]+x}" ]]; then
        echo "${_CI_CONFIG_PATH_CACHE[$_cache_key]}"
        return 0
    fi

    local _env_name="CI_CONFIG_PATH_${_stem^^}"
    _env_name="${_env_name//-/_}"
    if [[ -n "${!_env_name:-}" ]]; then
        _CI_CONFIG_PATH_CACHE[$_cache_key]="${!_env_name}"
        echo "${!_env_name}"
        return 0
    fi

    if [[ -n "${CI_CONFIG_OVERRIDES:-}" ]]; then
        local _resolver="${CI_LIB_DIR}/resolve_config_path.py"
        if [[ ! -f "$_resolver" ]]; then
            ci_fail "Config path resolver not found at $_resolver"
            return 1
        fi

        local _resolved="" _py_rc=0
        _resolved="$(
            CI_CONFIG_DIR="${CI_CONFIG_DIR:-}" \
            WORKSPACE_CI_CONFIG_ROOT="${WORKSPACE_CI_CONFIG_ROOT:-}" \
            CI_CONFIG_OVERRIDES="${CI_CONFIG_OVERRIDES:-}" \
            CI_LIB_DIR="${CI_LIB_DIR:-}" \
            CI_PROJECT_ROOT="${CI_PROJECT_ROOT:-}" \
                ci_uv_run "$_resolver" "$_stem" "$_consumer_path"
        )" || _py_rc=$?

        if [[ $_py_rc -eq 0 && -n "$_resolved" ]]; then
            _CI_CONFIG_PATH_CACHE[$_cache_key]="$_resolved"
            echo "$_resolved"
            return 0
        fi
        if [[ $_py_rc -ne 0 ]]; then
            ci_warn "ci_config_path: resolver failed for ${_stem} (exit $_py_rc)"
        fi
    fi

    local _default="${CI_CONFIG_DIR}/${_stem}.yaml"
    if [[ -f "$_default" ]]; then
        _CI_CONFIG_PATH_CACHE[$_cache_key]="$_default"
        echo "$_default"
        return 0
    fi

    if [[ -n "$_consumer_path" && -f "$_consumer_path" ]]; then
        _CI_CONFIG_PATH_CACHE[$_cache_key]="$_consumer_path"
        echo "$_consumer_path"
        return 0
    fi

    _CI_CONFIG_PATH_CACHE[$_cache_key]="$_default"
    echo "$_default"
}