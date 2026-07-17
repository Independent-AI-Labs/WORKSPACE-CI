# REQ-BOOT-LAYOUT: Platform-Aware Hermetic Boot Directory Layout

**Date:** 2026-07-10
**Status:** Active
**Type:** Requirements
**Specification:** [SPEC-BOOT-LAYOUT](../specifications/SPEC-BOOT-LAYOUT.md)

> This document defines the requirements for the platform-aware,
> hermetic boot-directory layout used across the workspace. The boot
> directory name is determined at runtime by `ci_boot_name()` -- no
> fallbacks, no escape hatches, no legacy compatibility. The boot
> directory location is `CI_PROJECT_ROOT/$CI_BOOT_NAME/` -- hermetic per
> project, never shared at workspace root. Boot-directory inheritance is
> declared in `moon.yml::project.inherited_boot_dirs` -- there is no
> separate `boot_layout.yaml` file.

---

**Cross-references:**

- [SPEC-BOOT-LAYOUT](../specifications/SPEC-BOOT-LAYOUT.md): companion specification (implementation detail)
- [RUNBOOK-HOOKS](../runbooks/RUNBOOK-HOOKS.md): hook generation, `generate-hooks`, PATH-prepend contract
- [`config/banned_words.yaml`](../../config/banned_words.yaml): `\bpython3?\b` ban (use `uv run python` for hermetic invocation, never bare `python`)
- [`config/required_hooks.yaml`](../../config/required_hooks.yaml): canonical hook definitions
- [`lib/ci.sh`](../../lib/ci.sh): workspace root resolution, platform detection, boot path resolver, output helpers
- [`scripts/generate-hooks`](../../scripts/generate-hooks): hook template owner (PATH-prepend line)
- [`moon.yml`](../../moon.yml): boot-layout inheritance declaration (`project.inherited_boot_dirs`)

---

## 1. Purpose & Scope

### 1.1 Purpose

Establish a single, platform-aware, hermetic, repository-self-sufficient
toolchain layout contract that every project repository can use to
bootstrap its own runtime dependencies without implicit cross-repo
filesystem assumptions. The boot directory name adapts to the host
platform (`ci_boot_name()` returns `.boot-macos` on Darwin, `.boot-linux`
on Linux) and the boot directory lives at the project root, not the
workspace root.

### 1.2 Scope

**This document OWNS the requirements for:**

- Physical layout of platform-aware boot directories (`$CI_BOOT_NAME/`
  containing shared toolchain binaries AND optionally a `python-env/`
  sub-venv) and `.venv/` (private project venv) at each project root.
- Platform detection (`ci_platform_name()`) and boot directory name
  resolution (`ci_boot_name()`, `ci_boot_dir()`).
- Portable relative path computation (`ci_relative_path()`) replacing
  GNU-specific `realpath --relative-to`.
- The `moon.yml::project.inherited_boot_dirs` schema: declaring each
  repo's inherited boot directories (ANCESTOR via walk-up OR SIBLING via
  explicit declaration).
- Walk-up PATH resolution algorithm for `$CI_BOOT_NAME/bin/` (child
  wins, prepended leftmost).
- Cross-repo Python invocation contract (always `uv run --project <path>
  --no-sync python -m ci.<check>`, never bare `python` from PATH).
- A non-blocking compliance check that verifies a scanned repo's
  `moon.yml::project.inherited_boot_dirs` entries resolve to existing
  directories and any `uv run --project` references point at valid venvs.
- Eradication of workspace-root-level `.boot-linux/` ownership
  assumptions (no repo writes outside its own `CI_PROJECT_ROOT`).
- OS-aware hook generation: `generate-hooks` emits PATH entries using
  `ci_resolve_boot_path()` instead of hardcoded `.boot-linux` paths.
- Dual-marker workspace root detection (`.boot-linux` OR `.boot-macos`).
- Bootstrap script platform-aware default directory (inline detection,
  no `ci.sh` dependency).
- CLI wrapper portable readlink replacement and platform-aware boot dir.
- Linter exclude patterns, `.gitignore`, and root `Makefile` computed
  boot-name variable.
- macOS support: Homebrew-based system dependency installation,
  platform-aware bootstrapping (Rust host triple, gitleaks tarball
  naming, `ci_sha256()` portable checksum helper).

**This document DOES NOT:**

- Own the moon (moonrepo) workspace config schema (`.moon/workspace.yml`,
  `moon.yml`): those documents live in WORKSPACE-VM; this document only
  REQUIRES that moon `project.inherited_boot_dirs` and `dependsOn` edges
  are aligned.
- Own the `uv` toolchain's venv-creation semantics: that is uv's
  contract; this document requires that consumers USE
  `uv run --project` rather than attempting to share/symlink a venv
  across project boundaries.
- Mandate per-repo language choice or layer classification.
- Replace the `banned_words.yaml` `python3?` ban: that ban stays in
  force; this document REINFORCES it by specifying the only allowed
  alternative.
- Own the content of the boot directory (which tools, versions, or
  their configuration).
- Own systemd service templates (Linux-only, not applicable to macOS).
- Own the git-guard binary compilation and installation (covered by CI
  project contracts).

### 1.3 Terminology

