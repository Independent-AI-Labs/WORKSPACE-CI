# SPEC-BOOT-LAYOUT: Platform-Aware Hermetic Boot Directory Implementation

**Date:** 2026-07-10
**Status:** Active
**Type:** Specification
**Requirements:** [REQ-BOOT-LAYOUT](../requirements/REQ-BOOT-LAYOUT.md)

> This document specifies the implementation of the platform-aware,
> hermetic boot-directory layout. The boot directory name is determined
> at runtime by `ci_boot_name()`; the boot directory location is
> `CI_PROJECT_ROOT/$CI_BOOT_NAME/`. Boot-directory inheritance is
> declared in `moon.yml::project.inherited_boot_dirs` -- there is no
> separate `boot_layout.yaml` file. The system is fully platform-aware
> on macOS (Homebrew, GNU tools, platform-aware bootstrapping).

---

**Cross-references:**

- [REQ-BOOT-LAYOUT](../requirements/REQ-BOOT-LAYOUT.md): companion requirements (FR-/NFR-level acceptance criteria)
- [RUNBOOK-HOOKS](../runbooks/RUNBOOK-HOOKS.md): hook generation contract
- [`lib/ci.sh`](../../lib/ci.sh): platform detection, boot path resolver, workspace root resolution, `ci_sha256()`
- [`scripts/generate-hooks`](../../scripts/generate-hooks): hook generator (PATH-prepend + relative path)
- [`scripts/bootstrap-homebrew`](../../scripts/bootstrap-homebrew): macOS Homebrew + GNU tools installer
- [`scripts/install-system-deps`](../../scripts/install-system-deps): platform-aware system dependency resolver
- [`config/system-deps.yaml`](../../config/system-deps.yaml): system dependency declarations (apt + brew)
- [`moon.yml`](../../moon.yml): boot-layout inheritance declaration (`project.inherited_boot_dirs`)
- [`ci/check_boot_venv_layout.py`](../../ci/check_boot_venv_layout.py): non-blocking compliance audit
- POSIX.1-2017 Shell Command Language
- GNU Core Utilities (`realpath`, `readlink`, `dirname`, `basename`)
- BSD/macOS System Calls (`uname(2)`)

---

## 1. Overview

This SPEC implements the boot-layout contract from REQ-BOOT-LAYOUT. It
introduces:

1. **Platform detection** -- `ci_platform_name()` in `lib/ci.sh` detects
   `linux` or `darwin` via `uname -s`. No fallback, no env override.
2. **Boot directory resolution** -- `ci_boot_name()` returns
   `.boot-linux` or `.boot-macos`; `ci_boot_dir()` returns
   `CI_PROJECT_ROOT/$CI_BOOT_NAME`. No fallback, no env override.
3. **Walk-up PATH resolution** -- `ci_resolve_boot_path()` walks up
   from a start directory, prepending `$CI_BOOT_NAME/bin` and
   `$CI_BOOT_NAME/python-env/bin` at each level. Reads
   `inherited_boot_dirs` entries from `moon.yml` and prepends them
   after walk-up.
4. **Portable relative path** -- `ci_relative_path()` replaces
   GNU-only `realpath --relative-to` with pure bash string manipulation.
5. **Portable SHA-256** -- `ci_sha256()` provides cross-platform
   checksum computation (`sha256sum` → `shasum -a 256` → `python3`).
6. **Hook generation** -- `generate-hooks` emits
   `ci_resolve_boot_path("$_ROOT")` in the PATH-prepend line. Uses
   `ci_relative_path()` for `_ci_rel`. No hardcoded `.boot-linux`.
7. **Dual-marker workspace detection** -- `walk-projects`,
   `checks_compliance.sh`, `check_required_hooks_present.py` accept
   both `.boot-linux` and `.boot-macos` as workspace markers.
8. **Bootstrap scripts** -- source `ci.sh` and use `$CI_BOOT_NAME`
   for install target. Platform-aware download URLs (tarball names,
   Rust host triples). `ci_sha256()` for checksum verification.
9. **macOS system dependencies** -- `bootstrap-homebrew` installs
   Homebrew + bash 5.x + coreutils/gnu-sed/findutils/pkg-config.
   `install-system-deps` is platform-aware (apt on Linux, brew on macOS).
10. **Compliance check** -- `ci/check_boot_venv_layout.py` non-blocking
    audit of `moon.yml::project.inherited_boot_dirs` + `dependsOn`
    alignment + `.pre-commit-config.yaml` `--project` refs.
11. **Configuration files** -- linter excludes, `.gitignore`, root
    Makefile all updated for dual-marker awareness and platform-aware
    computation.

**Implementation stack:** Pure bash functions in `lib/ci.sh`. Zero
external dependencies for the core API. Inline platform detection for
bootstrap scripts that cannot source `ci.sh`. Homebrew for macOS system
packages.

---

## 2. Architectural Principles

### 2.1 Inheritance, not contribution

A repo reads from ancestor boot directories via PATH walk-up. A repo
NEVER writes into an ancestor's, sibling's, or child's boot directory.
The only boot directory a repo writes into is its own
(`CI_PROJECT_ROOT/$CI_BOOT_NAME/`).

