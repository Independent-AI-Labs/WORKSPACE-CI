#!/usr/bin/env bash
# CI Core Checks: ignore dirs, unstaged detection, banned words.
# Sourced by checks.sh. Requires ci.sh to be loaded first.

# --- Built-in ignore directories ---
# `reference` is the ecosystem-wide convention for external code drops
# (tarballs from partners, third-party source parked for the porting
# team); contents are read-only and not subject to our rules.
# `vendored` is the sibling convention for committed vendor mirrors.
_IGNORE_DIRS=(
    .git .venv __pycache__ node_modules .mypy_cache .pytest_cache .ruff_cache
    dist build .next out checkpoints logs results mlruns .gemini rocm_artifacts
    tmp projects .boot-linux .boot-macos .gcloud .cache .local venv env .env
    site-packages vendor vendored packages ansible .tox .nox htmlcov .coverage
    eggs .eggs target reference
)

_in_ignored_dir() {
    local filepath="$1"
    local part
    IFS='/' read -ra parts <<< "$filepath"
    for part in "${parts[@]}"; do
        for ign in "${_IGNORE_DIRS[@]}"; do
            [[ "$part" == "$ign" ]] && return 0
        done
    done
    return 1
}

# --- ci_check_unstaged ---
ci_check_unstaged() {
    local untracked
    untracked=$(git ls-files --others --exclude-standard)
    if ! git diff --quiet || [ -n "$untracked" ]; then
        echo ""
        ci_fail "Unstaged or untracked files detected, auto-staging now."
        git diff
        git add -A
        if [ -n "$untracked" ]; then
            echo ""
            ci_info "Untracked files being staged:"
            echo "$untracked" | sed 's/^/  /'
        fi
        echo ""
        ci_info "All changes staged. Re-run: git commit"
        return 1
    fi
    return 0
}

# --- ci_check_banned_words [files...] ---
ci_check_banned_words() {
    local config="${CI_CONFIG_DIR}/banned_words.yaml"
    local errors=0

    if [[ ! -f "$config" ]]; then
        ci_fail "Config not found: $config"
        return 1
    fi

    local records_file exc_file _grep_tmp
    records_file="$(mktemp)"
    exc_file="$(mktemp)"
    _grep_tmp="$(mktemp)"

    awk -f "$_CHECKS_DIR/parse_banned_words.awk" "$config" > "$records_file"
    awk -f "$_CHECKS_DIR/parse_exceptions.awk" "$config" > "$exc_file"

    # Load per-project exceptions if present (SPEC: config/banned_words_exceptions.yaml)
    local project_exc="config/banned_words_exceptions.yaml"
    if [[ -f "$project_exc" ]]; then
        awk -f "$_CHECKS_DIR/parse_exceptions.awk" "$project_exc" >> "$exc_file"
    fi

    # Build exception lookup: pattern -> combined path regex
    declare -A _exc_map=()
    while IFS=$'\034' read -r exc_pattern exc_paths; do
        [[ -z "$exc_pattern" || -z "$exc_paths" ]] && continue
        if [[ -n "${_exc_map[$exc_pattern]+x}" ]]; then
            _exc_map[$exc_pattern]="${_exc_map[$exc_pattern]}|${exc_paths}"
        else
            _exc_map[$exc_pattern]="$exc_paths"
        fi
    done < "$exc_file"
    rm -f "$exc_file"

    # --- Build file list ---
    local files=()
    while IFS= read -r f; do
        [[ -z "$f" ]] && continue
        files+=("$f")
    done < <(ci_file_list "$@" | ci_filter_ext .py .js .ts .rs .toml .sh)

    ci_info "Scanning ${#files[@]} file(s) for banned patterns..."

    # --- Check each file against each record ---
    while IFS=$'\034' read -r section pattern reason dir_key; do
        [[ -z "$pattern" ]] && continue

        # Look up exception regex for this pattern
        local exc="${_exc_map[$pattern]:-}"

        for filepath in "${files[@]}"; do
            # Skip if exception matches filepath. Use `--` separator so
            # patterns that happen to start with `-` (e.g. the banned
            # em-dash rules) are never interpreted as grep options.
            if [[ -n "$exc" ]] && echo "$filepath" | grep -qE -- "$exc"; then
                continue
            fi

            local basename
            basename="$(basename "$filepath")"

            # filename_rules: check basename only
            if [[ "$section" == "filename_rules" ]]; then
                if echo "$basename" | grep -qE -- "$pattern"; then
                    ci_error "$filepath" "0" "$pattern" "$reason" "$basename"
                    errors=$((errors + 1))
                fi
                continue
            fi

            # directory_rules: only apply if file is under the specified dir
            if [[ "$section" == "directory_rules" && -n "$dir_key" ]]; then
                case "$filepath" in
                    "$dir_key/"* | *"/$dir_key/"*) ;;
                    *) continue ;;
                esac
            fi

            [[ -f "$filepath" ]] || continue

            # Strip \b from pattern for validation only (word boundary is not a BRE/ERE construct)
            local validate_pattern="${pattern//\\b/}"
            if echo "" | grep -nE -- "$validate_pattern" >/dev/null 2>&1; then
                ci_warn "Skipping invalid pattern: '$pattern' (reason: $reason)"
                continue
            fi

            if grep -nE -- "$pattern" "$filepath" > "$_grep_tmp"; then
                while IFS=: read -r line_num content; do
                    ci_error "$filepath" "$line_num" "$pattern" "$reason" "$content"
                    errors=$((errors + 1))
                done < "$_grep_tmp"
            fi
        done
    done < "$records_file"

    rm -f "$records_file" "$_grep_tmp"

    if [[ $errors -gt 0 ]]; then
        echo ""
        ci_fail "$errors banned pattern(s) found."
        return 1
    fi

    ci_pass "No banned patterns found."
    return 0
}
