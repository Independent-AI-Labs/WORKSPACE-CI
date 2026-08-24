#!/usr/bin/env bash
# scaffold_analyze.sh: Inspection-mode functions for scaffold-ci
# (analyze, diff, json, append-makefile, hook-drift, override checks,
# CLI help text, force-error message).
# Sourced by scripts/scaffold-ci via scaffold_lib.sh. Not executed directly.

# ── Removed --force flag error message ────────────────────────────────────
_scl_force_error_msg() {
    cat >&2 <<'MSG'
ERROR: --force is removed. The single --force flag could overwrite a
hand-edited Makefile and customised config/*.yaml in one shot, with no backup
and no confirmation. Use a granular flag instead (--apply-* are equivalent
aliases of --force-*):

  --apply-precommit   Overwrite .pre-commit-config.yaml only.
                      (alias: --force-precommit)
  --apply-makefile    Overwrite Makefile only. REFUSES if the existing
                      Makefile is customised (differs from the template);
                      you must delete the file by hand to proceed.
                      (alias: --force-makefile)
  --apply-configs     Overwrite config/*.yaml (6 files) only.
                      (alias: --force-configs)
  --apply-all         All of the above combined. Requires --yes in non-TTY.
                      (alias: --force-all)

Or use inspection flags first to understand the state:
  --analyze           Print per-file state table, no writes.
  --diff              Print unified diffs against on-disk files.
  --append-makefile   Add missing Makefile targets without clobbering recipes.

Add --yes to skip the interactive confirmation prompt (required when stdout
is not a TTY, e.g. piped to a file). Backups (*.scaffold-bak.<epoch>) are
written by default; pass --no-backup to disable.
MSG
}

# ── CLI help text ─────────────────────────────────────────────────────────
_scl_help_msg() {
    cat <<'USAGE'
Usage: scaffold-ci --consumer PATH [--profile PATH] [--dry-run]
                   [--force-precommit|--apply-precommit]
                   [--force-makefile|--apply-makefile]
                   [--force-configs|--apply-configs]
                   [--force-all|--apply-all]
                   [--append-makefile] [--analyze] [--diff] [--json]
                   [--yes] [--no-backup] [--lax-applicable]
       scaffold-ci --emit-template

  Default (no flags):    Print analyze table; generate any MISSING file;
                           leave existing files untouched. Fresh-scaffold
                           (all files missing) writes everything.
  --consumer PATH        Consumer project directory (required for scaffolding).
  --profile PATH         Profile YAML (default: <consumer>/ci-profile.yaml).
  --dry-run              Print intended file content without writing.

  Overwrite flags (granular; --apply-* are aliases of --force-*):
  --force-precommit      Overwrite .pre-commit-config.yaml only.
  --force-makefile       Overwrite Makefile only. REFUSES if the existing
                           Makefile has been customised (differs from the
                           template); delete the file by hand to regenerate.
  --force-configs        Overwrite config/*.yaml (6 files) only.
  --force-all            Equivalent to all three --force-* flags.

  Append mode:
  --append-makefile      Append any template targets missing from the existing
                           Makefile without touching existing recipes. Reports
                           what was added; useful for wiring in new scaffold
                           targets into a hand-edited Makefile.

  Inspection flags (never write):
  --analyze              Print per-file state table (MISSING/IN_SYNC/
                           CUSTOMIZED) and exit; no writes, including missing
                           files.
  --diff                 Print unified diffs against on-disk files and exit.
  --json                 Print machine-readable analyze JSON. Implies
                           --analyze semantics (no writes). Pipe to jq or a
                           dashboard consumer.

  Hooks:
  --yes                  Skip the interactive confirmation prompt (required
                           when stdout is not a TTY).
  --no-backup            Do not write *.scaffold-bak.<epoch> backups before
                           overwriting (backups are on by default).
  --lax-applicable       Downgrade applicable_to mismatch from hard error to
                           warning (default is strict: refuse to wire a hook
                           the registry says does not apply to these languages).
  --emit-template        Regenerate templates/ci-profile.template.yaml.
USAGE
}

# ── Render config content list for analyze ────────────────────────────────
# Populates nameref arrays _out_paths and _out_states (parallel) for the 6
# generated config files. No disk writes.
_scl_render_config_list() {
    local -n _out_paths="$1"
    local -n _out_states="$2"
    local _consumer_dir="$3"
    local _cfg_specs=(
        "config/coverage_thresholds.yaml|coverage_thresholds.yaml|coverage"
        "config/file_length_limits.yaml|file_length_limits.yaml|"
        "config/dead_code.yaml|dead_code.yaml|dead_code"
        "config/dependency_excludes.yaml|dependency_excludes.yaml|"
        "config/duplicate_dependency_excludes.yaml|duplicate_dependency_excludes.yaml|"
        "config/markdown_docs.yaml|markdown_docs.yaml|"
        "osv-scanner.toml|tpl:osv-scanner.toml|"
    )
    local _spec _rel _base _pp _src _rendered
    for _spec in "${_cfg_specs[@]}"; do
        _rel="${_spec%%|*}"
        _base="${_spec#*|}"
        _base="${_base%%|*}"
        _pp="${_spec##*|}"
        if [[ "$_base" == tpl:* ]]; then
            _src="$_CI_ROOT/templates/${_base#tpl:}"
        else
            _src="$_CONFIG_DIR/$_base"
        fi
        _rendered="$(_scl_render_config "$_src" "$_pp" "$_consumer_dir")"
        _out_paths+=("$_rel")
        _out_states+=("$(_scl_state "$_rendered" "$_consumer_dir/$_rel")")
    done
}

# ── Detect hook drift between config and executable hook ─────────────────
# _scl_hook_drift <consumer_dir>
# Prints "<state> <config_count> <hook_count>" where state is OK or DRIFT.
# Counts id lines in .pre-commit-config.yaml and "=== Hook:" markers in
# .git/hooks/pre-commit. Returns OK if either side is missing (nothing to
# compare) to avoid false alarms on fresh-scaffold.
_scl_hook_drift() {
    local _c="$1"
    local _pc="$_c/.pre-commit-config.yaml"
    local _hook="$_c/.git/hooks/pre-commit"
    local _pc_n=0 _hook_n=0
    if [[ -f "$_pc" ]]; then
        _pc_n=$(awk '/^[[:space:]]*- id:/ { n++ } END { print n+0 }' "$_pc")
    fi
    if [[ -f "$_hook" ]]; then
        _hook_n=$(awk '/^# === Hook:/ { n++ } END { print n+0 }' "$_hook")
    fi
    if [[ "$_pc_n" -eq 0 || "$_hook_n" -eq 0 ]]; then
        printf 'UNKNOWN %d %d' "$_pc_n" "$_hook_n"
        return
    fi
    if [[ "$_pc_n" -ne "$_hook_n" ]]; then
        printf 'DRIFT %d %d' "$_pc_n" "$_hook_n"
    else
        printf 'OK %d %d' "$_pc_n" "$_hook_n"
    fi
}

# ── Validate override entry paths ─────────────────────────────────────────
# _scl_check_override_paths <consumer_dir>
# For each override whose field is "entry", extract any path-like tokens
# and warn if they don't exist relative to <consumer_dir>. Skips absolute
# paths and .git-internal references.
_scl_check_override_paths() {
    local _c="$1"
    local _i _oid _ofield _oval _path
    local _warnings=()
    for _i in "${!_pf_override_ids[@]}"; do
        _oid="${_pf_override_ids[$_i]}"
        _ofield="${_pf_override_fields[$_i]}"
        _oval="${_pf_override_values[$_i]}"
        [[ "$_ofield" == "entry" ]] || continue
        for _path in $(printf '%s' "$_oval" | grep -oE '[A-Za-z0-9_./-]+\.(ya?ml|json|toml|sh|py|lua)'); do
            [[ "$_path" == /* ]] && continue
            [[ "$_path" == .git/* ]] && continue
            [[ -e "$_c/$_path" ]] || _warnings+=("$_oid:$_path")
        done
    done
    if [[ ${#_warnings[@]} -gt 0 ]]; then
        for _w in "${_warnings[@]}"; do
            local _oid="${_w%%:*}"
            local _path="${_w#*:}"
            ci_warn "override for '$_oid' references non-existent path: $_path"
        done
    fi
}

# ── Compute makefile target diffs (shared by analyze_text, analyze_json) ──
# Sets nameref arrays: _missing, _common, _extra
_scl_makefile_target_diff() {
    local -n _missing="$1"
    local -n _common="$2"
    local -n _extra="$3"
    local _existing_tgts=() _template_tgts=()
    if [[ -f "$_mf_target" ]]; then
        ci_capture_lines _existing_tgts -- _scl_extract_targets "$_mf_target"
    fi
    ci_capture_pipe _template_tgts 'printf "%s\n" "$_mf_content" | _scl_extract_targets_stdin'
    local _t _found
    for _t in "${_template_tgts[@]:-}"; do
        [[ -z "$_t" ]] && continue
        _found=0
        for _e in "${_existing_tgts[@]:-}"; do
            [[ "$_e" == "$_t" ]] && { _found=1; break; }
        done
        if [[ $_found -eq 0 ]]; then
            _missing+=("$_t")
        else
            _common+=("$_t")
        fi
    done
    for _t in "${_existing_tgts[@]:-}"; do
        [[ -z "$_t" ]] && continue
        _found=0
        for _e in "${_template_tgts[@]:-}"; do
            [[ "$_e" == "$_t" ]] && { _found=1; break; }
        done
        [[ $_found -eq 0 ]] && _extra+=("$_t")
    done
}

# ── Analyze: text-table report (no writes) ───────────────────────────────
# Uses globals: _consumer, _pc_target, _mf_target, _pc_content, _mf_content,
# _pf_project, _pf_tier, _pf_languages, _CONFIG_DIR
_scl_analyze_text() {
    local _pc_state _mf_state
    _pc_state="$(_scl_state "$_pc_content" "$_pc_target")"
    _mf_state="$(_scl_state "$_mf_content" "$_mf_target")"

    local _cfg_paths=() _cfg_states=()
    _scl_render_config_list _cfg_paths _cfg_states "$_consumer"

    echo "=== scaffold-ci analyze: $_pf_project ==="
    echo "Profile: tier=$_pf_tier  languages=[${_pf_languages[*]}]"
    echo ""
    printf '%-44s %s\n' "File" "State"
    printf '%-44s %s\n' "$(printf '%.0s-' {1..44})" "$(printf '%.0s-' {1..12})"
    printf '%-44s %s\n' ".pre-commit-config.yaml" "$_pc_state"
    printf '%-44s %s\n' "Makefile" "$_mf_state"
    local _i
    for _i in "${!_cfg_paths[@]}"; do
        printf '%-44s %s\n' "${_cfg_paths[$_i]}" "${_cfg_states[$_i]}"
    done
    local _qe_state
    if [[ -f "$_consumer/quality_exceptions.yaml" ]]; then _qe_state="EXISTS"; else _qe_state="MISSING"; fi
    printf '%-44s %s\n' "quality_exceptions.yaml" "$_qe_state"

    local _missing_tgts=() _common_tgts=() _conflict_tgts=()
    _scl_makefile_target_diff _missing_tgts _common_tgts _conflict_tgts
    echo ""
    echo "Makefile target analysis:"
    echo "  MISSING (template-only): ${_missing_tgts[*]:-(none)}"
    echo "  COMMON (in both):        ${_common_tgts[*]:-(none)}"
    echo "  EXTRA (existing-only):  ${_conflict_tgts[*]:-(none)}"

    local _drift
    _drift="$(_scl_hook_drift "$_consumer")"
    local _d_state="${_drift%% *}"
    local _d_rest="${_drift#* }"
    local _pc_n="${_d_rest%% *}"
    local _hook_n="${_d_rest##* }"
    echo ""
    echo "Hook wiring:"
    if [[ "$_d_state" == "DRIFT" ]]; then
        echo "  .pre-commit-config.yaml: $_pc_n hooks"
        echo "  .git/hooks/pre-commit:    $_hook_n hooks  (STALE)"
        echo "  Suggestion: run 'make install-hooks' to regenerate native hooks"
    elif [[ "$_d_state" == "UNKNOWN" ]]; then
        echo "  (one side missing: config=$_pc_n, executable=$_hook_n; nothing to compare)"
    else
        echo "  .pre-commit-config.yaml: $_pc_n hooks"
        echo "  .git/hooks/pre-commit:    $_hook_n hooks  (in sync)"
    fi

    _scl_check_override_paths "$_consumer"

    echo ""
    echo "Suggested next step:"
    if [[ "$_pc_state" == "CUSTOMIZED" ]]; then
        echo "  scaffold-ci --consumer <path> --force-precommit --yes (review --diff first)"
    elif [[ "$_pc_state" == "MISSING" ]]; then
        echo "  scaffold-ci --consumer <path>  (will generate missing .pre-commit-config.yaml)"
    fi
    if [[ "$_mf_state" == "CUSTOMIZED" && ${#_missing_tgts[@]} -gt 0 ]]; then
        echo "  scaffold-ci --consumer <path> --append-makefile  (add ${_missing_tgts[*]} without clobbering recipes)"
    fi
}

# ── Analyze: JSON report (no writes) ─────────────────────────────────────
_scl_analyze_json() {
    local _pc_state _mf_state
    _pc_state="$(_scl_state "$_pc_content" "$_pc_target")"
    _mf_state="$(_scl_state "$_mf_content" "$_mf_target")"

    local _cfg_paths=() _cfg_states=()
    _scl_render_config_list _cfg_paths _cfg_states "$_consumer"

    local _missing_tgts=() _common_tgts=() _conflict_tgts=()
    _scl_makefile_target_diff _missing_tgts _common_tgts _conflict_tgts

    local _drift
    _drift="$(_scl_hook_drift "$_consumer")"
    local _d_state="${_drift%% *}"
    local _d_rest="${_drift#* }"
    local _pc_n="${_d_rest%% *}"
    local _hook_n="${_d_rest##* }"

    printf '{"consumer":"%s","profile":{"tier":"%s","languages":["%s"],"project":"%s"}' \
        "$_consumer" "$_pf_tier" "${_pf_languages[*]/ /\",\"}" "$_pf_project"
    printf ',"files":['
    printf '{"path":".pre-commit-config.yaml","state":"%s"},' "$_pc_state"
    printf '{"path":"Makefile","state":"%s"},' "$_mf_state"
    local _i
    for _i in "${!_cfg_paths[@]}"; do
        printf '{"path":"%s","state":"%s"}' "${_cfg_paths[$_i]}" "${_cfg_states[$_i]}"
        [[ $((_i + 1)) -lt ${#_cfg_paths[@]} ]] && printf ','
    done
    printf '],"makefile_targets":{"missing":['
    local _first=1
    for _t in "${_missing_tgts[@]:-}"; do
        [[ -z "$_t" ]] && continue
        [[ $_first -eq 0 ]] && printf ','
        printf '"%s"' "$_t"
        _first=0
    done
    printf '],"common":['
    _first=1
    for _t in "${_common_tgts[@]:-}"; do
        [[ -z "$_t" ]] && continue
        [[ $_first -eq 0 ]] && printf ','
        printf '"%s"' "$_t"
        _first=0
    done
    printf '],"extra":['
    _first=1
    for _t in "${_conflict_tgts[@]:-}"; do
        [[ -z "$_t" ]] && continue
        [[ $_first -eq 0 ]] && printf ','
        printf '"%s"' "$_t"
        _first=0
    done
    printf ']}'
    printf ',"hook_drift":{"state":"%s","config":%d,"executable":%d}' "$_d_state" "$_pc_n" "$_hook_n"
    printf '}\n'
}

# ── Diff mode: print unified diffs for each file that differs ─────────────
# Uses globals: _consumer, _pc_target, _mf_target, _pc_content, _mf_content,
# _CONFIG_DIR, _pf_project, _pf_languages
_scl_run_diff() {
    local _rc=0
    diff -u "$@" || _rc=$?
    if [[ $_rc -gt 1 ]]; then
        ci_fail "diff failed (rc=$_rc) for args: $*"
        return 1
    fi
    return 0
}

_scl_diff_mode() {
    local _pc_state _mf_state
    _pc_state="$(_scl_state "$_pc_content" "$_pc_target")"
    _mf_state="$(_scl_state "$_mf_content" "$_mf_target")"

    if [[ "$_pc_state" == "CUSTOMIZED" ]]; then
        echo "--- $_pc_target (on disk)"
        echo "+++ .pre-commit-config.yaml (rendered from profile)"
        _scl_run_diff "$_pc_target" <(printf '%s\n' "$_pc_content")
        echo ""
    elif [[ "$_pc_state" == "MISSING" ]]; then
        echo "--- (no existing .pre-commit-config.yaml)"
        echo "+++ .pre-commit-config.yaml (would be created)"
        printf '%s\n' "$_pc_content"
    fi

    if [[ "$_mf_state" == "CUSTOMIZED" ]]; then
        echo "--- $_mf_target (on disk)"
        echo "+++ Makefile (rendered from template)"
        _scl_run_diff "$_mf_target" <(printf '%s\n' "$_mf_content")
        echo ""
    elif [[ "$_mf_state" == "MISSING" ]]; then
        echo "--- (no existing Makefile)"
        echo "+++ Makefile (would be created)"
        printf '%s\n' "$_mf_content"
    fi

    local _cfg_specs=(
        "config/coverage_thresholds.yaml|coverage_thresholds.yaml|coverage"
        "config/file_length_limits.yaml|file_length_limits.yaml|"
        "config/dead_code.yaml|dead_code.yaml|dead_code"
        "config/dependency_excludes.yaml|dependency_excludes.yaml|"
        "config/duplicate_dependency_excludes.yaml|duplicate_dependency_excludes.yaml|"
        "config/markdown_docs.yaml|markdown_docs.yaml|"
        "osv-scanner.toml|tpl:osv-scanner.toml|"
    )
    local _spec _rel _base _pp _src _rendered _state _dst
    for _spec in "${_cfg_specs[@]}"; do
        _rel="${_spec%%|*}"
        _base="${_spec#*|}"
        _base="${_base%%|*}"
        _pp="${_spec##*|}"
        if [[ "$_base" == tpl:* ]]; then
            _src="$_CI_ROOT/templates/${_base#tpl:}"
        else
            _src="$_CONFIG_DIR/$_base"
        fi
        _rendered="$(_scl_render_config "$_src" "$_pp" "$_consumer")"
        _dst="$_consumer/$_rel"
        _state="$(_scl_state "$_rendered" "$_dst")"
        if [[ "$_state" == "CUSTOMIZED" ]]; then
            echo "--- $_dst (on disk)"
            echo "+++ $_rel (rendered)"
            _scl_run_diff "$_dst" <(printf '%s\n' "$_rendered")
            echo ""
        elif [[ "$_state" == "MISSING" ]]; then
            echo "--- (no existing $_rel)"
            echo "+++ $_rel (would be created)"
            printf '%s\n' "$_rendered"
        fi
    done
}

# ── Append missing Makefile targets to an existing Makefile ───────────────
# _scl_append_makefile <rendered_content>
# Parses target names from the existing Makefile at $_mf_target and the
# rendered template content. For each template target absent from the
# existing Makefile, appends the entire target block (header line +
# recipe lines starting with TAB) to the existing file. Targets present
# in both are skipped (assumed in sync or intentionally customised).
# Writes nothing if there are no missing targets; reports what changed
# via the _generated array.
_scl_append_makefile() {
    local _rendered="$1"
    [[ -f "$_mf_target" ]] || { ci_fail "Makefile not found at $_mf_target (use --apply-makefile for fresh scaffold)"; return 1; }

    local _existing_tgts=() _template_tgts=()
    ci_capture_lines _existing_tgts -- _scl_extract_targets "$_mf_target"
    ci_capture_pipe _template_tgts 'printf "%s\n" "$_rendered" | _scl_extract_targets_stdin'

    local _missing_tgts=()
    local _t _found
    for _t in "${_template_tgts[@]:-}"; do
        [[ -z "$_t" ]] && continue
        _found=0
        local _e
        for _e in "${_existing_tgts[@]:-}"; do
            [[ "$_e" == "$_t" ]] && { _found=1; break; }
        done
        [[ $_found -eq 0 ]] && _missing_tgts+=("$_t")
    done

    if [[ ${#_missing_tgts[@]} -eq 0 ]]; then
        _skipped+=("Makefile (no missing targets to append)")
        return 0
    fi

    local _missing_re
    _missing_re="^($(IFS='|'; printf '%s' "${_missing_tgts[*]}"; unset IFS)):"
    printf '%s\n' "$_rendered" | awk -v want_re="$_missing_re" '
        BEGIN { in_block = 0 }
        /^[A-Za-z][A-Za-z0-9_.-]*:/ && $0 ~ want_re { in_block = 1; printf "\n%s\n", $0; next }
        /^[A-Za-z][A-Za-z0-9_.-]*:/ && $0 !~ want_re { in_block = 0; next }
        in_block == 1 { print }
    ' > "$_mf_target.append.tmp"

    if [[ -s "$_mf_target.append.tmp" ]]; then
        if [[ $_dry_run -eq 1 ]]; then
            echo "================================================================================"
            echo "Would append to: $_mf_target (targets: ${_missing_tgts[*]})"
            echo "================================================================================"
            cat "$_mf_target.append.tmp"
            rm -f "$_mf_target.append.tmp"
        else
            _scl_backup "$_mf_target" "$_make_backup" _backups_written
            printf '\n# -- Appended by scaffold-ci --append-makefile [%s] --\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$_mf_target"
            cat "$_mf_target.append.tmp" >> "$_mf_target"
            rm -f "$_mf_target.append.tmp"
            _generated+=("Makefile (appended: ${_missing_tgts[*]})")
        fi
    else
        rm -f "$_mf_target.append.tmp"
        _skipped+=("Makefile (append extracted no blocks)")
    fi
}