Siblings (same-level repos under a shared parent) are NOT reachable via
walk-up; cross-sibling boot sharing requires an EXPLICIT
`inherited_boot_dirs` entry in the consumer's `moon.yml` plus a matching
`moon.yml::dependsOn` edge. The sibling's boot directory remains
READ-ONLY: the consumer never writes into it.

### 2.2 Configuration over convention

Where a boot directory lives is determined by `CI_PROJECT_ROOT` and
`ci_boot_name()`. The `inherited_boot_dirs` entries in `moon.yml` are
PROJECT-ROOT paths (e.g. `'../CI'`), NOT boot-dir paths. The resolver
appends `/$CI_BOOT_NAME/bin` at runtime → platform-aware by
construction. The walk-up is auto-discovery ON TOP of the explicit
`inherited_boot_dirs` declaration: declared entries win (leftmost after
walk-up entries).

### 2.3 `.venv/` is private; cross-repo Python via `uv run --project`

No venv is shared, symlinked, or PATH-exposed across project boundaries.
Cross-repo Python invocation uses uv's `--project` flag (with `--no-sync`
to prevent mutation of the sibling's `uv.lock`). Bare `python` from PATH
remains banned (`banned_words.yaml`).

### 2.4 Pure OS-path idioms

`ci_resolve_boot_path()` and `ci_relative_path()` use only directory
existence checks + string manipulation. No `realpath`, no `readlink -f`,
no network, no python subprocess. Pure bash. PRoot-safe, sandbox-safe,
hermetic.

### 2.5 Non-blocking compliance

`check_boot_venv_layout.py` is advisory. Failures never block pre-commit.
A fresh checkout where `.venv/` doesn't exist yet must not be blocked by
the layout audit (chicken-and-egg avoidance).

### 2.6 Platform determines directory name -- no fallback

The boot directory name is `.boot-linux` on Linux, `.boot-macos` on
macOS. There is NO fallback from one to the other. If the platform's
boot directory does not exist on disk, that is a FATAL error at the
point of use -- not at `ci.sh` source-time (the library provides path
strings; consumers validate existence).

### 2.7 No escape hatches

No `BOOT_DIR`, `BOOT_LINUX_DIR`, or equivalent environment variable
override exists. The boot directory is determined by the platform and
the project root. No legacy compatibility, no mixed-state tolerance, no
fallback pathways.

### 2.8 `moon.yml` is the single source of truth

`moon.yml::project.inherited_boot_dirs` is the sole declaration of
boot-directory inheritance. There is no separate `boot_layout.yaml`
file. The compliance check verifies `inherited_boot_dirs` entries
resolve to existing project roots with boot directories, and that
each entry has a matching `dependsOn` edge.

---

## 3. System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  projects/CI/lib/ci.sh                                          │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ ci_platform_name()    → "linux" | "darwin"                  ││
│  │ ci_boot_dir()         → CI_PROJECT_ROOT/$CI_BOOT_NAME        ││
│  │ ci_boot_name()        → ".boot-linux" | ".boot-macos"       ││
│  │ ci_relative_path(a,b) → "projects/CI" | "../CI" | etc.     ││
│  │ ci_resolve_boot_path()→ walk-up + inherited_boot_dirs PATH  ││
│  │ ci_sha256()           → portable SHA-256 hash               ││
│  │                                                             ││
│  │ CI_BOOT_DIR  = CI_PROJECT_ROOT/$CI_BOOT_NAME (source-time)  ││
│  │ CI_BOOT_NAME = ci_boot_name()             (source-time)     ││
│  └─────────────────────────────────────────────────────────────┘│
└──────────────────┬──────────────────────────────────────────────┘
                   │ sourced by
                   ├──────────────────────────────────────────────┐
                   ▼                                              ▼
┌──────────────────────────────┐  ┌──────────────────────────────────────┐
│  .git/hooks/pre-commit       │  │  scripts/walk-projects                │
│  .git/hooks/commit-msg       │  │  lib/checks_compliance.sh             │
│  .git/hooks/pre-push         │  │  scripts/compliance-report            │
│  (uses ci_resolve_boot_path  │  │  (accept both markers)                │
│   in PATH-prepend)           │  └──────────────────────────────────────┘
└──────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  scripts/bootstrap-{uv,rust,gitleaks,cloc,homebrew}            │
│  (source ci.sh → $CI_BOOT_NAME for install target)              │
│  (platform-aware download URLs + ci_sha256 checksum)           │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  scripts/install-system-deps                                    │
│  (platform-aware: apt/dpkg on Linux, brew on macOS)            │
│  (reads config/system-deps.yaml with brew_package + platforms)  │
└─────────────────────────────────────────────────────────────────┘
```

### Component Interaction Flow

```
Developer runs: make init
       │
       ▼
