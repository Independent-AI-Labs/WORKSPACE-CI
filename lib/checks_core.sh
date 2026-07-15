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
# Fails the commit if there are unstaged or untracked files, auto-staging all
# changes so the developer can re-commit without losing work.
# Prevents partial commits that leave the working tree in an inconsistent state.
# The developer simply re-runs git commit after the auto-stage completes.
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
# Delegates to lib/check_banned_words.py to scan all tracked files for banned
# patterns defined in config/banned_words.yaml.
# Replaces a prior bash+AWK implementation that spawned ~33,000 subprocesses
# under PRoot and took 5+ minutes; the Python version does zero subprocess
# spawns and completes in <1s.
# Per-project exemptions are supported via config/banned_words_exceptions.yaml
# with granular path and pattern scoping.
ci_check_banned_words() {
    local config
    config="$(ci_config_path banned_words)" || return 1
    if [[ ! -f "$config" ]]; then
        ci_fail "Config not found: $config"
        return 1
    fi
    local script_path="${CI_LIB_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}/check_banned_words.py"
    if [[ ! -f "$script_path" ]]; then
        ci_fail "Banned-words: helper not found at $script_path"
        return 1
    fi
    # ci_uv_run cds to CI_PROJECT_ROOT; preserve the consuming repo for
    # git ls-files and per-project exceptions via CI_SCAN_ROOT.
    local _scan_root="${CI_SCAN_ROOT:-$PWD}"
    CI_SCAN_ROOT="$_scan_root" \
    CI_CONFIG_DIR="$CI_CONFIG_DIR" \
        ci_uv_run "$script_path" "$@" </dev/null
}
