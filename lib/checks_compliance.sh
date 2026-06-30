#!/usr/bin/env bash
# CI Compliance Scoring: deep project audit with tier classification.
# Sourced by checks.sh. Requires ci.sh and checks_core.sh to be loaded first.

# --- ci_compliance_score [PROJECT_DIR] ---
# Deep compliance audit of a single project directory.
# Checks 15 dimensions across 5 categories, produces a percentage score
# with actionable violation details.
ci_compliance_score() {
    local project_dir="${1:-.}"
    project_dir="$(cd "$project_dir" && pwd)"
    local project_name
    project_name="$(basename "$project_dir")"

    local _passed=0 _total=0 _violations=0
    local _precommit="$project_dir/.pre-commit-config.yaml"
    local _makefile="$project_dir/Makefile"
    local _gitignore="$project_dir/.gitignore"

    # Detect language (last match wins; order: unknown < node < rust < python)
    local _lang="unknown"
    [[ -f "$project_dir/package.json" ]] && _lang="node"
    [[ -f "$project_dir/Cargo.toml" ]] && _lang="rust"
    [[ -f "$project_dir/pyproject.toml" ]] && _lang="python"

    # Detect git dir (project may be a subdirectory of a larger repo)
    local _gitdir=""
    if [[ -d "$project_dir/.git" ]]; then
        _gitdir="$project_dir/.git"
    else
        _gitdir="$(git -C "$project_dir" rev-parse --git-dir)"
        [[ -n "$_gitdir" && "$_gitdir" != /* ]] && _gitdir="$project_dir/$_gitdir"
    fi

    # Detect test directory
    local _has_tests=0
    for _tdir in tests test spec src/test; do
        [[ -d "$project_dir/$_tdir" ]] && { _has_tests=1; break; }
    done

    # Load blocked patterns for Q1
    local _blocked_combined=""
    local _blocked_cfg="$CI_CONFIG_DIR/blocked_commit_patterns.yaml"
    if [[ -f "$_blocked_cfg" ]]; then
        while IFS= read -r _line; do
            if [[ "$_line" =~ pattern:[[:space:]]*[\"\']?(.+)[\"\']?$ ]]; then
                local _pat="${BASH_REMATCH[1]}"
                _pat="${_pat%\"}" ; _pat="${_pat%\'}"
                _pat="${_pat#\"}" ; _pat="${_pat#\'}"
                [[ -n "$_blocked_combined" ]] && _blocked_combined="${_blocked_combined}|"
                _blocked_combined="${_blocked_combined}${_pat}"
            fi
        done < "$_blocked_cfg"
    fi

    # --- Helpers ---
    _cs_pass() {
        _passed=$((_passed + 1))
        _total=$((_total + 1))
        echo -e "  ${_GREEN}[x]${_NC} $1  $2"
    }
    _cs_fail() {
        _total=$((_total + 1))
        _violations=$((_violations + 1))
        echo -e "  ${_RED}[ ]${_NC} $1  $2"
        echo -e "       ${_CYAN}-> $3${_NC}"
    }
    _cs_skip() {
        echo -e "  ${_YELLOW}[~]${_NC} $1  $2 (N/A)"
    }

    # --- Header ---
    echo ""
    ci_info "=== CI Compliance: $project_name ==="
    echo "Language: $_lang"
    echo ""

    # =====================================================================
    # CATEGORY 1: Hook Infrastructure
    # =====================================================================
    ci_info "HOOK INFRASTRUCTURE"

    if [[ -f "$_precommit" ]]; then
        _cs_pass "H1" ".pre-commit-config.yaml exists"
    else
        _cs_fail "H1" ".pre-commit-config.yaml missing" \
            "Copy template from CI or create .pre-commit-config.yaml"
    fi

    if [[ -n "$_gitdir" && -f "$_gitdir/hooks/pre-commit" ]] \
       && grep -q 'CI\|generate-hooks\|ci\.sh' "$_gitdir/hooks/pre-commit"; then
        _cs_pass "H2" "Native pre-commit hooks installed"
    elif [[ -n "$_gitdir" && -f "$_gitdir/hooks/pre-commit" ]]; then
        _cs_fail "H2" "Pre-commit hook exists but not CI generated" \
            "Run: make install-hooks (uses generate-hooks)"
    else
        _cs_fail "H2" "No pre-commit hook installed" \
            "Run: make install-hooks"
    fi

    if [[ -n "$_gitdir" && -f "$_gitdir/hooks/pre-push" ]] \
       && grep -q 'CI\|generate-hooks\|ci\.sh' "$_gitdir/hooks/pre-push"; then
        _cs_pass "H3" "Native pre-push hooks installed"
    else
        _cs_fail "H3" "No pre-push hook installed" \
            "Run: make install-hooks"
    fi

    echo ""

    # =====================================================================
    # CATEGORY 2: Required Hooks Wired
    # =====================================================================
    ci_info "REQUIRED HOOKS"

    if [[ ! -f "$_precommit" ]]; then
        _cs_fail "R1" "block-sensitive-files not wired" \
            "Create .pre-commit-config.yaml first (see CI/docs/HOOKS.md)"
        _cs_fail "R2" "check-banned-words not wired" \
            "Create .pre-commit-config.yaml first"
        _cs_fail "R3" "Commit message checks not wired" \
            "Create .pre-commit-config.yaml first"
        _cs_fail "R4" "block-coauthored-history not wired" \
            "Create .pre-commit-config.yaml first"
        if [[ $_has_tests -eq 1 ]]; then
            _cs_fail "R5" "verify-coverage not wired (tests/ exists)" \
                "Create .pre-commit-config.yaml first"
        else
            _cs_skip "R5" "verify-coverage (no test directory)"
        fi
    else
        if grep -q 'block-sensitive-files' "$_precommit"; then
            _cs_pass "R1" "block-sensitive-files wired"
        else
            _cs_fail "R1" "block-sensitive-files not wired" \
                "Add block-sensitive-files hook to .pre-commit-config.yaml"
        fi

        if grep -q 'check-banned-words' "$_precommit"; then
            _cs_pass "R2" "check-banned-words wired"
        else
            _cs_fail "R2" "check-banned-words not wired" \
                "Add check-banned-words hook to .pre-commit-config.yaml"
        fi

        local _r3_msg=0 _r3_block=0
        grep -q 'check-commit-message' "$_precommit" && _r3_msg=1
        grep -q 'block-coauthored' "$_precommit" && _r3_block=1
        if [[ $_r3_msg -eq 1 && $_r3_block -eq 1 ]]; then
            _cs_pass "R3" "Commit message checks wired"
        elif [[ $_r3_msg -eq 1 ]]; then
            _cs_fail "R3" "check-commit-message wired but block-coauthored missing" \
                "Add block-coauthored hook (commit-msg stage)"
        elif [[ $_r3_block -eq 1 ]]; then
            _cs_fail "R3" "block-coauthored wired but check-commit-message missing" \
                "Add check-commit-message hook (commit-msg stage)"
        else
            _cs_fail "R3" "Commit message checks not wired" \
                "Add check-commit-message + block-coauthored hooks (commit-msg stage)"
        fi

        if grep -q 'block-coauthored-history' "$_precommit"; then
            _cs_pass "R4" "block-coauthored-history wired (pre-push)"
        else
            _cs_fail "R4" "block-coauthored-history not wired (pre-push)" \
                "Add block-coauthored-history hook to pre-push stage"
        fi

        if [[ $_has_tests -eq 1 ]]; then
            if grep -q 'verify-coverage' "$_precommit"; then
                _cs_pass "R5" "verify-coverage wired"
            else
                _cs_fail "R5" "verify-coverage not wired (tests/ exists)" \
                    "Add verify-coverage hook to pre-push stage"
            fi
        else
            _cs_skip "R5" "verify-coverage (no test directory)"
        fi

        # R6: check-markdown-docs must be wired with --check-remote (all tiers)
        if grep -q 'check-markdown-docs' "$_precommit"; then
            local _md_entry
            _md_entry="$(grep -A2 'check-markdown-docs' "$_precommit")"
            if echo "$_md_entry" | grep -q -- '--check-remote'; then
                _cs_pass "R6" "check-markdown-docs wired with --check-remote"
            else
                _cs_fail "R6" "check-markdown-docs wired but missing --check-remote" \
                    "Add --check-remote flag to the check-markdown-docs entry"
            fi
        else
            _cs_fail "R6" "check-markdown-docs not wired" \
                "Add check-markdown-docs hook to .pre-commit-config.yaml (type: markdown, entry: uv run python -m ci.check_markdown_docs --check-remote)"
        fi
    fi

    echo ""

    # =====================================================================
    # CATEGORY 3: Configuration
    # =====================================================================
    ci_info "CONFIGURATION"

    local _cov_cfg="$project_dir/config/coverage_thresholds.yaml"
    if [[ -f "$_cov_cfg" ]]; then
        local _has_suite=0
        grep -qE 'min_coverage:[[:space:]]*[1-9]' "$_cov_cfg" && _has_suite=1
        if [[ $_has_suite -eq 1 ]]; then
            _cs_pass "C1" "coverage_thresholds.yaml present with thresholds"
        else
            _cs_fail "C1" "coverage_thresholds.yaml exists but no valid thresholds" \
                "Add at least one suite with min_coverage >= 1"
        fi
    elif [[ $_has_tests -eq 1 ]]; then
        _cs_fail "C1" "coverage_thresholds.yaml missing (tests/ exists)" \
            "Create config/coverage_thresholds.yaml with test suites"
    else
        _cs_skip "C1" "coverage_thresholds.yaml (no test directory)"
    fi

    if [[ -f "$_gitignore" ]] && grep -qE '^\s*\.env\s*$|^\s*\.env\b' "$_gitignore"; then
        _cs_pass "C2" ".gitignore covers .env files"
    elif [[ -f "$_gitignore" ]]; then
        _cs_fail "C2" ".gitignore missing .env pattern" \
            "Add '.env' to .gitignore"
    else
        _cs_fail "C2" "No .gitignore file" \
            "Create .gitignore with at least: .env"
    fi

    local _long_files=0
    if [[ -f "$_precommit" ]]; then
        local _fl_config="$project_dir/config/file_length_limits.yaml"
        local _fl_max=512
        local _fl_exts=(.py .sh .js .ts .rs .tsx .css)

        if [[ -f "$_fl_config" ]]; then
            local _cfg_max
            _cfg_max="$(ci_read_yaml "$_fl_config" "max_lines")"
            [[ -n "$_cfg_max" ]] && _fl_max="$_cfg_max"
        fi

        local _fl_files=()
        local _fl_tmp; _fl_tmp=$(mktemp) || {
            _cs_skip "C3" "File length check (mktemp failed)"
            _long_files=0
        }
        if [[ -n "$_fl_tmp" ]]; then
            (
                cd "$project_dir" && git ls-files --cached --others --exclude-standard \
                    | while IFS= read -r _p; do
                        for _e in "${_fl_exts[@]}"; do
                            [[ "$_p" == *"$_e" ]] && echo "$project_dir/$_p" && break
                        done
                    done
            ) > "$_fl_tmp"
            while IFS= read -r _f; do
                [[ -n "$_f" ]] && _fl_files+=("$_f")
            done < "$_fl_tmp"
            rm -f "$_fl_tmp"
            for _f in "${_fl_files[@]}"; do
                [[ -z "$_f" || ! -f "$_f" ]] && continue
                _in_ignored_dir "$_f" && continue
                local _flines
                _flines="$(wc -l < "$_f")"

                local _file_limit=$_fl_max
                if [[ -f "$_fl_config" ]]; then
                    local _override_limit _rel_f _rl_rc=0
                    _rel_f="$(realpath --relative-to="$project_dir" "$_f")" || _rl_rc=$?
                    if [[ $_rl_rc -ne 0 ]]; then
                        _rel_f="$_f"
                    fi
                    _override_limit="$(awk -v path="$_rel_f" '
                        /^[[:space:]]*- path:[[:space:]]+/ { gsub(/^[[:space:]]*- path:[[:space:]]+/, ""); gsub(/["'"'"']/, ""); cur_path=$0 }
                        cur_path == path && /^[[:space:]]+max_lines:[[:space:]]+/ { gsub(/^[[:space:]]+max_lines:[[:space:]]+/, ""); print; exit }
                    ' "$_fl_config")"
                    [[ -n "$_override_limit" ]] && _file_limit=$_override_limit
                fi

                if [[ $_flines -gt $_file_limit ]]; then
                    _long_files=$((_long_files + 1))
                fi
            done
        fi
    fi

    if [[ $_long_files -eq 0 ]]; then
        _cs_pass "C3" "All files within length limit"
    else
        _cs_fail "C3" "$_long_files file(s) exceed length limit" \
            "Run: source CI/lib/checks.sh && ci_check_file_length (in project dir)"
    fi

    echo ""

    # =====================================================================
    # CATEGORY 4: Code Quality
    # =====================================================================
    ci_info "CODE QUALITY"

    if [[ -n "$_blocked_combined" && -n "$_gitdir" ]]; then
        local _hist_violations
        _hist_violations="$(git -C "$project_dir" log --format=%B HEAD \
            | grep -ciE "$_blocked_combined")"
        if [[ "$_hist_violations" -eq 0 ]]; then
            _cs_pass "Q1" "History clean (no blocked patterns)"
        else
            _cs_fail "Q1" "History has $_hist_violations blocked pattern(s)" \
                "Run: projects/CI/scripts/rewrite-history"
        fi
    elif [[ -z "$_gitdir" ]]; then
        _cs_skip "Q1" "History clean (not a git repo)"
    else
        _cs_fail "Q1" "Cannot check history (no blocked_commit_patterns.yaml)" \
            "Ensure CI config/blocked_commit_patterns.yaml exists"
    fi

    local _bw_rc=0
    if [[ -f "$CI_CONFIG_DIR/banned_words.yaml" ]]; then
        local _bw_tmp; _bw_tmp=$(mktemp)
        (cd "$project_dir" && ci_check_banned_words) \
            </dev/null >"$_bw_tmp" 2>&1 || _bw_rc=$?
        if [[ $_bw_rc -ne 0 && -s "$_bw_tmp" ]]; then
            while IFS= read -r _line; do
                echo "       $_line"
            done < "$_bw_tmp"
        fi
        rm -f "$_bw_tmp"
        if [[ $_bw_rc -eq 0 ]]; then
            _cs_pass "Q2" "No banned patterns in source"
        else
            _cs_fail "Q2" "Banned patterns found in source" \
                "Run: source CI/lib/checks.sh && ci_check_banned_words (in project dir)"
        fi
    else
        _cs_skip "Q2" "Banned patterns (no banned_words.yaml)"
    fi

    echo ""

    # =====================================================================
    # CATEGORY 5: Project Structure
    # =====================================================================
    ci_info "PROJECT STRUCTURE"

    if [[ -f "$_makefile" ]] && grep -q 'generate-hooks' "$_makefile"; then
        _cs_pass "S1" "Makefile uses generate-hooks"
    elif [[ -f "$_makefile" ]] && grep -q 'pre-commit install' "$_makefile"; then
        _cs_fail "S1" "Makefile uses pre-commit install (outdated)" \
            "Replace 'pre-commit install' with generate-hooks call in Makefile"
    elif [[ -f "$_makefile" ]] && grep -q 'install-hooks' "$_makefile"; then
        _cs_fail "S1" "Makefile has install-hooks but doesn't use generate-hooks" \
            "Update install-hooks target to call generate-hooks"
    elif [[ -f "$_makefile" ]]; then
        _cs_fail "S1" "Makefile has no install-hooks target" \
            "Add install-hooks target that calls generate-hooks"
    else
        _cs_fail "S1" "No Makefile" \
            "Create Makefile with install-hooks target"
    fi

    if [[ $_has_tests -eq 1 ]]; then
        _cs_pass "S2" "Test directory exists"
    else
        _cs_fail "S2" "No test directory" \
            "Create tests/ directory with initial test"
    fi

    echo ""

    # =====================================================================
    # CATEGORY 6: Auto-Enforcement (manifest-driven)
    # =====================================================================
    # Tier-aware: strict-tier projects must have quality_exceptions.yaml
    # and the rendered hooks must include every applicable mandatory hook.
    # POC and vendored tiers skip these checks (they don't apply).
    ci_info "AUTO-ENFORCEMENT"

    # Resolve tier via the workspace registry (autocreated from template
    # if missing). Fall back to the CI template if registry is absent.
    local _ws_root="" _registry="" _rel="" _tier="strict"
    local _cur_dir="$project_dir"
    while [[ "$_cur_dir" != "/" ]]; do
        if [[ -d "$_cur_dir/.boot-linux" && -d "$_cur_dir/projects/CI" ]]; then
            _ws_root="$_cur_dir"
            break
        fi
        _cur_dir="$(dirname "$_cur_dir")"
    done
    if [[ -n "$_ws_root" ]]; then
        _registry="$_ws_root/ci/config/project_enforcement.yaml"
        [[ ! -f "$_registry" ]] && _registry=""
        _rel="${project_dir#"$_ws_root"/}"
        [[ "$_rel" == "$project_dir" ]] && _rel="."
        local _tier_rc=0
        _tier="$(ci_resolve_tier "$_rel" "$_registry")" || _tier_rc=$?
        if [[ $_tier_rc -ne 0 ]]; then
            _tier="strict"
        fi
    fi

    if [[ "$_tier" == "vendored" ]]; then
        _cs_skip "Q3" "vendored tier: no contract"
    elif [[ "$_tier" == "poc" ]]; then
        _cs_skip "Q3" "poc tier: quality_exceptions not required"
    elif [[ -f "$project_dir/quality_exceptions.yaml" ]]; then
        _cs_pass "Q3" "quality_exceptions.yaml present"
    else
        _cs_fail "Q3" "quality_exceptions.yaml missing at project root" \
            "Copy templates/quality_exceptions.template.yaml; replace __PROJECT_NAME__"
    fi

    echo ""

    # =====================================================================
    # SUMMARY
    # =====================================================================
    local _pct=0
    if [[ $_total -gt 0 ]]; then
        _pct=$(( (_passed * 100) / _total ))
    fi

    local _tier="Tier F"
    [[ $_pct -ge 40 ]] && _tier="Tier D"
    [[ $_pct -ge 60 ]] && _tier="Tier C"
    [[ $_pct -ge 80 ]] && _tier="Tier B"
    [[ $_pct -eq 100 ]] && _tier="Tier A"

    echo "==========================================="
    if [[ $_violations -eq 0 ]]; then
        ci_pass "COMPLIANCE: ${_pct}% (${_passed}/${_total}) -- $_tier"
    else
        ci_fail "COMPLIANCE: ${_pct}% (${_passed}/${_total}) -- $_tier -- $_violations violation(s)"
    fi
    echo "==========================================="

    [[ $_violations -eq 0 ]] && return 0 || return 1
}
