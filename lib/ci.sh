#!/usr/bin/env bash
# CI Core Library: sourced by hooks, test runners, and scripts.
# Consumers set their own shell flags; this file must stay passive.
# Usage: source /path/to/ci.sh


# ---------------------------------------------------------------------------
# Platform detection
# ---------------------------------------------------------------------------

# ci_platform_name
#   Returns: "linux" or "darwin" (lowercase, derived from uname -s).
ci_platform_name() {
    uname -s | tr 'A-Z' 'a-z'
}

# ci_boot_name [platform]
#   Maps platform name to boot directory name.
#   Defaults to ci_platform_name if no argument given.
ci_boot_name() {
    local _platform="${1:-$(ci_platform_name)}"
    case "$_platform" in
        darwin) echo ".boot-macos" ;;
        *)      echo ".boot-linux" ;;
    esac
}

# ci_boot_dir [project_root] [platform]
#   Resolves the boot directory path for the current platform.
#   Accepts optional explicit project_root and platform overrides.
#   Otherwise echoes $CI_PROJECT_ROOT/$boot_name. Caller validates existence.
ci_boot_dir() {
    local _ws="${1:-${CI_PROJECT_ROOT:-}}"
    local _platform="${2:-$(ci_platform_name)}"
    local _boot_name
    _boot_name="$(ci_boot_name "$_platform")"
    echo "$_ws/$_boot_name"
}

# ---------------------------------------------------------------------------
# Workspace detection
# ---------------------------------------------------------------------------
CI_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CI_PROJECT_ROOT="$(cd "$CI_LIB_DIR/.." && pwd)"
CI_CONFIG_DIR="${CI_CONFIG_DIR:-$CI_PROJECT_ROOT/config}"
export CI_LIB_DIR CI_PROJECT_ROOT CI_CONFIG_DIR

# shellcheck source=ci_config_paths.sh
if ! source "$CI_LIB_DIR/ci_config_paths.sh"; then
    echo "ERROR: failed to source $CI_LIB_DIR/ci_config_paths.sh" >&2
    return 1
fi
# shellcheck source=ci_helpers.sh
if ! source "$CI_LIB_DIR/ci_helpers.sh"; then
    echo "ERROR: failed to source $CI_LIB_DIR/ci_helpers.sh" >&2
    return 1
fi

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
# Source-time boot directory variables (set once when ci.sh is sourced).
# ---------------------------------------------------------------------------
CI_BOOT_NAME="$(ci_boot_name)"
CI_BOOT_DIR="$CI_PROJECT_ROOT/$CI_BOOT_NAME"

# ---------------------------------------------------------------------------
# Portable sha256 helper
# ---------------------------------------------------------------------------

