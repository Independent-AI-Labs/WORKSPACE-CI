#!/usr/bin/env bash
# CI structural source-size checks.
# Sourced by checks.sh after checks_core.sh so ignore helpers are available.

# --- ci_check_module_size ---
# Enforces physical source-file bytes, source files per module, direct
# submodules per module, and source-module depth. Structural limits are
# optional fields in file_length_limits.yaml; defaults keep the guard active
# for older configurations.
ci_check_module_size() {
    [[ $# -eq 0 ]] || { ci_fail "ci_check_module_size does not accept positional narrowing"; return 1; }
    local config
    config="$(ci_config_path file_length_limits "./config/file_length_limits.yaml")" || return 1

    local max_bytes=262144 max_total_bytes=16777216 max_files=48 max_submodules=8 max_depth=8
    local exts=(.py .sh .js .ts .tsx .rs .css .lua)
    local value key
    if [[ -f "$config" ]]; then
        local configured_exts=()
        ci_capture_lines configured_exts -- ci_read_yaml_list "$config" extensions
        [[ ${#configured_exts[@]} -gt 0 ]] && exts=("${configured_exts[@]}")
        for key in max_file_bytes max_total_source_bytes max_source_files_per_module max_submodules_per_module max_module_depth; do
            value="$(ci_read_yaml "$config" "$key")"
            [[ -n "$value" ]] || continue
            if [[ ! "$value" =~ ^[1-9][0-9]*$ ]]; then
                ci_fail "Invalid $key in $config: $value (must be a positive integer)"
                return 1
            fi
            case "$key" in
                max_file_bytes) max_bytes="$value" ;;
                max_total_source_bytes) max_total_bytes="$value" ;;
                max_source_files_per_module) max_files="$value" ;;
                max_submodules_per_module) max_submodules="$value" ;;
                max_module_depth) max_depth="$value" ;;
            esac
        done
    fi

    local root
    root="$(git rev-parse --show-toplevel)" || return 1
    local source_files=() candidates=()
    ci_capture_lines candidates -- git ls-files --cached
    local candidate ext is_source
    for candidate in "${candidates[@]}"; do
        is_source=0
        for ext in "${exts[@]}"; do
            [[ "$candidate" == *"$ext" ]] && { is_source=1; break; }
        done
        [[ $is_source -eq 1 ]] && source_files+=("$candidate")
    done

    declare -A modules=() direct_files=() child_dirs=() override_files=() override_children=() override_depth=()
    local f module parent child bytes path depth total_bytes=0
    local violations=()

    if [[ -f "$config" ]]; then
        local override_data
        override_data="$(awk '
          function emit() {
              if (path != "") print path "\t" files "\t" children "\t" depth
              path=files=children=depth=""
          }
          /^module_overrides:[[:space:]]*$/ { in_mod=1; next }
          in_mod && /^[^[:space:]-]/ { emit(); exit }
          in_mod && /^[[:space:]]*-[[:space:]]+path:/ {
              emit(); path=$0
              sub(/^[[:space:]]*-[[:space:]]+path:[[:space:]]*/, "", path)
              gsub(/^["'"'']|["'"'']$/, "", path); next
          }
          in_mod && /^[[:space:]]+max_source_files:/ {
              val=$0; sub(/^[^:]+:[[:space:]]*/, "", val); files=val; next
          }
          in_mod && /^[[:space:]]+max_submodules:/ {
              val=$0; sub(/^[^:]+:[[:space:]]*/, "", val); children=val; next
          }
          in_mod && /^[[:space:]]+max_depth:/ {
              val=$0; sub(/^[^:]+:[[:space:]]*/, "", val); depth=val; next
          }
          END { if (in_mod) emit() }
        ' "$config")"
        while IFS=$'\t' read -r path value key depth; do
            [[ -n "$path" ]] || continue
            [[ -z "$value" || "$value" =~ ^[1-9][0-9]*$ ]] || { ci_fail "Invalid module override max_source_files for $path"; return 1; }
            [[ -z "$key" || "$key" =~ ^[1-9][0-9]*$ ]] || { ci_fail "Invalid module override max_submodules for $path"; return 1; }
            [[ -z "$depth" || "$depth" =~ ^[1-9][0-9]*$ ]] || { ci_fail "Invalid module override max_depth for $path"; return 1; }
            [[ -n "$value" ]] && override_files["$path"]="$value"
            [[ -n "$key" ]] && override_children["$path"]="$key"
            [[ -n "$depth" ]] && override_depth["$path"]="$depth"
        done <<< "$override_data"
    fi

    for f in "${source_files[@]}"; do
        [[ -n "$f" ]] || continue
        _in_ignored_dir "$f" && continue
        if [[ -L "$f" ]]; then
            violations+=("symlink:$f")
            continue
        fi
        if [[ ! -e "$f" ]] && [[ -n "$(git ls-files --deleted -- "$f")" ]]; then
            continue
        fi
        if [[ ! -f "$f" || ! -r "$f" ]]; then
            violations+=("unreadable:$f")
            continue
        fi
        module="${f%/*}"
        [[ "$module" == "$f" ]] && module="."
        bytes="$(wc -c < "$f")"
        total_bytes=$((total_bytes + bytes))
        if [[ "$bytes" -gt "$max_bytes" ]]; then
            violations+=("file:$f:$bytes bytes (limit $max_bytes)")
        fi
        direct_files["$module"]=$(( ${direct_files["$module"]:-0} + 1 ))
        modules["$module"]=1

        parent="${module%/*}"
        [[ "$parent" == "$module" || -z "$parent" ]] && parent="."
        while [[ "$parent" != "." ]]; do
            modules["$parent"]=1
            child="${module#"$parent"/}"
            child="${child%%/*}"
            child_dirs["$parent|$child"]=1
            if [[ "$parent" == */* ]]; then
                parent="${parent%/*}"
            else
                parent="."
            fi
        done
        modules[.]=1
        [[ "$module" != "." ]] && child_dirs[".|${module%%/*}"]=1
    done

    [[ "$total_bytes" -le "$max_total_bytes" ]] || violations+=("total:$total_bytes bytes (limit $max_total_bytes)")

    local module_file_count child_count limit_files limit_children limit_depth
    for module in "${!modules[@]}"; do
        module_file_count="${direct_files[$module]:-0}"
        limit_files="$max_files"
        limit_children="$max_submodules"
        limit_depth="$max_depth"
        [[ -n "${override_files[$module]:-}" ]] && limit_files="${override_files[$module]}"
        [[ -n "${override_children[$module]:-}" ]] && limit_children="${override_children[$module]}"
        [[ -n "${override_depth[$module]:-}" ]] && limit_depth="${override_depth[$module]}"

        child_count=0
        for child in "${!child_dirs[@]}"; do
            [[ "$child" == "$module|"* ]] && child_count=$((child_count + 1))
        done
        depth=0
        [[ "$module" != "." ]] && depth="${module//[^\/]/}" && depth=$(( ${#depth} + 1 ))

        [[ "$module_file_count" -le "$limit_files" ]] || violations+=("files:$module:$module_file_count (limit $limit_files)")
        [[ "$child_count" -le "$limit_children" ]] || violations+=("submodules:$module:$child_count (limit $limit_children)")
        [[ "$depth" -le "$limit_depth" ]] || violations+=("depth:$module:$depth (limit $limit_depth)")
    done

    if [[ ${#violations[@]} -gt 0 ]]; then
        ci_fail "Module-size guardrail violations:"
        printf '  %s\n' "${violations[@]}" | sort
        return 1
    fi
    ci_pass "All source files and modules are within size limits."
    return 0
}
