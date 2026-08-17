#!/usr/bin/env bash
# CI quality_exceptions.yaml validation.
#
# Sourced by checks.sh. Shell-only: no Python deps. The Python self-check
# (ci/ci/check_required_hooks_present.py) does the deeper validation;
# these shell helpers are fast pre-flights for hooks and the git wrapper.

# --- ci_check_quality_exceptions_present [PROJECT_DIR] ---
# Pure existence + readability check for quality_exceptions.yaml.
# Returns 0 if file exists; 1 otherwise (with one-line fix message).
# Used by hook checks.
ci_check_quality_exceptions_present() {
    local project_dir="${1:-.}"
    project_dir="$(cd "$project_dir" && pwd)"
    local _path="$project_dir/quality_exceptions.yaml"

    if [[ -f "$_path" ]]; then
        ci_validate_exemption_file "$_path" "quality_exceptions.yaml"
        return
    fi

    ci_fail "quality_exceptions.yaml missing at $project_dir"
    echo "  Fix: copy /opt/workspace-ci/templates/quality_exceptions.template.yaml"
    echo "       to $project_dir/quality_exceptions.yaml and replace"
    echo "       __PROJECT_NAME__ with the repo name. Empty exceptions: [] is ok."
    return 1
}
