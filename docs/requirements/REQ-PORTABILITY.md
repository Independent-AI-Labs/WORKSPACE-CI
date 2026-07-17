# REQ-PORTABILITY: Shell Layer Portability Across Virtualization Layers

**Date:** 2026-07-17
**Status:** Active
**Type:** Requirements
**Specification:** [SPEC-PORTABILITY](../specifications/SPEC-PORTABILITY.md)

> Mandates that the workspace-ci shell layer ([`lib/*.sh`](../../lib/),
> [`scripts/*`](../../scripts/)) runs on any Linux virtualization layer:
> bare metal, Docker, Kubernetes, PRoot, bwrap, firejail, chroot, and any
> combination thereof. The single hard rule is a total ban on bash process
> substitution, which opens `/dev/fd/NN` by path and breaks under PRoot,
> sandboxes without `/proc`, and chroots without a populated `/dev/fd/`.
> Temp-file-based capture helpers in [`lib/ci.sh`](../../lib/ci.sh) are the
> mandated replacement. Out of scope: Python code, web/ TypeScript, and
> non-shell tooling.

---

**Cross-references:**
- [SPEC-PORTABILITY](../specifications/SPEC-PORTABILITY.md): companion specification
- [`lib/ci.sh`](../../lib/ci.sh): owns `ci_capture_lines` / `ci_capture_pipe`
- [`lib/checks_files.sh`](../../lib/checks_files.sh): owns `ci_check_portable_shell` enforcement
- [`config/required_hooks.yaml`](../../config/required_hooks.yaml): registers `check-portable-shell` (mandatory, pre-commit)
- [`tests/unit/test_portable_shell.sh`](../../tests/unit/test_portable_shell.sh): unit test

---

## 1. Purpose & Scope

### 1.1 Purpose
Guarantee that every shell script in the CI layer executes correctly on
restricted virtualization layers where path-based file-descriptor access
(`/dev/fd/NN`) is broken, without sacrificing correctness on normal Linux
systems.

### 1.2 Scope
**This document OWNS the requirements for:**
- The process-substitution ban in `lib/*.sh` and `scripts/*`
- The mandated temp-file capture idioms replacing process substitution
- Allowed portable idioms
- The minimum bash version
- Enforcement via pre-commit hook and unit test

**This document DOES NOT:**
- Cover Python (`ci/`, `lib/*.py`) or TypeScript (`web/`) portability
- Define hook generation semantics (see [RUNBOOK-HOOKS](../runbooks/RUNBOOK-HOOKS.md))
- Define boot-directory layout (see [REQ-BOOT-LAYOUT](REQ-BOOT-LAYOUT.md))

### 1.3 Terminology
| Term | Definition |
|------|------------|
| Process substitution | Bash `<(cmd)`, `>(cmd)`, and redirect forms `< <(cmd)`, `> >(cmd)`; requires opening `/dev/fd/NN` by path |
| Virtualization layer | Any of: bare metal, Docker, Kubernetes, PRoot, bwrap, firejail, chroot, restricted container runtimes |
| nameref | Bash `local -n` name-reference variable (requires bash 4.3+) |
| Capture helper | `ci_capture_lines` or `ci_capture_pipe` from `lib/ci.sh` |

## 2. Functional Requirements

### FR-1: Process Substitution Ban
| ID | Requirement |
|----|-------------|
| FR-1.1 | Shell code under `lib/*.sh` and `scripts/*` MUST NOT use process substitution in any form: `< <(...)`, `> >(...)`, pipe-fed `<(...)` or `>(...)`, or standalone `<(...)` / `>(...)` as command arguments. |
| FR-1.2 | The ban MUST be enforced by `ci_check_portable_shell`, registered as `check-portable-shell` (mandatory, stage `pre-commit`) in `config/required_hooks.yaml`. |
| FR-1.3 | The enforcement scan MUST skip comment lines, so prose mentioning the pattern in comments does not false-positive. |