| Term | Definition |
|------|------------|
| Boot directory | A directory named `$CI_BOOT_NAME/` (e.g. `.boot-linux/` on Linux, `.boot-macos/` on macOS) containing hermetic toolchain binaries (and optionally `python-env/`, a uv-managed venv) consumed by hooks and tasks. Owner: exactly ONE repo. Lives at `CI_PROJECT_ROOT/$CI_BOOT_NAME/`. |
| Boot name | The directory name portion: `.boot-linux` or `.boot-macos`. Derived from `uname -s` via `ci_boot_name()`. Single source of truth for the directory name. |
| Boot path | The absolute filesystem path to the boot directory (e.g. `/path/to/project/.boot-macos`). |
| Platform | The host operating system: `linux` or `darwin` (lowercase, from `uname -s`). |
| Venv directory | A directory named `.venv/` created by `uv sync` at a project root containing `pyproject.toml`. Private to that project. NEVER shared. |
| inherited_boot_dirs | A YAML list field under `project:` in `moon.yml`. Each entry is a PROJECT-ROOT path (e.g. `'../CI'`), NOT a boot-dir path. The resolver appends `/$CI_BOOT_NAME/bin` at runtime, making entries platform-aware by construction. |
| PATH walk-up | Algorithm: from a starting directory, walk up the filesystem tree; at each level containing `$CI_BOOT_NAME/bin`, prepend it to the accumulator. Child (closer to start) prepended leftmost → wins. Walk-up only reaches ANCESTORS: siblings are sideways, not up, and require explicit `inherited_boot_dirs` declaration. |
| Inheritance | Read-only consumption of another repo's boot dir `bin/`: either an ANCESTOR via automatic walk-up OR a SIBLING via explicit `inherited_boot_dirs` declaration. Pure OS-path idiom. NOT a "contribution upstream": repos never write into another repo's boot dir. |
| Cross-project invocation | Running a Python check from a sibling repo via `uv run --project <sibling> --no-sync python -m ci.<check>`. Uses the sibling's `.venv/` directly without modifying it. Distinct from boot-binary inheritance (which uses PATH walk-up + `inherited_boot_dirs` for tools like gitleaks). |
| Boot layout compliance check | A non-blocking check (`python -m ci.check_boot_venv_layout`) that audits a scanned repo's `moon.yml::project.inherited_boot_dirs` resolution + any `--project` references. Emits warnings only, always exits 0. |
| Producer (boot) | A repo whose boot dir contains bootstrap artifacts (e.g. CI produces `gitleaks`). The boot dir is owned by that repo. |
| Consumer (boot) | A repo that inherits a producer's boot dir via PATH walk-up. The consumer never writes into the producer's boot dir. |
| Leaked dependency | A repo that hardcodes a path expecting an artifact a sibling repo creates, without declaring the relationship via `inherited_boot_dirs` or `--project`. |
| Workspace root | The top-level directory of the monorepo, identified by `pyproject.toml` or `Makefile` and a boot directory. |
| Workspace marker | A directory (`.boot-linux` or `.boot-macos`) whose presence at a given path identifies that path as a workspace root during directory traversal. |
| `ci.sh` | The CI core library (`projects/CI/lib/ci.sh`) sourced by every generated hook and CI script. Provides platform detection, path resolution, output helpers, and the boot directory resolver. |
| Hook generation | The process by which `scripts/generate-hooks` reads `.pre-commit-config.yaml` and emits native bash git hooks to `.git/hooks/`. |
| Generated hook | A bash script written to `.git/hooks/{pre-commit,commit-msg,pre-push}` by the hook generation process. Sources `ci.sh` at runtime. |

### 1.4 Ownership Split

```
workspace/
├── projects/
│   ├── CI/
│   │   ├── $CI_BOOT_NAME/bin/       # OWNED by CI; gitleaks, uv, etc.
│   │   ├── .venv/                    # PRIVATE: uv sync on CI's pyproject.toml
│   │   ├── moon.yml                  # inherited_boot_dirs: [] (root)
│   │   └── pyproject.toml
│   │
│   ├── GUARD/
│   │   ├── $CI_BOOT_NAME/bin/       # OWNED by GUARD; built guard binary
│   │   ├── moon.yml                  # inherited_boot_dirs: ['../CI']
│   │   └── Cargo.toml                # NO pyproject.toml; NO .venv/
│   │
│   └── DATAOPS/
│       ├── $CI_BOOT_NAME/bin/       # OWNED by DATAOPS
│       ├── .venv/                    # PRIVATE: uv sync on DATAOPS's pyproject.toml
│       ├── moon.yml                  # inherited_boot_dirs: ['../CI']
│       └── pyproject.toml
│
└── (NO .boot-* at workspace root -- fully eliminated)
```

Each boot directory is owned by the repo whose `CI_PROJECT_ROOT` contains
it. The directory name is `ci_boot_name()` -- platform-determined, not
hardcoded. Inheritance is strictly read-only via PATH walk-up. No repo
ever writes into a parent's or sibling's boot directory.

---

## 2. Functional Requirements

### FR-1: Boot Directory Physical Location

| ID | Requirement |
|----|-------------|
| FR-1.1 | A repo's own boot directory MUST live at `CI_PROJECT_ROOT/$CI_BOOT_NAME/`. The location is determined by `CI_PROJECT_ROOT` (set by `ci.sh` at source-time) and `ci_boot_name()` (platform-determined). The location MUST NOT be overridden by any environment variable. |
| FR-1.2 | `ci_boot_name()` is the single source of truth for the boot directory name. No script, Makefile, or configuration file MAY hardcode `.boot-linux` or `.boot-macos` as a literal directory name where the runtime boot directory is concerned. |
| FR-1.3 | A repo MUST NOT write into any boot directory outside its own `CI_PROJECT_ROOT/$CI_BOOT_NAME/`. This is the "no contribution upstream" rule: only inheritance (read-only PATH walk-up) is permitted. |
| FR-1.4 | Each boot directory MUST have a single owning repo. Bootstrapping scripts (`bootstrap-gitleaks`, `bootstrap-uv`, etc.) MUST install artifacts into the owning repo's `CI_PROJECT_ROOT/$CI_BOOT_NAME/bin/` only. |
| FR-1.5 | A repo MAY have no boot directory at all. It then inherits only via its `inherited_boot_dirs` list. |

### FR-2: Venv Directory Privacy

| ID | Requirement |
|----|-------------|
| FR-2.1 | A repo's `.venv/` directory MUST be created by `uv sync` at the repo's project root containing `pyproject.toml`. The venv is PRIVATE to that repo. |
| FR-2.2 | A repo MUST NOT share, symlink, or expose its `.venv/` to a sibling or ancestor. Cross-repo venv sharing is an anti-pattern. |
| FR-2.3 | A repo without a `pyproject.toml` MUST NOT create a `.venv/`; it invokes Python from a sibling via `uv run --project <sibling> --no-sync` (FR-6). |
| FR-2.4 | No hook script, Makefile target, or CI check MAY invoke `python`/`python3` as a bare command. The `banned_words.yaml` rule stays in force. Hermetic Python invocation is always `uv run python` (own repo) or `uv run --project <path> --no-sync python` (cross-repo). |

