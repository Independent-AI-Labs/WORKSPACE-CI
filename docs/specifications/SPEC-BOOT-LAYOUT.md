# SPEC-BOOT-LAYOUT: Hierarchical `.boot-linux/` and `.venv/` Toolchain Implementation

**Date:** 2026-06-26
**Status:** IMPLEMENTED
**Type:** Specification
**Requirements:** [REQ-BOOT-LAYOUT](../requirements/REQ-BOOT-LAYOUT.md)

> **Implementation status:** Complete (Phases 1-3 and Phase 5). Code changes
> scoped and sequenced in §11 (Phased Implementation) have been implemented:
> `ci_resolve_boot_path()` lives in `lib/ci.sh`, `generate-hooks` uses it,
> `config/boot_layout.yaml` is shipped, `ci/check_boot_venv_layout.py` exists,
> `scripts/bootstrap-python-env` is deleted, `bootstrap-gitleaks` installs to
> CI's own `.boot-linux/bin/`, and `scripts/bootstrap-uv` + `scripts/bootstrap-rust`
> exist for Phase 5. Phase 4 (VM-side alignment) is a separate concern owned
> by WORKSPACE-VM.

---

**Cross-references:**

- [REQ-BOOT-LAYOUT](../requirements/REQ-BOOT-LAYOUT.md): companion requirements (FR-/NFR-level acceptance criteria)
- [HOOKS.md](../HOOKS.md): hook generation contract
- [`lib/ci.sh`](../../lib/ci.sh): where `ci_resolve_boot_path()` will live
- [`scripts/generate-hooks`](../../scripts/generate-hooks): the file containing the hardcoded PATH-prepend to be replaced
- [`config/banned_words.yaml`](../../config/banned_words.yaml): the `python3?` ban that motivates the `uv run --project` contract
- [`ci/check_required_hooks_present.py`](../../ci/check_required_hooks_present.py): the model for the new `check_boot_venv_layout.py` companion check

---

## 1. Overview

This SPEC implements the boot-layout contract from REQ-BOOT-LAYOUT. It introduces:

1. A `ci_resolve_boot_path()` pure function in `lib/ci.sh` that replaces the
   hardcoded PATH-prepend in `scripts/generate-hooks`.
2. A `config/boot_layout.yaml` schema (one file per repo that uses the
   boot/venv pattern) declaring own `boot_dir`, `venv_dir`, and `inherit:`
   list of ancestor `.boot-linux/` dirs.
3. A new `ci/check_boot_venv_layout.py` non-blocking compliance audit.
4. Deletion of `scripts/bootstrap-python-env`, the `install-python-env`
   Makefile target + manifest entry + `sync` prereq, the
   `/root/.boot-linux/python-env/` venv and `/root/.boot-linux/bin/python`
   symlink (session pollution).
5. Reversion of `.pre-commit-config.yaml` hook entries that stripped `uv run`
   during the 2026-06-25 session (and eradication of the `2>/dev/null`
   swallows in `check-dependency-versions`/`check-duplicate-dependencies`).
6. GUARD's `.pre-commit-config.yaml::check-markdown-docs.entry` changes from
   bare `python -m ...` to `uv run --project ../CI --no-sync python -m ...`.

Phase 5 added `scripts/bootstrap-uv` and `scripts/bootstrap-rust` to
WORKSPACE-CI for Rust toolchain self-sufficiency (see §11 Phase 5).

---

## 2. Architectural Principles

### 2.1 Inheritance, not contribution

A repo reads from ancestor `.boot-linux/bin/` via PATH walk-up. A repo
NEVER writes into an ancestor's, sibling's, or child's `.boot-linux/`. The
only `.boot-linux/` a repo writes into is its own (declared via
`config/boot_layout.yaml::boot_dir`).

This is the asdf `.tool-versions` upward-lookup model adapted to boot
directories: each ancestor level declares (via the existence of its `.boot-linux/`)
what tools it provides; descendants discover those by walking up the tree.
Siblings (same-level repos under a shared parent) are NOT reachable via walk-up;
cross-sibling boot sharing requires an EXPLICIT `inherit:` entry in the
consumer's `boot_layout.yaml` (see §4.1) plus a matching `moon.yml::dependsOn`
edge (see §8.2). Crucially, despite "explicit", the sibling's `.boot-linux/`
remains READ-ONLY: the consumer never writes into it.

### 2.2 Configuration over convention

Where a `.boot-linux/` lives is configuration, not convention. A repo can
declare `boot_dir: ../shared-boot/` if it wants a sibling location; the
compliance check verifies the path resolves. The walk-up is auto-discovery
ON TOP of the explicit declaration: declared `inherit:` entries win
(leftmost after walk-up entries).

### 2.3 `.venv/` is private; cross-repo Python via `uv run --project`