┌──────────────────────────────────────────────┐
│  1. bootstrap-homebrew (macOS only)          │
│     a. Install Homebrew if absent (sudo)     │
│     b. brew install bash coreutils gnu-sed   │
│        findutils pkg-config (no sudo)        │
└──────────────────┬───────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────┐
│  2. install-system-deps --install            │
│     a. Parse config/system-deps.yaml         │
│     b. Filter by platforms field             │
│     c. Check: dpkg -s (Linux) / brew list    │
│        (macOS)                               │
│     d. Install: apt-get (Linux) / brew       │
│        (macOS)                               │
└──────────────────┬───────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────┐
│  3. bootstrap-rust (if cargo missing)        │
│     a. Platform-aware host triple            │
│     b. RUSTUP_HOME/CARGO_HOME before check   │
│     c. Idempotent on re-run                  │
└──────────────────────────────────────────────┘

Developer runs: make install
       │
       ▼
┌──────────────────────────────────────────────┐
│  1. preflight                                │
│     a. curl + tar present?                   │
│     b. $(SHELL) bash 4.3+? (namerefs)        │
└──────────────────┬───────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────┐
│  2. install-boot-tools                       │
│     a. bootstrap-uv → $CI_BOOT_NAME/bin/uv   │
│     b. bootstrap-rust → $CI_BOOT_NAME/rust/  │
└──────────────────┬───────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────┐
│  3. install-python-deps                      │
│     a. PATH=$CI_BOOT_NAME/bin:$PATH uv sync  │
│        --extra dev                           │
└──────────────────┬───────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────┐
│  4. install-gitleaks + install-cloc          │
│     a. Platform-aware tarball names          │
│     b. ci_sha256() checksum verification     │
└──────────────────┬───────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────┐
│  5. install-hooks                            │
│     a. cleanup-precommit                     │
│     b. generate-hooks → .git/hooks/{stage}   │
│        - ci_resolve_boot_path("$_ROOT")      │
│        - ci_relative_path for _ci_rel        │
└──────────────────────────────────────────────┘
```

---

## 4. Platform Detection API (`ci.sh`)

### 4.1 `ci_platform_name()`

```bash
ci_platform_name() {
    uname -s | tr 'A-Z' 'a-z'
}
```

| Property | Value |
|----------|-------|
| Input | None (reads `uname -s`) |
| Output | `linux` or `darwin` (lowercase, to stdout) |
| Side effects | None |
| External deps | `uname` (POSIX-mandated) |
| Bash version | 3.2+ compatible |

### 4.2 `ci_boot_name()`

```bash
ci_boot_name() {
    local _platform="${1:-$(ci_platform_name)}"
    case "$_platform" in
        darwin) echo ".boot-macos" ;;
        *)      echo ".boot-linux" ;;
    esac
}
```

| Property | Value |
|----------|-------|
| Input | None (or optional platform override) |
| Output | `.boot-linux` or `.boot-macos` (to stdout) |
| Use case | Workspace marker checks, walk-up directory name, bootstrap install target |

### 4.3 `ci_boot_dir()`

```bash
ci_boot_dir() {
    local _ws="${1:-${CI_PROJECT_ROOT:-}}"
    local _platform="${2:-$(ci_platform_name)}"
    local _boot_name
    _boot_name="$(ci_boot_name "$_platform")"
    echo "$_ws/$_boot_name"
}
```

| Property | Value |
|----------|-------|
| Input | None (uses `CI_PROJECT_ROOT` set at source-time) |
| Output | Absolute path to boot directory (to stdout) |
| Fallback | None. No env override. No platform-to-platform fallback. |
| Bash version | 3.2+ compatible |

The function returns a path string. It does NOT verify the directory
exists. Existence validation is the consumer's responsibility.

### 4.4 Source-Time Variables

When `ci.sh` is sourced, the following variables are set:

```bash
CI_BOOT_NAME="$(ci_boot_name)"       # directory name only
CI_BOOT_DIR="$CI_PROJECT_ROOT/$CI_BOOT_NAME"  # absolute path
```

These are available to every consumer (generated hooks, CI scripts,
compliance checks) without re-computation. The source-time block MUST
NOT emit a FATAL error if the boot directory does not exist on disk
(per FR-10.6: `ci.sh` is a passive library; it exports path strings,
not existence checks).

---

## 5. Portable Helper APIs (`ci.sh`)

### 5.1 `ci_relative_path(FROM_DIR, TO_DIR)`

Computes relative path using pure bash string manipulation (no external
tools). Splits both paths on `/`, finds the common prefix, emits `../`
for each remaining component in `FROM`, then appends remaining components
from `TO`.

| from | to | result |
|------|----|--------|
| `/ws` | `/ws/projects/CI` | `projects/CI` |
| `/ws/projects/foo` | `/ws/projects/CI` | `../CI` |
| `/ws/projects/foo` | `/ws` | `../..` |
| `/ws` | `/ws` | `.` |
| `/a/b/c` | `/x/y/z` | `../../../x/y/z` |

### 5.2 `ci_sha256(FILE)`

Portable SHA-256 hash computation. Tries `sha256sum` (GNU coreutils /
Darwin port), then `shasum -a 256` (macOS built-in), then `python3` as
last resort. Prints the hash (lowercase hex, no filename). Returns 1 if
all methods fail.

Used by all bootstrap scripts for checksum verification of downloaded
artifacts. Replaces direct `sha256sum` calls that break on macOS where
`sha256sum` may not be available.

### 5.3 Replacement of `realpath --relative-to`

**Before** (`generate-hooks`):
```bash
_ci_rel="$(realpath --relative-to="$_repo_root" "$_CI_ROOT")"
```

**After:**
```bash
_ci_rel="$(ci_relative_path "$_repo_root" "$_CI_ROOT")"
```

This eliminates the GNU coreutils dependency that breaks on macOS BSD
`realpath`. No `grealpath` (Homebrew GNU coreutils) is introduced.

---

## 6. Boot Directory Resolution

### 6.1 Resolution Model

The boot directory is resolved as:

```
CI_PROJECT_ROOT + "/" + ci_boot_name()
```

- `CI_PROJECT_ROOT` is set by `ci.sh` at source-time (parent of `lib/`).
- `ci_boot_name()` returns `.boot-linux` or `.boot-macos` based on
  `uname -s`.
- NO environment variable override.
- NO fallback to a different platform's directory name.
- NO FATAL error at source-time if the directory doesn't exist.

### 6.2 Consumer Validation

Consumers that need the boot directory to exist MUST validate existence
themselves:

- **Bootstrap scripts**: create the directory (`mkdir -p`) before
  installing artifacts. FATAL if `mkdir` fails.
- **Generated hooks**: `ci_resolve_boot_path()` skips non-existent
  directories silently (per FR-4.5); the hook falls back to ambient PATH.
- **Compliance check**: emits INFO if inherited boot dir doesn't exist.

---

## 7. `ci_resolve_boot_path()`: Walk-Up Algorithm

### 7.1 Signature & Semantics

```bash
ci_resolve_boot_path <start-dir>
```

Pure function. Walks up from `<start-dir>` to `/`. At each level that
contains `$CI_BOOT_NAME/python-env/bin`, prepends it to the accumulator;
at each level that contains `$CI_BOOT_NAME/bin`, prepends it after the
python-env entry. Returns the accumulated string (colon-separated
entries, no trailing colon: caller prepends ":$PATH").

Then reads `moon.yml` at `<start-dir>` (if present) for
`project.inherited_boot_dirs` -- a list of PROJECT-ROOT paths (not
boot-dir paths). Each entry is resolved to a project root, then
`/$CI_BOOT_NAME/bin` is appended and checked for existence. Valid
entries are prepended AFTER the walk-up results so declared
inheritance wins (leftmost = highest precedence). Among
`inherited_boot_dirs` entries, LATER-listed entries are prepended
later → they land leftmost → they win.

Pure: no side effects, no network. The `cd ... && pwd -P` subshells
do not mutate the parent shell's CWD.

### 7.2 PRoot-safety

- No `< <(...)` process substitution (uses `ci_capture_lines` from
  `lib/ci.sh` which uses temp files).
- No `realpath` (uses `cd ... && pwd -P` for path resolution).
- NO `2>/dev/null` anywhere. In the `inherited_boot_dirs` loop, `cd
  "$entry"` against a non-existent path emits its native `bash: cd:
  <path>: No such file or directory` to stderr: that error IS visible
  to the user (not suppressed), and the `|| continue` propagates the
  skip per FR-3.3.
- No `|| true` outside the `$(...)` subshell.
- No `source` without `|| exit/return`.

### 7.3 Platform Awareness

The walk-up uses `$CI_BOOT_NAME` (set at source-time by `ci_boot_name()`)
at every level. On macOS, it searches for `.boot-macos/bin` and
`.boot-macos/python-env/bin`. On Linux, it searches for `.boot-linux/bin`
and `.boot-linux/python-env/bin`. The directory name is NEVER hardcoded.

### 7.4 Precedence Rule

PATH entries resolve leftmost-first (POSIX `execvp` semantics). The
accumulator prepends child-most-specific leftmost:

```
For repo at /ws/projects/GUARD with own .boot-macos/bin/ and
inherited_boot_dirs: ['../CI']:
  walk-up emits:    /ws/projects/GUARD/.boot-macos/bin:
  inherit prepend:  /ws/projects/CI/.boot-macos/bin
  final accum:      /ws/projects/CI/.boot-macos/bin:/ws/projects/GUARD/.boot-macos/bin:
```

The `inherited_boot_dirs` entry is prepended AFTER the walk-up loop
completes, so it lands LEFTMOST → highest precedence. If multiple
entries are declared, they prepend in list order; the LATER-listed entry
is prepended later → also lands leftmost → wins.

### 7.5 Idempotency & Termination

Re-running `ci_resolve_boot_path /path` with the same filesystem state
produces the same string byte-for-byte. No random, no timestamp, no
env-var-dependent behavior. The `while` loop is bounded by walking up to
`/` or empty dirname. O(depth): typically 3-5 iterations.

---

## 8. `moon.yml::project.inherited_boot_dirs`: Schema Specification

### 8.1 Schema (YAML)

```yaml
# moon.yml
project:
  name: 'workspace-guard'
  description: 'Rust repo with Python hooks; consumes boot from CI'
  # Boot-layout inheritance: project-root paths whose $CI_BOOT_NAME/bin
  # should be prepended to PATH via ci_resolve_boot_path(). Entries are
  # project roots (e.g. '../CI'), NOT boot-dir paths. The resolver
  # appends /$CI_BOOT_NAME/bin at runtime → platform-aware.
  inherited_boot_dirs:
    - '../CI'

language: 'rust'
layer: 'library'

dependsOn:
  - 'ci'
```

### 8.1.1 CI (Root Project)

```yaml
project:
  name: 'ci'
  inherited_boot_dirs: []    # CI is the root: no inherited boot dirs