### FR-3: Inherited Boot Dirs (Ancestor via walk-up OR Sibling via explicit declaration)

| ID | Requirement |
|----|-------------|
| FR-3.1 | A repo MAY declare `inherited_boot_dirs` in `moon.yml::project`: a YAML list of PROJECT-ROOT paths (relative-or-absolute) to ANCESTOR or SIBLING project roots to consume read-only. Sibling paths (e.g. `'../CI'`) are the canonical cross-repo sharing mechanism; walk-up alone cannot reach siblings because they are sideways in the filesystem tree, not upward. |
| FR-3.2 | Each entry in `inherited_boot_dirs` MUST be a PROJECT-ROOT path (e.g. `'../CI'`), NOT a boot-dir path. The resolver appends `/$CI_BOOT_NAME/bin` at runtime → platform-aware by construction. Entries MUST NOT include the boot directory name (`.boot-linux`, `.boot-macos`) or `bin/` suffix. |
| FR-3.3 | The resolver MUST skip silently any `inherited_boot_dirs` entry whose resolved `/$CI_BOOT_NAME/bin` does not exist on disk (emits INFO in the compliance check, NOT a warning: soft optional is useful for repos that may or may not be present). |
| FR-3.4 | A repo MUST NOT declare a sibling's project root in `inherited_boot_dirs` if that sibling is not declared in the moon project graph (`moon.yml::dependsOn`). Doing so is an undeclared-dependency violation and the compliance check MUST emit a warning (non-blocking). |

### FR-4: Walk-Up PATH Resolution Algorithm

| ID | Requirement |
|----|-------------|
| FR-4.1 | Hook generation (`scripts/generate-hooks`) MUST emit a PATH-prepend line computed by a `ci_resolve_boot_path()` function in `lib/ci.sh`. The function is called with the hook's repo root (`$_ROOT`) as argument. |
| FR-4.2 | `ci_resolve_boot_path(<start-dir>)` MUST walk up from `<start-dir>` to `/`, prepending `<dir>/$CI_BOOT_NAME/python-env/bin` (when present) and `<dir>/$CI_BOOT_NAME/bin` (when present) to the accumulator in that order at each level. |
| FR-4.3 | The walk-up order MUST produce a PATH-style string with the child (closest to `<start-dir>`) leftmost (highest precedence: child wins). |
| FR-4.4 | The emitted PATH-prepend in a generated hook MUST also include explicit `inherited_boot_dirs` entries from `moon.yml`, prepended AFTER the walk-up results (so declared inheritance wins over incidental walk-up discovery). |
| FR-4.5 | If no boot directory exists at any walked level AND `inherited_boot_dirs` is empty/absent, the PATH-prepend MUST be a no-op (the hook falls back to ambient PATH). The hook MUST NOT fail solely because no boot dir is found. |
| FR-4.6 | The PATH-prepend line in generated hooks MUST be a single `export PATH=...` statement. Re-invocation of the hook in a nested shell MAY produce duplicate PATH entries (the walker does NOT deduplicate); this is acceptable because POSIX PATH resolution is leftmost-wins and the duplicate entries resolve to the same binaries. |
| FR-4.7 | `ci_resolve_boot_path()` MUST use `$CI_BOOT_NAME` (set by `ci_boot_name()`) at every walk-up level. The function MUST NOT hardcode `.boot-linux` or `.boot-macos` as the directory name to search for. |

### FR-5: `moon.yml::project.inherited_boot_dirs` Schema

| ID | Requirement |
|----|-------------|
| FR-5.1 | Each repo that uses the boot/venv pattern MUST declare `inherited_boot_dirs` under `project:` in its `moon.yml`. Repos with no inherited boot dirs MUST declare `inherited_boot_dirs: []`. |
| FR-5.2 | `inherited_boot_dirs` MUST be a YAML list of strings. Each string is a PROJECT-ROOT path (relative or absolute). Relative paths resolve against the repo root (the directory containing `moon.yml`). |
| FR-5.3 | Entries MUST be project roots (e.g. `'../CI'`), NOT boot-dir paths. The resolver appends `/$CI_BOOT_NAME/bin` at runtime → platform-aware by construction. |
| FR-5.4 | `moon.yml::project.inherited_boot_dirs` MUST be the single source of truth for boot inheritance. Generated hooks, Makefiles, and compliance checks MUST read from this field: never duplicate the inheritance list in a separate file. |
| FR-5.5 | The moon project id for each `inherited_boot_dirs` entry is derived by lowercasing the last path component (e.g. `'../CI'` → `'ci'`). This id MUST appear in the consuming repo's `moon.yml::dependsOn`. |

### FR-6: `uv run --project` Contract

| ID | Requirement |
|----|-------------|
| FR-6.1 | A hook in a sibling repo that needs to invoke Python checks from another repo MUST use `uv run --project <ci-path> --no-sync python -m ci.<check> <args>`. |
| FR-6.2 | `<ci-path>` MUST be resolvable relative to the sibling's repo root (the hook template MUST emit the correct relative path via `generate-hooks`'s `${_ci_rel}` variable). |
| FR-6.3 | `--no-sync` MUST be passed when invoking a sibling's `.venv/` so the sibling's `uv.lock` is not mutated by the consumer's hook run. |
| FR-6.4 | CWD MUST stay at the sibling's repo root so `--all-md` and other CWD-relative arguments resolve against the sibling's tree (not the producer's). |
| FR-6.5 | A repo's own hooks (invoked from its own CWD) MUST continue to use `uv run python -m ci.<check>` (no `--project` flag: uv discovers the repo's `.venv/` natively). |
| FR-6.6 | No hook script MAY use `VIRTUAL_ENV` activation, `source .../activate`, or environment-via-PATH-only python resolution. The `--project` flag is the sole mechanism for cross-repo Python. |

