#!/usr/bin/env bash
# CI Dead Code Check: wraps the `dangle` Rust binary with post-filtering
# from config/dead_code.yaml (scan_paths, ignore_paths, reference_only_paths,
# ignored_names, ignored_name_patterns).
# Advisory / non-blocking: the wrapping rc-capture in generate-hooks emits
# a warning on failure rather than hard-failing the push.
# Sourced by checks.sh. Requires ci.sh to be loaded first.

# --- _dc_load_config_lists <out_array_name> <yaml_key> ---
# Helper: read a YAML list into a nameref, tolerating a missing key.
_dc_load_config_lists() {
    local -n _dcl_arr=$1; shift
    local _dcl_key="$1"; shift
    local _dcl_file="$1"
    _dcl_arr=()
    if [[ -f "$_dcl_file" ]]; then
        ci_capture_lines _dcl_arr -- ci_read_yaml_list "$_dcl_file" "$_dcl_key"
    fi
}

# --- _dc_in_paths <path> <array_name> ---
# Return 0 if $path equals or is a descendant of any entry in the array.
_dc_in_paths() {
    local _dcp_path="$1"
    local -n _dcp_list=$2
    local _dcp_p
    for _dcp_p in "${_dcp_list[@]}"; do
        [[ -z "$_dcp_p" ]] && continue
        if [[ "$_dcp_path" == "$_dcp_p" || "$_dcp_path" == "${_dcp_p}/"* ]]; then
            return 0
        fi
    done
    return 1
}

# --- _dc_name_ignored <name> ---
# Return 0 if $name matches any literal in _dc_ignored_names or any ERE
# pattern in _dc_ignored_name_patterns.
_dc_name_ignored() {
    local _dcn_name="$1" _dcn_pat
    local _dcn_i
    for _dcn_i in "${_dc_ignored_names[@]}"; do
        [[ "$_dcn_name" == "$_dcn_i" ]] && return 0
    done
    for _dcn_pat in "${_dc_ignored_name_patterns[@]}"; do
        [[ -z "$_dcn_pat" ]] && continue
        if [[ "$_dcn_name" =~ $_dcn_pat ]]; then
            return 0
        fi
    done
    return 1
}

# --- ci_check_dead_code ---
# Resolves the `dangle` binary (PATH, then $HOME/.cargo/bin/dangle), runs it
# over the whole git-tracked repository, parses the
# `file:line:col: kind name is not referenced` output, and post-filters the
# candidates against config/dead_code.yaml:
#   scan_paths             (allowlist) keep only items whose file is under one
#   ignore_paths           (denylist) drop items whose file is under one
#   reference_only_paths   (denylist for reporting, still cited as references)
#   ignored_names          (exact-name allowlist)
#   ignored_name_patterns  (regex-name allowlist)
# Reports survivors as warnings and returns 1 if any are found; returns 0
# when the repo is clean or dangle/config is unavailable (non-blocking).
# Dangle's own test-file heuristic (`test_` prefix or `/tests/` segment)
# already suppresses reporting there; reference_only_paths covers any extras.
ci_check_dead_code() {
    local _dc_cfg
    _dc_cfg="$(ci_config_path dead_code "./config/dead_code.yaml")" || return 0
    if [[ ! -f "$_dc_cfg" ]]; then
        ci_warn "dead_code.yaml not found; skipping dead-code check"
        return 0
    fi
    ci_validate_exemption_file "$_dc_cfg" "dead_code.yaml" || return 1

    local _dc_bin=""
    if _dc_bin="$(command -v dangle 2>&1)"; then
        :
    elif [[ -x "${HOME}/.cargo/bin/dangle" ]]; then
        _dc_bin="${HOME}/.cargo/bin/dangle"
    else
        ci_warn "dangle not installed; skipping dead-code check (cargo install dangle)"
        return 0
    fi

    ci_info "Dead Code Analysis (dangle, non-blocking)..."
    ci_info "  Config: $_dc_cfg"
    ci_info "  Binary: $_dc_bin"

    local _dc_scan_paths=() _dc_ignore_paths=() _dc_ref_only_paths=()
    local _dc_ignored_names=() _dc_ignored_name_patterns=()
    _dc_load_config_lists _dc_scan_paths            scan_paths            "$_dc_cfg"
    _dc_load_config_lists _dc_ignore_paths          ignore_paths          "$_dc_cfg"
    _dc_load_config_lists _dc_ref_only_paths       reference_only_paths  "$_dc_cfg"
    _dc_load_config_lists _dc_ignored_names        ignored_names         "$_dc_cfg"
    _dc_load_config_lists _dc_ignored_name_patterns ignored_name_patterns "$_dc_cfg"

    # Default scan_paths to "ci" when the key is empty, mirroring the YAML.
    if [[ ${#_dc_scan_paths[@]} -eq 0 ]]; then
        _dc_scan_paths=("ci")
    fi

    local _dc_out_tmp _dc_err_tmp
    _dc_out_tmp="$(mktemp)"
    _dc_err_tmp="$(mktemp)"
    local _dc_rc=0
    "$_dc_bin" > "$_dc_out_tmp" 2> "$_dc_err_tmp" || _dc_rc=$?
    # dangle returns 0 even when dead candidates are found; treat anything
    # greater than 1 as a tool crash (config error, parse failure, etc.).
    if [[ $_dc_rc -gt 1 ]]; then
        ci_warn "dangle crashed (exit $_dc_rc):"
        sed 's/^/    /' "$_dc_err_tmp" >&2
        rm -f "$_dc_out_tmp" "$_dc_err_tmp"
        return 0
    fi

    local _dc_violations=()
    local _dc_line _dc_file _dc_kind _dc_name _dc_lineno _dc_col
    while IFS= read -r _dc_line; do
        [[ -z "$_dc_line" ]] && continue
        # Parse "file:line:col: kind name is not referenced".
        if [[ "$_dc_line" =~ ^([^:]+):([0-9]+):([0-9]+):\ ([a-zA-Z]+)\ ([^[:space:]]+)\ is\ not\ referenced$ ]]; then
            _dc_file="${BASH_REMATCH[1]}"
            _dc_lineno="${BASH_REMATCH[2]}"
            _dc_col="${BASH_REMATCH[3]}"
            _dc_kind="${BASH_REMATCH[4]}"
            _dc_name="${BASH_REMATCH[5]}"
        else
            continue
        fi

        _dc_in_paths "$_dc_file" _dc_scan_paths || continue
        if _dc_in_paths "$_dc_file" _dc_ignore_paths; then
            continue
        fi
        if _dc_in_paths "$_dc_file" _dc_ref_only_paths; then
            continue
        fi
        if _dc_name_ignored "$_dc_name"; then
            continue
        fi

        _dc_violations+=("$_dc_file:$_dc_lineno:$_dc_kind:$_dc_name")
    done < "$_dc_out_tmp"

    rm -f "$_dc_out_tmp" "$_dc_err_tmp"

    if [[ ${#_dc_violations[@]} -eq 0 ]]; then
        ci_pass "No dead code detected (dangle)."
        return 0
    fi

    echo ""
    ci_warn "Dead code candidates (${#_dc_violations[@]}):"
    local _dc_v
    for _dc_v in "${_dc_violations[@]}"; do
        local _dc_f _dc_l _dc_k _dc_n
        IFS=: read -r _dc_f _dc_l _dc_k _dc_n <<< "$_dc_v"
        printf '  %s:%s  %s %s\n' "$_dc_f" "$_dc_l" "$_dc_k" "$_dc_n"
    done
    echo ""
    ci_info "Note: check-dead-code is advisory; dead code does not block the push."
    return 1
}