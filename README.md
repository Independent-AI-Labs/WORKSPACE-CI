# Practical Guardrails for Coding Agents

AI coding agents ship code fast and cut every corner doing it: skipped
tests, ignored lint failures, `--no-verify` to bypass hooks, amended history
to hide the mess. **WORKSPACE-CI** generates native git hooks from a single
config file and hard-enforces lint, tests, secrets, and coverage at commit
and push time. With **WORKSPACE-GUARD**, it blocks every escape hatch
(`--no-verify`, `--force`, `--amend`, `git reset`) at the syscall boundary.
The agent cannot cheat.

<img width="571" height="119" alt="Screenshot 2026-05-24 064144" src="https://github.com/user-attachments/assets/76c5c281-339f-4497-a5d0-c3f0112bf289" />

Ask an agent why it skipped the tests and you'll get a confident
hallucination about its own limitations instead of a fix:

<img width="558" height="202" alt="Screenshot 2026-05-24 071239" src="https://github.com/user-attachments/assets/be0a4b41-047f-44bd-ae53-5deb09be4121" />

### How it works

workspace-ci reads your `.pre-commit-config.yaml` and generates native
`.git/hooks/*` bash scripts. No framework runtime, no `pip install` on the
developer machine beyond the initial workspace bootstrap, no remote hook
repos to clone.

The execution model is three stages with non-redundant responsibility:

| Stage | What runs | Why it belongs there |
|-------|-----------|---------------------|
| pre-commit | Format, lint, secrets, banned patterns, error-swallow, dependency freshness, file length, coverage no-devolution | Fast, content-focused gates that must pass before a commit is recorded |
| commit-msg | Message format compliance, agent-attribution blocking | Checks only the commit message file, not the working tree |
| pre-push | Full test suite + coverage thresholds, web/JS quality, co-authored history scan, advisory dead-code report | Expensive gates that run only when code leaves the developer's machine |

A separate capability-based binary (WORKSPACE-GUARD) wraps `git` via dpkg-divert
and enforces guardrails at the syscall boundary: blocks `--no-verify`, `--force`
pushes, `git reset`, `git checkout --hard`, `git commit --amend`, standalone
`git rebase`, `git stash drop`, dangerous config keys (`core.hookspath`,
`core.sshcommand`, `alias.*`, etc.), and sanitizes the child environment to an
allow-list. Identity and editor config keys are sudo-gated. This ensures hooks
actually run and history cannot be rewritten.

Shell handles everything that doesn't need a full programming language: file
listing, pattern matching, conditional logic, formatter auto-stage, dead-code
analysis via the `dangle` binary (`cargo install dangle`). Python
handles what shell can't: multi-file regex at scale and network requests
(dependency freshness, markdown link probing).


---

## Quick Start

```bash
# 1. Clone or copy workspace-ci into your monorepo (e.g. projects/CI/)
cd projects/CI

# 2. Bootstrap system deps (macOS Homebrew + apt on Linux) and toolchain
make init          # once per machine: Homebrew/apt, Rust if missing
make install       # bootstrap uv, gitleaks, cloc, moon, ansible, node;
                   # uv sync (.venv), npm install (web/), generate hooks

# 3. Regenerate hooks after config changes
make install-hooks

# 4. Run the full pre-push gate locally before pushing
make check-push
```

For monorepo setups with shared config, see
[`docs/HOOKS.md`](docs/HOOKS.md) and
[`docs/requirements/REQ-BOOT-LAYOUT.md`](docs/requirements/REQ-BOOT-LAYOUT.md):
covers the Makefile contract, platform-aware `$(BOOT_NAME)` boot directories,
`ci_resolve_boot_path` walk-up, `moon.yml::project.inherited_boot_dirs`, and
tier configuration.

Consumer projects that only need hooks (no full CI install):

```bash
bash projects/CI/scripts/generate-hooks
```

---

## What Gets Checked

Every hook's stage is configured in `.pre-commit-config.yaml` and can be moved
freely. The table below shows the default wiring for the workspace root config.
Scope describes which files the check scans when triggered. Checks marked
**advisory** print warnings but do not block the commit or push.