### FR-7: Non-Blocking Layout Audit

| ID | Requirement |
|----|-------------|
| FR-7.1 | A `ci/check_boot_venv_layout.py` module MUST exist. It MUST be invokeable as `uv run python -m ci.check_boot_venv_layout [PROJECT_DIR]`. |
| FR-7.2 | The check MUST scan the given project dir (default CWD) for `moon.yml`. If absent, it MUST exit 0 with an info message (not a violation). |
| FR-7.3 | For each entry in `moon.yml::project.inherited_boot_dirs`: the entry MUST resolve to an existing project root directory whose `/$CI_BOOT_NAME/bin` exists. Missing project root → INFO (soft-optional). Existing project root but no boot dir → INFO. Existing boot dir → OK. World-writable boot dir → WARN. |
| FR-7.4 | The check MUST scan the repo's `.pre-commit-config.yaml` for any `uv run --project <path> --no-sync python -m ci.<check>` entries and verify the referenced `<path>` contains a `pyproject.toml` and a `.venv/bin/python`. Failures are warnings, exit 0. |
| FR-7.5 | The check MUST verify that each `inherited_boot_dirs` entry has a corresponding `dependsOn` edge in `moon.yml`. Mismatches are warnings, exit 0. |
| FR-7.6 | The check MUST emit a scoring report on stdout (one row per finding) and a trailing summary line. |
| FR-7.7 | The check MUST always exit 0: it is a non-blocking advisory audit. The exit code MUST NOT influence the pre-commit gate. Infrastructure errors (e.g. Python exceptions) MAY exit 2. |
| FR-7.8 | The check MUST be registered in the repo's `.pre-commit-config.yaml` (pre-commit stage) so the repo self-audits on every commit. It SHOULD be added to `config/required_hooks.yaml` as tier=`poc` (safety subset) so consumers inherit it. |

### FR-8: Leak Eradication

| ID | Requirement |
|----|-------------|
| FR-8.1 | `scripts/generate-hooks` MUST use `ci_resolve_boot_path("$_ROOT")` to compute the PATH-prepend line. The previous hardcoded `${CI_WORKSPACE_ROOT}/.boot-linux/...` PATH-prepend MUST NOT exist. |
| FR-8.2 | `scripts/bootstrap-gitleaks` MUST install gitleaks into the CI repo's own `CI_PROJECT_ROOT/$CI_BOOT_NAME/bin/`, NOT into a workspace-root-level boot directory. |
| FR-8.3 | All bootstrap scripts (`bootstrap-gitleaks`, `bootstrap-uv`, `bootstrap-rust`, `bootstrap-cloc`) MUST install artifacts into `CI_PROJECT_ROOT/$CI_BOOT_NAME/bin/` (or the appropriate subdirectory), using `ci_boot_name()` for the directory name. No bootstrap script MAY hardcode `.boot-linux` or `.boot-macos` as a literal install target. |
| FR-8.4 | No `2>/dev/null` or `>/dev/null 2>&1` swallows MAY exist in any bootstrap script, hook entry, or library function. All errors MUST be visible on stderr. This is the absolute silent-swallow canon. |

### FR-9: Platform Detection

| ID | Requirement |
|----|-------------|
| FR-9.1 | The system SHALL provide a `ci_platform_name()` shell function in `lib/ci.sh` that echoes a lowercase platform identifier. On Linux, it SHALL echo `linux`. On macOS (Darwin), it SHALL echo `darwin`. |
| FR-9.2 | `ci_platform_name()` SHALL use `uname -s` as the sole detection mechanism. The function SHALL NOT depend on `/etc/os-release`, `sw_vers`, or any platform-specific file. |
| FR-9.3 | `ci_platform_name()` SHALL be a pure function with no side effects, no file I/O, and no external dependencies beyond `uname`. It SHALL be safe to call from any shell context (subshell, pipeline, trap handler). |
| FR-9.4 | On any platform other than Linux or Darwin, `ci_platform_name()` SHALL echo `linux`. There is no fallback to a different boot directory name -- the platform determines the name, period. |

### FR-10: Boot Directory Resolution API

| ID | Requirement |
|----|-------------|
| FR-10.1 | The system SHALL provide a `ci_boot_dir()` shell function in `lib/ci.sh` that echoes the absolute path to the boot directory. The result SHALL be `CI_PROJECT_ROOT/$CI_BOOT_NAME`. No fallback. No environment variable override. |
| FR-10.2 | The boot directory name SHALL follow the pattern `.boot-<platform>` where `<platform>` is the output of `ci_platform_name()`. On Linux: `.boot-linux`. On macOS: `.boot-macos`. |
| FR-10.3 | The system SHALL provide a `ci_boot_name()` shell function that echoes just the directory name (e.g. `.boot-linux` or `.boot-macos`), without the project root prefix. This is used by workspace root detection logic that needs to check for directory existence. |
| FR-10.4 | When `ci.sh` is sourced, it SHALL resolve `CI_BOOT_DIR` (absolute path) and `CI_BOOT_NAME` (directory name) as variables available to all consumers. These SHALL be computed once at source-time, not on every invocation. |
| FR-10.5 | `ci_boot_dir()` MUST NOT fall back from a missing platform-preferred directory to a different platform's directory. If the boot directory does not exist on disk, it is a FATAL error at the point of use (not at source-time -- the library provides the path string; consumers validate existence). |
| FR-10.6 | The source-time resolution in `ci.sh` MUST NOT emit a FATAL error if the boot directory does not exist on disk. `ci.sh` is a passive library: it computes and exports path strings. Existence validation is the responsibility of the consumer (bootstrap scripts, hook execution, compliance check). |

### FR-11: Portable Relative Path Computation

