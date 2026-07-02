# REQ-BOOT-LAYOUT: Hierarchical `.boot-linux/` and `.venv/` Toolchain Layout

**Date:** 2026-06-26
**Status:** IMPLEMENTED
**Type:** Requirements
**Specification:** [SPEC-BOOT-LAYOUT](../specifications/SPEC-BOOT-LAYOUT.md)

> **Implementation status:** Complete (Phases 1-3 and Phase 5). The walk-up
> function `ci_resolve_boot_path()` lives in `lib/ci.sh` (lines 262-299), the
> `config/boot_layout.yaml` schema is shipped, and the
> `check_boot_venv_layout` compliance check exists at
> `ci/check_boot_venv_layout.py` (447 lines, all 10 checks from SPEC §6.3).
> Leaked dependencies on WORKSPACE-VM's `.boot-linux/` have been eliminated:
> `generate-hooks` uses `ci_resolve_boot_path()` instead of hardcoded paths,
> `bootstrap-gitleaks` installs to CI's own `.boot-linux/bin/`, and
> `scripts/bootstrap-python-env` has been deleted. Phase 4 (VM-side alignment)
> is a separate concern owned by WORKSPACE-VM. This document defines the
> requirements and acceptance criteria for the layout contract.

---

**Cross-references:**

- [SPEC-BOOT-LAYOUT](../specifications/SPEC-BOOT-LAYOUT.md): companion specification (implementation detail)
- [HOOKS.md](../HOOKS.md): hook generation, `generate-hooks`, PATH-prepend contract
- [`config/banned_words.yaml`](../../config/banned_words.yaml): `\bpython3?\b` ban (use `uv run python` for hermetic invocation, never bare `python`)
- [`config/required_hooks.yaml`](../../config/required_hooks.yaml): canonical hook definitions
- [`lib/ci.sh`](../../lib/ci.sh): workspace root resolution, output helpers
- [`scripts/generate-hooks`](../../scripts/generate-hooks): hook template owner (PATH-prepend line)
- WORKSPACE-VM (sibling workspace root repo, not yet public): current owner of `.boot-linux/python-env/` bootstrap (via `bootstrap_python.sh`); under the new contract, VM keeps its own `.boot-linux/python-env/` at `/root/WORKSPACE-VM/.boot-linux/python-env/` for VM-internal ambient scripts, but CI and GUARD no longer assume it exists

---

## 1. Purpose & Scope

### 1.1 Purpose

Establish a single, hermetic, repository-self-sufficient toolchain layout
contract that every Independent-AI-Labs repository (WORKSPACE-CI, WORKSPACE-GUARD,
WORKSPACE-VM, and any future projects) can use to bootstrap its own runtime
dependencies without implicit cross-repo filesystem assumptions.

### 1.2 Scope

**This document OWNS the requirements for:**

- Physical layout of `.boot-linux/` directories (containing shared toolchain binaries AND optionally a `python-env/` sub-venv) and `.venv/` (private project venv) at any level of the workspace tree.
- Configuration schema declaring each repo's own `.boot-linux/`, `.venv/`,
  and any inherited `.boot-linux/` directories (ANCESTOR via walk-up OR
  SIBLING via explicit `inherit:` declaration).
- Walk-up PATH resolution algorithm for `.boot-linux/bin/` (child wins,
  prepended leftmost).
- Cross-repo Python invocation contract (always `uv run --project <path>
  --no-sync python -m ci.<check>`, never bare `python` from PATH).
- A non-blocking compliance check that verifies a scanned repo's
  `boot_layout.yaml` resolves to existing directories and any `uv run
  --project` references point at valid venvs.
- Eradication of WORKSPACE-VM-leaked `.boot-linux/` ownership assumptions
  from WORKSPACE-CI and WORKSPACE-GUARD.
- `Makefile::install-python-deps` exports `UV_PROJECT_ENVIRONMENT=<venv_dir>`
  when `boot_layout.yaml::venv_dir` is relocated away from the default
  `.venv/` (per FR-BL-2.4), so `uv sync` writes to the declared location.
- An OPTIONAL `install-boot` Makefile target for repos that bootstrap their
  own `.boot-linux/bin/` (CI's existing `install-gitleaks` already plays
  this role). The base 11-target contract shape (init / install / install-ci
  / install-hooks / sync / check / lint / type-check / test / clean /
  preflight) is preserved.

**This document DOES NOT:**

- Own the moon (moonrepo) workspace config schema (`.moon/workspace.yml`,
  `moon.yml`): those documents live in WORKSPACE-VM; this document only
  REQUIRES that moon `project:` custom metadata and `dependsOn` edges align
  with `boot_layout.yaml`.