| Check | Default stage | Scope |
|-------|--------------|-------|
| Secret scanning (gitleaks, 160+ patterns, all non-gitignored files) | pre-commit | all files |
| Sensitive filename blocking (`.env`, `*.pem`, `credentials.json`, ...) | pre-commit | all files |
| Banned patterns (200+ including type suppressions, unsafe code, AI slop) | pre-commit | all files |
| Silent-error swallow (Python `except: pass`, JS `catch {}`, Shell `\|\| true`, Ansible `ignore_errors`, Cron no-log) | pre-commit | all tracked files |
| Dependency freshness (PyPI / npm / Docker Hub) | pre-commit | lockfiles |
| Duplicate / redundant dependency warning | pre-commit | `pyproject.toml` |
| Code formatting (`ruff format`, auto-stage + re-run) | pre-commit | Python files |
| Linting (`ruff check`, 900+ rules) | pre-commit | Python files |
| Type checking (`mypy`) | pre-commit | Python files |
| File length (max 512 lines, configurable per-file) | pre-commit | source files |
| `__init__.py` must be empty | pre-commit | `__init__.py` files |
| `+x` bit forbidden on `.py` modules | pre-commit | tracked `.py` files |
| Coverage thresholds not lowered | pre-commit | `coverage_thresholds.yaml` |
| Deleted `.py` still imported elsewhere | pre-commit | staged deletions |
| Unstaged/untracked files auto-stage guard | pre-commit | full tree |
| Process substitution banned in shell scripts | pre-commit | shell scripts |
| Markdown link integrity (internal anchors + external URLs) | pre-commit | doc files |
| Hook manifest completeness (self-check) | pre-commit | `.pre-commit-config.yaml` |
| Compliance report (17-dimension A-F audit, **advisory**) | pre-commit preamble | project config |
| Boot layout audit (`.boot-linux/`/`.boot-macos/` + `.venv/` alignment, **advisory**) | pre-commit | layout config |
| Commit message format (`type: description`, body required) | commit-msg | message body |
| Agent attribution / `Co-authored-by` pattern blocking | commit-msg | message body |
| Full test suite + coverage enforcement (Python + shell + web/) | pre-push | whole project |
| Web/JS quality (eslint, tsc, vitest via `make check-push`) | pre-push | `web/` |
| Co-authored / agent attribution in push range | pre-push | git history |
| Dead code candidates (`dangle`, 13 languages, **advisory**) | pre-push | git-tracked sources per `dead_code.yaml` `scan_paths` |

Every check has configurable `always_run` / `files:` / `stages:` / `types_or:`
gates in `.pre-commit-config.yaml` and an enforcement tier (`strict` / `poc` /
`vendored`) resolved via `project_enforcement.yaml`. POC tier runs only
secrets, sensitive files, banned words, and commit hygiene; vendored tier
installs no hooks.

All rules are config-driven. Patterns live in [`config/banned_words.yaml`](config/banned_words.yaml)
(with per-project overrides in [`banned_words_exceptions.yaml`](config/banned_words_exceptions.yaml)),
file rules in [`config/sensitive_files.yaml`](config/sensitive_files.yaml),
coverage gates in [`config/coverage_thresholds.yaml`](config/coverage_thresholds.yaml),
hook registry in [`config/required_hooks.yaml`](config/required_hooks.yaml),
boot layout in [`moon.yml`](moon.yml) (`project.inherited_boot_dirs`),
file length limits in [`config/file_length_limits.yaml`](config/file_length_limits.yaml),
dead code rules in [`config/dead_code.yaml`](config/dead_code.yaml),
markdown doc targets in [`config/markdown_docs.yaml`](config/markdown_docs.yaml),
blocked commit patterns in [`config/blocked_commit_patterns.yaml`](config/blocked_commit_patterns.yaml),
and dependency excludes in [`config/dependency_excludes.yaml`](config/dependency_excludes.yaml).
Add a pattern, tune a threshold, exclude a path: no code changes needed.

---

## Tiers

| Tier | Behavior |
|------|----------|
| **strict** | Full enforcement. Default for first-party code. |
| **poc** | Safety subset only: gitleaks, sensitive files, banned words, blocked history, commit message. |
| **vendored** | No hooks installed. For frozen or mirrored code. |