dependsOn: []
```

### 8.2 Resolution Semantics

- `inherited_boot_dirs`: each entry is a PROJECT-ROOT path (e.g.
  `'../CI'`), relative to the repo root (the directory containing
  `moon.yml`). The resolver appends `/$CI_BOOT_NAME/bin` at runtime →
  platform-aware by construction.
- Entries MUST NOT include the boot directory name (`.boot-linux`,
  `.boot-macos`) or `bin/` suffix.
- If an entry's resolved `/$CI_BOOT_NAME/bin` does not exist on disk,
  the walker skips it silently (soft-optional per FR-3.3).

### 8.3 `dependsOn` Alignment

Any `inherited_boot_dirs` entry pointing at a sibling project root MUST
correspond to a matching `dependsOn` edge in the consuming repo's
`moon.yml`. The moon project id is derived by lowercasing the last path
component of the entry (e.g. `'../CI'` → `'ci'`). Reverse direction is
invalid (an `inherited_boot_dirs` entry pointing at a repo NOT in
`dependsOn` is an undeclared dependency -- silent breakage risk).

### 8.4 Validation Rules (in the compliance check)

| Field | OK | WARN | INFO |
|---|---|---|---|
| `inherited_boot_dirs` entry | Resolves to existing project root with `/$CI_BOOT_NAME/bin` | Entry's boot bin dir is world-writable | Entry's project root does not exist on disk (soft-optional) |
| `dependsOn` alignment | `dependsOn` includes derived moon id for each entry | `dependsOn` MISSING derived moon id | N/A |

### 8.5 Single Source of Truth

`moon.yml::project.inherited_boot_dirs` is the single source of truth
for boot inheritance. `generate-hooks`, Makefiles, compliance checks,
and any future tooling MUST read from this field. No file duplicates the
inheritance list. There is no separate `boot_layout.yaml` file.

---

## 9. `scripts/generate-hooks`: Implementation

### 9.1 Relative Path Computation

`realpath --relative-to` is replaced with `ci_relative_path()`:

```bash
_ci_rel="$(ci_relative_path "$_repo_root" "$_CI_ROOT")"
```

### 9.2 PATH-Prepend via `ci_resolve_boot_path()`

The generated hook preamble uses `ci_resolve_boot_path()`:

```bash
_boot_path="$(ci_resolve_boot_path "$_ROOT")"
[[ -n "$_boot_path" ]] && export PATH="${_boot_path}:$PATH"
```

This computes the boot-PATH-prepend at runtime by walking up from the
hook's repo root (`$_ROOT`) and reading `moon.yml::project.inherited_boot_dirs`.
The walk-up uses `$CI_BOOT_NAME` at every level (platform-aware).

### 9.3 Generated Hook Preamble

Every generated hook contains this platform-aware preamble:

```bash
#!/usr/bin/env bash
# AUTO-GENERATED by projects/CI/scripts/generate-hooks -- do not edit.
set -euo pipefail

_ROOT="$(git rev-parse --show-toplevel)"
cd "$_ROOT"
source "${_ROOT}/projects/CI/lib/ci.sh"
_boot_path="$(ci_resolve_boot_path "$_ROOT")"
[[ -n "$_boot_path" ]] && export PATH="${_boot_path}:$PATH"
```

### 9.4 Hook Entry Shape in Consumer Repos

For sibling-repo hooks (e.g. GUARD's `check-markdown-docs`), the
generated hook MUST emit `uv run --project ../CI --no-sync python -m
ci.check_markdown_docs ...` per FR-6.1. The `../CI` relative path is
supplied by the CONSUMER in its `.pre-commit-config.yaml::entry` string --
NOT injected by `generate-hooks`.

For own-repo hooks, the entry stays `uv run python -m ci.check_markdown_docs`
(no `--project`).

### 9.5 Workspace Root Marker Check

The tier resolution logic in `generate-hooks` uses `$CI_BOOT_NAME` for
the workspace root marker check:

```bash
[[ -d "$_workspace_root/$CI_BOOT_NAME" ]]
```

---

## 10. Workspace Root Detection (Dual-Marker)

### 10.1 Dual-Marker Pattern

All workspace root detection scripts accept EITHER `.boot-linux` OR
`.boot-macos` as a valid workspace marker:

```bash
if [[ (-d "$_cur/.boot-linux" || -d "$_cur/.boot-macos") && -d "$_cur/projects" ]]; then
    _ws_root="$_cur"
    break