| ID | Requirement |
|----|-------------|
| FR-11.1 | The system SHALL provide a `ci_relative_path()` shell function that computes the relative path from a source directory to a target directory using pure bash string manipulation. The function SHALL NOT depend on `realpath`, `readlink -f`, `perl`, `python`, or any GNU-specific external tool. |
| FR-11.2 | `ci_relative_path()` SHALL produce correct results for all cases: target is a subdirectory of source, source is a subdirectory of target, sibling directories, and identical paths. |
| FR-11.3 | `ci_relative_path()` SHALL produce identical output regardless of trailing slashes on input paths. |
| FR-11.4 | `ci_relative_path()` SHALL NOT follow symlinks. Path computation SHALL use string manipulation only, not filesystem traversal. |

### FR-12: Hook Generation OS Awareness

| ID | Requirement |
|----|-------------|
| FR-12.1 | `scripts/generate-hooks` SHALL use `ci_relative_path()` instead of `realpath --relative-to` to compute the relative path from the repository root to the CI project root (`_ci_rel`). |
| FR-12.2 | Generated hook scripts SHALL emit PATH entries using `ci_resolve_boot_path("$_ROOT")` instead of hardcoded `.boot-linux` paths. The generated preamble SHALL include the walk-up result and `inherited_boot_dirs` entries per FR-4. |
| FR-12.3 | The generated hook header comments SHALL reference the correct CI relative path (`_ci_rel`) and re-generation command, matching the platform where generation occurred. |
| FR-12.4 | Generated hook code SHALL NOT use bash 4+ features (associative arrays, `printf -v`, `${var,,}`, `coproc`, `lastpipe`). macOS ships bash 3.2 at `/bin/bash`. |

### FR-13: Workspace Root Detection

| ID | Requirement |
|----|-------------|
| FR-13.1 | Workspace root detection logic in `walk-projects`, `checks_compliance.sh`, and any other script that walks up from a nested repo to find the workspace root SHALL accept EITHER `.boot-linux` OR `.boot-macos` as a valid workspace marker. The presence of either directory, combined with a `projects/` directory, SHALL identify the path as a workspace root. |
| FR-13.2 | The tier resolution logic in `generate-hooks` that checks for the workspace root's boot directory SHALL use `ci_boot_name()` or accept either marker. |
| FR-13.3 | `ci/check_required_hooks_present.py` SHALL accept both `.boot-linux` and `.boot-macos` as workspace markers in its `WORKSPACE_MARKERS` list. |

### FR-14: Bootstrap Script Boot Directory

| ID | Requirement |
|----|-------------|
| FR-14.1 | All bootstrap scripts that install artifacts into a boot directory SHALL default their boot directory to `CI_PROJECT_ROOT/$CI_BOOT_NAME/` (or use inline platform detection for scripts that cannot source `ci.sh`). |
| FR-14.2 | Bootstrap scripts that run before `ci.sh` is guaranteed to be available SHALL use an inline platform detection pattern: |
|     | ```bash |
|     | _boot_platform="$(uname -s | tr 'A-Z' 'a-z')" |
|     | case "$_boot_platform" in |
|     |     darwin) _boot_name=".boot-macos" ;; |
|     |     *)      _boot_name=".boot-linux" ;; |
|     | esac |
|     | BOOT_DIR="${PROJECT_ROOT}/$_boot_name" |
|     | ``` |
| FR-14.3 | No `BOOT_DIR` or `BOOT_LINUX_DIR` environment variable override SHALL be supported. The boot directory is determined by the platform and the project root -- no escape hatches. |

### FR-15: Platform-Aware Bootstrapping

| ID | Requirement |
|----|-------------|
| FR-15.1 | Bootstrap scripts that download platform-specific binaries (gitleaks, uv, rust) MUST detect the host platform and architecture at runtime and select the correct download URL. No hardcoded `linux` or `unknown-linux-gnu` in tarball names or host triples. |
| FR-15.2 | `bootstrap-rust` MUST compute the Rust host triple using platform-aware logic: `aarch64-apple-darwin` on macOS ARM64, `x86_64-apple-darwin` on macOS Intel, `<arch>-unknown-linux-gnu` on Linux. The `uname -m` output `arm64` MUST be normalized to `aarch64` for Rust triple compatibility. |
| FR-15.3 | `bootstrap-rust` MUST export `RUSTUP_HOME` and `CARGO_HOME` BEFORE the idempotency version check, so rustup proxies can resolve their home directory. |
| FR-15.4 | `bootstrap-gitleaks` MUST select the correct tarball name based on platform: `gitleaks_<version>_darwin_<arch>.tar.gz` on macOS, `gitleaks_<version>_linux_<arch>.tar.gz` on Linux. |
| FR-15.5 | All bootstrap scripts that verify downloaded artifacts MUST use `ci_sha256()` for portable SHA-256 checksum computation. The function tries `sha256sum`, then `shasum -a 256`, then `python3` as fallback. |

### FR-16: macOS System Dependencies

| ID | Requirement |
|----|-------------|
| FR-16.1 | `scripts/bootstrap-homebrew` MUST install Homebrew (if absent) and then brew-install: `bash`, `coreutils`, `gnu-sed`, `findutils`, `pkg-config`. These provide bash 5.x (nameref support) and GNU equivalents of BSD tools. |
| FR-16.2 | `scripts/bootstrap-homebrew` MUST be a no-op on Linux (exit 0 immediately). |
| FR-16.3 | `scripts/bootstrap-homebrew` MUST require sudo ONLY for the initial Homebrew installation. Once Homebrew exists, `brew install` runs without sudo. |
| FR-16.4 | `scripts/install-system-deps` MUST be platform-aware: use `apt-get`/`dpkg` on Linux, `brew`/`brew list` on macOS. The `--export-missing` and `--install-only` modes are Linux-only (brew runs without sudo). |
| FR-16.5 | `config/system-deps.yaml` MUST support a `brew_package` field for macOS Homebrew formulas alongside the existing `apt_package` field for Linux. Entries with `brew_package` set are installable on macOS; entries without it are reported as "not installable on macOS" unless filtered by `platforms: [linux]`. |
| FR-16.6 | `config/system-deps.yaml` MUST support a `platforms` field (list of platform names) to filter entries by platform. Entries with `platforms: [linux]` are skipped on macOS and vice versa. Omit `platforms` = all platforms. |
| FR-16.7 | The `Makefile` MUST use Homebrew bash (`/opt/homebrew/bin/bash` or `/usr/local/bin/bash`) as `SHELL` on macOS when available, using `/bin/bash` (3.2) only when Homebrew bash is not yet installed. |
| FR-16.8 | The `Makefile` MUST prepend Homebrew gnubin directories (`coreutils/libexec/gnubin`, `gnu-sed/libexec/gnubin`, `findutils/libexec/gnubin`) to `PATH` on macOS so GNU tools shadow BSD equivalents. |
| FR-16.9 | The `Makefile` `init` target MUST call `scripts/bootstrap-homebrew` FIRST on macOS, before `install-system-deps` and `bootstrap-rust`. |

