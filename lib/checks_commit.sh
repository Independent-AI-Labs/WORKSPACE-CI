#!/usr/bin/env bash
# CI Commit Checks: blocked patterns, commit message format.
# Sourced by checks.sh. Requires ci.sh to be loaded first.

# --- Blocked commit patterns (shared by commit-msg and pre-push checks) ---
_load_blocked_commit_patterns() {
    local config="${CI_CONFIG_DIR}/blocked_commit_patterns.yaml"
    _BLOCKED_PATTERNS=()
    _BLOCKED_REASONS=()

    if [[ ! -f "$config" ]]; then
        ci_warn "Config not found: $config"
        return 1
    fi

    local _in_blocked=0
    local _pat="" _reason=""
    while IFS= read -r _line; do
        [[ "$_line" == "blocked:" ]] && { _in_blocked=1; continue; }
        [[ $_in_blocked -eq 0 ]] && continue
        # New entry
        if [[ "$_line" =~ ^[[:space:]]+- ]]; then
            # Flush previous
            if [[ -n "$_pat" ]]; then
                _BLOCKED_PATTERNS+=("$_pat")
                _BLOCKED_REASONS+=("$_reason")
            fi
            _pat="" _reason=""
        fi
        if [[ "$_line" =~ pattern:[[:space:]]*[\"\']?(.+)[\"\']?$ ]]; then
            _pat="${BASH_REMATCH[1]}"
            _pat="${_pat%\"}" ; _pat="${_pat%\'}"
            _pat="${_pat#\"}" ; _pat="${_pat#\'}"
        fi
        if [[ "$_line" =~ reason:[[:space:]]*[\"\']?(.+)[\"\']?$ ]]; then
            _reason="${BASH_REMATCH[1]}"
            _reason="${_reason%\"}" ; _reason="${_reason%\'}"
            _reason="${_reason#\"}" ; _reason="${_reason#\'}"
        fi
    done < "$config"
    # Flush last entry
    if [[ -n "$_pat" ]]; then
        _BLOCKED_PATTERNS+=("$_pat")
        _BLOCKED_REASONS+=("$_reason")
    fi
}

# Check a message string against all blocked patterns.
# Returns 0 if clean, 1 if any pattern matched.
_check_message_blocked() {
    local _msg="$1"
    local _violations=0
    for _i in "${!_BLOCKED_PATTERNS[@]}"; do
        if echo "$_msg" | grep -qiE "${_BLOCKED_PATTERNS[$_i]}"; then
            ci_fail "${_BLOCKED_REASONS[$_i]}"
            _violations=$((_violations + 1))
        fi
    done
    return $(( _violations > 0 ? 1 : 0 ))
}

# --- ci_block_coauthored <commit-msg-file> ---
# Commit-msg hook that validates the commit message against blocked patterns
# from config/blocked_commit_patterns.yaml.
# Catches AI-attribution markers and other forbidden text that must never
# enter commit history.
# Prints the configured reason for each match so the developer knows exactly
# what to remove.
ci_block_coauthored() {
    local msg_file="${1:-}"

    if [[ -z "$msg_file" || ! -f "$msg_file" ]]; then
        ci_fail "No commit message file provided or file not found."
        return 1
    fi

    _load_blocked_commit_patterns || return 1

    local _msg
    _msg="$(cat "$msg_file")"
    if ! _check_message_blocked "$_msg"; then
        echo ""
        echo "Remove blocked patterns from your commit message."
        return 1
    fi

    return 0
}

# --- ci_block_coauthored_history ---
# Pre-push hook that scans every commit in the actual push range for blocked
# patterns from config/blocked_commit_patterns.yaml.
# Reads push refs from stdin per the git pre-push protocol and computes the
# exact set of new commits being pushed.
# Blocks the push if any commit contains a violation, instructing the
# developer to rewrite history via interactive rebase.
ci_block_coauthored_history() {
    _load_blocked_commit_patterns || return 1

    local _zero="0000000000000000000000000000000000000000"
    local _all_commits=""

    # Read ALL push refs from stdin before entering the loop. If we
    # read line-by-line inside the while-read, the $(git log ...)
    # command substitutions inherit the pipe's stdin and hold the read
    # end open. After the loop exits, the pipe is NOT at EOF because
    # git's subprocess still holds it. The second while-read loop's
    # $(git log -1 ...) calls then inherit the still-open pipe and
    # the function hangs indefinitely. Reading stdin into a variable
    # first and feeding the loop via here-string breaks the chain.
    local _push_refs
    _push_refs="$(cat)"
    while read -r _local_ref _local_sha _remote_ref _remote_sha; do
        [[ -z "$_local_sha" ]] && continue
        # Deleted branch, nothing to check
        [[ "$_local_sha" == "$_zero" ]] && continue
        if [[ "$_remote_sha" == "$_zero" ]]; then
            _all_commits+="$(git log --format=%H "$_local_sha" --not --remotes)"$'\n'
        elif git merge-base --is-ancestor "$_remote_sha" "$_local_sha"; then
            _all_commits+="$(git log --format=%H "$_remote_sha..$_local_sha")"$'\n'
        else
            _all_commits+="$(git log --format=%H "$_local_sha" --not --remotes)"$'\n'
        fi
    done <<< "$_push_refs"

    local _commits
    _commits="$(echo "$_all_commits" | sort -u | grep -v '^$')"

    if [[ -z "$_commits" ]]; then
        ci_pass "No new commits to check."
        return 0
    fi

    local _violations=0
    while IFS= read -r _sha; do
        [[ -z "$_sha" ]] && continue
        local _msg _short _subject
        _msg="$(git log -1 --format=%B "$_sha")"
        _short="$(git log -1 --format=%h "$_sha")"
        _subject="$(git log -1 --format=%s "$_sha")"
        for _i in "${!_BLOCKED_PATTERNS[@]}"; do
            if echo "$_msg" | grep -qiE "${_BLOCKED_PATTERNS[$_i]}"; then
                ci_fail "$_short $_subject -- ${_BLOCKED_REASONS[$_i]}"
                _violations=$((_violations + 1))
                break
            fi
        done
    done <<< "$_commits"

    if [[ $_violations -gt 0 ]]; then
        echo ""
        ci_fail "$_violations commit(s) with blocked patterns found in push range."
        echo "Rewrite history to remove them before pushing:"
        echo "  git rebase -i <base>"
        return 1
    fi

    ci_pass "No blocked patterns in push range."
    return 0
}

# --- ci_check_commit_message <commit-msg-file> ---
# Commit-msg hook that enforces conventional-commit format on the first line,
# a blank second line, and a mandatory body explaining what changed and why.
# Validates the type prefix against feat, fix, refactor, docs, test, chore,
# ci, perf, style, build, and revert.
# Auto-generated git messages such as merge and squash are allowed through
# without validation.
ci_check_commit_message() {
    local msg_file="${1:-}"

    if [[ -z "$msg_file" || ! -f "$msg_file" ]]; then
        ci_fail "No commit message file provided or file not found."
        return 1
    fi

    # Strip comment lines (git -v adds diff as comments).
    local first_line="" second_line=""
    local -a lines=()
    while IFS= read -r line; do
        [[ "$line" == \#* ]] && continue
        lines+=("$line")
    done < "$msg_file"
    first_line="${lines[0]:-}"
    second_line="${lines[1]:-}"

    if [[ -z "$first_line" ]]; then
        ci_fail "Commit message is empty."
        return 1
    fi

    # Allow auto-generated git messages (merge, revert, fixup, squash)
    if [[ "$first_line" =~ ^(Merge\ |Revert\ \"|fixup!\ |squash!\ ) ]]; then
        return 0
    fi

    # First line must match "type: description"
    local valid_types="^(feat|fix|refactor|docs|test|chore|ci|perf|style|build|revert): .+"
    if ! [[ "$first_line" =~ $valid_types ]]; then
        echo ""
        ci_fail "Bad commit message format."
        echo "  Got:      $first_line"
        echo "  Expected: type: description"
        echo "  Types:    feat fix refactor docs test chore ci perf style build revert"
        echo ""
        echo "  Example:  feat: add websocket reconnection logic"
        return 1
    fi

    # Second line MUST be blank
    if [[ -n "$second_line" ]]; then
        echo ""
        ci_fail "Second line of commit message must be blank."
        echo "  Got: '$second_line'"
        echo ""
        echo "  Format:"
        echo "    type: description"
        echo "    (blank line)"
        echo "    body with details..."
        return 1
    fi

    # Body is MANDATORY
    local body=""
    for i in "${!lines[@]}"; do
        (( i < 2 )) && continue
        if [[ -n "${lines[$i]}" && ! "${lines[$i]}" =~ ^[[:space:]]*$ ]]; then
            body="${lines[$i]}"
            break
        fi
    done
    if [[ -z "$body" ]]; then
        echo ""
        ci_fail "Commit message body is required."
        echo "  Title-only commits are not allowed."
        echo "  Explain WHAT changed and WHY after the blank line."
        echo ""
        echo "  Format:"
        echo "    type: description"
        echo "    (blank line)"
        echo "    body with details..."
        return 1
    fi

    return 0
}
