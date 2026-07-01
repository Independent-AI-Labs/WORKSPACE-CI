# workspace-ci

Catches secrets, banned patterns, silent errors, and commit garbage
before they reach your main branch: at native git speed, in any language.

![License: MIT](https://img.shields.io/badge/license-MIT-green)
![Hooks: native bash](https://img.shields.io/badge/hooks-native%20bash-blue)
![Tiers: strict | poc | vendored](https://img.shields.io/badge/tiers-strict%20%7C%20poc%20%7C%20vendored-orange)

---

## Why

The `pre-commit` framework stashes your working tree: files vanish from disk,
breaking dev servers and confusing your IDE. Standalone linters don't talk to
each other, so you wire a dozen separate hooks and pray they agree on what's
staged. And if an agent generates the code, none of them catch the patterns
that matter: `except: pass`, `dict[str, Any]`, `Co-authored-by: Claude`.

workspace-ci generates **native** `.git/hooks/*` bash scripts from your
`.pre-commit-config.yaml`. No framework. No stashing. One coordinated set of
gates that fire at pre-commit, commit-msg, and pre-push: shell-first, with
Python where shell can't go.

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

| Category | Stage | Examples |
|----------|-------|----------|
| Secrets & sensitive files | pre-commit | gitleaks (bundled), `.env`/`*.pem`/`credentials.json` detection |
| Code quality | pre-commit | 50+ banned patterns (`# type: ignore`, `dict[str, Any]`, `getattr()`, `|| true`), file length caps, ruff format + lint, mypy, init-file discipline |
| Commit hygiene | commit-msg | message format, `Co-authored-by` blocking, agent attribution patterns |
| Test coverage | pre-commit, pre-push | no devolution per-commit, threshold enforcement per-push |
| Deep analysis | pre-push | dead code (AST), dependency freshness (PyPI/npm/Docker Hub), full history scan for blocked patterns, markdown link integrity, hook manifest completeness |

Checks are config-driven. Every rule lives in a YAML file under
[`config/`](config/). Add a pattern, tune a threshold, exclude a path -
no code changes needed.

Full rule reference: browse [`config/banned_words.yaml`](config/banned_words.yaml)
(patterns), [`config/required_hooks.yaml`](config/required_hooks.yaml) (hooks),
[`config/sensitive_files.yaml`](config/sensitive_files.yaml) (file rules),
[`config/coverage_thresholds.yaml`](config/coverage_thresholds.yaml) (gates).

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