### FR-17: Portable SHA-256 Helper

| ID | Requirement |
|----|-------------|
| FR-17.1 | The system SHALL provide a `ci_sha256()` shell function in `lib/ci.sh` that prints the SHA-256 hash (lowercase hex, no filename) of a given file. |
| FR-17.2 | `ci_sha256()` MUST try `sha256sum` first (GNU coreutils / Darwin port), then `shasum -a 256` (macOS built-in), then `python3` as last resort. Returns 1 if all fail. |
| FR-17.3 | All bootstrap scripts that verify downloaded artifact checksums MUST use `ci_sha256()` instead of calling `sha256sum` directly, ensuring portability across macOS and Linux. |

### FR-18: CLI Wrapper Boot Directory

| ID | Requirement |
|----|-------------|
| FR-18.1 | The CLI wrapper scripts (`repo`, `run`, `ops`, `oc`) SHALL resolve their boot directory to the platform-appropriate path using the same inline platform detection pattern as bootstrap scripts. |
| FR-18.2 | CLI wrappers that currently use `readlink -f` in their `SCRIPT_DIR` resolution SHALL replace this with a portable `cd + dirname` pattern that works on both Linux and macOS. |

### FR-19: Extension Registration

| ID | Requirement |
|----|-------------|
| FR-19.1 | The `register_extensions.py` script SHALL determine the boot directory name using `platform.system()` instead of hardcoding `.boot-linux`. On Darwin, it SHALL use `.boot-macos`. |
| FR-19.2 | The `env_setup.sh` `setup_paths()` function SHALL detect the platform and prepend the correct boot directory's `bin/` to `PATH`. |

### FR-20: CI Library Skip Patterns

| ID | Requirement |
|----|-------------|
| FR-20.1 | CI scripts that skip boot directories in file listings (`compliance-report`, `audit-workspace`, `code-stats`) SHALL use a regex pattern that matches both `.boot-linux` and `.boot-macos`: `grep -vE '\.boot-(linux\|macos)|...'` |
| FR-20.2 | `lib/checks_core.sh` `_IGNORE_DIRS` array SHALL include both `.boot-linux` and `.boot-macos`. |

### FR-21: Configuration Files

| ID | Requirement |
|----|-------------|
| FR-21.1 | `ruff.toml`, `mypy.toml`, and equivalent linter configuration files SHALL include both `.boot-linux` and `.boot-macos` in their exclude patterns. |
| FR-21.2 | The `.gitignore` file SHALL include both `.boot-linux/` and `.boot-macos/` as ignored directories. |

### FR-22: Root Makefile

| ID | Requirement |
|----|-------------|
| FR-22.1 | The root `Makefile` SHALL define a computed variable `BOOT_NAME` that resolves to `.boot-linux` or `.boot-macos` based on `uname -s`. The computation MUST NOT use BSD-incompatible `sed` syntax (e.g. `t` label branching). A shell `if/else` conditional or `$(if ...)` is the correct approach. |
| FR-22.2 | All hardcoded `.boot-linux` path references in the Makefile SHALL use `$(BOOT_NAME)` instead. |

### FR-23: moon Integration

| ID | Requirement |
|----|-------------|
| FR-23.1 | A repo's `moon.yml` MAY declare `project.inherited_boot_dirs` (moon v2 custom metadata) listing project-root paths whose boot directories should be inherited. |
| FR-23.2 | A repo that declares `inherited_boot_dirs: ['../CI']` MUST also declare `dependsOn: ['ci']` in its `moon.yml`. The compliance check MUST warn on `inherited_boot_dirs` entries whose target repo is not in the consuming repo's `dependsOn`. |
| FR-23.3 | moon's `dependsOn` graph MUST reflect boot-inheritance direction (consumer dependsOn producer). Reverse direction is a constraint violation. |
| FR-23.4 | CI is the root: `inherited_boot_dirs: []`, `dependsOn: []`. GUARD and DATAOPS inherit from CI: `inherited_boot_dirs: ['../CI']`, `dependsOn: ['ci']`. |

---

## 3. Non-Functional Requirements

### NFR-1: Idempotency & Determinism

| ID | Requirement |
|----|-------------|
| NFR-1.1 | `ci_resolve_boot_path()` MUST be a pure function (same input → same output; no side effects, no network, no reads outside filesystem metadata). |
| NFR-1.2 | The walk-up MUST terminate in O(depth) steps; bounded by hitting `/` from the start dir. |
| NFR-1.3 | Re-running hook generation against the same `moon.yml` and same filesystem state MUST produce byte-identical PATH-prepend lines. |
| NFR-1.4 | Re-running `make install` (full bootstrap) when all artifacts exist and are version-current MUST be a no-op (no re-downloads, no re-builds). |
| NFR-1.5 | Re-running `generate-hooks` on the same platform SHALL produce functionally identical hooks. Switching platforms SHALL produce correctly re-targeted hooks on the next generation. |
| NFR-1.6 | `ci_platform_name()` SHALL execute in under 10ms (single `uname -s` call + case statement). |
| NFR-1.7 | `ci_relative_path()` SHALL execute in under 5ms for paths up to 10 components deep (pure bash string manipulation, no external processes). |

### NFR-2: Portability