No venv is shared, symlinked, or PATH-exposed across project boundaries.
Cross-repo Python invocation uses uv's documented `--project` flag
(upstream URL: <https://docs.astral.sh/uv/reference/cli/index.md>) so the
sibling's `.venv/` is used read-only (with `--no-sync` to prevent mutation
of the sibling's `uv.lock`). Bare `python` from PATH remains banned
(`banned_words.yaml:234-236`).

### 2.4 Pure OS-path idioms

`ci_resolve_boot_path()` uses only directory existence checks + PATH string
construction. No symlinks-following, no `realpath`, no network, no python
subprocess. This keeps it PRoot-safe, sandbox-safe, and hermetic.

### 2.5 Non-blocking compliance

`check_boot_venv_layout.py` is advisory. Failures never block pre-commit.
A fresh checkout where `.venv/` doesn't exist yet must not be blocked by
the layout audit (chicken-and-egg avoidance).

---

## 3. `ci_resolve_boot_path()`: Algorithm Specification

### 3.1 Signature & Semantics

```bash
# lib/ci.sh (added)
#
# ci_resolve_boot_path <start-dir>
#   Pure function. Walks up from <start-dir> to /. At each level that
#   contains .boot-linux/python-env/bin, prepends it to the accumulator;
#   at each level that contains .boot-linux/bin, prepends it after the
#   python-env entry. Returns the accumulated string (colon-separated
#   entries, no trailing colon: caller prepends ":$PATH").
#
#   Then reads config/boot_layout.yaml (if present at <start-dir>) and
#   prepends each inherit: entry's bin subdir AFTER the walk-up results.
#   inherit entries are relative to <start-dir> (repo root), NOT CWD.
#   They are resolved via `cd <start>; cd <entry>; pwd -P` (physical path,
#   no symlink expansion in intermediate components).
#
#   Walk-up produces: child (closer to <start-dir>) prepended leftmost
#   within the walk-up phase. inherit entries prepend AFTER walk-up, so
#   inherit entries are LEFTMOST overall = highest precedence. Among
#   inherit entries, LATER-listed entries are prepended later → they
#   land leftmost → they win (see §3.3 precedence rule).
#
#   Pure: no side effects, no network. The `cd ... && pwd -P` subshells
#   do not mutate the parent shell's CWD.
ci_resolve_boot_path() {
    local start="$1" walk accum=""
    walk="$start"
    while [[ "$walk" != "/" && "$walk" != "." ]]; do
        if [[ -d "$walk/.boot-linux/python-env/bin" ]]; then
            accum="$walk/.boot-linux/python-env/bin:$accum"
        fi
        if [[ -d "$walk/.boot-linux/bin" ]]; then
            accum="$walk/.boot-linux/bin:$accum"
        fi
        walk="$(dirname "$walk")"
    done
    # Explicit inherit: entries (prepended AFTER walk-up; later-listed = leftmost = wins).
    # Entries are relative to the repo root (= $start), NOT to CWD. Resolve
    # them by prefixing $start before the existence check and the accum prepend.
    # Use `cd "$start" && cd "$entry"` to resolve relative paths portably
    # (pwd -P avoids symlink expansion in the resolved path; we want the
    # literal directory, not its symlink target, for PATH-prepend stability).
    local layout="$start/config/boot_layout.yaml"
    if [[ -f "$layout" ]]; then
        local inherited=()
        if ci_capture_lines inherited -- ci_read_yaml_list "$layout" "inherit"; then
            local entry resolved
            for entry in "${inherited[@]}"; do
                # Strip trailing slash. Entries point at .boot-linux/ dirs.
                entry="${entry%/}"
                # Resolve relative to $start (repo root), not CWD.
                resolved="$(cd "$start" && cd "$entry" && pwd -P)" || continue
                if [[ -d "$resolved/bin" ]]; then
                    accum="$resolved/bin:$accum"
                fi
            done
        fi
    fi
    printf '%s' "$accum"
}
```

### 3.2 PRoot-safety

- No `< <(...)` process substitution (uses `ci_capture_lines` from `lib/ci.sh` which uses temp files).
- No `realpath` (uses `cd ... && pwd -P` for path resolution in the inherit loop: `pwd -P` gives the physical path without symlink expansion in intermediate components, matching the NFR-BL-3.1 constraint).
- NO `2>/dev/null` anywhere. None. Not even one "allowed" swallow. The
  canon bans silent error-suppression absolutely. In the inherit loop,
  `cd "$entry"` against a non-existent path emits its native `bash: cd:
  <path>: No such file or directory` to stderr: that error IS visible to
  the user (not suppressed), and the `|| continue` propagates the skip
  per FR-BL-3.3. The error's meaning IS "this entry isn't on disk -
  skip it"; the skip is the documented handling. Suppression is never
  acceptable, even when the error semantics are intentional; the visible
  stderr keeps the trace honest.
- No `|| true` outside the `$(...)` subshell (uses `if/then/fi` and `|| continue` guards).
- No `source` without `|| exit/return`: the helper is invoked from generated hooks where `set -euo pipefail` is active.

### 3.3 Precedence rule

PATH entries resolve leftmost-first (POSIX `execvp` semantics). The
accumulator prepends child-most-specific leftmost:

```
For /root/WORKSPACE-GUARD with own .boot-linux/bin/git-guard and
inherit: [../WORKSPACE-CI/.boot-linux]:
  walk-up emits:    /root/WORKSPACE-GUARD/.boot-linux/bin:
                    (only one .boot-linux/ on the up-path; /root/ has none
                    post-refactor: /root/.boot-linux/ is deleted per FR-BL-8.10)
  inherit prepend: /root/WORKSPACE-CI/.boot-linux/bin
  final accum:     /root/WORKSPACE-CI/.boot-linux/bin:/root/WORKSPACE-GUARD/.boot-linux/bin:
```

The inherit entry is prepended AFTER the walk-up loop completes, so it lands
LEFTMOST in the accumulator → highest precedence. If multiple inherit entries
are declared, they prepend in list order; the LATER-listed entry is prepended
later → also lands leftmost → wins. This matches REQ Open Q #6: **later-listed
`inherit:` entries win**.

### 3.4 Idempotency

Re-running `ci_resolve_boot_path /root/WORKSPACE-GUARD` with the same
filesystem state produces the same string byte-for-byte. No random,
no timestamp, no env-var-dependent behavior.

### 3.5 Termination

`while [[ "$walk" != "/" && "$walk" != "." ]]`: bounded by walking up to
`/` or empty dirname. O(depth): typically 3-5 iterations for our repos.

---

## 4. `config/boot_layout.yaml`: Schema Specification

### 4.1 Schema (YAML)

```yaml
# Optional schema hint for editors / IDE completion.
# version: 1

# OWN boot dir (relative to repo root or absolute). Default: .boot-linux/.
# Set to null or omit to declare "this repo has no own boot dir".
boot_dir: .boot-linux/

# OWN private venv dir (relative to repo root or absolute). Default: .venv/.
# Set to null to declare "this repo has no own venv" (e.g. GUARD).
venv_dir: .venv/

# Ancestor .boot-linux/ directories to inherit read-only via PATH walk-up.
# Each entry is the PATH to the .boot-linux/ directory (with or without
# trailing slash). The walker appends "/bin" automatically.
# Later entries get prepended AFTER earlier ones, so LATER entries WIN
# (leftmost-prepends = highest precedence).
inherit:
  - ../WORKSPACE-CI/.boot-linux

# Free-text human rationale (optional). Not parsed by tooling.
comment: |
  GUARD has no Python venv; inherits CI's gitleaks via PATH.
  Python checks invoked via `uv run --project ../CI --no-sync`.
```

### 4.2 Resolution semantics

- `boot_dir`: relative paths resolve against the repo root (the dir containing `config/boot_layout.yaml`'s parent). Absolute paths used as-is. `null`/`absent` = no own boot dir.
- `venv_dir`: same resolution rules as `boot_dir`. `null`/`absent` = no own venv (cross-repo only via `uv run --project`).
- `inherit`: each entry is resolved with the same rules. If entry resolves to a non-existent dir, walker skips silently (soft-optional, supports VM-might-be-absent).

### 4.3 Validation rules (in the compliance check)

| Field | OK | WARN | INFO |
|---|---|---|---|
| `boot_dir` | Resolves to existing dir, or null | Resolves to a file (not dir); resolved leaf dir is world-writable (NFR-BL-3.2) | Field is null/absent (repo has no own boot dir) |
| `venv_dir` | Resolves to existing dir containing `bin/python`, or null | Resolves to existing dir WITHOUT `bin/python` (incomplete venv); resolved leaf is world-writable | Field is null/absent (repo has no own venv: e.g. GUARD) |
| `inherit` entry | Resolves to existing `.boot-linux/` dir, AND target repo IS in consuming `moon.yml::dependsOn` | Entry exists as a file (not dir); entry's resolved leaf is world-writable; target repo NOT in `dependsOn` | Entry does not exist on disk (soft-optional per FR-BL-3.3) |
| `..` usage | Path uses `..` for cross-sibling refs (e.g. `../WORKSPACE-CI/.boot-linux`) | (No warning triggered solely by `..` segments: cross-sibling refs are the canonical pattern) | N/A |

Note: `..` segments are NOT flagged. Cross-sibling inheritance is the documented mechanism (see §4.1 example and REQ §4 Open Q #4 Resolution). The check focuses on (a) existence, (b) world-writable leaf, (c) `dependsOn` alignment: NOT on path-shape policing.

### 4.4 Single source of truth

`generate-hooks`, Makefiles, `moon.yml` metadata, and any future tooling
MUST read from `config/boot_layout.yaml`. No file duplicates the inheritance
list. `moon.yml::project.bootDir`/`project.parentBoot` are DESCRIPTIVE
(informational only, moon ignores) and MUST mirror `boot_layout.yaml`.

---

## 5. `scripts/generate-hooks`: Modification Spec

### 5.1 Before (previous implementation, now removed)

The following hardcoded PATH-prepend previously lived in `generate-hooks`
(lines 104-111) and has been replaced by `ci_resolve_boot_path()`:

```bash
# Prepend the workspace boot venv's python bin BEFORE the .boot-linux/bin
# convenience symlinks. ...
export PATH="${CI_WORKSPACE_ROOT}/.boot-linux/python-env/bin:${CI_WORKSPACE_ROOT}/.boot-linux/bin:$PATH"
```

### 5.2 After (replacement)

```bash
# Compute the boot-PATH-prepend at runtime by walking up from the
# hook's repo root (_ROOT) and reading config/boot_layout.yaml::inherit.
# See lib/ci.sh::ci_resolve_boot_path and REQ-BOOT-LAYOUT §2.2 / FR-BL-4.
_BOOT_PATH="$(ci_resolve_boot_path "$_ROOT")"
if [[ -n "$_BOOT_PATH" ]]; then
    export PATH="${_BOOT_PATH}:$PATH"
fi
```

### 5.3 Removal

The chained-symlink design comment (lines 104-110) is removed: the design
no longer relies on `.boot-linux/bin/python → python-env/bin/python` symlinks
outside the owning repo. (The `python-env/` subdirectory model is owned
exclusively by WORKSPACE-VM for its own ambient python needs, not by CI.)

### 5.4 Hook entry shape in consumer repos

For sibling-repo hooks (e.g. WORKSPACE-GUARD's `check-markdown-docs`), the
generated hook MUST emit `uv run --project ../CI --no-sync python -m
ci.check_markdown_docs ...` per FR-BL-6.1. The `../CI` relative path is
supplied by the CONSUMER in its `.pre-commit-config.yaml::entry` string -
NOT injected by `generate-hooks`.

For OWN-repo hooks (WORKSPACE-CI's own `.pre-commit-config.yaml`), the entry
stays `uv run python -m ci.check_markdown_docs ...` (no `--project`).

`generate-hooks` does NOT parse `.pre-commit-config.yaml::entry` to swap
in flags. It just emits the `entry:` string verbatim into the generated
hook. The `--project ../CI --no-sync` addition is therefore a CONSUMER'S
RESPONSIBILITY: `WORKSPACE-GUARD/.pre-commit-config.yaml::check-markdown-docs.entry`
MUST be edited to include `--project ../CI --no-sync`. This spec does not
teach `generate-hooks` to auto-inject `--project`; that would couple the
generator to the consumer's needs. The hook owner supplies the entry.

(Note: `generate-hooks` does have an internal `${_ci_rel}` variable used
to source `lib/checks.sh` from the correct relative path based on nesting
depth. That variable is for the hook's `source` line: NOT for editing
`entry:` strings. Do not conflate the two. The consumer's `entry:` is
hand-authored in its `.pre-commit-config.yaml`.)

---

## 6. `ci/check_boot_venv_layout.py`: Module Spec

### 6.1 Invocation

```bash
uv run python -m ci.check_boot_venv_layout [PROJECT_DIR]
```

`PROJECT_DIR` defaults to CWD. The module scans `<PROJECT_DIR>/config/boot_layout.yaml`.

### 6.2 Output format

One row per finding:
```
OK    config/boot_layout.yaml:5   boot_dir=.boot-linux/ resolves to existing directory
WARN  config/boot_layout.yaml:8   inherit entry ../MISSING/.boot-linux does not exist on disk
INFO  moon.yml                    project.bootDir=.boot-linux matches boot_layout.yaml (descriptive metadata only)
```

Trailing summary:
```
boot-layout: 12 ok, 1 warning, 3 info
```

Exit code: always `0` (non-blocking; per FR-BL-7.7).

### 6.3 Checks performed

1. `config/boot_layout.yaml` exists? If not → emit `INFO` and exit 0.
2. Parse YAML; validate fields against schema (§4.1). Malformed YAML → `WARN`, exit 0.
3. For `boot_dir`: resolve against project root. If null → `INFO`. If missing dir → `WARN`. If exists → `OK`.
4. For `venv_dir`: resolve against project root. If null → `INFO`. If exists and has `bin/python` → `OK`. If exists without `bin/python` → `WARN`.
5. For each `inherit:` entry: resolve against project root. If path doesn't exist → `INFO` (soft-optional per FR-BL-3.3). If exists as dir → `OK`. If exists as file → `WARN`.
6. For each existing `inherit:` entry: check if the resolved `.boot-linux/` leaf dir OR its `bin/` subdir is world-writable (`os.stat().st_mode & 0o002`). If world-writable → `WARN` (per NFR-BL-3.2). Note: parent-chain world-writable checks are OUT OF SCOPE (NFR-BL-3.2 rationale).
7. Read `<project>/moon.yml` if it exists. Verify `project.bootDir` and `project.parentBoot` (if present) match `boot_layout.yaml::boot_dir` and the inheritance list, respectively. Mismatch → `WARN`.
8. Read `<project>/moon.yml::dependsOn`. For each `inherit:` entry whose owning repo can be derived from the path (e.g. `../WORKSPACE-CI/.boot-linux` is owned by the `WORKSPACE-CI` repo → moon project id `ci`), verify `ci` is in `moon.yml::dependsOn`. Mismatch → `WARN` (inherit-without-deps violation; per NFR-BL-5.2).
9. Scan `<project>/.pre-commit-config.yaml` for `uv run --project <path> --no-sync python -m ci.<check>` entries. For each, verify `<path>/pyproject.toml` exists and `<path>/.venv/bin/python` exists. Missing → `WARN`. Present → `OK`.
10. Score summary + exit 0.

### 6.4 Dependencies

The module imports `pyyaml` (already in CI's `pyproject.toml::dependencies`),
`pathlib`, and standard library only. No additional `pyproject.toml` edits.

### 6.5 Registration

In `scripts/manifest.yaml`:
```yaml
- id: check-boot-venv-layout
  path: ci/check_boot_venv_layout.py
  summary: Non-blocking audit of boot_layout.yaml + moon.yml + .pre-commit-config.yaml --project refs.
  usage: python -m ci.check_boot_venv_layout [PROJECT_DIR]
  category: compliance
  output: "Score + findings on stdout. Always exits 0 (non-blocking)."
```

In `config/required_hooks.yaml` (so consumers inherit):
```yaml
- id: check-boot-venv-layout
  ...
  tier: poc        # safety subset; runs even in poc tier (it's advisory)
```

In WORKSPACE-CI's own `.pre-commit-config.yaml`:
```yaml
- id: check-boot-venv-layout
  name: Boot Layout Audit (non-blocking)
  entry: "uv run python -m ci.check_boot_venv_layout"
  language: system
  pass_filenames: false
  always_run: true
```

---

## 7. Deletions & Reversions (per REQ-BL-8)

### 7.1 Files to delete entirely

> **Status: DONE.** All three deletions are complete.

| Path | Reason |
|---|---|
| `/root/WORKSPACE-CI/scripts/bootstrap-python-env` | Duplicates VM's `bootstrap_python.sh`; no repo needs `.boot-linux/python-env/` under the new model (FR-BL-8.3). |
| `/root/.boot-linux/python-env/` (directory) | Session pollution; duplicates VM's role; violates FR-BL-1.3 (FR-BL-8.10). |
| `/root/.boot-linux/bin/python` (symlink) | Session pollution; created by deleted `bootstrap-python-env` (FR-BL-8.10). |

### 7.2 Files to revert (2026-06-25 session edits)

> **Status: DONE.** All reversions are complete. `uv run` is preserved in all
> hook entries, and `2>/dev/null` swallows have been replaced with explicit
> `|| { echo ... >&2; exit 1; }` patterns.

Two distinct operations apply to CI's hook entries simultaneously:

1. **RESTORE `uv run`**: the 2026-06-25 session stripped `uv run` from several entries, violating `banned_words.yaml:236`. The `uv run` prefix MUST be restored.
2. **ERADICATE `2>/dev/null`**: the `check-dependency-versions` and `check-duplicate-dependencies` entries had pre-existing `2>/dev/null` swallows. Those swallows MUST be replaced with explicit `|| { echo ... >&2; exit 1; }` rc-capture patterns.

Both operations apply to L58/L65 (which need BOTH `uv run` restored AND swallow eradicated).

| File | Edit made in session | Corrected state |
|---|---|---|
| `WORKSPACE-CI/.pre-commit-config.yaml` L23 | `uv run ruff format` → `ruff format` | Restore `uv run ruff format` (FR-BL-8.7) |
| `WORKSPACE-CI/.pre-commit-config.yaml` L30 | `uv run ruff check` → `ruff check` | Restore `uv run ruff check` (FR-BL-8.7) |
| `WORKSPACE-CI/.pre-commit-config.yaml` L58 | Session stripped NOTHING here; the swallow was PRE-EXISTING. Hook entry needs: (a) `uv run python` preserved (it was never stripped here: the entry used `bash -c 'uv run python -c "import ci" 2>/dev/null ...'` already), (b) the `2>/dev/null` swallow replaced. | Replace swallow: `bash -c 'uv run python -c "import ci" \|\| { echo "FAILED: ci not installed: run: make sync" >&2; exit 1; }; exec uv run python -m ci.check_dependency_versions "$@"' --` (FR-BL-8.8) |
| `WORKSPACE-CI/.pre-commit-config.yaml` L65 | Same as L58: entry used `2>/dev/null` swallow pre-session; no `uv run` stripping here. | Same replacement pattern as L58, for `ci.check_duplicate_dependencies` (FR-BL-8.8). |
| `WORKSPACE-CI/.pre-commit-config.yaml` L121 | `uv run python -m mypy` → `python -m mypy` | Restore `uv run python -m mypy` (FR-BL-8.7) |
| `WORKSPACE-CI/.pre-commit-config.yaml` L129 | `uv run python -m ci.check_markdown_docs` → bare `python -m ci.check_markdown_docs` | Restore `uv run python -m ci.check_markdown_docs` (FR-BL-8.7) |
| `WORKSPACE-CI/.pre-commit-config.yaml` L136 | `uv run python -m ci.check_required_hooks_present` → bare `python -m ...` | Restore `uv run python -m ci.check_required_hooks_present` (FR-BL-8.7) |
| `WORKSPACE-CI/config/coverage_thresholds.yaml` L7, L13 | `uv run python -m pytest` → `python -m pytest` | Restore `uv run python -m pytest` |
| `WORKSPACE-CI/lib/checks_coverage.sh` L46 | `runner="uv run pytest"` → `runner="python -m pytest"` | Restore `runner="uv run pytest"` |
| `WORKSPACE-CI/lib/checks_compliance.sh` L192 | Diagnostic string changed to remove `uv run` | Restore the `uv run python -m ci.check_markdown_docs --check-remote` reference in the diagnostic message |

### 7.3 Files to add or modify

> **Status: DONE (CI-side).** All WORKSPACE-CI entries are complete.
> WORKSPACE-GUARD and WORKSPACE-VM entries are owned by those repos.

| File | Action |
|---|---|
| `WORKSPACE-CI/lib/ci.sh` | ADD `ci_resolve_boot_path()` function per §3.1 |
| `WORKSPACE-CI/scripts/generate-hooks` | REPLACE hardcoded PATH-prepend (L104-111) with `ci_resolve_boot_path()` invocation per §5 |
| `WORKSPACE-CI/scripts/bootstrap-gitleaks` | CHANGE install target to `${CI_PROJECT_ROOT}/.boot-linux/bin/gitleaks` (resolved from `config/boot_layout.yaml::boot_dir`); DELETE the `_workspace_root` walk-up function (replaced by sourcing `lib/ci.sh` for `CI_PROJECT_ROOT`); ERADICATE `2>/dev/null`/`>/dev/null 2>&1` swallows per the silent-swallow canon |
| `WORKSPACE-CI/ci/check_boot_venv_layout.py` | ADD new module per §6 |
| `WORKSPACE-CI/scripts/manifest.yaml` | REMOVE `bootstrap-python-env` entry; ADD `check-boot-venv-layout` entry per §6.5 |
| `WORKSPACE-CI/Makefile` | REMOVE `install-python-env` target; REMOVE `install-python-env` prereq from `install-deps` and `sync` |
| `WORKSPACE-CI/.pre-commit-config.yaml` | ADD `check-boot-venv-layout` hook entry per §6.5; REVERT session edits per §7.2 |
| `WORKSPACE-CI/config/boot_layout.yaml` | ADD with `boot_dir: .boot-linux/`, `venv_dir: .venv/`, `inherit: []` (CI has no ancestors to inherit; produces gitleaks for siblings) |
| `WORKSPACE-GUARD/.pre-commit-config.yaml` L52 | CHANGE `entry: "python -m ci.check_markdown_docs ..."` to `entry: "uv run --project ../CI --no-sync python -m ci.check_markdown_docs --all-md --check-remote"` (per FR-BL-6.1) |
| `WORKSPACE-GUARD/config/boot_layout.yaml` | ADD with `boot_dir: .boot-linux/`, `venv_dir: null`, `inherit: [../WORKSPACE-CI/.boot-linux]` |
| `WORKSPACE-GUARD/moon.yml` | VERIFY `dependsOn: [ci]` (or add it) to align with `inherit:` per NFR-BL-5.2 |
| `WORKSPACE-VM/config/boot_layout.yaml` (later phase) | ADD with `boot_dir: .boot-linux/`, `venv_dir: .venv/`, `inherit: [../WORKSPACE-CI/.boot-linux]` so VM consumes CI's gitleaks rather than installing its own |
| `WORKSPACE-VM/moon.yml` (later phase) | VERIFY `dependsOn: [ci]` and declared `inherit:` alignment |

---

## 8. moon Integration Details

### 8.1 Custom metadata fields on `moon.yml::project:`

Per moon v2 custom-metadata docs (<https://moonrepo.dev/docs/config/project>
→ `project` → Custom fields v2.0.0), arbitrary keys under `project:` are
persisted in the project graph as informational metadata; moon ignores them
for graph execution. We use these for descriptive cross-reference with
`boot_layout.yaml`:

```yaml
# WORKSPACE-GUARD/moon.yml
project:
  name: 'workspace-guard'
  description: 'Rust repo with Python hooks; consumes boot from WORKSPACE-CI'
  bootDir: '.boot-linux'                  # descriptive; mirrors boot_layout.yaml
  parentBoot: ['../WORKSPACE-CI/.boot-linux']  # descriptive; mirrors inherit:
```

The compliance check (§6) verifies consistency between `moon.yml::project.bootDir`
and `boot_layout.yaml::boot_dir`, emitting `WARN` on mismatch.

### 8.2 `dependsOn` and `inherit:` alignment

Any `inherit:` entry pointing at a sibling `.boot-linux/` (e.g.
`../WORKSPACE-CI/.boot-linux`) MUST correspond to a matching
`dependsOn: [ci]` edge in the consuming repo's `moon.yml` (the moon
project id is derived by lowercasing the WORKSPACE-<NAME> directory's
<NAME> segment). Reverse direction is invalid (an `inherit` entry
pointing at a repo NOT in `dependsOn` is an undeclared dependency -
silent breakage risk per the Riftmap infra-dependency research).

The compliance check (§6 step 8) detects mismatches.

### 8.3 Mismatch reporting flow

```
WARN  moon.yml                  inherit references WORKSPACE-CI/.boot-linux but
                                dependsOn does not include 'ci'; add 'ci' to
                                dependsOn or remove ../WORKSPACE-CI/.boot-linux
                                from config/boot_layout.yaml::inherit.
```

---

## 9. Traceability

| REQ ID | SPEC section |
|--------|--------------|
| FR-BL-1.1 | §4.1 (boot_dir default), §3.1 (resolution) |
| FR-BL-1.2 | §4.1 (relative/absolute paths), §4.2 (resolution semantics) |
| FR-BL-1.3 | §7 (deletions), §2.1 (architectural principle) |
| FR-BL-1.4 | §7.3 (`bootstrap-gitleaks` install target change), §5.4 (hook entry responsibility) |
| FR-BL-1.5 | §4.1 (boot_dir null/absent → no own boot dir), §6.3 check 3 (INFO path) |
| FR-BL-2.1 | §7.3 (Makefile `install-python-deps` keeps `uv sync`) |
| FR-BL-2.2 | §7.1 (delete `/root/.boot-linux/python-env/` symlink-sharing) |
| FR-BL-2.3 | §7.3 (GUARD has no pyproject; uses `uv run --project`) |
| FR-BL-2.4 | §7.3 (Makefile exports `UV_PROJECT_ENVIRONMENT` when venv_dir relocated) |
| FR-BL-2.5 | §2.3 (architectural principle), §5.4 (--project contract) |
| FR-BL-3.1 | §4.1 (inherit schema: ancestor OR sibling), §3.1 (walker appends inherit after walk-up) |
| FR-BL-3.2 | §4.1 (entry shape: path to `.boot-linux/`, walker appends `/bin`), §3.1 (`entry="${entry%/}"; ... "$entry/bin"`) |
| FR-BL-3.3 | §3.1 (`|| continue` skips the entry on failed `cd`; cd's native stderr IS the visible signal: no `2>/dev/null` swallowing per §3.2), §6.3 check 5 (INFO for non-existent) |
| FR-BL-3.4 | §6.3 check 8 (WARN if target repo not in moon.yml::dependsOn), §8.2 (alignment rule) |
| FR-BL-4.1 | §5.2 (generate-hooks replacement) |
| FR-BL-4.2 | §3.1 (walk-up algorithm) |
| FR-BL-4.3 | §3.3 (precedence rule) |
| FR-BL-4.4 | §3.1 (inherit prepended after walk-up, leftmost) |
| FR-BL-4.5 | §5.2 (empty accum → no PATH-prepend), §6.3 check on missing boot dirs |
| FR-BL-4.6 | §3.1 (single printf), §10.5 (no dedup, duplicates acceptable), §3.2 (rationale) |
| FR-BL-5.1 | §4.1 (schema) |
| FR-BL-5.2 | §4.1 (schema keys: boot_dir, venv_dir, inherit) |
| FR-BL-5.3 | §4.1 (version field) |
| FR-BL-5.4 | §4.1 (comment field) |
| FR-BL-5.5 | §4.1 (relative paths with `..` allowed for sibling refs), §4.3 (`..` NOT flagged alone; WARN only on world-writable or ungraphed sibling) |
| FR-BL-5.6 | §4.4 (single source of truth; moon.yml::project.bootDir descriptive only) |
| FR-BL-6.1 | §5.4 (hook entry shape for consumer repos) |
| FR-BL-6.2 | §5.4 (consumer supplies relative path; `generate-hooks` does NOT auto-inject) |
| FR-BL-6.3 | §5.4 (`--no-sync` flag) |
| FR-BL-6.4 | §5.4 (CWD stays at consumer root; uv docs cited) |
| FR-BL-6.5 | §5.4 (own-repo hooks use bare `uv run python`) |
| FR-BL-6.6 | §5.4 (no VIRTUAL_ENV, no activate, --project sole mechanism) |
| FR-BL-7.1 | §6.1 (invocation) |
| FR-BL-7.2 | §6.3 check 1 (INFO+exit 0 if absent) |
| FR-BL-7.3 | §6.3 checks 3-5 (boot_dir, venv_dir, inherit resolution) |
| FR-BL-7.4 | §6.3 check 9 (scan .pre-commit-config.yaml for --project refs) |
| FR-BL-7.5 | §6.3 check 7 (scan moon.yml::project.bootDir/parentBoot) |
| FR-BL-7.6 | §6.2 (output format, summary line) |
| FR-BL-7.7 | §6.1 (always exit 0) |
| FR-BL-7.8 | §6.5 (registration in manifest.yaml, required_hooks.yaml, CI's .pre-commit-config.yaml) |
| FR-BL-8.1 | §5 (generate-hooks mod) |
| FR-BL-8.2 | §7.3 (bootstrap-gitleaks install target change) |
| FR-BL-8.3 | §7.1 (delete bootstrap-python-env) |
| FR-BL-8.4 | §7.3 (Makefile: remove install-python-env target + prereqs) |
| FR-BL-8.5 | §7.3 (manifest.yaml: remove bootstrap-python-env entry) |
| FR-BL-8.7 | §7.2 (revert session edits: restore uv run) |
| FR-BL-8.8 | §7.2 (eradicate `2>/dev/null` swallows in L58/L65) |
| FR-BL-8.9 | §7.3 (GUARD hook entry change) |
| FR-BL-8.10 | §7.1 (delete /root/.boot-linux/python-env + symlink) |
| NFR-BL-1.1 | §3.1 (pure function: no side effects, subshell `cd` doesn't mutate parent), §3.4 (idempotency) |
| NFR-BL-1.2 | §3.5 (O(depth) termination) |
| NFR-BL-1.3 | §3.4 (byte-identical output for same fs state) |
| NFR-BL-1.4 | §11 Phase 1/2 (idempotent bootstraps: bootstrap-gitleaks version-match short-circuit) |
| NFR-BL-2.1 | §3.2 (PRoot-safety, no process substitution, no associative arrays) |
| NFR-BL-2.2 | §4.1 (POSIX forward slashes, no drive letters) |
| NFR-BL-2.3 | §11 Phase 2 (CI+GUARD install without VM; NFR-BL-2.3 rationale) |
| NFR-BL-3.1 | §3.1 (pwd -P, dirname string-only), §3.2 (no realpath, intermediate paths not stat'd) |
| NFR-BL-3.2 | §6.3 check 6 (world-writable leaf check via os.stat().st_mode & 0o002), §4.3 validation table |
| NFR-BL-3.3 | §11 Phase 5 (SHA256-pinning pattern for new bootstraps) |
| NFR-BL-3.4 | §2.3 (architectural principle reinforces banned_words.yaml) |
| NFR-BL-4.1 | §11 Phase 2 (legacy hardcoded prepend removed; no fallback pathway retained) |
| NFR-BL-4.2 | §7.3 (VM keeps bootstrap_python.sh: VM-owned concern), §6.3 check 1 (INFO on absent boot_layout.yaml) |
| NFR-BL-5.1 | §8.1 (moon.yml::project.bootDir/parentBoot mirroring) |
| NFR-BL-5.2 | §8.2 (dependsOn alignment), §6.3 check 8 (enforces) |
| NFR-BL-5.3 | §8.2 (reverse direction invalid: consumer→producer only) |

---

## 10. Edge Cases & Decisions

### 10.1 `inherit:` with overlapping `boot_dir`

If a repo declares `boot_dir: .boot-linux/` AND `inherit: [.boot-linux/]` (self-inheritance), the walker's auto-discovery already covers `.boot-linux/bin`; the explicit `inherit:` entry would be redundant. The compliance check emits `INFO` (not WARN) for self-referential inheritance.

### 10.2 `inherit:` entry that duplicates a walk-up-discovered dir

If `/root/.boot-linux/bin` were ever to exist AND a repo at `/root/WORKSPACE-CI/` declared `inherit: [/root/.boot-linux/]`, the walk-up already prepends `/root/.boot-linux/bin` and the explicit inherit would prepend it again: producing duplicate PATH entries (POSIX shells tolerate this; resolution is unaffected). The walker DOES NOT deduplicate; the caller's `export PATH=` line MAY contain duplicate entries. This is acceptable because (a) duplicates don't change resolution semantics, (b) dedup would require shell-array set-tracking which §3.1 deliberately avoids for PRoot-safety (no associative arrays under `set -u`). Under the post-refactor contract this case is moot: `/root/.boot-linux/` is deleted, so no walk-up level contributes it.

### 10.3 Repo with `boot_dir: null` and `inherit: null`

Truly "no boot infra" repo. The compliance check emits `INFO` for both fields. Hooks fall back to ambient PATH. This is the legitimate "host provides X" case per the Bazel `host_platform` research.

### 10.4 Hook entry using `--project` to NON-CI sibling

The compliance check (§6 step 9) validates ANY `uv run --project <path>` reference in `.pre-commit-config.yaml` resolves to a directory with `pyproject.toml` and `.venv/bin/python`. This generalizes FR-BL-6 to any Python-providing sibling (future DATAOPS, etc.), not just CI.

### 10.5 PATH-prepend re-invocation

Each generated hook does exactly one `export PATH="${_BOOT_PATH}:$PATH"` per shell invocation. The accumulator output of `ci_resolve_boot_path()` is deterministic for a given filesystem state. If a hook itself invokes another hook (not a current pattern but not forbidden), the inner execution will prepend the same `_BOOT_PATH` block again, producing duplicate PATH entries. POSIX shells handle this without error; resolution is unaffected because the leftmost (highest-precedence) entry is the same in both copies. The walker does NOT deduplicate; this is deliberate (see §10.2).

---

## 11. Phased Implementation

### Phase 1: Reversions and cleanup (single PR after this SPEC is approved)

> **Status: DONE (CI-side).** All CI-side items complete. GUARD-side item
> (L52 change) is owned by WORKSPACE-GUARD.

- [x] Delete `/root/.boot-linux/python-env/` + `/root/.boot-linux/bin/python` symlink.
- [x] Delete `/root/WORKSPACE-CI/scripts/bootstrap-python-env`.
- [x] Remove `bootstrap-python-env` from `scripts/manifest.yaml`.
- [x] Remove `install-python-env` target from WORKSPACE-CI Makefile; remove its prereq from `install-deps` and `sync`.
- [x] Revert `WORKSPACE-CI/.pre-commit-config.yaml` per §7.2 (restore `uv run` everywhere; eradicate `2>/dev/null` swallows in L58/L65).
- [x] Revert `config/coverage_thresholds.yaml`, `lib/checks_coverage.sh`, `lib/checks_compliance.sh` per §7.2.
- [ ] Change `WORKSPACE-GUARD/.pre-commit-config.yaml` L52 to `uv run --project ../CI --no-sync python -m ci.check_markdown_docs --all-md --check-remote` per §7.3.

### Phase 2: New contract (after Phase 1 lands)

> **Status: DONE (CI-side).** All CI-side items complete. GUARD-side items
> are owned by WORKSPACE-GUARD.

- [x] Add `ci_resolve_boot_path()` to `lib/ci.sh` per §3.1.
- [x] Replace `generate-hooks` hardcoded PATH-prepend with `ci_resolve_boot_path()` invocation per §5.
- [x] Rewrite `bootstrap-gitleaks` to install to `${CI_PROJECT_ROOT}/.boot-linux/bin/gitleaks` via `config/boot_layout.yaml::boot_dir`; eradicate `2>/dev/null` swallows per the silent-swallow canon.
- [x] Add `config/boot_layout.yaml` to WORKSPACE-CI: `boot_dir: .boot-linux/`, `venv_dir: .venv/`, `inherit: []`.
- [ ] Add `config/boot_layout.yaml` to WORKSPACE-GUARD: `boot_dir: .boot-linux/`, `venv_dir: null`, `inherit: [../WORKSPACE-CI/.boot-linux]`.
- [ ] Verify WORKSPACE-GUARD's `moon.yml::dependsOn` includes `ci` (add if missing).

### Phase 3: Compliance check (after Phase 2 lands)

> **Status: DONE (CI-side).** All CI-side items complete. GUARD-side item
> is owned by WORKSPACE-GUARD.

- [x] Add `ci/check_boot_venv_layout.py` per §6.
- [x] Register in `scripts/manifest.yaml` per §6.5.
- [x] Add to `config/required_hooks.yaml` as `tier: poc`.
- [x] Add `check-boot-venv-layout` hook entry to WORKSPACE-CI's `.pre-commit-config.yaml` per §6.5.
- [x] Add `project.bootDir` / `project.parentBoot` custom metadata to WORKSPACE-CI's `moon.yml` mirroring `boot_layout.yaml`.
- [ ] Add `project.bootDir` / `project.parentBoot` custom metadata to WORKSPACE-GUARD's `moon.yml` mirroring `boot_layout.yaml`.

### Phase 4: VM-side alignment (separate PR, separate commit)

- [ ] Add `config/boot_layout.yaml` to WORKSPACE-VM: `boot_dir: .boot-linux/`, `venv_dir: .venv/`, `inherit: [../WORKSPACE-CI/.boot-linux]`.
- [ ] Verify WORKSPACE-VM's `moon.yml::dependsOn` includes `ci`.
- [ ] Add `project.bootDir` + `project.parentBoot` to WORKSPACE-VM's `moon.yml`.
- [ ] WORKSPACE-VM KEEPS `bootstrap_python.sh` and its `.boot-linux/python-env/`: these serve VM-internal ambient scripts (e.g. `workspace/scripts/bin/bootstrap-repos` consumes `.boot-linux/bin/python` at lines 43-45). This is VM's owned concern under the new contract, not a legacy artifact to remove.

### Phase 5 (deferred): Rust toolchain self-sufficiency

> **Status: PARTIAL.** `bootstrap-uv` and `bootstrap-rust` scripts exist.
> Integration into `bootstrap-workspace-guard` and preflight checks are
> still pending.

- [x] Author `scripts/bootstrap-uv` to install uv into `${CI_PROJECT_ROOT}/.boot-linux/bin/uv` hermetically (SHA256-pinned download like `bootstrap-gitleaks`).
- [x] Author `scripts/bootstrap-rust` to install rustup + components (cargo, rustc, clippy-driver, rustfmt) into `${CI_PROJECT_ROOT}/.boot-linux/` (with RUSTUP_HOME + CARGO_HOME redirected).
- [ ] Update `bootstrap-workspace-guard` to source CI's `bootstrap-rust` instead of shelling out to VM's `bootstrap_rust.sh`.
- [ ] Add `preflight` check verifying `cargo`/`rustfmt`/`clippy` exist before hooks run (host-provides-X check, fail-closed).

---

## 12. Open Questions (forwarded from REQ §6, with SPEC-level answers)

1. **Intermediate-level `boot_layout.yaml`?** SPEC: no. ONE per repo. Intermediate boot dirs reached via walk-up only.
2. **Walk-up reaching `.venv/bin/`?** SPEC: no. `.venv/` is private per FR-BL-2. Walk-up is `.boot-linux/bin/` + `.boot-linux/python-env/bin` only.
3. **Compliance check blocking?** SPEC: no, ever (NFR-BL-5 underscored via §6.1 exit 0 invariant).
4. **`inherit:` glob support?** SPEC: no. Each entry dispatched explicitly; globs introduce undeclared dependencies.
5. **VM inherits CI's gitleaks or installs its own?** SPEC §10.1: VM `inherit:` lists CI's `.boot-linux` so walk-up + explicit-declared inheritance both surface `/root/WORKSPACE-CI/.boot-linux/bin/gitleaks`. VM does NOT install its own gitleaks copy.
6. **`inherit:` priority/scope field?** SPEC: no. Positional precedence: later-listed entries prepended later = leftmost = wins. Matches the implementation in §3.1.