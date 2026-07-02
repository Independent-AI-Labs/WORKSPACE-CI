# workspace-ci

## Practical Guardrails for Coding Agents

LLMs have severe limitations when it comes to maintaining consistent high-quality output across complex programming tasks. Negative patterns and poor practices have now been distilled over and over into state-of-the-art models, that are simply incapable of writing "good" code.

<img width="571" height="119" alt="Screenshot 2026-05-24 064144" src="https://github.com/user-attachments/assets/76c5c281-339f-4497-a5d0-c3f0112bf289" />

When confronted about carelessness towards the codebase, an LLM will happily fabricate a theory about its own inefficiencies instead of actually focusing on the CI tasks at hand:

<img width="558" height="202" alt="Screenshot 2026-05-24 071239" src="https://github.com/user-attachments/assets/be0a4b41-047f-44bd-ae53-5deb09be4121" />

WORKSPACE-CI offers tools for enforcing strict code quality, continuous integration, and testing guardrails for non-deterministically generated code.

### How it works

workspace-ci reads your `.pre-commit-config.yaml` and generates native
`.git/hooks/*` bash scripts. No framework runtime, no `pip install` on the
developer machine beyond the initial workspace bootstrap, no remote hook
repos to clone.

The execution model is three stages with non-redundant responsibility:

| Stage | What runs | Why it belongs there |
|-------|-----------|---------------------|
| pre-commit | Format, lint, secrets, banned patterns, error-swallow, file length, coverage no-devolution | Fast, content-focused gates that must pass before a commit is recorded |
| commit-msg | Message format compliance, agent-attribution blocking | Checks only the commit message file, not the working tree |
| pre-push | Full test suite + coverage thresholds, history scan for blocked patterns | Expensive gates that run only when code leaves the developer's machine |

A separate capability-based binary (WORKSPACE-GUARD) wraps `git` via dpkg-divert
and enforces guardrails at the syscall boundary: blocks `--no-verify`, `--force`
pushes, `git reset`, `git checkout --hard`, `git commit --amend`, standalone
`git rebase`, `git stash drop`, dangerous config keys (`core.hookspath`,
`core.sshcommand`, `alias.*`, etc.), and sanitizes the child environment to an
allow-list. Identity and editor config keys are sudo-gated. This ensures hooks
actually run and history cannot be rewritten.

Shell handles everything that doesn't need a full programming language: file
listing, pattern matching, conditional logic, formatter auto-stage. Python
handles what shell can't: multi-file regex at scale (banned-words was ~33,000
subprocesses in bash; <1s in Python), AST analysis (dead code), and network
requests (dependency freshness, markdown link probing).


---

## Quick Start

```bash
# 1. Drop workspace-ci into your repo
cp -r workspace-ci /path/to/your-project/

# 2. Generate hooks (reads your .pre-commit-config.yaml, writes .git/hooks/*)
bash workspace-ci/scripts/generate-hooks

# 3. Done. Every commit and push is now gated.
```

For monorepo setups with shared config, see
[`docs/HOOKS.md`](docs/HOOKS.md): covers the Makefile contract,
`bootstrap-gitleaks`, and tier configuration.

---

## What Gets Checked

Every hook's stage is configured in `.pre-commit-config.yaml` and can be moved
freely. The table below shows the default wiring for the workspace root config.
Scope describes which files the check scans when triggered.

| Check | Default stage | Scope |
|-------|--------------|-------|
| Secret scanning (gitleaks, 160+ patterns) | pre-commit | staged content |
| Sensitive filename blocking (`.env`, `*.pem`, `credentials.json`, ...) | pre-commit | all files |
| Banned patterns (50+ including type suppressions, unsafe code, fake objects, Co-authored-by) | pre-commit | all files |
| Silent-error swallow (Python `except: pass`, JS `catch {}`, Shell `\|\| true`, Ansible `ignore_errors`, Cron no-log) | pre-commit | staged diff |
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
| Commit message format (`type: description`, body required) | commit-msg | message body |
| Agent attribution / `Co-authored-by` pattern blocking | commit-msg | message body |
| Full test suite + coverage enforcement | pre-push | whole project |
| History scan (blocked patterns in push range) | pre-push | git history |
| Dead code (Python AST cross-reference graph) | pre-push | Python sources |
| Dependency freshness (PyPI / npm / Docker Hub) | pre-push | lockfiles |
| Duplicate / redundant dependency warning | pre-push | `pyproject.toml` |
| Markdown link integrity (internal anchors + external URLs) | pre-push | doc files |
| Hook manifest completeness (self-check) | pre-push | `.pre-commit-config.yaml` |
| Compliance score (15-dimension A-F audit) | pre-push | project config |
| `.venv` hierarchy tracking for monorepos (`.boot-linux/` + `.venv/` alignment) | pre-push | layout config |