| ID | Requirement |
|----|-------------|
| NFR-2.1 | `ci_resolve_boot_path()` MUST work under bash 4.3+ (the existing `lib/ci.sh` baseline) without process substitution (PRoot-safe, conforms to `check_portable_shell`). |
| NFR-2.2 | `moon.yml::project.inherited_boot_dirs` paths MUST use POSIX forward slashes. No drive letters, no backslashes. |
| NFR-2.3 | All new functions added to `ci.sh` SHALL use only POSIX-compatible shell constructs plus bashisms already present in the file (`[[ ]]`, `${var#...}`, `BASH_REMATCH`, `BASH_SOURCE[0]`). No bash 4+ features (associative arrays, `lastpipe`, `${var,,}`) SHALL be introduced in portable code paths. |
| NFR-2.4 | Generated hooks and CI scripts SHALL function correctly under macOS's default bash (3.2) as well as Homebrew-installed bash (5.x). No bash 4+ features SHALL be used in generated hook code. |
| NFR-2.5 | All existing functionality on Linux SHALL continue to work identically. The `.boot-linux` directory name, all tool paths, and all workspace detection logic SHALL remain unchanged on Linux platforms. |
| NFR-2.6 | The boot layout contract MUST be VM-agnostic: repos MUST be installable and fully hook-functional in a checkout that contains no VM tree. |

### NFR-3: Security

| ID | Requirement |
|----|-------------|
| NFR-3.1 | `ci_resolve_boot_path()` MUST NOT follow symlinks at intermediate path components. The walker uses `dirname` on the start path's physical-absolute form. Existence checks via `[[ -d ... ]]` only apply to the FINAL `<dir>/$CI_BOOT_NAME/bin` component. |
| NFR-3.2 | The `inherited_boot_dirs` list MUST NOT contain paths whose resolved boot directory OR `bin/` subdir is world-writable. The compliance check MUST warn (non-blocking) on such paths. |
| NFR-3.3 | Bootstrapping scripts MUST verify downloaded binary checksums (SHA256-pinning pattern via `ci_sha256()`). |
| NFR-3.4 | The boot layout contract MUST NOT weaken the existing `banned_words.yaml` `python3?` ban. |
| NFR-3.5 | The boot directory path SHALL NOT be derived from user-controlled environment variables. No `BOOT_DIR`, `BOOT_LINUX_DIR`, or equivalent override mechanism SHALL exist. |
| NFR-3.6 | `ci_relative_path()` SHALL NOT follow symlinks outside the workspace root. Path computation SHALL use string manipulation only, not filesystem traversal. |

### NFR-4: Maintainability

| ID | Requirement |
|----|-------------|
| NFR-4.1 | `lib/ci.sh` SHALL be the single source of truth for boot directory resolution. All scripts that need the boot directory SHALL source `ci.sh` (or use the inline pattern for bootstrap scripts that run before `ci.sh` is available). |
| NFR-4.2 | All modified or new source files SHALL remain under 512 lines per AGENTS.md Rule 12. |
| NFR-4.3 | No `shellcheck disable`, `type: ignore`, or `noqa` directives SHALL be introduced to suppress linting of the new code. All code SHALL pass existing lint gates without suppression. |
| NFR-4.4 | `ci.sh` is sourced by every generated hook. All additions to `ci.sh` SHALL NOT change its passive-sourcing contract (no side effects on source, no output to stdout). |

### NFR-5: moon Integration

| ID | Requirement |
|----|-------------|
| NFR-5.1 | A repo's `moon.yml` MAY declare `project.inherited_boot_dirs` custom field (moon v2 custom metadata) listing project-root paths to inherit boot directories from. |
| NFR-5.2 | A repo that declares `inherited_boot_dirs: ['../CI']` in `moon.yml` MUST also declare `dependsOn: ['ci']`. The compliance check MUST warn on `inherited_boot_dirs` entries whose target repo is not in the consuming repo's `dependsOn`. |
| NFR-5.3 | moon's `dependsOn` graph MUST reflect boot-inheritance direction (consumer dependsOn producer). Reverse direction is a constraint violation. |

---

## 4. Constraints

| ID | Constraint | Source |
|----|------------|--------|
| C-1 | `ci.sh` is sourced by every generated hook. All additions to `ci.sh` SHALL NOT change its passive-sourcing contract (no side effects on source, no output to stdout). | `ci.sh` header |
| C-2 | Bootstrap scripts cannot depend on `ci.sh` because they run during workspace bootstrap before `ci.sh` is guaranteed available. They SHALL use inline platform detection. | Bootstrap ordering |
| C-3 | The `.boot-linux` directory name SHALL NOT be renamed or removed on Linux. `.boot-macos` is the macOS equivalent, not a replacement for `.boot-linux`. | Platform consistency |
| C-5 | `realpath --relative-to` SHALL be replaced with a pure-bash function, not with `grealpath` (GNU coreutils via Homebrew). No new external dependencies for path computation. | AGENTS.md Rule 5 |
| C-6 | `readlink -f` SHALL be replaced with `cd + dirname` patterns, not with `greadlink` (GNU coreutils via Homebrew). No new external dependencies for path resolution. | AGENTS.md Rule 5 |
| C-7 | All shell scripts SHALL use `set -euo pipefail` and pass shellcheck. | AGENTS.md Rule 1 |
| C-8 | Generated hook code SHALL NOT use bash 4+ features. macOS ships bash 3.2 at `/bin/bash`. | macOS compatibility |

---

## 5. Assumptions

| ID | Assumption |
|----|------------|
| A-1 | `uname -s` returns `Linux` on all Linux distributions and `Darwin` on all macOS versions. This is a POSIX.1-2001 mandate and has been stable across all known implementations. |
| A-2 | macOS users have bash available. macOS ships with bash 3.2 at `/bin/bash`. Users with Homebrew bash 5.x are also supported. The `#!/usr/bin/env bash` shebang resolves correctly on both. |
| A-3 | The workspace's bootstrap sequence already handles macOS binary downloads correctly. Only the target directory naming needs to change. |
| A-4 | The boot directory is gitignored and not shared across machines. Each developer/CI runner has their own boot directory, so platform-specific naming introduces no cross-environment conflicts. |