fi
```

### 10.2 Affected Files

| File | Change |
|------|--------|
| `scripts/walk-projects` | Dual-marker acceptance at workspace root detection |
| `lib/checks_compliance.sh` | Dual-marker acceptance at workspace root walk-up |
| `ci/check_required_hooks_present.py` | Both markers in `WORKSPACE_MARKERS` list |
| `scripts/generate-hooks` | Use `$CI_BOOT_NAME` for workspace root marker check |

---

## 11. Bootstrap Scripts

### 11.1 CI Project Bootstrap Scripts

The CI project's bootstrap scripts (`bootstrap-gitleaks`,
`bootstrap-uv`, `bootstrap-rust`, `bootstrap-cloc`) source `ci.sh` and
use `$CI_BOOT_NAME` for the install target:

```bash
source "${CI_PROJECT_ROOT}/lib/ci.sh"
target_dir="${CI_PROJECT_ROOT}/${CI_BOOT_NAME}/bin"
```

### 11.2 Platform-Aware Download URLs

#### 11.2.1 `bootstrap-uv`

```bash
case "$(uname -s)" in
    Linux)  platform="unknown-linux-gnu" ;;
    Darwin) platform="apple-darwin" ;;
esac
tarball="uv-${arch}-${platform}.tar.gz"
```

#### 11.2.2 `bootstrap-gitleaks`

```bash
case "$(uname -s)" in
    Linux)  goos="linux" ;;
    Darwin) goos="darwin" ;;
esac
tarball="gitleaks_${GITLEAKS_VERSION}_${goos}_${arch}.tar.gz"
```

#### 11.2.3 `bootstrap-rust`

```bash
# Normalize arch: uname -m gives "arm64" on macOS, Rust needs "aarch64"
case "$(uname -m)" in
    x86_64|amd64)  _rust_arch="x86_64" ;;
    aarch64|arm64) _rust_arch="aarch64" ;;
esac
case "$(uname -s)" in
    Linux)  host_triple="$_rust_arch-unknown-linux-gnu" ;;
    Darwin) host_triple="$_rust_arch-apple-darwin" ;;
esac
```

### 11.3 Checksum Verification

All bootstrap scripts use `ci_sha256()` for portable SHA-256
verification:

```bash
actual_sha="$(ci_sha256 "${tmp}/${tarball}")"
if [[ "$actual_sha" != "$expected_sha" ]]; then
    _log "checksum mismatch: expected $expected_sha, got $actual_sha"
    return 1
fi
```

### 11.4 `bootstrap-rust` Idempotency

`bootstrap-rust` exports `RUSTUP_HOME` and `CARGO_HOME` BEFORE the
idempotency version check, so rustup proxies can resolve their home
directory and find the active toolchain:

```bash
export RUSTUP_HOME="$rust_home"
export CARGO_HOME="$rust_home"

# NOW check idempotency
if [[ -x "$rust_home/bin/rustc" && -x "$rust_home/bin/cargo" ]]; then
    "$rust_home/bin/rustc" --version ...
```

---

## 12. macOS System Dependencies

### 12.1 `scripts/bootstrap-homebrew`

Installs Homebrew (if absent) and brew-installs essential GNU tools:

| Package | Purpose |
|---------|---------|
| `bash` | bash 5.x (macOS ships 3.2, lacks `local -n` namerefs) |
| `coreutils` | realpath, sha256sum, ghead, gtail (via `libexec/gnubin`) |
| `gnu-sed` | GNU sed (macOS BSD sed breaks `t` label branching) |
| `findutils` | GNU find (macOS ships BSD find) |
| `pkg-config` | library detection for native builds |

**Sudo model**: Homebrew installer requires sudo ONLY on first install.
Once Homebrew exists, `brew install` runs without sudo. The script
detects existing Homebrew at `/opt/homebrew/bin/brew` (Apple Silicon) or
`/usr/local/bin/brew` (Intel) and skips the installer.

**No-op on Linux**: exits 0 immediately if `uname -s` is not `Darwin`.

### 12.2 `scripts/install-system-deps`

Platform-aware system dependency resolver:

| Platform | Check | Install |
|----------|-------|---------|
| Linux | `dpkg -s <apt_package>` | `$SUDO apt-get install -y <pkgs>` |
| macOS | `brew list --versions <brew_package>` | `brew install <pkgs>` (no sudo) |

**Platform filtering**: entries in `config/system-deps.yaml` with
`platforms: [linux]` are skipped on macOS (emit `[SKIPPED]`).

**Modes**:
- `--check`: report only, exit 1 if missing
- `--print`: print install command (no sudo)
- `--install`: run install inline
- `--export-missing FILE`: write missing apt pkgs (Linux only)
- `--install-only FILE`: read file, run apt install (Linux only)

### 12.3 `config/system-deps.yaml` Schema

```yaml
requires:
  - check_cmd: curl
    apt_package: curl          # Linux (apt)
    brew_package: curl         # macOS (Homebrew)
    description: curl (HTTP client)

  - check_type: apt-package
    apt_package: ca-certificates
    description: ca-certificates (TLS root certs)
    platforms: [linux]         # Linux only -- skipped on macOS

  - check_cmd: pkg-config
    apt_package: pkg-config    # Linux (apt)
    brew_package: pkg-config   # macOS (Homebrew)
    description: pkg-config (library detection)