Every check has configurable `always_run` / `files:` / `stages:` / `types_or:`
gates in `.pre-commit-config.yaml` and an enforcement tier (`strict` / `poc` /
`vendored`) resolved via `project_enforcement.yaml`. POC tier runs only
secrets, sensitive files, banned words, and commit hygiene; vendored tier
installs no hooks.

All rules are config-driven. Patterns live in [`config/banned_words.yaml`](config/banned_words.yaml),
file rules in [`config/sensitive_files.yaml`](config/sensitive_files.yaml),
coverage gates in [`config/coverage_thresholds.yaml`](config/coverage_thresholds.yaml),
and hook registry in [`config/required_hooks.yaml`](config/required_hooks.yaml).
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

## How It Compares

These tools serve different roles. The table below maps actual
capabilities so you can see where workspace-ci fills gaps that
assembling the other tools alone leaves open.

| Feature | pre-commit | ruff | eslint | gitleaks | workspace-ci |
| ------- | ---------- | ---- | ------ | -------- | ------------ |
| **GUARDRAILS** | | | | | |
| Secrets (built-in) | Partial | No | No | Yes | Yes |
| Banned patterns | Partial | No | No | No | Yes |
| Error-swallow detection | No | No | No | No | Yes |
| Blocks escape hatches | Partial | No | No | No | Yes |
| **ANALYSIS** | | | | | |
| Linting | Partial | Yes | Yes | No | Yes |
| Dead code | No | No | No | No | Yes |
| Coverage gates | No | No | No | No | Yes |
| Commit message | Partial | No | No | No | Yes |
| History scan | No | No | No | Partial | Yes |
| Markdown links | No | No | No | No | Yes |
| Dependency freshness | No | No | No | No | Yes |
| **PLATFORM** | | | | | |
| Role | Hook framework | Python linter and formatter | JS/TS/CSS/JSON/MD linter | Secret scanner | Integrated hook enforcer |
| Hook stages | pre-commit, commit-msg, pre-push | standalone / CI | standalone / CI | pre-commit, CI | pre-commit, commit-msg, pre-push |
| Execution model | Python runtime; stashes tree; clones remote repos | Single Rust binary | Node.js binary | Single Go binary | Native bash scripts; files stay on disk |
| Env isolation | Yes | No | No | No | Partial |
| First-run speed | Partial | Yes | Yes | Yes | Yes |
| Hook auto-update | Yes | No | No | No | Yes |
| Enforcement tiers | No | No | No | No | Yes |
| Language requirement | Python 3.x | Rust binary | Node.js | Go binary | bash |

### What the matrix tells you

- **pre-commit** is a generic hook scheduler with environment isolation. It does not
  detect secrets, ban patterns, enforce coverage, or analyze code on its own; it
  delegates everything to third-party repos that must be cloned and built on first run.
  Its killer feature is per-hook environment isolation (Docker, Node, Ruby, Python).

- **ruff**, **eslint**, and **gitleaks** are single-purpose tools. Each does one thing well,
  but none coordinates with the others, gates commits, or catches cross-language
  error-swallow patterns.

- **workspace-ci** is an integrated enforcement system that fills the gaps none of
  the individual tools address: banned patterns, error-swallow detection, coverage
  gates, dead code, dependency freshness, and escape-hatch blocking, all coordinated
  from native bash with no framework runtime and no working-tree stashing.

---

## Documentation

| Doc | What's in it |
|-----|-------------|
| [`docs/HOOKS.md`](docs/HOOKS.md) | Hook generation, configuration, migration from pre-commit |
| [`docs/requirements/REQ-BOOT-LAYOUT.md`](docs/requirements/REQ-BOOT-LAYOUT.md) | Hierarchical `.boot-linux/` and `.venv/` toolchain layout requirements |
| [`docs/specifications/SPEC-BOOT-LAYOUT.md`](docs/specifications/SPEC-BOOT-LAYOUT.md) | Boot layout implementation: walk-up PATH resolution, config schema, compliance check |
| [`docs/requirements/REQ-WIKI.md`](docs/requirements/REQ-WIKI.md) | Interactive wiki UI requirements |
| [`docs/specifications/SPEC-WIKI.md`](docs/specifications/SPEC-WIKI.md) | Wiki implementation specification |
| [`lib/`](lib/) | Shell check functions: core, files, commit, coverage, compliance, quality |
| [`ci/`](ci/) | Python checks: dependency versions, dead code, markdown refs, required hooks |

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
Rust (`unwrap()` abuse), Shell (`|| true`), and more via regex. The Python layer
(dead code AST, dependency version checks, markdown refs) is Python-only.

### Can agents bypass it?

Pre-commit hooks fail closed. Pre-push scans full history: anything snuck in
via rebase or amend gets blocked.
[WORKSPACE-GUARD](https://github.com/Independent-AI-Labs/WORKSPACE-GUARD)
wraps the `git` binary itself and refuses `--no-verify`, force-push to main,
and other escape hatches.

---

**License:** MIT