- Own the `uv` toolchain's venv-creation semantics: that is uv's contract;
  this document requires that consumers USE `uv run --project` rather than
  attempting to share/symlink a venv across project boundaries.
- Mandate per-repo language choice or layer classification.
- Replace the `banned_words.yaml` `python3?` ban: that ban stays in force;
  this document REINFORCES it by specifying the only allowed alternative.

### 1.3 Glossary

| Term | Definition |
|------|------------|
| Boot directory | A directory named `.boot-linux/` containing hermetic toolchain binaries (and optionally `python-env/`, a uv-managed venv) consumed by hooks and tasks. Owner: exactly ONE repo. |
| Venv directory | A directory named `.venv/` created by `uv sync` at a project root containing `pyproject.toml`. Private to that project. NEVER shared. |
| Boot layout config | A YAML file at `config/boot_layout.yaml` in each repo that uses the boot/venv pattern. Declares own `boot_dir`, `venv_dir`, and `inherit:` list of ancestor OR sibling boot dirs. |
| PATH walk-up | Algorithm: from a starting directory, walk up the filesystem tree; at each level containing `.boot-linux/bin/`, prepend it to the accumulator. Child (closer to start) prepended leftmost → wins. Walk-up only reaches ANCESTORS: siblings are sideways, not up, and require explicit `inherit:` declaration. |
| Inheritance | Read-only consumption of another repo's `.boot-linux/bin/`: either an ANCESTOR via automatic walk-up OR a SIBLING via explicit `inherit:` declaration. Pure OS-path idiom. NOT a "contribution upstream": repos never write into another repo's `.boot-linux/`. |
| Cross-project invocation | Running a Python check from a sibling repo via `uv run --project <sibling> --no-sync python -m ci.<check>`. Uses the sibling's `.venv/` directly without modifying it. Distinct from boot-binary inheritance (which uses PATH walk-up + `inherit:` for tools like gitleaks). |
| Boot layout compliance check | A non-blocking check (`python -m ci.check_boot_venv_layout`) that audits a scanned repo's `boot_layout.yaml` resolution + any `--project` references. Emits warnings only, always exits 0. |
| Producer (boot) | A repo whose `.boot-linux/bin/` contains bootstrap artifacts (e.g. WORKSPACE-CI produces `gitleaks`). The boot dir is owned by that repo. |
| Consumer (boot) | A repo that inherits a producer's `.boot-linux/bin/` via PATH walk-up. The consumer never writes into the producer's boot dir. |
| Leaked dependency | A repo that hardcodes a path expecting an artifact a sibling repo creates, without declaring the relationship via `boot_layout.yaml` or `--project`. Today's `generate-hooks` PATH-prepend line is a leaked dependency. |

### 1.4 Ownership Split (post-refactor)

```
/root/
├── WORKSPACE-CI/
│   ├── .boot-linux/bin/
│   │   └── gitleaks          # OWNED by CI; bootstrap-gitleaks writes here
│   ├── .venv/                # PRIVATE: uv sync on CI's pyproject.toml
│   ├── config/
│   │   └── boot_layout.yaml  # declares own boot_dir + .venv/ + inherit list
│   └── pyproject.toml        # exists today
│
├── WORKSPACE-GUARD/
│   ├── .boot-linux/bin/
│   │   └── git-guard         # OWNED by GUARD; built guard binary (post-install to /usr/bin/git)
│   ├── config/
│   │   └── boot_layout.yaml  # declares: inherit [../WORKSPACE-CI/.boot-linux]
│   └── Cargo.toml            # NO pyproject.toml; NO .venv/
│
├── WORKSPACE-VM/
│   ├── .boot-linux/bin/
│   │   ├── cargo, rustc, ...  # OWNED by VM; VM-specific ambient tools
│   │   └── adb, cloudflared   # OWNED by VM
│   ├── .boot-linux/python-env/  # OWNED by VM; VM-specific ambient python venv
│   ├── .venv/                   # PRIVATE: uv sync on VM's pyproject.toml
│   ├── config/
│   │   └── boot_layout.yaml    # declares: inherit [../WORKSPACE-CI/.boot-linux]
│   └── pyproject.toml
│
└── /root/.boot-linux/      # FULLY DELETED under the new contract: no repo
                             # legitimately writes at /root/ (workspace root, not
                             # a repo root): every repo writes only into its
                             # own declared boot_dir under its own project root.
                             # Pre-refactor, bootstrap-gitleaks' walk-up logic
                             # short-circuited at this dir; per FR-BL-8.2 it now
                             # installs to CI's own boot_dir.
```

