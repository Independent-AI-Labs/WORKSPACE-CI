#!/usr/bin/env bash
# CI File Checks: sensitive files, file length, init files.
# Sourced by checks.sh. Requires ci.sh and checks_core.sh to be loaded first.

# --- ci_block_sensitive_files [files...] ---
# Blocks commit if any staged file matches sensitive extensions or keywords
# from config/sensitive_files.yaml.
# Enforces an allowlist of safe file types and supports per-repo exception
# lists via sensitive_files_exceptions.yaml.
# Prevents accidental leakage of credentials, keys, and environment files
# into version control.
_load_sensitive_config() {
    local config="${CI_CONFIG_DIR}/sensitive_files.yaml"
    [[ -f "$config" ]] || return 1

    _SENSITIVE_EXTENSIONS=()
    ci_capture_lines _SENSITIVE_EXTENSIONS -- ci_read_yaml_list "$config" "sensitive_extensions"

    _SENSITIVE_KEYWORDS=()
    ci_capture_lines _SENSITIVE_KEYWORDS -- ci_read_yaml_list "$config" "sensitive_keywords"

    _SAFE_EXCEPTIONS=()
    ci_capture_lines _SAFE_EXCEPTIONS -- ci_read_yaml_list "$config" "safe_exceptions"

    _SAFE_PREFIXES=()
    ci_capture_lines _SAFE_PREFIXES -- ci_read_yaml_list "$config" "safe_prefixes"

    # Merge per-repo exceptions from <repo_root>/config/sensitive_files_exceptions.yaml
    local repo_root
    repo_root="$(git rev-parse --show-toplevel)" || repo_root=""
    if [[ -n "$repo_root" ]]; then
        local per_repo="${repo_root}/config/sensitive_files_exceptions.yaml"
        if [[ -f "$per_repo" ]]; then
            local _extra=()
            ci_capture_lines _extra -- ci_read_yaml_list "$per_repo" "safe_exceptions"
            _SAFE_EXCEPTIONS+=("${_extra[@]}")
        fi
    fi
}

_is_sensitive() {
    local filepath="$1"
    local name ext name_lower

    name="$(basename "$filepath")"
    name_lower="${name,,}"
    ext=".${name_lower##*.}"
    # Files without extension: ext equals .filename
    [[ "$name_lower" == "${name_lower##*.}" ]] && ext=""

    # Safe exceptions (exact match)
    for safe in "${_SAFE_EXCEPTIONS[@]}"; do
        [[ "$name" == "$safe" ]] && return 1
    done

    # Safe prefixes (prefix match)
    for pfx in "${_SAFE_PREFIXES[@]}"; do
        [[ "$name_lower" == "${pfx}"* ]] && return 1
    done

    # Must have a sensitive extension (or start with .env)
    local has_ext=0
    if [[ "$name_lower" == .env* ]]; then
        has_ext=1
    else
        for sext in "${_SENSITIVE_EXTENSIONS[@]}"; do
            [[ "$ext" == "$sext" ]] && { has_ext=1; break; }
        done
    fi
    [[ $has_ext -eq 0 ]] && return 1

    # Hidden file (starts with .)
    [[ "$name_lower" == .* ]] && return 0

    # Contains sensitive keyword
    for kw in "${_SENSITIVE_KEYWORDS[@]}"; do
        [[ "$name_lower" == *"$kw"* ]] && return 0
    done

    return 1
}

ci_block_sensitive_files() {
    _load_sensitive_config || { ci_fail "Config not found: ${CI_CONFIG_DIR}/sensitive_files.yaml"; return 1; }

    local errors=0
    local sensitive_files=()

    local f _files=()
    ci_capture_lines _files -- ci_file_list "$@"
    for f in "${_files[@]}"; do
        [[ -z "$f" ]] && continue
        if _is_sensitive "$f"; then
            sensitive_files+=("$f")
            errors=$((errors + 1))
        fi
    done

    if [[ $errors -gt 0 ]]; then
        echo ""
        echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
        ci_fail "Sensitive files detected!"
        echo "The following files match patterns forbidden for commitment:"
        for sf in "${sensitive_files[@]}"; do
            echo "  - $sf"
        done
        echo ""
        echo "REASON: Files with sensitive extensions matching '.' or keywords"
        echo "are blocked to prevent accidental secret leakage."
        echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
        return 1
    fi

    return 0
}