```

**Fields**:
- `apt_package`: Debian package (Linux only)
- `brew_package`: Homebrew formula (macOS only)
- `platforms`: list of supported platforms (e.g. `[linux]`, `[darwin]`).
  Omit = all platforms.
- `optional`: true/false (default false)
- `bootstrap_script`: hermetic install path (flags as bootstrap-needed)

---

## 13. Root Makefile

### 13.1 Platform Detection

```makefile
_OS := $(shell uname -s)
_HB_PREFIX := $(if $(wildcard /opt/homebrew),/opt/homebrew,$(if $(wildcard /usr/local),/usr/local))

SHELL := $(if $(wildcard $(_HB_PREFIX)/bin/bash),$(_HB_PREFIX)/bin/bash,/bin/bash)

export PATH := $(_HB_PREFIX)/opt/coreutils/libexec/gnubin:$(_HB_PREFIX)/opt/gnu-sed/libexec/gnubin:$(_HB_PREFIX)/opt/findutils/libexec/gnubin:$(_HB_PREFIX)/bin:$(PATH)
```

On macOS, `SHELL` uses Homebrew bash 5.x when available (for nameref
support). The gnubin directories are prepended to `PATH` so GNU tools
shadow BSD equivalents. On Linux, `_HB_PREFIX` is empty, `SHELL` is
`/bin/bash`, and the PATH prepend is a no-op.

### 13.2 Computed Boot Name Variable

```makefile
BOOT_NAME := $(if $(filter Darwin,$(_OS)),.boot-macos,.boot-linux)
BOOT_BIN := $(CURDIR)/$(BOOT_NAME)/bin
```

Uses `$(if ...)` + `$(filter ...)` -- no `sed` (avoids BSD sed `t` label
branching incompatibility).

### 13.3 Preflight

```makefile
preflight:
    @$(SHELL) -c '[ "$${BASH_VERSINFO[0]}" -gt 4 ] || ...' \
        || { echo "ERROR: bash 4.3+ required..."; echo "  On macOS: run 'make init'..."; exit 1; }
```

Uses `$(SHELL)` (not `bash`) so the version check runs against the
Makefile's actual shell (Homebrew bash 5.x on macOS after `make init`).

### 13.4 Init Target

```makefile
init:
    @bash scripts/bootstrap-homebrew    # macOS only (no-op on Linux)
    bash scripts/install-system-deps --install
    @if ! command -v cargo > /dev/null 2>&1; then bash scripts/bootstrap-rust; fi
```

---

## 14. Compliance Check: `ci/check_boot_venv_layout.py`

### 14.1 Invocation

```bash
uv run python -m ci.check_boot_venv_layout [PROJECT_DIR]
```

`PROJECT_DIR` defaults to CWD. The module scans `<PROJECT_DIR>/moon.yml`.

### 14.2 Output Format

One row per finding:
```
OK    moon.yml:16   inherited_boot_dirs entry '../CI' resolves to /ws/projects/CI/.boot-macos/bin
WARN  moon.yml:31   inherited_boot_dirs entry '../CI': dependsOn MISSING 'ci'
INFO  moon.yml      inherited_boot_dirs is empty: repo has no inherited boot dirs
```

Trailing summary:
```
boot-layout: 5 ok, 1 warning, 2 info
```

Exit code: always `0` (non-blocking; per FR-7.7). Infrastructure errors
exit `2`.

### 14.3 Checks Performed

1. `moon.yml` exists? If not → emit `INFO` and exit 0.
2. Parse YAML; validate `MoonYml` schema (pydantic). Malformed → `WARN`.
3. For each `inherited_boot_dirs` entry: resolve to project root. If
   project root doesn't exist → `INFO` (soft-optional). If exists but
   no `/$CI_BOOT_NAME/bin` → `INFO`. If boot bin exists → `OK`.
4. For each existing inherited boot dir: check if `bin/` is
   world-writable. If world-writable → `WARN`.
5. For each `inherited_boot_dirs` entry: derive moon project id (last
   path component lowercased). Verify it's in `dependsOn`. Missing →
   `WARN`.
6. Scan `.pre-commit-config.yaml` for `uv run --project <path> --no-sync
   python -m ci.<check>` entries. For each, verify
   `<path>/pyproject.toml` and `<path>/.venv/bin/python` exist. Missing
   → `WARN`. Present → `OK`.
7. Score summary + exit 0.

### 14.4 Dependencies

The module imports `pyyaml`, `pydantic` (already in CI's
`pyproject.toml`), `pathlib`, and standard library only.

---

## 15. moon Integration Details

### 15.1 Custom Metadata Field: `project.inherited_boot_dirs`

Per moon v2 custom-metadata docs, arbitrary keys under `project:` are
persisted in the project graph as informational metadata; moon ignores
them for graph execution.

```yaml
project:
  name: 'workspace-guard'
  inherited_boot_dirs:
    - '../CI'
```

The compliance check (§14) verifies consistency between
`inherited_boot_dirs` and `dependsOn`.

### 15.2 `dependsOn` and `inherited_boot_dirs` Alignment

Any `inherited_boot_dirs` entry pointing at a sibling project root MUST
correspond to a matching `dependsOn` edge in the consuming repo's
`moon.yml`. The moon project id is derived by lowercasing the last path
component of the entry.

### 15.3 Mismatch Reporting Flow

```
WARN  moon.yml    inherited_boot_dirs entry '../CI' but dependsOn
                  does not include 'ci'; add 'ci' to dependsOn or
                  remove '../CI' from inherited_boot_dirs.
