# SPEC-PORTABILITY: Shell Layer Portability Implementation

**Date:** 2026-07-17
**Status:** Active
**Type:** Specification
**Requirements:** [REQ-PORTABILITY](../requirements/REQ-PORTABILITY.md)

> Implements the shell portability contract for [`lib/*.sh`](../../lib/)
> and [`scripts/*`](../../scripts/): zero process substitution, temp-file
> capture helpers (`ci_capture_lines` / `ci_capture_pipe`) in
> [`lib/ci.sh`](../../lib/ci.sh), enforced by `ci_check_portable_shell`
> (mandatory pre-commit hook) and
> [`tests/unit/test_portable_shell.sh`](../../tests/unit/test_portable_shell.sh).
> Requires bash 4.3+ (nameref).

---

**Cross-references:**
- [REQ-PORTABILITY](../requirements/REQ-PORTABILITY.md): companion requirements
- [`lib/ci.sh`](../../lib/ci.sh): capture helpers, shared library sourced by all scripts
- [`lib/checks_files.sh`](../../lib/checks_files.sh): `ci_check_portable_shell` scanner
- [`config/required_hooks.yaml`](../../config/required_hooks.yaml): hook registration (`check-portable-shell`, mandatory)
- [`tests/unit/test_portable_shell.sh`](../../tests/unit/test_portable_shell.sh): unit test, run by `tests/run_tests.sh`

---

## 1. Overview

Bash process substitution (`< <(cmd)`, `>(cmd)`) is correct, idiomatic
bash on a normal Linux system. However, it requires opening `/dev/fd/NN`
by path to hand the file descriptor to the consuming command. This
path-based fd access is broken under:

- **PRoot** (ptrace-based chroot, used on Android/Termux Ubuntu): does
  not emulate `/dev/fd/` symlinks correctly.
- **bwrap / firejail** sandboxes without `/proc` mounted.
- **chroot** environments without a populated `/dev/fd/`.
- **Some container runtimes** with restricted `/proc` and `/dev` layouts.

Since workspace-ci is a security product that may be installed on any of
these, the shell layer avoids process substitution entirely.

## 2. Architectural Principles

### 2.1 Temp files are the gold standard
A `mktemp` file (0600) decouples producer from consumer with a real path
that works on every POSIX system and every virtualization layer. Every
capture idiom in this spec reduces to a temp file.

### 2.2 Subshells inherit; pipelines do not mutate
A subshell `( ... )` inherits the parent's variables (including arrays),
so producers can read outer-scope data. A pipeline consumer runs in a
subshell, so it cannot write outer-scope data: capture into an array via
the helpers instead.