# --- ci_check_file_length [files...] ---
# Fails the commit if any source file exceeds the line limit defined in
# config/file_length_limits.yaml.
# The default limit is 512 lines with support for per-file overrides in the
# config.
# Scans .py, .sh, .js, .ts, .tsx, .rs, .css, and .lua files, skipping
# ignored directories.
ci_check_file_length() {
    local config="./config/file_length_limits.yaml"
    if [[ ! -f "$config" ]]; then
        config="${CI_CONFIG_DIR}/file_length_limits.yaml"
    fi
    local max_lines=512
    local exts=(.py .sh .js .ts .tsx .rs .css .lua)
    local errors=0

    # Read config if available
    if [[ -f "$config" ]]; then
        local cfg_max
        cfg_max="$(ci_read_yaml "$config" "max_lines")"
        [[ -n "$cfg_max" ]] && max_lines="$cfg_max"

        local cfg_exts=()
        ci_capture_lines cfg_exts -- ci_read_yaml_list "$config" "extensions"
        [[ ${#cfg_exts[@]} -gt 0 ]] && exts=("${cfg_exts[@]}")

        # Read per-file overrides: path -> max_lines
        declare -A _fl_ovr=()
        local _fl_ovr_data
        _fl_ovr_data="$(awk '
          /^overrides:/   { in_ov=1; path=""; next }
          !in_ov          { next }
          /^[^ ]/         { exit }
          /path:/         { path=$0; sub(/^[[:space:]]*[^:]*:[[:space:]]*/,"",path); gsub(/^["'"'"']|["'"'"']$/,"",path); gsub(/[[:space:]]+$/,"",path); next }
          /max_lines:/    { max=$0; sub(/^[[:space:]]*[^:]*:[[:space:]]*/,"",max); gsub(/[^0-9]/,"",max); if(path!=""&&max!="") { print path,max; path="" } }
        ' "$config")"
        while IFS=' ' read -r _fl_opath _fl_omax; do
            [[ -n "$_fl_opath" && -n "$_fl_omax" ]] && _fl_ovr["$_fl_opath"]="$_fl_omax"
        done <<< "$_fl_ovr_data"
    fi

    ci_info "Checking file lengths (max $max_lines lines)..."

    local violations=()
    local f lines fl_limit _fl_files=()
    ci_capture_pipe _fl_files 'ci_file_list "$@" | ci_filter_ext "${exts[@]}"' "$@"
    for f in "${_fl_files[@]}"; do
        [[ -z "$f" || ! -f "$f" ]] && continue
        _in_ignored_dir "$f" && continue
        lines="$(wc -l < "$f")"

        # Check per-file override
        fl_limit="$max_lines"
        if [[ ${#_fl_ovr[@]} -gt 0 ]]; then
            for fl_path in "${!_fl_ovr[@]}"; do
                [[ "$f" == "$fl_path" || "$f" == *"/$fl_path" ]] && { fl_limit="${_fl_ovr[$fl_path]}"; break; }
            done
        fi

        if [[ $lines -gt $fl_limit ]]; then
            local excess=$((lines - fl_limit))
            violations+=("$f:$lines:$excess")
            errors=$((errors + 1))
        fi
    done

    if [[ $errors -gt 0 ]]; then
        echo ""
        ci_fail "$errors file(s) exceed their line limits:"
        echo ""
        # Sort by line count descending
        printf '%s\n' "${violations[@]}" | sort -t: -k2 -rn | while IFS=: read -r vf vlines vexcess; do
            echo -e "  ${_BOLD}${vf}${_NC}: ${vlines} lines (+${vexcess} over limit)"
        done
        echo ""
        return 1
    fi

    ci_pass "All files within $max_lines line limit."
    return 0
}

# --- ci_check_init_files [files...] ---
# __init__.py files must be completely empty (zero non-blank lines).
ci_check_init_files() {
    local has_errors=0

    local f _init_files=()
    ci_capture_lines _init_files -- ci_file_list "$@"
    for f in "${_init_files[@]}"; do
        [[ -z "$f" || ! -f "$f" ]] && continue

        local basename
        basename="$(basename "$f")"
        [[ "$basename" != "__init__.py" ]] && continue

        # Count non-blank lines
        local content
        local content
        content=$(grep -cve '^\s*$' "$f") || content=0
        if [[ "$content" -gt 0 ]]; then
            has_errors=1
            ci_fail "$f must be empty ($content non-blank lines found)"
        fi
    done

    [[ $has_errors -eq 1 ]] && return 1
    ci_pass "All __init__.py files are empty."
    return 0
}


# --- ci_check_py_not_executable [files...] ---
# Enforce: tracked .py files must NOT have the exec bit.
# .py files in this project are modules; entry points are bash wrappers
# invoking run (which resolves the hermetic .venv/.boot-linux interpreter).
# An executable .py relies on /usr/bin/env python3 -> system python, which
# bypasses pinned dependencies.
ci_check_py_not_executable() {
    local has_errors=0
    local f _py_files=()
    ci_capture_lines _py_files -- ci_file_list "$@"
    for f in "${_py_files[@]}"; do
        [[ -z "$f" || ! -f "$f" ]] && continue
        [[ "$f" != *.py ]] && continue
        if [[ -x "$f" ]]; then
            has_errors=1
            ci_fail "$f has exec bit set -- .py files must not be executable (use a bash wrapper invoking run)"
        fi
    done

    [[ $has_errors -eq 1 ]] && return 1
    ci_pass "No executable .py modules."
    return 0
}


# --- ci_check_no_dead_imports ---
# When a Python module is deleted in a commit, fail if any tracked file
# still imports it. Prevents the "deleted source but forgot to update
# imports" class of bug that had to be caught by a pre-push test run.
#
# Namespace-package escape: if the deleted module still exists under
# another project as a namespace package), the
# import is still valid and the deletion is intentional.
#
# Scope: only fires on the pre-commit stage (pass_filenames: false); it
# inspects the staged diff independently of the file arguments passed in.
ci_check_no_dead_imports() {
    local has_errors=0
    local _deleted_raw deleted
    _deleted_raw="$(git diff --cached --name-only --diff-filter=D)"
    deleted="$(echo "$_deleted_raw" | grep -E '\.py$')" || deleted=""

    [[ -z "$deleted" ]] && { ci_pass "No Python deletions; no dead-import risk."; return 0; }

    local module_root
    module_root="$(git rev-parse --show-toplevel)"
    local f
    while IFS= read -r f; do
        [[ -z "$f" ]] && continue
        # Derive the dotted module name from the file path.
        # e.g. ci/scripts/backup/create/main.py -> ami.scripts.backup.create.main
        local mod
        mod="${f%.py}"
        mod="${mod//\//.}"
        mod="${mod%.__init__}"

        # Check for namespace-package replacement under projects/
        local ns_path="${f}"
        local ns_init="${f/.py//__init__.py}"
        if [[ -n "$module_root" ]]; then
            local p
            for p in "$module_root"/projects/*/; do
                if [[ -f "${p}${ns_path}" ]] || [[ -f "${p}${ns_init}" ]]; then
                    ci_info "  ${f} namespace: ${p}${ns_path}"
                    continue 2  # skip to next deleted file
                fi
            done
        fi

        # Grep tracked files for an active import of that module.
        local hits
        hits="$(git grep -l -E "^\s*(from|import)\s+${mod}(\s|$|\.|,)" -- '*.py')"
        if [[ -n "$hits" ]]; then
            has_errors=1
            ci_fail "$f deleted but still imported by:"
            echo "$hits" | sed 's/^/    /' >&2
        fi
    done <<< "$deleted"

    [[ $has_errors -eq 1 ]] && return 1
    ci_pass "No dead imports after deletions."
    return 0
}

# --- ci_check_portable_shell [files...] ---
# Enforces that no process substitution (< <(...), > >(...), <(...), >(...))
# appears in shell scripts under lib/ and scripts/.
# Process substitution opens /dev/fd/NN by path, which breaks under PRoot,
# bwrap/firejail sandboxes, and chroots without /proc.
# Scans comment lines and string literals to avoid false positives where the
# pattern appears as prose.
ci_check_portable_shell() {
    local has_errors=0
    local _ci_root
    _ci_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

    # Collect shell files: lib/*.sh + scripts/* (extensionless scripts included)
    local _shell_files=()
    local _f
    for _f in "$_ci_root"/lib/*.sh; do
        [[ -f "$_f" ]] && _shell_files+=("$_f")
    done
    for _f in "$_ci_root"/scripts/*; do
        [[ -f "$_f" ]] || continue
        # Skip non-shell files (yaml, json, md, .txt, directories)
        case "$(basename "$_f")" in
            *.yaml|*.yml|*.json|*.md|*.txt|*.toml) continue ;;
        esac
        _shell_files+=("$_f")
    done

    local violations=()
    local _file _line _lineno
    # Regex patterns stored in variables to avoid bash interpreting < > as
    # operators inside [[ =~ ]]. [<] and [>] match literal angle brackets in ERE.
    local _re_dup_in='[<][[:space:]]*[<][(]'
    local _re_dup_out='[>][[:space:]]*[>][(]'
    local _re_pipe_in='[|][[:space:]]*[<][(]'
    local _re_pipe_out='[|][[:space:]]*[>][(]'
    local _re_standalone_in='[[:space:]][<][(][^)]*[)][[:space:]]'
    local _re_standalone_out='[[:space:]][>][(][^)]*[)][[:space:]]?$'
    for _file in "${_shell_files[@]}"; do
        _lineno=0
        while IFS= read -r _line; do
            _lineno=$((_lineno + 1))
            # Skip comment lines (the ci.sh doc comment mentions < <(cmd) as prose)
            [[ "$_line" =~ ^[[:space:]]*# ]] && continue
            # Detect process substitution: < <(...), > >(...), | <(...), | >(...),
            # and standalone <(...) / >(...) as command arguments.
            local _pat
            for _pat in "$_re_dup_in" "$_re_dup_out" "$_re_pipe_in" \
                        "$_re_pipe_out" "$_re_standalone_in" \
                        "$_re_standalone_out"; do
                if [[ "$_line" =~ $_pat ]]; then
                    violations+=("$_file:$_lineno: $_line")
                    has_errors=1
                    break
                fi
            done
        done < "$_file"
    done

    if [[ $has_errors -eq 1 ]]; then
        ci_fail "Process substitution found (not portable across virtualization layers):"
        echo "  Use ci_capture_lines / ci_capture_pipe from lib/ci.sh instead." >&2
        echo "" >&2
        for v in "${violations[@]}"; do
            echo "  $v" >&2
        done
        return 1
    fi
    ci_pass "No process substitution in shell scripts."
    return 0
}