Each `.boot-linux/` is owned by the repo whose root contains it. Inheritance is
strictly read-only via PATH walk-up. No repo ever writes into a parent's or
sibling's `.boot-linux/`. Contrast with the pre-refactor state, where
`WORKSPACE-CI/scripts/bootstrap-gitleaks` wrote to `/root/.boot-linux/bin/`
(workspace-root level, outside CI's own subtree): that was a leaked
contribution-upstream pattern and is forbidden under FR-BL-1.3.

`/root/.boot-linux/bin/uv` (a Phase 5 future bootstrap-uv artifact) is NOT
shown in the tree above; uv is currently host-provided via `~/.local/bin/uv`
(see SPEC §11 Phase 5). CI's `.boot-linux/bin/` today contains only `gitleaks`.

---

## 2. Functional Requirements

### 2.1 Boot Directory Layout

#### FR-BL-1: Boot Directory Physical Location

| ID | Requirement |
|----|-------------|
| FR-BL-1.1 | A repo's own `.boot-linux/` directory MUST live at the repo's project root by default (relative path `.boot-linux/` from the primary manifest file: `pyproject.toml`, `Cargo.toml`, `Makefile`, or `moon.yml`, whichever is the repo's root marker). |
| FR-BL-1.2 | A repo MAY relocate its `.boot-linux/` to an arbitrary absolute or relative path via `config/boot_layout.yaml::boot_dir`. The location MUST be declared, never assumed. |
| FR-BL-1.3 | A repo MUST NOT write into any `.boot-linux/` directory outside its own `boot_dir` declaration. This is the "no contribution upstream" rule: only inheritance (read-only PATH walk-up) is permitted. |
| FR-BL-1.4 | Each `.boot-linux/` MUST have a single owning repo. Bootstrapping scripts (`bootstrap-gitleaks`, `bootstrap-uv`, etc.) MUST install artifacts into the owning repo's declared `boot_dir` only. |
| FR-BL-1.5 | A repo MAY have no `.boot-linux/` at all (declared `boot_dir: null` or omitted). It then inherits only via its `inherit:` list. |

#### FR-BL-2: Venv Directory Privacy

| ID | Requirement |
|----|-------------|
| FR-BL-2.1 | A repo's `.venv/` directory MUST be created by `uv sync` at the repo's project root containing `pyproject.toml`. The venv is PRIVATE to that repo. |
| FR-BL-2.2 | A repo MUST NOT share, symlink, or expose its `.venv/` to a sibling or ancestor. Cross-repo venv sharing is an anti-pattern (Poetry maintainer, uv docs: "the environment will be overwritten by invocations in each project"). |
| FR-BL-2.3 | A repo without a `pyproject.toml` MUST NOT create a `.venv/`; it declares `venv_dir: null` in `boot_layout.yaml` and invokes Python from a sibling via `uv run --project <sibling> --no-sync` (FR-BL-6). |
| FR-BL-2.4 | A repo MAY relocate its `.venv/` via `config/boot_layout.yaml::venv_dir` (absolute or relative). When relocated, `UV_PROJECT_ENVIRONMENT=<venv_dir>` MUST be exported by `make install-python-deps` so `uv sync` writes to the declared location. |
| FR-BL-2.5 | No hook script, Makefile target, or CI check MAY invoke `python`/`python3` as a bare command. The `banned_words.yaml` rule at L234-236 stays in force. Hermetic Python invocation is always `uv run python` (own repo) or `uv run --project <path> --no-sync python` (cross-repo). |

#### FR-BL-3: Inherited Boot Dirs (Ancestor via walk-up OR Sibling via explicit declaration)

| ID | Requirement |
|----|-------------|
| FR-BL-3.1 | A repo MAY declare `inherit:` in `config/boot_layout.yaml`: a YAML list of filesystem paths (relative-or-absolute) to ANCESTOR or SIBLING boot directories to consume read-only. Sibling paths (e.g. `../WORKSPACE-CI/.boot-linux`) are the canonical cross-repo sharing mechanism; walk-up alone cannot reach siblings because they are sideways in the filesystem tree, not upward. |
| FR-BL-3.2 | Each entry in `inherit:` MUST be the path of an `.boot-linux/` directory (with or without trailing slash; not the `bin/` subdir: the walker appends `/bin`). |
| FR-BL-3.3 | The walker MUST skip silently any `inherit:` entry that does not exist on disk (emits INFO in the compliance check, NOT a warning: soft optional is useful for "VM might or might not be present" cases). |
| FR-BL-3.4 | A repo MUST NOT declare a sibling's `.boot-linux/` in `inherit:` if that sibling is not declared in the moon project graph (`moon.yml::dependsOn`). Doing so is an undeclared-dependency violation and the compliance check MUST emit a warning (non-blocking). |

### 2.2 PATH Resolution

#### FR-BL-4: Walk-Up Algorithm

| ID | Requirement |
|----|-------------|
| FR-BL-4.1 | Hook generation (`scripts/generate-hooks`) MUST emit a PATH-prepend line computed by a `ci_resolve_boot_path()` function in `lib/ci.sh`. |
| FR-BL-4.2 | `ci_resolve_boot_path(<start-dir>)` MUST walk up from `<start-dir>` to `/`, prepending `<dir>/.boot-linux/python-env/bin` (when present) and `<dir>/.boot-linux/bin` (when present) to the accumulator in that order at each level. |
| FR-BL-4.3 | The walk-up order MUST produce a PATH-style string with the child (closest to `<start-dir>`) leftmost (highest precedence: child wins). |
| FR-BL-4.4 | The emitted PATH-prepend in a generated hook MUST also include explicit `inherit:` entries from `config/boot_layout.yaml`, prepended AFTER the walk-up results (so declared inheritance wins over incidental walk-up discovery). |
| FR-BL-4.5 | If no `.boot-linux/` exists at any walked level AND `inherit:` is empty/absent, the PATH-prepend MUST be a no-op (the hook falls back to ambient PATH). The hook MUST NOT fail solely because no boot dir is found. |
| FR-BL-4.6 | The PATH-prepend line in generated hooks MUST be a single `export PATH=...` statement. Re-invocation of the hook in a nested shell MAY produce duplicate PATH entries (the walker does NOT deduplicate); this is acceptable because POSIX PATH resolution is leftmost-wins and the duplicate entries resolve to the same binaries. See SPEC §10.2 and §10.5. |

### 2.3 Boot Layout Config Schema

#### FR-BL-5: `config/boot_layout.yaml` Schema

| ID | Requirement |
|----|-------------|
| FR-BL-5.1 | Each repo that uses the boot/venv pattern MUST ship a `config/boot_layout.yaml`. Repos with no `.boot-linux/` and no `.venv/` MAY omit it (the compliance check skips them). |
| FR-BL-5.2 | `boot_layout.yaml` MUST support keys: `boot_dir` (string\|null, default `.boot-linux/`), `venv_dir` (string\|null, default `.venv/`), `inherit` (list of paths, default `[]`). |
| FR-BL-5.3 | `boot_layout.yaml` MAY support a `version:` field (integer, default 1) for forward-compat schema migration. |
| FR-BL-5.4 | `boot_layout.yaml` MAY support a `comment:` field (free text) for human-readable rationale and ownership notes. |
| FR-BL-5.5 | Paths in `boot_layout.yaml` MUST be relative to the repo root (the directory containing `boot_layout.yaml`'s parent `config/`), or absolute. Relative paths MAY use `..` segments for cross-sibling references (e.g. `../WORKSPACE-CI/.boot-linux` is the canonical GUARD→CI pattern). The compliance check MUST NOT warn solely on `..` usage; it MUST warn only if the resolved path is world-writable (per NFR-BL-3.2) or if the target repo is not declared in `moon.yml::dependsOn` (per FR-BL-3.4). |
| FR-BL-5.6 | `config/boot_layout.yaml` MUST be the single source of truth for boot inheritance. Generated hooks, Makefiles, and moon.yml metadata MUST read from this file: never duplicate the inheritance list. |

### 2.4 Cross-Project Python Invocation

#### FR-BL-6: `uv run --project` Contract

| ID | Requirement |
|----|-------------|
| FR-BL-6.1 | A hook in a sibling repo that needs to invoke Python checks from WORKSPACE-CI MUST use `uv run --project <ci-path> --no-sync python -m ci.<check> <args>`. |
| FR-BL-6.2 | `<ci-path>` MUST be resolvable relative to the sibling's repo root (the hook template MUST emit the correct relative path via `generate-hooks`'s existing `${_ci_rel}` variable: today `../CI`, adapts to nesting). |
| FR-BL-6.3 | `--no-sync` MUST be passed when invoking a sibling's `.venv/` so the sibling's `uv.lock` is not mutated by the consumer's hook run. |
| FR-BL-6.4 | CWD MUST stay at the sibling's repo root so `--all-md` and other CWD-relative arguments resolve against the sibling's tree (not the producer's). |
| FR-BL-6.5 | WORKSPACE-CI's own hooks (invoked from CI's own CWD) MUST continue to use `uv run python -m ci.<check>` (no `--project` flag: uv discovers CI's `.venv/` natively). |
| FR-BL-6.6 | No hook script MAY use `VIRTUAL_ENV` activation, `source .../activate`, or environment-via-PATH-only python resolution. The `--project` flag is the sole mechanism for cross-repo Python. |

### 2.5 Compliance Check

#### FR-BL-7: Non-Blocking Layout Audit

| ID | Requirement |
|----|-------------|
| FR-BL-7.1 | A new `ci/check_boot_venv_layout.py` module MUST be added to WORKSPACE-CI. It MUST be invokeable as `uv run python -m ci.check_boot_venv_layout [PROJECT_DIR]`. |
| FR-BL-7.2 | The check MUST scan the given project dir (default CWD) for `config/boot_layout.yaml`. If absent, it MUST exit 0 with an info message (not a violation). |
| FR-BL-7.3 | For each field in `boot_layout.yaml`: `boot_dir` MUST resolve to an existing directory OR be null; `venv_dir` MUST resolve to an existing directory containing `bin/python` OR be null; each `inherit:` entry MUST resolve to an existing `.boot-linux/`. |
| FR-BL-7.4 | The check MUST scan the repo's `.pre-commit-config.yaml` for any `uv run --project <path> --no-sync python -m ci.<check>` entries and verify the referenced `<path>` contains a `pyproject.toml` and a `.venv/bin/python`. Failures are warnings, exit 0. |
| FR-BL-7.5 | The check MUST scan the repo's `moon.yml` (if present) for a `project:` block custom field `bootDir`/`parentBoot` and verify consistency with `boot_layout.yaml`. Mismatches are warnings, exit 0. |
| FR-BL-7.6 | The check MUST emit a scoring report on stdout (one row per finding, format `OK\|WARN\|INFO  <path>:<line>  <message>`) and a trailing summary line `boot-layout: <n-ok> ok, <n-warn> warnings, <n-info> info`. |
| FR-BL-7.7 | The check MUST always exit 0: it is a non-blocking advisory audit. The exit code MUST NOT influence the pre-commit gate. |
| FR-BL-7.8 | The check MUST be registered in WORKSPACE-CI's own `.pre-commit-config.yaml` (pre-commit stage) so the CI repo self-audits on every commit. It SHOULD be added to `config/required_hooks.yaml` as tier=`poc` (safety subset) so consumers inherit it. |

### 2.6 Eradication of Leaked Dependencies

#### FR-BL-8: Leaks to Eliminate

| ID | Requirement |
|----|-------------|
| FR-BL-8.1 | `scripts/generate-hooks` MUST remove the hardcoded `${CI_WORKSPACE_ROOT}/.boot-linux/python-env/bin:${CI_WORKSPACE_ROOT}/.boot-linux/bin` PATH-prepend (lines 104-111) and replace it with `ci_resolve_boot_path()` invocation per FR-BL-4. |
| FR-BL-8.2 | `scripts/bootstrap-gitleaks` MUST install gitleaks into the CI repo's own `.boot-linux/bin/` (resolved from `config/boot_layout.yaml::boot_dir`), NOT into `${CI_WORKSPACE_ROOT}/.boot-linux/bin/`. |
| FR-BL-8.3 | The `bootstrap-python-env` script added during the 2026-06-25 session MUST be deleted entirely. Neither CI nor GUARD needs `.boot-linux/python-env/` under the new model: CI's python is its private `.venv/` and GUARD invokes CI's venv via `uv run --project`. VM keeps its OWN `.boot-linux/python-env/` at `/root/WORKSPACE-VM/.boot-linux/python-env/` for VM-internal ambient scripts (per cross-reference); that is VM's owned concern, not a legacy artifact. |
| FR-BL-8.4 | The `install-python-env` Makefile target and its prereq in `install-deps`/`sync` MUST be removed. |
| FR-BL-8.5 | The `bootstrap-python-env` entry in `scripts/manifest.yaml` MUST be removed. |
| FR-BL-8.7 | The `uv run ruff format` / `uv run ruff check` / `uv run python -m mypy` / `uv run python -m ci.check_markdown_docs` / `uv run python -m ci.check_required_hooks_present` hook entries in WORKSPACE-CI's `.pre-commit-config.yaml` MUST be preserved (REVERT any 2026-06-25 session edits that stripped `uv run`). |
| FR-BL-8.8 | The `2>/dev/null` swallows in `check-dependency-versions` and `check-duplicate-dependencies` hook entries (`.pre-commit-config.yaml` L58, L65) MUST be eradicated (replaced with `||` + explicit `echo ... >&2; exit 1` pattern: no more silent /dev/null suppression). |
| FR-BL-8.9 | WORKSPACE-GUARD's `check-markdown-docs` hook entry MUST switch from bare `python -m ci.check_markdown_docs` (a 2026-06-25 session edit that violated `banned_words.yaml:236`) to `uv run --project ../CI --no-sync python -m ci.check_markdown_docs --all-md --check-remote` (per FR-BL-6.1). |
| FR-BL-8.10 | The `/root/.boot-linux/python-env/` directory and `/root/.boot-linux/bin/python` symlink created during the 2026-06-25 session MUST be deleted. They duplicate VM's `bootstrap_python.sh` role and violate FR-BL-1.3 (no contribution upstream). |

---

## 3. Non-Functional Requirements

### NFR-BL-1: Idempotency & Determinism

| ID | Requirement |
|----|-------------|
| NFR-BL-1.1 | `ci_resolve_boot_path()` MUST be a pure function (same input → same output; no side effects, no network, no reads outside filesystem metadata). |
| NFR-BL-1.2 | The walk-up MUST terminate in O(depth) steps; bounded by hitting `/` from the start dir. |
| NFR-BL-1.3 | Re-running hook generation against the same `boot_layout.yaml` and same filesystem state MUST produce byte-identical PATH-prepend lines. |
| NFR-BL-1.4 | Re-running `make install` (full bootstrap) when all artifacts exist and are version-current MUST be a no-op (no re-downloads, no re-builds). |

### NFR-BL-2: Portability

| ID | Requirement |
|----|-------------|
| NFR-BL-2.1 | `ci_resolve_boot_path()` MUST work under bash 4.3+ (the existing `lib/ci.sh` baseline) without process substitution (PRoot-safe, conforms to `check_portable_shell`). |
| NFR-BL-2.2 | `config/boot_layout.yaml` paths MUST use POSIX forward slashes. No drive letters, no backslashes. |
| NFR-BL-2.3 | The boot layout contract MUST be VM-agnostic: WORKSPACE-CI and WORKSPACE-GUARD MUST be installable and fully hook-functional in a checkout that contains NO WORKSPACE-VM tree. Neither CI nor GUARD declares `inherit:` entries pointing at VM's `.boot-linux/` (the dependency direction is reversed under the new contract: VM inherits from CI, not vice versa). VM's `inherit: [../WORKSPACE-CI/.boot-linux]` is a VM-side concern, not a CI/GUARD concern. |

### NFR-BL-3: Security

| ID | Requirement |
|----|-------------|
| NFR-BL-3.1 | `ci_resolve_boot_path()` MUST NOT follow symlinks at intermediate path components. The walker uses `dirname` on the start path's physical-absolute form (the caller MUST pass `pwd -P`-resolved absolute paths). `dirname` is string-only and never stats intermediate dirs, so a symlink planted between two `.boot-linux/` layers cannot redirect tool lookup. Existence checks via `[[ -d ... ]]` only apply to the FINAL `<dir>/.boot-linux/bin` component: a symlinked `.boot-linux` at the leaf layer IS followed; this is acceptable because the leaf dir is the consumer's own declared endpoint, not an attacker's intermediate hop. |
| NFR-BL-3.2 | The `inherit:` list MUST NOT contain paths whose resolved `.boot-linux/` directory OR `bin/` subdir is world-writable (`chmod -o+w` on the leaf dir). The compliance check MUST warn (non-blocking) on such paths. Verifying the entire parent chain for world-writable segments is OUT OF SCOPE: an attacker controlling `/tmp` could plant arbitrary dirs; the contract assumes the workspace root is trusted. The leaf-dir check catches accidental `chmod 777` on `.boot-linux/` itself. |
| NFR-BL-3.3 | Bootstrapping scripts MUST verify downloaded binary checksums (gitleaks already does: `bootstrap-gitleaks` L88-104). Any new bootstrap script (e.g. future `bootstrap-uv`) MUST follow the same SHA256-pinning pattern. |
| NFR-BL-3.4 | The boot layout contract MUST NOT weaken the existing `banned_words.yaml` `python3?` ban. Bare `python` from PATH remains banned; FR-BL-6 provides the only hermetic alternative. |

### NFR-BL-4: Backwards Compatibility

| ID | Requirement |
|----|-------------|
| NFR-BL-4.1 | During the transitional window (one release cycle after this REQ ships): a repo WITHOUT `config/boot_layout.yaml` MUST still work: generated hooks fall back to the ambient PATH only (no PATH-prepend). Any pre-existing hardcoded `CI_WORKSPACE_ROOT/.boot-linux/...` PATH-prepend in `generate-hooks` MUST be removed in Phase 2 of SPEC §11; no legacy fallback pathway is retained. |
| NFR-BL-4.2 | After the transitional window, absence of `boot_layout.yaml` becomes a compliance INFO (per FR-BL-7.2): the repo simply runs on ambient PATH. WORKSPACE-VM keeps `bootstrap_python.sh` because VM serves its OWN ambient scripts at `/root/WORKSPACE-VM/.boot-linux/python-env/bin/python`; this is VM's owned concern under the new contract, not a legacy artifact. |

### NFR-BL-5: moon Integration

| ID | Requirement |
|----|-------------|
| NFR-BL-5.1 | A repo's `moon.yml` MAY declare `project.bootDir` and `project.parentBoot` custom fields (moon v2 custom metadata) mirroring `boot_layout.yaml` for descriptive purposes. The compliance check MUST verify these mirror the YAML. |
| NFR-BL-5.2 | A repo that declares `inherit: [../WORKSPACE-CI/.boot-linux]` in `boot_layout.yaml` MUST also declare `dependsOn: [ci]` in its `moon.yml`. The compliance check MUST warn on `inherit:` entries whose target repo is not in the consuming repo's `dependsOn`. |
| NFR-BL-5.3 | moon's `dependsOn` graph MUST reflect boot-inheritance direction (consumer dependsOn producer). Reverse direction is a constraint violation. |

---

## 4. Open Questions

1. Should `config/boot_layout.yaml` be ONE file per repo, or also support a
   `boot_layout.yaml` at intermediate directory levels (e.g. at the directory
   owning `/root/.boot-linux/`) that would override child configs?
   Decision: ONE file per repo. Intermediate-level boot dirs are reached
   via walk-up only, never declared via config. There is no `/root/.boot-linux/`
   owner under the new contract; `/root/.boot-linux/` is deleted (FR-BL-8.10
   extends to legacy artifacts at that path).

2. Should the walk-up algorithm also look for `.venv/bin/` (i.e. expose a
   python from a walked-up parent's `.venv/`)? **No.** FR-BL-2 makes `.venv/`
   private; python cross-repo always goes through `uv run --project`. The
   walk-up is for `.boot-linux/bin/` (binaries like gitleaks)
   only.

3. Should the compliance check (`check_boot_venv_layout.py`) ever become
   blocking? Decision: no: it stays advisory forever. Blocking would
   prevent bootstrap from running on a fresh checkout where the venv doesn't
   exist yet (chicken-and-egg).

4. Should `inherit:` entries support glob patterns (e.g. `../*/.boot-linux/`
   to inherit from ALL siblings that have one)? Decision: no. Glob
   inheritance is fragile and can introduce undeclared dependencies. Each
   inherited boot dir is listed explicitly.

5. Should WORKSPACE-VM (the workspace root repo) ship an
   `inherit: [../WORKSPACE-CI/.boot-linux]` so VM consumes CI's gitleaks?
   Or should VM install its OWN gitleaks copy?
   Decision: VM inherits CI's gitleaks via EXPLICIT `inherit:` declaration
   (sibling reference, NOT ancestor walk-up). Walk-up from
   `/root/WORKSPACE-VM/` walks UP through `/root` and `/`: it does NOT cross
   sideways into `/root/WORKSPACE-CI/` (siblings are sideways, not up).
   Therefore walk-up alone cannot reach CI's `.boot-linux/`; VM's
   `boot_layout.yaml` MUST list `../WORKSPACE-CI/.boot-linux` in `inherit:`
   explicitly. VM does NOT install its own gitleaks copy: that would
   duplicate CI's role. Per NFR-BL-5.2 the explicit `inherit:` declaration
   comes with a corresponding `moon.yml::dependsOn: [ci]` edge.

6. Should the `inherit:` mechanism support a priority/scope field
   (e.g. "inherit gitleaks from CI but rust from VM")? Decision: no.
   PATH-walk-up is uniform; precedence is positional (later-listed entries
   get prepended later, so they win). If a tool exists in two inherited
   dirs, the LATER entry in the `inherit:` list wins.

---

## 5. Verification

| # | Test | Maps to |
|---|------|---------|
| 1 | Fresh checkout of WORKSPACE-CI; run `make install`; verify `.venv/bin/python -c "import ci, httpx"` succeeds; verify no `.boot-linux/python-env/` is created by CI. | FR-BL-2.1, FR-BL-8.3 |
| 2 | Fresh checkout of WORKSPACE-GUARD (no WORKSPACE-VM anywhere on the disk); run `make install-hooks`; verify `.git/hooks/pre-commit` is generated; verify the `check-markdown-docs` entry reads `uv run --project ../CI --no-sync python -m ci.check_markdown_docs --all-md --check-remote`. | FR-BL-1.3, FR-BL-6.1, FR-BL-8.9 |
| 3 | From WORKSPACE-GUARD CWD run the generated pre-commit hook; verify `uv run --project ../CI --no-sync python -m ci.check_markdown_docs` resolves to CI's `.venv/bin/python` and `import ci` succeeds; verify no mutation of CI's `uv.lock` (mtime check before/after). | FR-BL-6.3, FR-BL-6.4 |
| 4 | Run `ci_resolve_boot_path /root/WORKSPACE-GUARD` (assuming GUARD's `.boot-linux/bin` exists and its `boot_layout.yaml::inherit` lists `../WORKSPACE-CI/.boot-linux`); confirm the output is `/root/WORKSPACE-CI/.boot-linux/bin:/root/WORKSPACE-GUARD/.boot-linux/bin:` (inherit entry leftmost because it is prepended AFTER walk-up; CI's gitleaks wins over any duplicate binary in GUARD's own `.boot-linux/bin`). If GUARD's `.boot-linux/bin` does NOT exist (fresh checkout), confirm the output is just `/root/WORKSPACE-CI/.boot-linux/bin:`. The legacy `/root/.boot-linux/bin/` MUST NOT appear (it is fully deleted per the post-refactor contract). | FR-BL-4.2, FR-BL-4.3, FR-BL-8.10 |
| 5 | Run `ci_resolve_boot_path /root/WORKSPACE-VM` with WORKSPACE-VM present and VM's `boot_layout.yaml::inherit: [../WORKSPACE-CI/.boot-linux]`; confirm the output is `/root/WORKSPACE-CI/.boot-linux/bin:/root/WORKSPACE-VM/.boot-linux/python-env/bin:/root/WORKSPACE-VM/.boot-linux/bin:` (inherit prepended AFTER walk-up; CI's gitleaks wins leftmost; VM's own python-env and bin follow). The legacy `/root/.boot-linux/bin/` MUST NOT appear. | FR-BL-4.2, FR-BL-4.3, FR-BL-8.10 |
| 6 | Verify `/root/.boot-linux/` does not exist on disk after Phase 1 of SPEC §11 (full cleanup: `/root/.boot-linux/python-env/` + `/root/.boot-linux/bin/python` + any other leftover artifacts deleted). Running `make install` in CI MUST NOT recreate it; CI writes only to `/root/WORKSPACE-CI/.boot-linux/bin/` per FR-BL-1.3. | FR-BL-8.10, FR-BL-1.3 |
| 7 | Run `uv run --no-sync --project /root/WORKSPACE-CI python -c "import ci"` from `/root/WORKSPACE-GUARD`; verify exit 0 and no `uv.lock` mtime change in CI. | FR-BL-6.3 |
| 8 | Run `uv run python -m ci.check_boot_venv_layout /root/WORKSPACE-CI`; confirm it emits `OK` rows for `boot_dir` and `venv_dir` and exits 0. | FR-BL-7.1, FR-BL-7.3 |
| 9 | Run `uv run python -m ci.check_boot_venv_layout /root/WORKSPACE-GUARD`; confirm it emits `WARN` for missing `venv_dir` (GUARD has none), `OK` for `inherit: [../WORKSPACE-CI/.boot-linux]`, exits 0. | FR-BL-7.3 |
| 10 | Manually break `inherit:` in GUARD's `boot_layout.yaml` (point at a non-existent dir); rerun the compliance check; confirm `INFO` rows for the broken entry (per FR-BL-3.3: non-existent inherit entries are soft-optional, NOT warnings) and exit 0. Then break it differently: point at an existing FILE (not dir); confirm `WARN` and exit 0. | FR-BL-7.3, FR-BL-7.7, FR-BL-3.3 |
| 11 | GUARD's `moon.yml` declares `dependsOn: [ci]` and `boot_layout.yaml::inherit: [../WORKSPACE-CI/.boot-linux]`; the compliance check emits `OK`. Flip `dependsOn` to `[]` and rerun; the check MUST emit `WARN` (inherit-without-deps violation). | NFR-BL-5.2 |
| 12 | From WORKSPACE-GUARD, trigger pre-commit; verify `gitleaks` resolves via GUARD's EXPLICIT `inherit: [../WORKSPACE-CI/.boot-linux]` to `/root/WORKSPACE-CI/.boot-linux/bin/gitleaks`. Walk-up alone from `/root/WORKSPACE-GUARD` only reaches `/root/WORKSPACE-GUARD/.boot-linux/bin/` and `/root/.boot-linux/bin/` (the latter is deleted); it would NOT reach `/root/WORKSPACE-CI/.boot-linux/` (CI is a sibling, NOT an ancestor). The explicit `inherit:` declaration is REQUIRED for sibling-to-sibling boot sharing. | FR-BL-3.1, FR-BL-4.4, NFR-BL-5.2 |
| 13 | Inspect WORKSPACE-CI's `.pre-commit-config.yaml` `check-markdown-docs` entry; verify it reads `uv run python -m ci.check_markdown_docs` (NOT bare `python`, NOT `uv run --project`). | FR-BL-6.5, FR-BL-8.7 |
| 14 | Inspect `scripts/generate-hooks`; verify the PATH-prepend line is computed from `ci_resolve_boot_path()` and not hardcoded to `${CI_WORKSPACE_ROOT}/.boot-linux/...`. | FR-BL-8.1 |