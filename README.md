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

<table>
<thead>
<tr>
  <th>Feature</th>
  <th>pre-commit</th>
  <th>ruff</th>
  <th>eslint</th>
  <th>gitleaks</th>
  <th>workspace-ci</th>
</tr>
</thead>
<tbody>

<tr>
  <td colspan="6" bgcolor="#E2E8F0"><b>GUARDRAILS</b></td>
</tr>

<tr>
  <td><b>Secrets (built-in)</b></td>
  <td>◆ via 3rd-party hooks</td>
  <td>—</td>
  <td>—</td>
  <td>✓ 160+ patterns + Shannon entropy</td>
  <td bgcolor="#F4F4FF">✓ Bundles gitleaks + <code>.env</code>/<code>*.pem</code>/<code>credentials.json</code> blocking</td>
</tr>

<tr>
  <td><b>Banned patterns</b></td>
  <td>◆ via 3rd-party hooks</td>
  <td>—</td>
  <td>—</td>
  <td>—</td>
  <td bgcolor="#F4F4FF">✓ 50+ patterns: <code># type: ignore</code>, <code>dict[str,Any]</code>, <code>Co-authored-by</code>, <code>unsafe</code>, <code>mock</code>...</td>
</tr>

<tr>
  <td><b>Silent-error swallow</b></td>
  <td>—</td>
  <td>—</td>
  <td>—</td>
  <td>—</td>
  <td bgcolor="#F4F4FF">✓ Multi-language: <code>except: pass</code>, <code>catch {}</code>, <code>|| true</code>, <code>ignore_errors</code>, cron no-log</td>
</tr>

<tr>
  <td><b>Blocks escape hatches</b></td>
  <td>◆ <code>--no-verify</code> bypasses all hooks</td>
  <td>—</td>
  <td>—</td>
  <td>—</td>
  <td bgcolor="#F4F4FF">✓ WORKSPACE-GUARD blocks <code>--no-verify</code>, <code>--force</code>, rebase, amend</td>
</tr>

<tr>
  <td colspan="6" bgcolor="#E2E8F0"><b>ANALYSIS</b></td>
</tr>

<tr>
  <td><b>Linting</b></td>
  <td>◆ via 3rd-party hooks</td>
  <td>✓ 900+ rules, AST, auto-fix</td>
  <td>✓ Thousands via plugins, AST, auto-fix</td>
  <td>—</td>
  <td bgcolor="#F4F4FF">✓ Orchestrates ruff + mypy; any linter per language via config</td>
</tr>

<tr>
  <td><b>Dead code</b></td>
  <td>—</td>
  <td>—</td>
  <td>—</td>
  <td>—</td>
  <td bgcolor="#F4F4FF">✓ Python AST cross-reference graph</td>
</tr>

<tr>
  <td><b>Coverage gates</b></td>
  <td>—</td>
  <td>—</td>
  <td>—</td>
  <td>—</td>
  <td bgcolor="#F4F4FF">✓ Per-commit no-devolution + per-push thresholds</td>
</tr>

<tr>
  <td><b>Commit message</b></td>
  <td>◆ via hook scripts</td>
  <td>—</td>
  <td>—</td>
  <td>—</td>
  <td bgcolor="#F4F4FF">✓ Format enforcement + agent-attribution / <code>Co-authored-by</code> blocking</td>
</tr>

<tr>
  <td><b>History scan</b></td>
  <td>—</td>
  <td>—</td>
  <td>—</td>
  <td>◆ full git history</td>
  <td bgcolor="#F4F4FF">✓ Full history for blocked patterns + agent commits</td>
</tr>

<tr>
  <td><b>Markdown links</b></td>
  <td>—</td>
  <td>—</td>
  <td>—</td>
  <td>—</td>
  <td bgcolor="#F4F4FF">✓ URL probing via httpx (internal + external)</td>
</tr>

<tr>
  <td><b>Dependency freshness</b></td>
  <td>—</td>
  <td>—</td>
  <td>—</td>
  <td>—</td>
  <td bgcolor="#F4F4FF">✓ Live PyPI / npm / Docker Hub version checks</td>
</tr>

<tr>
  <td colspan="6" bgcolor="#E2E8F0"><b>PLATFORM</b></td>
</tr>

<tr>
  <td><b>Role</b></td>
  <td>Hook framework (any language)</td>
  <td>Python linter + formatter</td>
  <td>JS/TS/CSS/JSON/MD linter</td>
  <td>Secret scanner (git + files)</td>
  <td bgcolor="#F4F4FF"><b>Integrated hook enforcer (any language)</b></td>
</tr>

<tr>
  <td><b>Hook stages</b></td>
  <td>pre-commit, commit-msg, pre-push</td>
  <td>standalone / CI</td>
  <td>standalone / CI</td>
  <td>pre-commit, CI</td>
  <td bgcolor="#F4F4FF"><b>pre-commit, commit-msg, pre-push</b></td>
</tr>

<tr>
  <td><b>Execution model</b></td>
  <td>Python runtime; stashes tree; clones remote repos</td>
  <td>Single Rust binary, no stashing</td>
  <td>Node.js binary, no stashing</td>
  <td>Single Go binary, no stashing</td>
  <td bgcolor="#F4F4FF"><b>Native bash scripts; no framework runtime; files stay on disk</b></td>
</tr>

<tr>
  <td><b>Env isolation</b></td>
  <td>✓ Per-hook Docker/Node/Ruby/Python</td>
  <td>—</td>
  <td>—</td>
  <td>—</td>
  <td bgcolor="#F4F4FF">◆ PATH-based (tools in CI or dev environment)</td>
</tr>

<tr>
  <td><b>First-run speed</b></td>
  <td>◆ Slow (clone repos + build envs)</td>
  <td>✓ Instant</td>
  <td>✓ Instant</td>
  <td>✓ Instant</td>
  <td bgcolor="#F4F4FF">✓ <b>Instant (scripts generated at install time)</b></td>
</tr>

<tr>
  <td><b>Hook auto-update</b></td>
  <td>✓ <code>autoupdate</code> (pinned SHA refs)</td>
  <td>—</td>
  <td>—</td>
  <td>—</td>
  <td bgcolor="#F4F4FF">✓ <code>generate-hooks</code> from <code>.pre-commit-config.yaml</code></td>
</tr>

<tr>
  <td><b>Enforcement tiers</b></td>
  <td>—</td>
  <td>—</td>
  <td>—</td>
  <td>—</td>
  <td bgcolor="#F4F4FF">✓ <code>strict</code> / <code>poc</code> / <code>vendored</code> + <code>enforce</code> / <code>warn</code></td>
</tr>

<tr>
  <td><b>Language requirement</b></td>
  <td>Python 3.x</td>
  <td>Rust binary</td>
  <td>Node.js</td>
  <td>Go binary</td>
  <td bgcolor="#F4F4FF"><b>bash (ubiquitous; zero runtime to install)</b></td>
</tr>

</tbody>
</table>

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
