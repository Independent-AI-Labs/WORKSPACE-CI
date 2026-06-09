#!/usr/bin/env bash
# CI Core Library — sourced by hooks, test runners, and scripts.
# Consumers set their own shell flags; this file must stay passive.
# Usage: source /path/to/ci.sh


# ---------------------------------------------------------------------------
# Workspace detection
# ---------------------------------------------------------------------------
CI_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CI_PROJECT_ROOT="$(cd "$CI_LIB_DIR/.." && pwd)"
CI_CONFIG_DIR="$CI_PROJECT_ROOT/config"

# CI_WORKSPACE_ROOT: the monorepo/workspace root that contains this CI project.
# Accepts env var override; otherwise walks up from CI_PROJECT_ROOT looking for
# a root marker (pyproject.toml or Makefile). Falls back to parent of CI_PROJECT_ROOT.
if [[ -z "${CI_WORKSPACE_ROOT:-}" ]]; then
    _candidate="$(cd "$CI_PROJECT_ROOT/.." && pwd)"
    while [[ "$_candidate" != "/" ]]; do
        if [[ -f "$_candidate/pyproject.toml" || -f "$_candidate/Makefile" ]]; then
            CI_WORKSPACE_ROOT="$_candidate"
            break
        fi
        _candidate="$(cd "$_candidate/.." && pwd)"
    done
    CI_WORKSPACE_ROOT="${CI_WORKSPACE_ROOT:-$(cd "$CI_PROJECT_ROOT/.." && pwd)}"
fi

# ---------------------------------------------------------------------------
# Colors (disabled when stdout is not a terminal)
# ---------------------------------------------------------------------------
if [[ -t 1 ]]; then
    _RED='\033[0;31m'
    _GREEN='\033[0;32m'
    _YELLOW='\033[0;33m'
    _CYAN='\033[0;36m'
    _BOLD='\033[1m'
    _NC='\033[0m'
else
    _RED='' _GREEN='' _YELLOW='' _CYAN='' _BOLD='' _NC=''
fi

# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------
ci_pass()  { echo -e "${_GREEN}SUCCESS: $*${_NC}"; }
ci_fail()  { echo -e "${_RED}FAILED: $*${_NC}" >&2; }
ci_warn()  { echo -e "${_YELLOW}WARNING: $*${_NC}"; }
ci_info()  { echo -e "${_BOLD}$*${_NC}"; }

# Print a formatted violation line.
#   ci_error <file> <line> <pattern> <reason> [content]
ci_error() {
    local file="${1:-}" line="${2:-}" pattern="${3:-}" reason="${4:-}" content="${5:-}"
    echo -e "${_BOLD}${file}:${line}${_NC}"
    echo -e "  Pattern: ${_YELLOW}${pattern}${_NC}"
    echo -e "  Reason:  ${_CYAN}${reason}${_NC}"
    [[ -n "$content" ]] && echo "  > ${content:0:80}"
}

# ---------------------------------------------------------------------------
# File listing
# ---------------------------------------------------------------------------

# ci_file_list [files...]
#   Pre-commit mode: echoes each arg.
#   CI mode (no args): git ls-files.
ci_file_list() {
    if [[ $# -gt 0 ]]; then
        printf '%s\n' "$@"
    else
        local _git_tmp _git_rc=0
        _git_tmp="$(mktemp)"
        git ls-files --cached --others --exclude-standard 2>"$_git_tmp" || _git_rc=$?
        if [[ $_git_rc -ne 0 ]]; then
            ci_fail "git ls-files failed (exit $_git_rc): $(cat "$_git_tmp")" >&2
            rm -f "$_git_tmp"
            return 1
        fi
        [[ -s "$_git_tmp" ]] && ci_warn "git ls-files: $(cat "$_git_tmp")" >&2
        rm -f "$_git_tmp"
    fi
}

# ci_filter_ext <ext...>
#   Reads paths from stdin, emits only those matching any given extension.
#   Example: ci_file_list "$@" | ci_filter_ext .py .ts .js
ci_filter_ext() {
    local line
    while IFS= read -r line; do
        for ext in "$@"; do
            if [[ "$line" == *"$ext" ]]; then
                echo "$line"
                break
            fi
        done
    done
}

# ---------------------------------------------------------------------------
# Simple YAML reader
# ---------------------------------------------------------------------------

# ci_read_yaml <file> <key>
#   Reads a scalar value from a simple YAML file.
#   Supports flat keys (max_lines) and one-level dotpath (unit.min_coverage).
#   Returns the raw value (unquoted).
ci_read_yaml() {
    local file="$1" dotpath="$2"

    if [[ ! -f "$file" ]]; then
        return 1
    fi

    if [[ "$dotpath" == *.* ]]; then
        # Two-level: section.key
        local section="${dotpath%%.*}"
        local key="${dotpath#*.}"
        awk -v section="$section" -v key="$key" '
            /^[^ #]/ { in_section = ($0 ~ "^" section ":") }
            in_section && $0 ~ "^  " key ":" {
                val = $0
                sub(/^[^:]+:[[:space:]]*/, "", val)
                gsub(/^["'\'']|["'\'']$/, "", val)
                print val
                exit
            }
        ' "$file"
    else
        # Flat key
        awk -v key="$dotpath" '
            $0 ~ "^" key ":" {
                val = $0
                sub(/^[^:]+:[[:space:]]*/, "", val)
                gsub(/^["'\'']|["'\'']$/, "", val)
                print val
                exit
            }
        ' "$file"
    fi
}

# ci_read_yaml_list <file> <key>
#   Reads a YAML list under a key, one item per line (unquoted).
ci_read_yaml_list() {
    local file="$1" key="$2"

    if [[ ! -f "$file" ]]; then
        return 1
    fi

    awk -v key="$key" '
        /^[^ #]/ { in_key = ($0 ~ "^" key ":") ; next }
        in_key && /^  - / {
            val = $0
            sub(/^  - /, "", val)
            gsub(/^["'\'']|["'\'']$/, "", val)
            gsub(/^[[:space:]]+|[[:space:]]+$/, "", val)
            print val
        }
        in_key && /^[^ ]/ { exit }
    ' "$file"
}
