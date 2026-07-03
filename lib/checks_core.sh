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
# Fails the commit if there are unstaged or untracked files, auto-staging
# all changes so the developer can re-commit without losing work.
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
# Delegates to lib/check_banned_words.py (Python implementation).
# Replaces the prior bash+AWK implementation that spawned ~33,000
# subprocesses under PRoot (58 patterns x 96 files x ~6 procs),
# taking 5+ minutes. The Python version does zero subprocess spawns
# for pattern matching and completes in <1s.
ci_check_banned_words() {
    local config="${CI_CONFIG_DIR}/banned_words.yaml"
    if [[ ! -f "$config" ]]; then
        ci_fail "Config not found: $config"
        return 1
    fi
    local _ci_py="${CI_PROJECT_ROOT:-}/.venv/bin/python"
    local script_path="${CI_LIB_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}/check_banned_words.py"
    if [[ ! -x "$_ci_py" ]]; then
        ci_fail "Banned-words: CI venv python not found at $_ci_py"
        return 1
    fi
    if [[ ! -f "$script_path" ]]; then
        ci_fail "Banned-words: helper not found at $script_path"
        return 1
    fi
    CI_CONFIG_DIR="$CI_CONFIG_DIR" \
        "$_ci_py" "$script_path" "$@" </dev/null
}
