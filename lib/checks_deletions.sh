#!/usr/bin/env bash
# CI Deletion-Consumer Checks: guard deletions against remaining consumers.
# Sourced by checks.sh. Requires ci.sh to be loaded first.

# --- ci_check_deletion_consumers ---
# AUDIT-CAPABILITY-LOSS-2026-08-23: deletions in 89cd3e1/f7422dc removed
# files that consumers still depended on (a sibling Makefile calling the
# then-live scripts/cleanup-precommit, every consumer repo's scaffold-ci
# regeneration path, security-behavior tests for code that still ships
# in /opt). Nothing verified consumer impact before landing.
# When a commit deletes files under scripts/, lib/, ci/, or tests/,
# every remaining consumer must also change in the same commit or the
# commit message must carry a deletion-review line naming the deletion.
# Consumers searched: remaining tracked files here, sibling repos under
# projects/*, and the deployed /opt/workspace-ci artifact (a deleted
# test whose verified code still ships fails here).
#
# Escape hatch: a line "Deletion-Review: <file> <justification>" in the
# commit message body exempts that file (disclosed, greppable, audited).
_DELETION_SCOPE_RE='^(scripts/|lib/|ci/|tests/)'

ci_check_deletion_consumers() {
    local _commit_msg="${CI_COMMIT_MSG_FILE:-}"
    local _deleted_raw
    _deleted_raw="$(git diff --cached --name-only --diff-filter=D)"
    [[ -n "$_deleted_raw" ]] || { ci_pass "No deletions; no consumer risk."; return 0; }

    local _deleted
    _deleted="$(echo "$_deleted_raw" | grep -E "$_DELETION_SCOPE_RE")" || _deleted=""
    [[ -z "$_deleted" ]] && { ci_pass "No in-scope deletions."; return 0; }

    local -a _changed
    local _changed_raw
    _changed_raw="$(git diff --cached --name-only)"
    while IFS= read -r _f; do
        [[ -n "$_f" ]] && _changed+=("$_f")
    done <<< "$_changed_raw"
    local -A _deleted_set=()
    while IFS= read -r _f; do
        [[ -n "$_f" ]] && _deleted_set["$_f"]=1
    done <<< "$_deleted"

    local -A _reviewed=()
    if [[ -n "$_commit_msg" && -f "$_commit_msg" ]]; then
        local _line
        while IFS= read -r _line; do
            if [[ "$_line" =~ ^Deletion-Review:[[:space:]]*([^[:space:]]+) ]]; then
                _reviewed["${BASH_REMATCH[1]}"]=1
            fi
        done < "$_commit_msg"
    fi

    local _module_root
    _module_root="$(git rev-parse --show-toplevel)"
    local _f _base _has_errors=0 _review_note=0
    while IFS= read -r _f; do
        [[ -n "$_f" ]] || continue
        [[ -n "${_deleted_set["$_f"]:-}" ]] || continue
        if [[ -n "${_reviewed["$_f"]:-}" ]]; then
            ci_info "Deletion-Review accepted for $_f"
            _review_note=1
            continue
        fi
        _base="$(basename "$_f")"
        local _blocked=""

        # Consumers: remaining tracked files (excluding files deleted or
        # modified in this same commit, which bring consumers along).
        # git grep exits 1 on no matches: an expected empty result, not
        # an error; the exit code is captured and discarded by design.
        local _hits _hits_rc=0
        _hits="$(git grep -l -F "$_base" -- .)" || _hits_rc=$?
        [[ $_hits_rc -gt 1 ]] && { ci_fail "git grep failed for $_base"; return 1; }
        local _hit _c _carried
        while IFS= read -r _hit; do
            [[ -n "$_hit" ]] || continue
            [[ -n "${_deleted_set["$_hit"]:-}" ]] && continue
            _carried=0
            for _c in "${_changed[@]}"; do
                [[ "$_hit" == "$_c" ]] && { _carried=1; break; }
            done
            (( _carried )) && continue
            _blocked="$_blocked$_hit "
        done <<< "$_hits"

        # Consumers in sibling repos under projects/* (self excluded).
        # grep exits 1 on no matches: expected empty, not an error.
        local _pdir _phit _h2 _phit_rc
        for _pdir in "$_module_root"/../*/; do
            [[ -d "$_pdir" && "$_pdir" != "$_module_root/" ]] || continue
            _phit_rc=0
            _phit="$(grep -rl -F "$_base" "$_pdir" --include=Makefile \
                --include='*.yaml' --include='*.yml' --include='*.sh' \
                --include='*.md')" || _phit_rc=$?
            [[ $_phit_rc -gt 1 ]] && {
                ci_fail "sibling consumer scan failed in $_pdir"; return 1
            }
            while IFS= read -r _h2; do
                [[ -n "$_h2" ]] && _blocked="$_blocked$_h2 "
            done <<< "$_phit"
        done

        # Consumers in the deployed artifact: a deleted test whose
        # verified target still ships, or a deleted script still present.
        if [[ -d /opt/workspace-ci ]]; then
            if [[ -f "/opt/workspace-ci/$_f" ]]; then
                _blocked="$_blocked/opt/workspace-ci/$_f (still deployed) "
            fi
            local _opt_hits _opt_rc=0
            _opt_hits="$(grep -rl -F "$_base" /opt/workspace-ci/scripts \
                /opt/workspace-ci/lib /opt/workspace-ci/ci \
                /opt/workspace-ci/config)" || _opt_rc=$?
            [[ $_opt_rc -gt 1 ]] && {
                ci_fail "artifact consumer scan failed for $_base"; return 1
            }
            while IFS= read -r _oh; do
                [[ -n "$_oh" ]] && _blocked="$_blocked$_oh "
            done <<< "$_opt_hits"
        fi

        if [[ -n "$_blocked" ]]; then
            _has_errors=1
            ci_fail "Deletion of $_f has remaining consumers:"
            echo "$_blocked" | tr ' ' '\n' | sed '/^$/d; s/^/    /' >&2
            echo "    Bring consumers into this commit, or add to the message:" >&2
            echo "    Deletion-Review: $_f <justification>" >&2
        fi
    done <<< "$_deleted"

    (( _has_errors == 1 )) && return 1
    if (( _review_note == 1 )); then
        ci_pass "Deletions carry explicit Deletion-Review lines."
    else
        ci_pass "No remaining consumers for in-scope deletions."
    fi
    return 0
}