# ci_sha256 <file>
#   Prints the SHA-256 hash (lowercase hex, no filename) of <file>.
#   Tries sha256sum (GNU coreutils / Darwin port), then shasum -a 256
#   (macOS built-in), then python3 as last resort. Returns 1 if all fail.
ci_sha256() {
    local file="$1"
    if [[ ! -r "$file" ]]; then
        echo "ci_sha256: cannot read '$file'" >&2
        return 1
    fi
    if _sha_path="$(command -v sha256sum 2>&1)"; then
        sha256sum "$file" | awk '{print $1}'
    elif _sha_path="$(command -v shasum 2>&1)"; then
        shasum -a 256 "$file" | awk '{print $1}'
    elif _sha_path="$(command -v python3 2>&1)"; then
        python3 -c "import hashlib,sys;print(hashlib.sha256(open(sys.argv[1],'rb').read()).hexdigest())" "$file"
    else
        echo "ci_sha256: no checksum tool available (sha256sum, shasum, python3)" >&2
        return 1
    fi
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
#   Supports flat keys (dependsOn) and one-level dotpath (project.inherited_boot_dirs).
ci_read_yaml_list() {
    local file="$1" key="$2"

    if [[ ! -f "$file" ]]; then
        return 1
    fi

    if [[ "$key" == *.* ]]; then
        local section="${key%%.*}"
        local subkey="${key#*.}"
        awk -v section="$section" -v key="$subkey" '
            /^[^ #]/ { in_section = ($0 ~ "^" section ":") ; in_key = 0 ; next }
            in_section && $0 ~ "^  " key ":" { in_key = 1 ; next }
            in_key && /^    - / {
                val = $0
                sub(/^    - /, "", val)
                gsub(/^["'\'']|["'\'']$/, "", val)
                gsub(/^[[:space:]]+|[[:space:]]+$/, "", val)
                print val
            }
            in_key && /^  [^ ]/ && $0 !~ "^  " key ":" { exit }
            in_section && /^[^ ]/ && $0 !~ "^" section ":" { in_key = 0 }
        ' "$file"
    else
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
    fi
}

# ---------------------------------------------------------------------------
# Portable output capture (virtualization-safe)
# ---------------------------------------------------------------------------
# Process substitution (`< <(cmd)`) opens /dev/fd/NN by path, which is
# broken under PRoot, some bwrap/firejail sandboxes, and chroots without
# /proc. The helpers below use temp files (mktemp, 0600) instead: works
# on every POSIX system and every virtualization layer. Requires bash 4.3+
# for nameref.

# ci_capture_lines <array-nameref> -- <command...>
#   Run <command>, capture stdout lines into <array-nameref> (blanks skipped).
#   Preserves producer exit code. Temp file is 0600 via mktemp, auto-removed.
#
#   Example:
#     local exts=()
#     ci_capture_lines exts -- ci_read_yaml_list "$config" "extensions"
ci_capture_lines() {
    local -n _cl_arr=$1; shift
    [[ "${1:-}" == "--" ]] && shift
    local _cl_tmp; _cl_tmp=$(mktemp) || return 1
    # shellcheck disable=SC2064
    trap "rm -f '$_cl_tmp'" RETURN INT TERM
    local _cl_rc=0
    "$@" > "$_cl_tmp" || _cl_rc=$?
    _cl_arr=()
    local _cl_v
    while IFS= read -r _cl_v; do
        [[ -n "$_cl_v" ]] && _cl_arr+=("$_cl_v")
    done < "$_cl_tmp"
    rm -f "$_cl_tmp"
    trap - RETURN INT TERM
    return "$_cl_rc"
}

# ci_capture_pipe <array-nameref> <snippet> [args...]
#   Like ci_capture_lines but runs <snippet> via eval in a subshell: for
#   pipelines (ci_file_list | ci_filter_ext, find | sort, etc.). The
#   subshell inherits all shell functions and variables from the parent,
#   so snippet can call ci_file_list, ci_filter_ext, etc. The snippet's
#   "$@" / "$1".. refer to the args passed after the snippet.
#
#   SECURITY: <snippet> is passed to eval: it MUST be a hardcoded string
#   literal in the calling code, NEVER user input. All current call sites
#   use single-quoted static snippets.
#
#   Example:
#     local files=()
#     ci_capture_pipe files 'ci_file_list "$@" | ci_filter_ext .py .sh' "$@"
ci_capture_pipe() {
    local -n _cp_arr=$1; shift
    local _cp_snippet=$1; shift
    local _cp_tmp; _cp_tmp=$(mktemp) || return 1
    # shellcheck disable=SC2064
    trap "rm -f '$_cp_tmp'" RETURN INT TERM
    local _cp_rc=0
    ( eval "$_cp_snippet" ) > "$_cp_tmp" || _cp_rc=$?
    _cp_arr=()
    local _cp_v
    while IFS= read -r _cp_v; do
        [[ -n "$_cp_v" ]] && _cp_arr+=("$_cp_v")
    done < "$_cp_tmp"
    rm -f "$_cp_tmp"
    trap - RETURN INT TERM
    return "$_cp_rc"
}

# ---------------------------------------------------------------------------
# Fail-closed Python checker wrapper
# ---------------------------------------------------------------------------
# ci_run_python_checker <script_path> [args...]
#
# Fail-closed wrapper for Python checker invocation. stdin is passed
# through to the Python process. stdout captured to CI_CHECKER_STDOUT
# (temp file, caller MUST rm after use). stderr captured to
# CI_CHECKER_STDERR (auto-rm'd after printing on failure).
#
# INVARIANT (fail-closed / mathematical proof):
#   Python exit 0           → return 0
#   Python exit != 0        → return 1   (regardless of stdout content)
#
# Proof: The function has exactly two return paths:
#   (a) rc == 0 → return 0   (only when the Python child exits 0)
#   (b) rc != 0 → return 1   (every other case: violations, crash, timeout)
# There is no third path. A caller checking `if ci_run_python_checker ...`
# cannot reach a "pass" state for any non-zero child exit code, because
# the `|| _rc=$?` capture defeats `set -e` without masking the result,
# and the `if [[ $_rc -ne 0 ]]` branch is the ONLY non-return-0 path.
#
# Environment variables CI_CONFIG_DIR, CI_LIB_DIR, CI_PROJECT_ROOT
# are ALWAYS propagated to the child, regardless of whether they are
# exported in the parent shell. This eliminates CWD-dependent
# relative-path bugs in sibling repos (e.g. WORKSPACE-GUARD) whose
# hooks `cd` to their own root before invoking CI checkers.
ci_run_python_checker() {
    local _script="$1"; shift

    if [[ ! -f "$_script" ]]; then
        ci_fail "Checker script not found: $_script"
        return 1
    fi
    local _uv=""
    _uv="$(ci_uv_bin)" || {
        ci_fail "CI uv not found; run: make install-boot-tools"
        return 1
    }

    CI_CHECKER_STDOUT="$(mktemp)"
    CI_CHECKER_STDERR="$(mktemp)"

    local _rc=0
    CI_CONFIG_DIR="$CI_CONFIG_DIR" \
    WORKSPACE_CI_CONFIG_ROOT="${WORKSPACE_CI_CONFIG_ROOT:-}" \
    CI_CONFIG_OVERRIDES="${CI_CONFIG_OVERRIDES:-}" \
    CI_GUARD_CONFIG_DIR="${CI_GUARD_CONFIG_DIR:-}" \
    WORKSPACE_GUARD_CONFIG_ROOT="${WORKSPACE_GUARD_CONFIG_ROOT:-}" \
    CI_GUARD_CONFIG_OVERRIDES="${CI_GUARD_CONFIG_OVERRIDES:-}" \
    CI_LIB_DIR="$CI_LIB_DIR" \
    CI_PROJECT_ROOT="$CI_PROJECT_ROOT" \
        ci_uv_run "$_script" "$@" \
        > "$CI_CHECKER_STDOUT" 2>"$CI_CHECKER_STDERR" \
        || _rc=$?

    if [[ $_rc -ne 0 ]]; then
        if [[ -s "$CI_CHECKER_STDERR" ]]; then
            cat "$CI_CHECKER_STDERR" >&2
        fi
        rm -f "$CI_CHECKER_STDERR"
        return 1
    fi

    rm -f "$CI_CHECKER_STDERR"
    return 0
}

# ---------------------------------------------------------------------------
# Boot-path resolver (hierarchical $CI_BOOT_NAME/ contract per SPEC-BOOT-LAYOUT)
# ---------------------------------------------------------------------------

# ci_resolve_boot_path <start-dir>
#   Pure function. Walks up from <start-dir> to /. At each level that
#   contains $CI_BOOT_NAME/python-env/bin, prepends it to the accumulator;
#   at each level that contains $CI_BOOT_NAME/bin, prepends it after the
#   python-env entry. Returns the accumulated string (colon-separated
#   entries, no trailing colon: caller prepends ":$PATH").
#
#   Then reads moon.yml at <start-dir> (if present) for
#   project.inherited_boot_dirs -- a list of PROJECT-ROOT paths (not
#   boot-dir paths). Each entry is resolved to a project root, then
#   /$CI_BOOT_NAME/bin is appended and checked for existence. Valid
#   entries are prepended AFTER the walk-up results so declared
#   inheritance wins (leftmost = highest precedence). Among
#   inherited_boot_dirs entries, LATER-listed entries are prepended
#   later → they land leftmost → they win.
#
#   Pure: no side effects, no network. The `cd ... && pwd -P` subshells
#   do not mutate the parent shell's CWD.
#
#   NO SILENT ERROR SUPPRESSION. A failed `cd "$entry"` emits its native
#   `bash: cd: <path>: No such file or directory` to stderr: that IS
#   the visible signal. `|| continue` propagates the skip; the stderr
#   keeps the trace honest. No stderr redirection to the null device.
ci_resolve_boot_path() {
    local start="$1" walk accum="" _boot_name="${CI_BOOT_NAME:-$(ci_boot_name)}"
    walk="$start"
    while [[ "$walk" != "/" && "$walk" != "." ]]; do
        if [[ -d "$walk/$_boot_name/python-env/bin" ]]; then
            accum="$walk/$_boot_name/python-env/bin:$accum"
        fi
        if [[ -d "$walk/$_boot_name/bin" ]]; then
            accum="$walk/$_boot_name/bin:$accum"
        fi
        walk="$(dirname "$walk")"
    done
    # Explicit inherited_boot_dirs entries from moon.yml.
    # Entries are PROJECT-ROOT paths (e.g., '../CI'), NOT boot-dir paths.
    # The resolver appends /$CI_BOOT_NAME/bin at runtime → platform-aware.
    local moon="$start/moon.yml"
    if [[ -f "$moon" ]]; then
        local inherited=()
        if ci_capture_lines inherited -- ci_read_yaml_list "$moon" "project.inherited_boot_dirs"; then
            local entry resolved_project
            for entry in "${inherited[@]}"; do
                entry="${entry%/}"
                [[ -z "$entry" ]] && continue
                resolved_project="$(cd "$start" && cd "$entry" && pwd -P)" || continue
                if [[ -d "$resolved_project/$_boot_name/bin" ]]; then
                    accum="$resolved_project/$_boot_name/bin:$accum"
                fi
            done
        fi
    fi
    # Strip trailing colon (accum always ends with ':' due to prepend pattern)
    printf '%s' "${accum%:}"
}

# ci_resolve_tool_path <start-dir> <tool-name>
#   Walks up from <start-dir> to / looking for an executable at
#   $CI_BOOT_NAME/bin/<tool-name>. Falls back to command -v. Prints the
#   resolved path to stdout; returns 1 if not found.
ci_resolve_tool_path() {
    local start="$1" tool="$2" walk _boot_name="${CI_BOOT_NAME:-$(ci_boot_name)}"
    walk="$start"
    while [[ "$walk" != "/" && "$walk" != "." ]]; do
        if [[ -x "$walk/$_boot_name/bin/$tool" ]]; then
            printf '%s\n' "$walk/$_boot_name/bin/$tool"
            return 0
        fi
        walk="$(dirname "$walk")"
    done
    if _tool_path="$(command -v "$tool" 2>&1)"; then
        printf '%s\n' "$_tool_path"
        return 0
    fi
    return 1
}
