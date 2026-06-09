#!/usr/bin/env bash
# CI Quality Gates: quality_exceptions.yaml loader, tier resolution,
# and bootstrap helpers for the project_enforcement.yaml registry.
#
# Sourced by checks.sh. Shell-only — no Python deps. The Python self-check
# (ci/ci/check_required_hooks_present.py) does the deeper validation;
# these shell helpers are fast pre-flights for hooks and the git wrapper.

# --- ci_check_quality_exceptions_present [PROJECT_DIR] ---
# Pure existence + readability check for quality_exceptions.yaml.
# Returns 0 if file exists; 1 otherwise (with one-line fix message).
# Used by generate-hooks at render-time and by hook preambles at run-time.
ci_check_quality_exceptions_present() {
    local project_dir="${1:-.}"
    project_dir="$(cd "$project_dir" && pwd)"
    local _path="$project_dir/quality_exceptions.yaml"

    if [[ -f "$_path" ]]; then
        return 0
    fi

    ci_fail "quality_exceptions.yaml missing at $project_dir"
    echo "  Fix: copy projects/CI/templates/quality_exceptions.template.yaml"
    echo "       to $project_dir/quality_exceptions.yaml and replace"
    echo "       __PROJECT_NAME__ with the repo name. Empty exceptions: [] is ok."
    return 1
}

# --- ci_resolve_tier <repo_path> [registry_path] ---
# Resolve the enforcement tier for a repo, given the path-prefix registry.
# Echoes one of: strict | poc | vendored. Default is strict.
# Most-specific path-prefix match wins.
#
# repo_path:     path of the repo, relative to workspace root (e.g.
#                "projects/my-project"). Trailing slash optional.
# registry_path: path to the project_enforcement.yaml file. If omitted,
#                defaults to the CI template (read-only template).
ci_resolve_tier() {
    local _rel="${1:-}"
    local _registry="${2:-}"

    # Normalise: strip leading ./ and trailing /
    _rel="${_rel#./}"
    _rel="${_rel%/}"

    # If registry not given or missing, fall back to CI template.
    if [[ -z "$_registry" || ! -f "$_registry" ]]; then
        local _self_dir
        _self_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
        _registry="$_self_dir/../templates/project_enforcement.template.yaml"
    fi

    if [[ ! -f "$_registry" ]]; then
        # No registry, no template — fail open with strict default
        echo "strict"
        return 0
    fi

    # Walk YAML, find longest matching path prefix
    local _best_path="" _best_tier="" _cur_path="" _cur_tier=""
    local _in_exemptions=0
    while IFS= read -r _line; do
        if [[ "$_line" =~ ^exemptions: ]]; then
            _in_exemptions=1
            continue
        fi
        [[ $_in_exemptions -eq 0 ]] && continue

        # New entry begins with `  - path:`
        if [[ "$_line" =~ ^[[:space:]]+-[[:space:]]+path:[[:space:]]*(.+)$ ]]; then
            # Flush previous entry
            if [[ -n "$_cur_path" && -n "$_cur_tier" ]]; then
                local _ep="${_cur_path%/}"
                if [[ "$_rel" == "$_ep" || "$_rel" == "$_ep"/* ]]; then
                    if [[ ${#_ep} -gt ${#_best_path} ]]; then
                        _best_path="$_ep"
                        _best_tier="$_cur_tier"
                    fi
                fi
            fi
            _cur_path="${BASH_REMATCH[1]}"
            _cur_path="${_cur_path%\"}" ; _cur_path="${_cur_path#\"}"
            _cur_path="${_cur_path%\'}" ; _cur_path="${_cur_path#\'}"
            _cur_tier=""
            continue
        fi
        if [[ "$_line" =~ ^[[:space:]]+tier:[[:space:]]*(.+)$ ]]; then
            _cur_tier="${BASH_REMATCH[1]}"
            _cur_tier="${_cur_tier%\"}" ; _cur_tier="${_cur_tier#\"}"
            _cur_tier="${_cur_tier%\'}" ; _cur_tier="${_cur_tier#\'}"
        fi
    done < "$_registry"

    # Flush final entry
    if [[ -n "$_cur_path" && -n "$_cur_tier" ]]; then
        local _ep="${_cur_path%/}"
        if [[ "$_rel" == "$_ep" || "$_rel" == "$_ep"/* ]]; then
            if [[ ${#_ep} -gt ${#_best_path} ]]; then
                _best_tier="$_cur_tier"
            fi
        fi
    fi

    if [[ -n "$_best_tier" ]]; then
        echo "$_best_tier"
    else
        echo "strict"
    fi
}

# --- ci_resolve_enforcement_mode [registry_path] ---
# Echo the global enforcement_mode from the registry: 'warn' or 'enforce'.
# Default is 'warn' (fail-safe during rollout). Falls back to the CI
# template if registry_path is empty or missing.
ci_resolve_enforcement_mode() {
    local _registry="${1:-}"

    if [[ -z "$_registry" || ! -f "$_registry" ]]; then
        local _self_dir
        _self_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
        _registry="$_self_dir/../templates/project_enforcement.template.yaml"
    fi

    if [[ ! -f "$_registry" ]]; then
        echo "warn"
        return 0
    fi

    local _mode=""
    while IFS= read -r _line; do
        if [[ "$_line" =~ ^enforcement_mode:[[:space:]]*(.+)$ ]]; then
            _mode="${BASH_REMATCH[1]}"
            _mode="${_mode%\"}" ; _mode="${_mode#\"}"
            _mode="${_mode%\'}" ; _mode="${_mode#\'}"
            _mode="${_mode%%[[:space:]]*}"
            _mode="${_mode%%#*}"
            break
        fi
    done < "$_registry"

    case "$_mode" in
        enforce) echo "enforce" ;;
        warn|"") echo "warn" ;;
        *) echo "warn" ;;
    esac
}

# --- ci_autocreate_project_enforcement <workspace_root> ---
# Autocreate the live registry from the CI template if missing.
# Idempotent: no-op if the file already exists.
ci_autocreate_project_enforcement() {
    local _workspace_root="${1:-}"
    [[ -z "$_workspace_root" ]] && return 1

    local _live="$_workspace_root/ci/config/project_enforcement.yaml"
    local _tpl="$_workspace_root/projects/CI/templates/project_enforcement.template.yaml"

    if [[ -f "$_live" ]]; then
        echo "$_live"
        return 0
    fi
    if [[ ! -f "$_tpl" ]]; then
        # Workspace incomplete — caller decides what to do
        return 1
    fi

    mkdir -p "$(dirname "$_live")"
    cp "$_tpl" "$_live"
    echo "ci: autocreated $_live from template" >&2
    echo "$_live"
    return 0
}