---

## 6. Open Questions (all resolved)

1. **Intermediate-level boot-layout config?** Decision: ONE per repo (in `moon.yml`). Intermediate boot dirs reached via walk-up only.
2. **Walk-up reaching `.venv/bin/`?** Decision: no. `.venv/` is private per FR-2. Walk-up is for boot-dir `bin/` + `python-env/bin` only.
3. **Compliance check blocking?** Decision: no, ever. Advisory forever. Blocking would prevent bootstrap on fresh checkout (chicken-and-egg).
4. **`inherited_boot_dirs` glob support?** Decision: no. Each entry listed explicitly. Globs introduce undeclared dependencies.
5. **VM inherits CI's gitleaks or installs its own?** Decision: VM inherits via explicit `inherited_boot_dirs` declaration (sibling reference). VM does NOT install its own copy.
6. **`inherited_boot_dirs` priority/scope field?** Decision: no. Positional precedence: later-listed entries prepended later = leftmost = wins.
7. **Boot directory relocation via env var?** Decision: no. The boot directory is always at `CI_PROJECT_ROOT/$CI_BOOT_NAME/`.
8. **Environment variable override for boot directory?** Decision: no. No `BOOT_DIR`, `BOOT_LINUX_DIR`, or equivalent. Platform + project root determine the path.
9. **Separate `boot_layout.yaml` file?** Decision: ELIMINATED. The inheritance declaration lives in `moon.yml::project.inherited_boot_dirs` -- single source of truth, no duplicate representation, no drift-check needed.

---

## 7. Verification Matrix

| # | Test | Maps to |
|---|------|---------|
| V1 | On Linux, run `ci_platform_name()` and verify output is `linux`. On macOS, verify output is `darwin`. | FR-9.1, FR-9.2 |
| V2 | On Linux, run `ci_boot_name()` and verify output is `.boot-linux`. On macOS, verify output is `.boot-macos`. | FR-10.2, FR-10.3 |
| V3 | Source `ci.sh` and verify `CI_BOOT_DIR` and `CI_BOOT_NAME` are set. Verify `CI_BOOT_DIR` equals `CI_PROJECT_ROOT/$CI_BOOT_NAME`. Verify no FATAL error is emitted if the boot dir does not exist on disk. | FR-10.4, FR-10.5, FR-10.6 |
| V4 | Run `ci_relative_path /ws /ws/projects/CI` and verify output is `projects/CI`. Run `ci_relative_path /ws/projects/foo /ws/projects/CI` and verify output is `../CI`. | FR-11.1, FR-11.2 |
| V5 | Run `make install-hooks` on macOS; verify `.git/hooks/pre-commit` is generated; verify the PATH-prepend line uses `ci_resolve_boot_path()` and not hardcoded `.boot-linux`. | FR-4.1, FR-12.2 |
| V6 | Inspect `scripts/generate-hooks`; verify `realpath --relative-to` is replaced with `ci_relative_path()`. | FR-12.1 |
| V7 | Run `walk-projects` on macOS (with `.boot-macos/` present) and verify workspace root is detected. Run on Linux (with `.boot-linux/`) and verify no regression. | FR-13.1 |
| V8 | Inspect `bootstrap-gitleaks`; verify it installs to `CI_PROJECT_ROOT/$CI_BOOT_NAME/bin/gitleaks` and uses platform-aware tarball name. | FR-8.2, FR-1.4, FR-15.4 |
| V9 | Verify no `BOOT_DIR` or `BOOT_LINUX_DIR` env var override exists in any bootstrap script, CLI wrapper, or library function. | FR-14.3, FR-10.1, NFR-3.5 |
| V10 | Verify `.gitignore` includes both `.boot-linux/` and `.boot-macos/`. | FR-21.2 |
| V11 | Verify `ruff.toml` excludes both `.boot-linux` and `.boot-macos`. | FR-21.1 |
| V12 | Verify the root `Makefile` uses `$(BOOT_NAME)` and not hardcoded `.boot-linux`. Verify no BSD-incompatible `sed` syntax is used. | FR-22.1, FR-22.2 |
| V13 | Run `ci_resolve_boot_path /path/to/project` and verify the walk-up uses `$CI_BOOT_NAME` (not hardcoded `.boot-linux`). | FR-4.7 |
| V14 | From a sibling repo with `inherited_boot_dirs: ['../CI']`, run the generated pre-commit hook; verify `gitleaks` resolves via the inherited entry. | FR-3.1, FR-4.4 |
| V15 | Run `uv run python -m ci.check_boot_venv_layout`; confirm it emits OK rows and exits 0. | FR-7.1, FR-7.3 |
| V16 | Verify no `2>/dev/null` exists in any bootstrap script or library function. | FR-8.4 |
| V17 | Run `make install-hooks` on both platforms; verify generated hooks use no bash 4+ features. | FR-12.4, NFR-2.4 |
| V18 | Run `make init` on macOS; verify Homebrew + bash 5.x + GNU tools installed, system deps satisfied, Rust bootstrapped. | FR-16.1, FR-16.9 |
| V19 | Run `make install` on macOS; verify uv, gitleaks, cloc bootstrapped with correct platform binaries, `.venv` synced, hooks generated. | FR-15.1, FR-15.4, FR-15.5 |
| V20 | Run `make test-python` on macOS; verify all tests pass. | NFR-2.4, NFR-2.5 |
| V21 | Verify `ci_sha256()` works on macOS (using `shasum -a 256` or `sha256sum`) and Linux (using `sha256sum`). | FR-17.1, FR-17.2 |
| V22 | Verify `bootstrap-rust` uses `aarch64-apple-darwin` host triple on macOS ARM64 and is idempotent on re-run. | FR-15.2, FR-15.3 |
| V23 | Verify `install-system-deps --check` on macOS reports platform as `darwin`, skips `platforms: [linux]` entries, and installs `brew_package` deps via `brew install`. | FR-16.4, FR-16.5, FR-16.6 |