`enforcement_mode: warn` during rollout: see violations without breaking flow.
Flip to `enforce` when gates are clean.

---

## What workspace-ci adds beyond the tools it wraps

workspace-ci calls ruff, gitleaks, and mypy as subprocesses. It is not a
replacement for them. The real question is what you get beyond wiring those
same tools into pre-commit yourself.

### The floor: DIY pre-commit + ruff + gitleaks + mypy

You get format, lint, type-check, and secret scanning. You also get a
Python runtime dependency for every hook run, working-tree stashing on
each commit, and remote repo cloning on first run. That is the cost of
admission for pre-commit's hook scheduling.

### The ceiling: what workspace-ci adds on top of those same tools

| What is added | Why no off-the-shelf tool does this |
| ------------- | ----------------------------------- |
| Banned patterns (200+ semantic prohibitions) | No linter encodes the repo's architectural policy list from `banned_words.yaml`. These are policy decisions, not style rules. |
| Error-swallow detection (Python, JS, Shell, Ansible, Cron) | No tool spans five languages looking for swallowed-error patterns in unified diffs. Each language's linter only sees its own syntax. |
| Coverage no-devolution | Thresholds can only raise, never lower. No linter or test runner tracks config history. |
| Dead imports on deletion (`check-no-dead-imports`) | Detects imports of deleted `.py` modules before the commit lands. Pre-commit has no cross-file deletion awareness. |
| Dead code candidates (`check-dead-code`, advisory) | `dangle` cross-references unreferenced functions, classes, and modules across 13 languages; post-filtered via `dead_code.yaml`. Warns on push, does not block. |
| Dependency freshness | Flags stale pinned versions, not just unpinned ones. `pip-audit` checks vulnerabilities; this checks rot. |
| Co-authored history scan on push | Catches agent-attribution lines snuck in via rebase or amend that slipped past commit-msg. Scans the actual push range. |
| Enforcement tiers (strict / poc / vendored) | Per-project gate profiles. Pre-commit has no tier concept; every repo gets the same hooks or none. |
| Escape-hatch blocking | [WORKSPACE-GUARD](https://github.com/Independent-AI-Labs/WORKSPACE-GUARD) intercepts `--no-verify`, force-push, `git reset`, and `git commit --amend` at the syscall level. No hook framework can do this; hooks are bypassable by definition. |
| Native bash execution | No Python runtime for hooks, no tree stashing, no remote repo cloning. Hooks are generated bash scripts in `.git/hooks/*`. |

The tools workspace-ci wraps are the floor, not the ceiling. The value is
the enforcement layer above them.

---

## Wiki

The interactive documentation wiki lives in [`web/`](web/) (Next.js).

| Target | Purpose |
|--------|---------|
| `make start` / `make wiki-dev-start` | Dev server with HMR on `:3001` |
| `make wiki-dev-stop/restart/status/logs` | Dev server lifecycle |
| `make extract-wiki-data` | Regenerate wiki JSON from CI sources (hooks, scripts, code-stats) |
| `make wiki-prod-build` | Build production Podman image (`web/Containerfile`) |
| `make wiki-prod-start/stop/restart/status/logs` | Prod stack: nginx TLS proxy on `:80`/`:443` + app container |
| `make wiki-tunnel-deploy/start/stop/route-dns/...` | Cloudflare tunnel via Ansible systemd user unit |

Production deploy: copy [`.env.example`](.env.example) to `.env` (gitignored),
edit tunnel hostname and credentials, then `make wiki-prod-start` followed by
`make wiki-tunnel-deploy`. See [`cloudflare/config.yml.example`](cloudflare/config.yml.example)
and [`res/ansible/tunnel.yml`](res/ansible/tunnel.yml). `cloudflared` is resolved
via [`scripts/resolve-cloudflared.sh`](scripts/resolve-cloudflared.sh) (boot-dir
walk-up or `PATH`) when `CLOUDFLARED_BIN` is unset.

---

## WORKSPACE-GUARD install

WORKSPACE-GUARD is a separate repo; CI provides build and install targets that
wrap it via [`lib/guard-build.sh`](lib/guard-build.sh) and
[`lib/guard-install.sh`](lib/guard-install.sh):

```bash
# Operator (requires sudo; preserve SSH agent for git clone if needed):
sudo --preserve-env=HOME,SSH_AUTH_SOCK make build-guard
sudo --preserve-env=HOME,SSH_AUTH_SOCK make install-guard

# Read-only status check (no sudo):
make check-guard
```

`make rewrite-history` strips blocked patterns from git history and requires
`WORKSPACE_GUARD_ADMIN=1` when guard is installed.

---

## Documentation

| Doc | What's in it |
|-----|-------------|
| [`workflows/README.md`](workflows/README.md) | Agent/contributor workflows: website copy, architecture diagrams |
| [`docs/HOOKS.md`](docs/HOOKS.md) | Hook generation, configuration, migration from pre-commit |
| [`docs/PORTABILITY.md`](docs/PORTABILITY.md) | Shell portability contract: process-substitution ban, temp-file capture helpers |
| [`docs/SPEC-CI-SHARED-CONFIGS.md`](docs/SPEC-CI-SHARED-CONFIGS.md) | Monorepo shared config contract and inheritance |
| [`docs/requirements/REQ-BOOT-LAYOUT.md`](docs/requirements/REQ-BOOT-LAYOUT.md) | Platform-aware boot directory layout (`.boot-linux/`/`.boot-macos/`) and `.venv/` toolchain requirements |
| [`docs/specifications/SPEC-BOOT-LAYOUT.md`](docs/specifications/SPEC-BOOT-LAYOUT.md) | Boot layout implementation: walk-up PATH resolution, config schema, compliance check |
| [`docs/requirements/REQ-WIKI.md`](docs/requirements/REQ-WIKI.md) | Interactive wiki UI requirements |
| [`docs/specifications/SPEC-WIKI.md`](docs/specifications/SPEC-WIKI.md) | Wiki implementation specification |
| [`docs/specifications/SPEC-WIKI-RESPONSIVE.md`](docs/specifications/SPEC-WIKI-RESPONSIVE.md) | Wiki responsive layout specification |
| [`docs/requirements/REQ-SCAFFOLD-CI.md`](docs/requirements/REQ-SCAFFOLD-CI.md) | scaffold-ci feature requirements (FR/NFR/TR acceptance criteria) |
| [`docs/specifications/SPEC-SCAFFOLD-CI.md`](docs/specifications/SPEC-SCAFFOLD-CI.md) | scaffold-ci implementation: 5-phase validation, generation pipeline, awk parser |
| [`docs/audits/SECURITY-AUDIT-2026-07-04.md`](docs/audits/SECURITY-AUDIT-2026-07-04.md) | Full-repo security audit |
| [`lib/`](lib/) | Shell check functions: core, files, commit, coverage, compliance, quality, dead code |
| [`ci/`](ci/) | Python checks: dependency versions, markdown refs, required hooks manifest, boot layout |

---

## FAQ

### Why not just use pre-commit?

workspace-ci uses the same `.pre-commit-config.yaml` format, but generates
**native** `.git/hooks/*` bash scripts instead of running a Python framework.
Result: no stashing, no Python runtime dependency for hooks, and no remote git
ref pulls.

### Does it work for non-Python projects?

Yes. The shell layer: secrets, banned patterns, file length, error-swallow patterns,
commit hygiene, coverage gates: treats every language the same. The error-swallow
detector spans Python (`except: pass`), JavaScript/TypeScript (`catch {}`),
Shell (`|| true`), Ansible `ignore_errors`, and more via regex. Dead-code
analysis via `dangle` covers 13 languages when installed (`cargo install dangle`);
skips with a warning if absent. The Python layer (dependency version checks,
markdown refs, boot layout audit) is Python-only.

### Can agents bypass it?

Pre-commit hooks fail closed. Pre-push scans the push range for co-authored
and agent-attribution patterns: anything snuck in via rebase or amend gets
blocked.
[WORKSPACE-GUARD](https://github.com/Independent-AI-Labs/WORKSPACE-GUARD)
wraps the `git` binary itself and refuses `--no-verify`, force-push to main,
and other escape hatches.

---

**License:** MIT