### 2.3 Fail-closed enforcement
The ban is enforced at commit time by a mandatory hook and in CI by a
unit test. Comment lines are skipped by the scanner so prose (like this
document's source comments) does not false-positive.

## 3. System Diagram

```
producer command/pipeline          consumer
+---------------------+   mktemp   +---------------------------+
| "$@" or ( eval ... )| ---------> | while IFS= read -r line    |
|        ...          |  (0600)    |   [[ -n ]] && arr+=()      |
+---------------------+            +---------------------------+
        | exit code preserved (returned to caller)
        v
  trap RETURN/INT/TERM: rm -f tmp
```

## 4. Capture Helper API

Defined in [`lib/ci.sh`](../../lib/ci.sh).

### 4.1 `ci_capture_lines <array-nameref> -- <command...>`

Runs `<command>`, captures stdout lines into `<array-nameref>` (blank
lines skipped). Preserves the producer's exit code. Uses a `mktemp` temp
file (0600), removed via a `RETURN`/`INT`/`TERM` trap plus explicit
`rm -f`.

| Property | Value |
|----------|-------|
| Parameter 1 | nameref to target array (`local -n`) |
| Parameter 2 | literal `--` (optional, stripped if present) |
| Parameters 3+ | command and arguments, executed as `"$@"` |
| Return | producer's exit code |

```bash
local exts=()
ci_capture_lines exts -- ci_read_yaml_list "$config" "extensions"
```

### 4.2 `ci_capture_pipe <array-nameref> <snippet> [args...]`

Like `ci_capture_lines` but runs `<snippet>` via `eval` in a subshell:
for pipelines. The subshell inherits all shell functions and variables
from the parent, so the snippet can call `ci_file_list`,
`ci_filter_ext`, etc. The snippet's `"$@"` / `"$1"..` refer to the args
passed after the snippet.

| Property | Value |
|----------|-------|
| Parameter 1 | nameref to target array |
| Parameter 2 | snippet string, run as `( eval "$snippet" )` |
| Parameters 3+ | args visible to the snippet as `"$@"` |
| Return | pipeline's exit code |
| SECURITY | `<snippet>` MUST be a hardcoded single-quoted string literal, NEVER user input (it is passed to `eval`) |

```bash
local files=()
ci_capture_pipe files 'ci_file_list "$@" | ci_filter_ext .py .sh' "$@"
```

### 4.3 Explicit temp-file pattern (complex nested producers)

If the producer needs outer-scope array variables that cannot be passed
through the snippet args, use the temp-file pattern directly:

```bash
local tmp; tmp=$(mktemp) || return 1
(
    cd "$dir" && git ls-files | while IFS= read -r p; do
        for e in "${exts[@]}"; do
            [[ "$p" == *"$e" ]] && echo "$dir/$p" && break
        done
    done
) > "$tmp" 2>/dev/null
while IFS= read -r f; do
    [[ -n "$f" ]] && files+=("$f")
done < "$tmp"
rm -f "$tmp"
```

## 5. Detection and Enforcement

### 5.1 `ci_check_portable_shell` (pre-commit hook)

Defined in [`lib/checks_files.sh`](../../lib/checks_files.sh). Registered
in [`config/required_hooks.yaml`](../../config/required_hooks.yaml) as
`check-portable-shell` (`kind: shell`, `stage: pre-commit`,
`pass_filenames: false`, `always_run: true`, `mandatory: true`).

Scanned file set:

- `lib/*.sh`
- every regular file in `scripts/`, excluding `*.yaml`, `*.yml`,
  `*.json`, `*.md`, `*.txt`, `*.toml`

Detection patterns (ERE, matched per line, comment lines skipped):

| Pattern | Matches |
|---------|---------|
| `[<][[:space:]]*[<][(]` | `< <(...)` |
| `[>][[:space:]]*[>][(]` | `> >(...)` |
| `[|][[:space:]]*[<][(]` | pipe into `<(...)` |
| `[|][[:space:]]*[>][(]` | pipe into `>(...)` |
| `[[:space:]][<][(][^)]*[)][[:space:]]` | standalone `<(...)` argument |
| `[[:space:]][>][(][^)]*[)][[:space:]]?$` | standalone `>(...)` at line end |

On any match the hook fails with
"Process substitution found (not portable across virtualization layers)"
plus the offending `file:line` list, pointing to the capture helpers.

### 5.2 Unit test

[`tests/unit/test_portable_shell.sh`](../../tests/unit/test_portable_shell.sh)
runs under `tests/run_tests.sh` and asserts:

- no process substitution in `lib/` or `scripts/`
- `ci_capture_lines` populates the array, skips blanks, preserves the
  producer exit code
- `ci_capture_pipe` captures pipeline output correctly

## 6. Allowed Idioms

These idioms are portable and used freely:

- **Here-strings** (`<<< "$var"`): implemented via pipe + dup2, no
  `/dev/fd` path open. Works everywhere.
- **Command substitution** (`$(cmd)`): no fd path dependency.
- **Pipes** (`cmd1 | cmd2`): standard POSIX, works everywhere (the
  consumer runs in a subshell, so do not use pipes when you need to
  mutate outer-scope variables: use `ci_capture_lines` instead).
- **Temp files** (`mktemp`, `< "$tmp"`): work on every POSIX system and
  every virtualization layer.
- **`mapfile` / `readarray`** from temp files: portable when reading
  from a file path, not from process substitution.

## 7. Bash Version Requirement

`ci_capture_lines` and `ci_capture_pipe` use nameref (`local -n`), which
requires **bash 4.3+** (released 2014). This is present on every
non-ancient Linux distribution; on macOS, generated hooks prefer
Homebrew bash 5.x (see [RUNBOOK-HOOKS](../runbooks/RUNBOOK-HOOKS.md)).
The `make preflight` target verifies the bash version.

## 8. Edge Cases & Decisions

| Case | Decision |
|------|----------|
| Pattern mentioned in a comment | Scanner skips `^[[:space:]]*#` lines: allowed |
| `guard-drift.sh` local capture helper | Uses its own temp-file capture (same contract), not the ci.sh helpers, because the guard library is standalone |
| Snippet quoting | Always single-quoted static literals at call sites (`eval` injection surface) |
| Blank stdout lines | Skipped by both helpers (arrays contain no empty elements) |

## 9. File Map

| File | Purpose | Key Changes |
|------|---------|-------------|
| [`lib/ci.sh`](../../lib/ci.sh) | Shared shell library | Owns `ci_capture_lines`, `ci_capture_pipe` |
| [`lib/checks_files.sh`](../../lib/checks_files.sh) | File-level checks | Owns `ci_check_portable_shell` |
| [`config/required_hooks.yaml`](../../config/required_hooks.yaml) | Hook registry | `check-portable-shell` entry (mandatory) |
| [`tests/unit/test_portable_shell.sh`](../../tests/unit/test_portable_shell.sh) | Unit test | Ban assertion + helper behavior tests |

## 10. Implementation Status

| Component | Status | Evidence |
|-----------|--------|----------|
| Capture helpers | Implemented | lib/ci.sh `ci_capture_lines` (line 277), `ci_capture_pipe` (line 309) |
| Enforcement hook | Implemented | lib/checks_files.sh `ci_check_portable_shell`; config/required_hooks.yaml:132 |
| Unit test | Implemented | tests/unit/test_portable_shell.sh |
| Codebase compliance | Implemented | no process substitution in `lib/`, `scripts/` (hook-enforced) |
