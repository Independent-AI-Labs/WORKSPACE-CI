#!/usr/bin/env bash
# Dependency catalog accessors. Sourced by ci.sh.

# ci_tool_version <tool> [field]
ci_tool_version() {
    local tool="$1" field="${2:-version}" value
    value="$(ci_read_yaml "$CI_PROJECT_ROOT/res/dependency-pins.yaml" "$tool.$field")" || return 1
    [[ -n "$value" ]] || return 1
    printf '%s\n' "$value"
}

# ci_tool_artifact <tool> <asset|sha256>
ci_tool_artifact() {
    local tool="$1" field="$2" value
    case "$field" in asset|sha256) ;; *) return 1 ;; esac
    value="$(awk -v tool="$tool" -v field="$field" '
        $0 == tool ":" { in_tool = 1; next }
        in_tool && /^[^ ]/ { exit }
        in_tool && /^    - asset:/ {
            in_artifact = 1
            if (field == "asset") {
                value = $0
                sub(/^[^:]+:[[:space:]]*/, "", value)
                gsub(/^[\"]|[\"]$/, "", value)
                print value
                exit
            }
        }
        in_tool && in_artifact && $0 ~ "^      " field ":" {
            value = $0
            sub(/^[^:]+:[[:space:]]*/, "", value)
            gsub(/^[\"]|[\"]$/, "", value)
            print value
            exit
        }
    ' "$CI_PROJECT_ROOT/res/dependency-pins.yaml")" || return 1
    [[ -n "$value" ]] && printf '%s\n' "$value"
}

ci_cloc_artifact() { ci_tool_artifact cloc "$1"; }
