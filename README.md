# workspace-ci

Catches secrets, banned patterns, silent errors, and commit garbage
before they reach your main branch: at native git speed, in any language.

![License: MIT](https://img.shields.io/badge/license-MIT-green)
![Hooks: native bash](https://img.shields.io/badge/hooks-native%20bash-blue)
![Tiers: strict | poc | vendored](https://img.shields.io/badge/tiers-strict%20%7C%20poc%20%7C%20vendored-orange)

---

## Why

### Problem 1: Stashing breaks running state

The `pre-commit` framework runs `git stash push` before hooks and `git stash pop`
after. Your working tree vanishes during hook execution — file watchers fire
spurious change events, hot-reload dev servers crash, language servers lose
their buffer state, and any unsaved IDE work is gone until the stash comes
back. For a 5-second hook run this is an annoyance; for a 30-second coverage
run it's a workflow breaker.

workspace-ci never stashes. It determines what changed via
`git diff --cached --name-only`, then runs checks on the actual files on disk.
No vanishing tree. No stash pop races. Dev servers keep running.

### Problem 2: Ad-hoc tool wiring has no coordination

Without a hook framework, every linter/formatter/check is wired independently
in CI or as a separate pre-commit entry. Each has its own config file, its own
file-list logic, its own exclusion patterns, and no way to express ordering:

- `ruff format` modifies files → `ruff check` re-lints the modified versions
  without a re-stage, so the second pass sees a dirty tree.
- A "run tests" pre-commit hook executes before "check file length", even
  though file-length is cheaper and should gate first.
- Two linters that both need `git diff --cached` each parse the diff
  independently, doubling startup cost.

workspace-ci generates a single bash script per stage that sequences every
check in dependency order: formatters run first and auto-stage their output
(failing with "re-run: git commit"), cheap gates run before expensive ones,
file-dependent hooks gate on `_STAGED` with zero wasted file listing, and
any failure exits immediately. One script, one ordering, one pass.

### Problem 3: Standard tools don't guard against agent artifacts

When AI agents generate pull requests, they routinely leave traces that
standard linters ignore:

- `Co-authored-by: Claude <claude@anthropic.com>` in commit messages
- `# type: ignore` or `# noqa` suppressions that silently mask issues
- `mock` and `Any` types in production code
- `except: pass` swallow patterns across multiple languages
- `unsafe { }` blocks without documented justification

Each of these is catchable with enough manual config, but most teams don't
discover the pattern until after it's been merged. workspace-ci ships 50+
banned patterns pre-configured across Python, JavaScript, TypeScript, Shell,
Ansible, and Rust — including agent-attribution blockers at the commit-msg
stage — so the guardrails are active from day one.

### How it works

workspace-ci reads your `.pre-commit-config.yaml` and generates native
`.git/hooks/*` bash scripts. No framework runtime, no `pip install` on the
developer machine beyond the initial workspace bootstrap, no remote hook
repos to clone.

The execution model is three stages with non-redundant responsibility:

| Stage | What runs | Why it belongs there |
|-------|-----------|---------------------|
| pre-commit | Format, lint, secrets, banned patterns, silent-swallow, file length, coverage no-devolution | Fast, content-focused gates that must pass before a commit is recorded |
| commit-msg | Message format compliance, agent-attribution blocking | Checks only the commit message file, not the working tree |
| pre-push | Full test suite + coverage thresholds, history scan for blocked patterns | Expensive gates that run only when code leaves the developer's machine |

A separate SUID binary (WORKSPACE-GUARD) wraps `git` and blocks `--no-verify`,
`--force`, and `rebase` of pushed commits — so the hooks actually run.

Shell handles everything that doesn't need a full programming language: file
listing, pattern matching, conditional logic, formatter auto-stage. Python
handles what shell can't: multi-file regex at scale (banned-words was ~33,000
subprocesses in bash; <1s in Python), AST analysis (dead code), and network
requests (dependency freshness, markdown link probing).

### What you get

- No stashing, no vanishing tree, no broken dev servers
- One ordered gate sequence per stage, not N independent tool invocations
- 50+ agent-artifact patterns blocked from day one
- Zero runtime dependencies beyond bash and the tools you already use
- Escape-hatch-proof via WORKSPACE-GUARD
- Gradual rollout via enforcement tiers (strict/poc/vendored) + warn/enforce mode

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
| Banned patterns (50+, agent attribution, `# type: ignore`, `dict[str, Any]`, `unsafe`, `mock`, ...) | pre-commit | all files |
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
| Boot layout audit (`.boot-linux/` + `.venv/` hierarchy) | pre-push | layout config |

Every check has configurable `always_run` / `files:` / `stages:` / `types_or:`
gates in `.pre-commit-config.yaml` and an enforcement tier (`strict` / `poc` /
`vendored`) resolved via `project_enforcement.yaml`. POC tier runs only
secrets, sensitive files, banned words, and commit hygiene; vendored tier
installs no hooks.

All rules are config-driven. Patterns live in [`config/banned_words.yaml`](config/banned_words.yaml),
file rules in [`config/sensitive_files.yaml`](config/sensitive_files.yaml),
coverage gates in [`config/coverage_thresholds.yaml`](config/coverage_thresholds.yaml),
and hook registry in [`config/required_hooks.yaml`](config/required_hooks.yaml).
Add a pattern, tune a threshold, exclude a path — no code changes needed.

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

| Feature | `pre-commit` | `ruff` | `eslint` | `gitleaks` | **workspace-ci** |
|---|---|---|---|---|---|
| **Role** | Hook framework (any language) | Python linter + formatter | JS / TS / CSS / JSON / MD linter | Secret scanner (git history + files) | Integrated hook enforcer (any language) |
| **Hook stages** | pre-commit, commit-msg, pre-push | standalone / CI | standalone / CI | pre-commit, CI | pre-commit, commit-msg, pre-push |
| **Secrets (built-in)** | via 3rd-party hooks only | — | — | 160+ patterns + Shannon entropy | Bundles gitleaks + filename patterns (`.env`, `*.pem`, `credentials.json`) |
| **Banned patterns** | via 3rd-party hooks | — | — | — | 50+ patterns built-in (`type: ignore`, `dict[str,Any]`, `Co-authored-by`, `unsafe`, `mock`...) |
| **Silent-error swallow** | — | — | — | — | Multi-language regex: `except: pass` (Python), `catch {}` (JS), `\| true` (Shell), `ignore_errors` (Ansible), `|| true` (Make) |
| **Linting** | via 3rd-party hooks (ruff, mypy, etc.) | 900+ rules, AST, auto-fix | Thousands via plugins, AST, auto-fix | — | Orchestrates ruff + mypy for Python; any linter per language via hook config |
| **Commit message** | via hook scripts | — | — | — | Format enforcement + agent-attribution / `Co-authored-by` blocking |
| **Coverage gates** | — | — | — | — | Per-commit no-devolution + per-push thresholds (default 90% unit, 50% integration) |
| **Dead code** | — | — | — | — | Python AST cross-reference graph (imported-but-unused symbols) |
| **Dependency freshness** | — | — | — | — | Live PyPI / npm / Docker Hub version checks |
| **Markdown links** | — | — | — | — | URL probing via httpx (internal + external) |
| **History scan** | — | — | — | full git history | Full history for blocked patterns + agent commits |
| **Execution model** | Python runtime; stashes working tree; clones remote hook repos | Single Rust binary, no stashing | Node.js binary, no stashing | Single Go binary, no stashing | Native bash scripts (generated from `.pre-commit-config.yaml`); no framework runtime; files stay on disk |
| **Env isolation** | Per-hook Docker / Node / Ruby / Python envs | n/a | n/a | n/a | PATH-based (tools expected to be in CI or developer environment) |
| **First-run speed** | Slow (clone repos + build hook environments) | Instant | Instant | Instant | Instant (scripts are generated at install time, no downloads) |
| **Hook auto-update** | `autoupdate` (pinned SHA refs) | n/a | n/a | n/a | `generate-hooks` from `.pre-commit-config.yaml` |
| **Enforcement tiers** | — | n/a | n/a | n/a | `strict` / `poc` / `vendored` + `enforce` / `warn` mode per repo |
| **Blocks escape hatches** | `--no-verify` bypasses all hooks | n/a | n/a | n/a | Via WORKSPACE-GUARD: blocks `--no-verify`, `--force`, rebase, amend of pushed commits |
| **Language requirement** | Python 3.x | Rust binary | Node.js | Go binary | bash (ubiquitous; no runtime to install) |

### What the matrix tells you

- **pre-commit** is a generic hook *scheduler* with environment isolation. It doesn't
  detect secrets, ban patterns, enforce coverage, or analyze code on its own — it
  delegates everything to third-party repos that must be cloned and built on first run.
  Its killer feature is per-hook environment isolation (Docker, Node, Ruby, Python).

- **ruff**, **eslint**, and **gitleaks** are single-purpose tools. Each does one thing well,
  but none coordinates with the others, gates commits, or catches cross-language
  patterns like silent error swallowing.

- **workspace-ci** is an *integrated enforcement system* that fills the gaps none of
  the individual tools address: banned patterns, silent-error detection, coverage
  gates, dead code, dependency freshness, and escape-hatch blocking — all coordinated
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
| [`lib/`](lib/) | Shell check functions: core, files, commit, coverage, compliance, quality, silent |
| [`ci/`](ci/) | Python checks: dependency versions, dead code, markdown refs, required hooks |

---

## FAQ

### Why not just use pre-commit?

workspace-ci uses the same `.pre-commit-config.yaml` format, but generates
**native** `.git/hooks/*` bash scripts instead of running a Python framework.
Result: no stashing, no Python runtime dependency for hooks, and no remote git
ref pulls.

### Does it work for non-Python projects?

Yes. The shell layer: secrets, banned patterns, file length, silent errors,
commit hygiene, coverage gates: treats every language the same. The silent-swallow
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