### FR-2: Mandated Replacement Idioms
| ID | Requirement |
|----|-------------|
| FR-2.1 | Code that needs a command's stdout as an array MUST use `ci_capture_lines <array-nameref> -- <command...>` instead of `while read ... done < <(command)`. |
| FR-2.2 | Code that needs a pipeline's stdout as an array MUST use `ci_capture_pipe <array-nameref> <snippet> [args...]`. The snippet MUST be a single-quoted static string literal, never user input (it is passed to `eval`). |
| FR-2.3 | When the producer needs outer-scope array variables that cannot pass through a subshell snippet, code MUST use the explicit temp-file pattern: subshell redirect into a `mktemp` file, read loop over the file, `rm -f`. |
| FR-2.4 | Temp files MUST be created with `mktemp` (0600 permissions) and MUST be removed after use; the capture helpers remove theirs via a `RETURN`/`INT`/`TERM` trap plus explicit `rm -f`. |
| FR-2.5 | `ci_capture_lines` and `ci_capture_pipe` MUST preserve the producer's exit code and MUST skip blank lines when populating the target array. |

### FR-3: Allowed Idioms
| ID | Requirement |
|----|-------------|
| FR-3.1 | Here-strings (`<<< "$var"`) MAY be used freely (implemented via pipe + dup2, no `/dev/fd` path open). |
| FR-3.2 | Command substitution (`$(cmd)`) MAY be used freely. |
| FR-3.3 | Pipes (`cmd1 | cmd2`) MAY be used, but MUST NOT be relied on to mutate outer-scope variables (the consumer runs in a subshell); use FR-2.1/FR-2.2 helpers for that case. |
| FR-3.4 | `mapfile` / `readarray` MAY be used when reading from a file path, never from process substitution. |

## 3. Non-Functional Requirements
| ID | Requirement |
|----|-------------|
| NFR-1.1 | The capture helpers MUST NOT spawn path-based `/dev/fd` opens on any supported virtualization layer. |
| NFR-1.2 | `ci_check_portable_shell` MUST complete without spawning subprocesses beyond reading the target files (pure bash line scan). |

## 4. Constraints
| ID | Constraint | Source |
|----|-----------|--------|
| C-1 | bash 4.3+ required (nameref `local -n` in the capture helpers) | lib/ci.sh header comment; `make preflight` verifies |
| C-2 | Scanned file set: `lib/*.sh` plus all regular files in `scripts/` except `*.yaml`, `*.yml`, `*.json`, `*.md`, `*.txt`, `*.toml` | lib/checks_files.sh `ci_check_portable_shell` |

## 5. Assumptions
| ID | Assumption |
|----|-----------|
| A-1 | bash 4.3+ is present on every non-ancient Linux distribution and on macOS via Homebrew bash 5.x. |
| A-2 | `mktemp` behaves identically on all supported layers. |

## 6. Open Questions
None.

## 7. Verification Matrix
| # | Test | Maps to |
|---|------|---------|
| V1 | `ci_check_portable_shell` pre-commit hook (scans `lib/`, `scripts/`) | FR-1.1, FR-1.2, FR-1.3 |
| V2 | [`tests/unit/test_portable_shell.sh`](../../tests/unit/test_portable_shell.sh) | FR-1.1, FR-2.5 |

## 8. Implementation Status
| Item | Status | Evidence |
|------|--------|----------|
| FR-1.1 ban | Implemented | no process substitution in `lib/`, `scripts/` (enforced) |
| FR-1.2/FR-1.3 enforcement | Implemented | lib/checks_files.sh `ci_check_portable_shell`; config/required_hooks.yaml:132 |
| FR-2.1/FR-2.2 helpers | Implemented | lib/ci.sh `ci_capture_lines` (line 277), `ci_capture_pipe` (line 309) |
| FR-2.4/FR-2.5 helper semantics | Implemented | lib/ci.sh (mktemp 0600, trap cleanup, exit-code preservation, blank skip) |
| FR-3 allowed idioms | Implemented | in use across `lib/`, `scripts/` |
| V2 unit test | Implemented | tests/unit/test_portable_shell.sh |
