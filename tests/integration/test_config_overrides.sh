#!/usr/bin/env bash
# Integration tests for config path override resolution.
set -euo pipefail

_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_REPO_ROOT="$(cd "$_SCRIPT_DIR/../.." && pwd)"
# shellcheck source=../test_helpers.sh
source "$_SCRIPT_DIR/../test_helpers.sh"

_source_ci() {
    # shellcheck source=/dev/null
    source "$_REPO_ROOT/lib/ci.sh"
}

test_ci_config_dir_preserved_on_source() {
    local _custom
    _custom="$(mktemp -d)"
    export CI_CONFIG_DIR="$_custom"
    _source_ci
    [[ "$CI_CONFIG_DIR" == "$_custom" ]]
    rm -rf "$_custom"
    unset CI_CONFIG_DIR
}

test_ci_config_path_env_override() {
    _source_ci
    local _tmp _custom
    _tmp="$(mktemp -d)"
    _custom="$_tmp/banned_words.yaml"
    echo "version: 1" > "$_custom"
    export CI_CONFIG_PATH_BANNED_WORDS="$_custom"
    local _resolved
    _resolved="$(ci_config_path banned_words)"
    [[ "$_resolved" == "$_custom" ]]
    rm -rf "$_tmp"
    unset CI_CONFIG_PATH_BANNED_WORDS
}

test_ci_config_path_matches_python() {
    _source_ci
    local _tmp _manifest _override
    _tmp="$(mktemp -d)"
    _override="$_tmp/override.yaml"
    echo "version: 1" > "$_override"
    _manifest="$_tmp/overrides.yaml"
    cat > "$_manifest" <<EOF
silent_swallow_patterns: $_override
EOF
    export CI_CONFIG_OVERRIDES="$_manifest"
    local _bash_path _py_path
    _bash_path="$(ci_config_path silent_swallow_patterns)"
    _py_path="$(
        CI_CONFIG_DIR="${CI_CONFIG_DIR:-$_REPO_ROOT/config}" \
        CI_CONFIG_OVERRIDES="$_manifest" \
        CI_LIB_DIR="$_REPO_ROOT/lib" \
        CI_PROJECT_ROOT="$_REPO_ROOT" \
        uv run python "$_REPO_ROOT/lib/resolve_config_path.py" \
            silent_swallow_patterns
    )"
    [[ "$_bash_path" == "$_py_path" ]]
    rm -rf "$_tmp"
    unset CI_CONFIG_OVERRIDES
}

_run_test "config-overrides: CI_CONFIG_DIR preserved when pre-set" test_ci_config_dir_preserved_on_source
_run_test "config-overrides: per-file env override via ci_config_path" test_ci_config_path_env_override
_run_test "config-overrides: bash ci_config_path matches Python resolver" test_ci_config_path_matches_python