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
# Auto-stages all unstaged or untracked changes before the remaining hooks run.
# Prevents partial commits that leave the working tree in an inconsistent state.
#
# Single-command flow (AGENTS.md Code §8): git decides "anything to
# commit?" from its pre-hook index snapshot, so a hook-time add cannot
# make git count content the user never staged (stock git 2.43
# semantics, proven 2026-08-24). When nothing was pre-staged, this
# check stages everything, then fails with instructions naming the
# cause; the same commit command re-run succeeds because the index now
# carries the content. When something IS pre-staged, hook-time staging
# rides the commit via git's post-hook index re-read.
ci_check_unstaged() {
    local untracked pre_staged
    untracked=$(git ls-files --others --exclude-standard)
    if [[ -z "$(git diff --stat)" ]] && [[ -z "$untracked" ]]; then
        return 0
    fi
    # Was anything staged before this commit attempt began? git's
    # committable check counts only pre-hook staging; hook staging here
    # cannot save an otherwise-empty commit.
    pre_staged=1
    if git diff --cached --quiet; then
        pre_staged=0
    fi
    echo ""
    ci_info "Unstaged or untracked files detected, auto-staging now."
    git diff
    local add_rc=0
    git add -A || add_rc=$?
    if [[ $add_rc -ne 0 ]]; then
        # Self-diagnosing failure: capture the capability and PATH
        # context of this exact hook process so a permission fault
        # identifies itself instead of needing post-hoc replay.
        echo "" >&2
        ci_info "Auto-stage diagnostics (hook exec context):" >&2
        grep -E 'Cap(Eff|Bnd|Amb)|NoNewPrivs' /proc/self/status | sed 's/^/  /' >&2
        ci_info "  git resolves to: $(command -v git)" >&2
        getcap "$(command -v git)" 2>&1 | sed 's/^/  caps: /' >&2
        ci_fail "Auto-stage FAILED: git add -A exited $add_rc. Nothing was staged; stage manually and re-run."
        return 1
    fi
    if [ -n "$untracked" ]; then
        echo ""
        ci_info "Untracked files being staged:"
        echo "$untracked" | sed 's/^/  /'
    fi
    if [[ $pre_staged -eq 0 ]]; then
        echo ""
        ci_fail "Nothing was pre-staged: git cannot count hook-time staging (pre-hook index snapshot)."
        echo "  All changes are now staged. Re-run the SAME git commit command; it succeeds."
        return 1
    fi
    echo ""
    ci_info "All changes staged; continuing commit."
    return 0
}

# --- ci_check_fallback_resolution ---
# Delegates to lib/check_fallback_resolution.py to scan tracked shell files
# for multi-source resolution shapes: probe-backed ${VAR:-...} defaults,
# try-A-then-B reassignment after '! -x' probes, boot-then-PATH resolvers,
# and multi-candidate boot-dir arrays. Complements the banned-words
# catalog with shape detection.
ci_check_fallback_resolution() {
    local script_path="${CI_LIB_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}/check_fallback_resolution.py"
    if [[ ! -f "$script_path" ]]; then
        ci_fail "Fallback-resolution: helper not found at $script_path"
        return 1
    fi
    local _scan_root="${CI_SCAN_ROOT:-$PWD}"
    CI_SCAN_ROOT="$_scan_root" \
        ci_uv_run "$script_path" "$@" </dev/null
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
    # ci_uv_run preserves the caller cwd; still pin the consuming repo
    # explicitly for git ls-files and per-project exceptions via CI_SCAN_ROOT.
    local _scan_root="${CI_SCAN_ROOT:-$PWD}"
    CI_SCAN_ROOT="$_scan_root" \
    CI_CONFIG_DIR="$CI_CONFIG_DIR" \
        ci_uv_run "$script_path" "$@" </dev/null
}

# --- ci_check_policy_integrity ---
# Delegates to lib/check_policy_integrity.py: non-exemptible structural
# validation of banned_words.yaml + banned_words_exceptions.yaml, run
# BEFORE ordinary exemptions load. Broad exemptions are frozen against
# the exact-digest baseline in config/policy_integrity_baseline.yaml;
# new or modified broad entries fail closed.
ci_check_policy_integrity() {
    local script_path="${CI_LIB_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}/check_policy_integrity.py"
    if [[ ! -f "$script_path" ]]; then
        ci_fail "Policy-integrity: helper not found at $script_path"
        return 1
    fi
    local _scan_root="${CI_SCAN_ROOT:-$PWD}"
    CI_SCAN_ROOT="$_scan_root" \
    CI_CONFIG_DIR="$CI_CONFIG_DIR" \
        ci_uv_run "$script_path" "$@" </dev/null
}