```

---

## 16. Edge Cases & Decisions

### 16.1 `inherited_boot_dirs` with overlapping walk-up discovery

If a walk-up level has a boot dir AND a repo declares `inherited_boot_dirs`
pointing at that same project, duplicate PATH entries are produced. POSIX
shells tolerate this; resolution is unaffected. The walker does NOT
deduplicate.

### 16.2 Repo with `inherited_boot_dirs: []`

CI (the root project) has `inherited_boot_dirs: []`. The compliance check
emits `INFO`. Hooks use only walk-up-discovered boot dirs (if any).

### 16.3 Hook entry using `--project` to non-CI sibling

The compliance check validates ANY `uv run --project <path>` reference
in `.pre-commit-config.yaml` resolves to a directory with
`pyproject.toml` and `.venv/bin/python`. This generalizes FR-6 to any
Python-providing sibling.

### 16.4 Missing boot directory at source-time

`ci.sh` exports `CI_BOOT_DIR` and `CI_BOOT_NAME` at source-time
regardless of whether the boot directory exists on disk. The library
provides path strings; consumers validate existence.

### 16.5 `uname -m` → Rust arch normalization

`uname -m` returns `arm64` on macOS ARM64, but Rust uses `aarch64` for
the host triple. `bootstrap-rust` normalizes: `arm64` → `aarch64`.

### 16.6 BSD sed `t` label incompatibility

macOS BSD sed does not support the `t` label branching syntax used in
GNU sed. The Makefile `BOOT_NAME` computation uses `$(if ...)` +
`$(filter ...)` instead of `sed`, avoiding this incompatibility entirely.

---

## 17. File Map

| File | Purpose | Key Changes |
|------|---------|-------------|
| `lib/ci.sh` | Core library | `ci_platform_name()`, `ci_boot_name()`, `ci_boot_dir()`, `ci_relative_path()`, `ci_resolve_boot_path()`, `ci_sha256()`; `CI_BOOT_NAME`/`CI_BOOT_DIR` at source-time |
| `scripts/generate-hooks` | Hook generator | `ci_relative_path()` for `_ci_rel`; `ci_resolve_boot_path("$_ROOT")` for PATH-prepend |
| `scripts/bootstrap-homebrew` | macOS Homebrew installer | Install Homebrew + bash 5.x + coreutils/gnu-sed/findutils/pkg-config |
| `scripts/bootstrap-uv` | uv installer | `$CI_BOOT_NAME/bin/` target; `ci_sha256()` for checksum; platform-aware URL |
| `scripts/bootstrap-rust` | Rust installer | `$CI_BOOT_NAME/` target; platform-aware host triple; `RUSTUP_HOME` before idempotency check |
| `scripts/bootstrap-gitleaks` | gitleaks installer | `$CI_BOOT_NAME/bin/` target; `ci_sha256()`; platform-aware tarball name |
| `scripts/bootstrap-cloc` | cloc installer | `$CI_BOOT_NAME/bin/` target; `ci_sha256()` |
| `scripts/install-system-deps` | System dep resolver | Platform-aware (apt/brew); `brew_package` + `platforms` support |
| `config/system-deps.yaml` | System dep declarations | `brew_package` field; `platforms` field; inline `# Linux`/`# macOS` comments |
| `Makefile` | CI makefile | `$(if ...)` BOOT_NAME; Homebrew bash as SHELL; gnubin PATH; `bootstrap-homebrew` in init |
| `ci/check_boot_venv_layout.py` | Compliance audit | Reads `moon.yml::project.inherited_boot_dirs`; 7 checks; always exits 0 |
| `ci/_boot_layout_helpers.py` | Compliance helpers | `MoonYml`, `MoonProject`, `derive_moon_id_from_inherited()`, `scan_precommit_project_refs()` |
| `moon.yml` (CI) | CI moon config | `inherited_boot_dirs: []`, `dependsOn: []` |
| `moon.yml` (GUARD) | GUARD moon config | `inherited_boot_dirs: ['../CI']`, `dependsOn: ['ci']` |
| `moon.yml` (DATAOPS) | DATAOPS moon config | `inherited_boot_dirs: ['../CI']`, `dependsOn: ['ci']` |
| `.gitignore` | Git ignore | `.boot-linux/` + `.boot-macos/` |
| `ruff.toml` | Linter exclude | `.boot-linux` + `.boot-macos` |
| `docs/requirements/REQ-BOOT-LAYOUT.md` | Requirements | This doc pair |
| `docs/specifications/SPEC-BOOT-LAYOUT.md` | Specification | This doc pair |

### Deleted Files

| Path | Reason |
|---|---|
| `config/boot_layout.yaml` (CI) | Eliminated -- replaced by `moon.yml::project.inherited_boot_dirs` |
| `config/boot_layout.yaml` (GUARD) | Eliminated -- replaced by `moon.yml::project.inherited_boot_dirs` |
| `config/boot_layout.schema.yaml` (CI) | Eliminated -- schema now documented in SPEC §8 |