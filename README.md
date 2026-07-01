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

<div style="overflow-x: auto; margin: 1.5em 0;">

<style>
.cm-table { border-collapse: collapse; width: 100%; min-width: 780px; font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen,Ubuntu,Cantarell,sans-serif; font-size: 13px; line-height: 1.5; }
.cm-table th, .cm-table td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
.cm-table thead th { font-weight: 600; font-size: 14px; background: #f8fafc; border-bottom: 2px solid #e2e8f0; position: sticky; top: 0; z-index: 2; }
.cm-table thead th:first-child { background: #f8fafc; z-index: 3; left: 0; position: sticky; }
.cm-table tbody tr:hover { background: #f1f5f9; }
.cm-table .feature-name { font-weight: 600; color: #0f172a; white-space: nowrap; position: sticky; left: 0; background: #fff; z-index: 1; }
.cm-table tbody tr:hover .feature-name { background: #f1f5f9; }
.cm-table .section-row td { background: #f1f5f9; font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #475569; padding: 6px 12px; border-bottom: 1px solid #cbd5e1; }
.cm-table .section-row:hover td { background: #e2e8f0; }
.cm-table .ws-col { border-left: 3px solid #6366f1; background: #fafaff; }
.cm-table thead .ws-col { background: #eef2ff; border-left: 3px solid #6366f1; color: #4338ca; }
.cm-table tbody tr:hover .ws-col { background: #eef2ff; }
.cm-table .yes { color: #16a34a; font-weight: 700; font-size: 15px; }
.cm-table .partial { color: #d97706; font-weight: 700; font-size: 15px; }
.cm-table .no { color: #94a3b8; font-size: 15px; }
.cm-table .cell-text { color: #334155; }
.cm-table .highlight { color: #4338ca; font-weight: 500; }
</style>

<table class="cm-table">
<thead>
<tr>
  <th style="min-width:170px">Feature</th>
  <th style="min-width:120px">pre-commit</th>
  <th style="min-width:100px">ruff</th>
  <th style="min-width:100px">eslint</th>
  <th style="min-width:110px">gitleaks</th>
  <th class="ws-col" style="min-width:160px">workspace-ci</th>
</tr>
</thead>
<tbody>

<!-- ─────────────── GUARDRAILS ─────────────── -->
<tr class="section-row"><td colspan="6">Guardrails</td></tr>

<tr>
  <td class="feature-name">Secrets (built-in)</td>
  <td><span class="partial">◆</span> <span class="cell-text">via 3rd-party hooks</span></td>
  <td><span class="no">—</span></td>
  <td><span class="no">—</span></td>
  <td><span class="yes">✓</span> <span class="cell-text">160+ patterns + Shannon entropy</span></td>
  <td class="ws-col"><span class="yes">✓</span> <span class="cell-text">Bundles gitleaks + <code>.env</code>/<code>*.pem</code>/<code>credentials.json</code> blocking</span></td>
</tr>

<tr>
  <td class="feature-name">Banned patterns</td>
  <td><span class="partial">◆</span> <span class="cell-text">via 3rd-party hooks</span></td>
  <td><span class="no">—</span></td>
  <td><span class="no">—</span></td>
  <td><span class="no">—</span></td>
  <td class="ws-col"><span class="yes">✓</span> <span class="cell-text">50+ patterns: <code># type: ignore</code>, <code>dict[str,Any]</code>, <code>Co-authored-by</code>, <code>unsafe</code>, <code>mock</code>...</span></td>
</tr>

<tr>
  <td class="feature-name">Silent-error swallow</td>
  <td><span class="no">—</span></td>
  <td><span class="no">—</span></td>
  <td><span class="no">—</span></td>
  <td><span class="no">—</span></td>
  <td class="ws-col"><span class="yes">✓</span> <span class="cell-text">Multi-language: <code>except: pass</code>, <code>catch {}</code>, <code>|| true</code>, <code>ignore_errors</code>, cron no-log</span></td>
</tr>

<tr>
  <td class="feature-name">Blocks escape hatches</td>
  <td><span class="partial">◆</span> <span class="cell-text"><code>--no-verify</code> bypasses all hooks</span></td>
  <td><span class="no">—</span></td>
  <td><span class="no">—</span></td>
  <td><span class="no">—</span></td>
  <td class="ws-col"><span class="yes">✓</span> <span class="cell-text">WORKSPACE-GUARD blocks <code>--no-verify</code>, <code>--force</code>, rebase, amend</span></td>
</tr>

<!-- ─────────────── ANALYSIS ─────────────── -->
<tr class="section-row"><td colspan="6">Analysis</td></tr>

<tr>
  <td class="feature-name">Linting</td>
  <td><span class="partial">◆</span> <span class="cell-text">via 3rd-party hooks</span></td>
  <td><span class="yes">✓</span> <span class="cell-text">900+ rules, AST, auto-fix</span></td>
  <td><span class="yes">✓</span> <span class="cell-text">Thousands via plugins, AST, auto-fix</span></td>
  <td><span class="no">—</span></td>
  <td class="ws-col"><span class="yes">✓</span> <span class="cell-text">Orchestrates ruff + mypy; any linter per language via config</span></td>
</tr>

<tr>
  <td class="feature-name">Dead code</td>
  <td><span class="no">—</span></td>
  <td><span class="no">—</span></td>
  <td><span class="no">—</span></td>
  <td><span class="no">—</span></td>
  <td class="ws-col"><span class="yes">✓</span> <span class="cell-text">Python AST cross-reference graph</span></td>
</tr>

<tr>
  <td class="feature-name">Coverage gates</td>
  <td><span class="no">—</span></td>
  <td><span class="no">—</span></td>
  <td><span class="no">—</span></td>
  <td><span class="no">—</span></td>
  <td class="ws-col"><span class="yes">✓</span> <span class="cell-text">Per-commit no-devolution + per-push thresholds</span></td>
</tr>

<tr>
  <td class="feature-name">Commit message</td>
  <td><span class="partial">◆</span> <span class="cell-text">via hook scripts</span></td>
  <td><span class="no">—</span></td>
  <td><span class="no">—</span></td>
  <td><span class="no">—</span></td>
  <td class="ws-col"><span class="yes">✓</span> <span class="cell-text">Format enforcement + agent-attribution / <code>Co-authored-by</code> blocking</span></td>
</tr>

<tr>
  <td class="feature-name">History scan</td>
  <td><span class="no">—</span></td>
  <td><span class="no">—</span></td>
  <td><span class="no">—</span></td>
  <td><span class="partial">◆</span> <span class="cell-text">full git history</span></td>
  <td class="ws-col"><span class="yes">✓</span> <span class="cell-text">Full history for blocked patterns + agent commits</span></td>
</tr>

<tr>
  <td class="feature-name">Markdown links</td>
  <td><span class="no">—</span></td>
  <td><span class="no">—</span></td>
  <td><span class="no">—</span></td>
  <td><span class="no">—</span></td>
  <td class="ws-col"><span class="yes">✓</span> <span class="cell-text">URL probing via httpx (internal + external)</span></td>
</tr>

<tr>
  <td class="feature-name">Dependency freshness</td>
  <td><span class="no">—</span></td>
  <td><span class="no">—</span></td>
  <td><span class="no">—</span></td>
  <td><span class="no">—</span></td>
  <td class="ws-col"><span class="yes">✓</span> <span class="cell-text">Live PyPI / npm / Docker Hub version checks</span></td>
</tr>

<!-- ─────────────── PLATFORM ─────────────── -->
<tr class="section-row"><td colspan="6">Platform</td></tr>

<tr>
  <td class="feature-name">Role</td>
  <td><span class="cell-text">Hook framework (any language)</span></td>
  <td><span class="cell-text">Python linter + formatter</span></td>
  <td><span class="cell-text">JS/TS/CSS/JSON/MD linter</span></td>
  <td><span class="cell-text">Secret scanner (git + files)</span></td>
  <td class="ws-col"><span class="highlight">Integrated hook enforcer (any language)</span></td>
</tr>

<tr>
  <td class="feature-name">Hook stages</td>
  <td><span class="cell-text">pre-commit, commit-msg, pre-push</span></td>
  <td><span class="cell-text">standalone / CI</span></td>
  <td><span class="cell-text">standalone / CI</span></td>
  <td><span class="cell-text">pre-commit, CI</span></td>
  <td class="ws-col"><span class="highlight">pre-commit, commit-msg, pre-push</span></td>
</tr>

<tr>
  <td class="feature-name">Execution model</td>
  <td><span class="cell-text">Python runtime; stashes tree; clones remote repos</span></td>
  <td><span class="cell-text">Single Rust binary, no stashing</span></td>
  <td><span class="cell-text">Node.js binary, no stashing</span></td>
  <td><span class="cell-text">Single Go binary, no stashing</span></td>
  <td class="ws-col"><span class="highlight">Native bash scripts; no framework runtime; files stay on disk</span></td>
</tr>

<tr>
  <td class="feature-name">Env isolation</td>
  <td><span class="yes">✓</span> <span class="cell-text">Per-hook Docker/Node/Ruby/Python</span></td>
  <td><span class="no">—</span></td>
  <td><span class="no">—</span></td>
  <td><span class="no">—</span></td>
  <td class="ws-col"><span class="partial">◆</span> <span class="cell-text">PATH-based (tools in CI or dev environment)</span></td>
</tr>

<tr>
  <td class="feature-name">First-run speed</td>
  <td><span class="partial">◆</span> <span class="cell-text">Slow (clone repos + build envs)</span></td>
  <td><span class="yes">✓</span> <span class="cell-text">Instant</span></td>
  <td><span class="yes">✓</span> <span class="cell-text">Instant</span></td>
  <td><span class="yes">✓</span> <span class="cell-text">Instant</span></td>
  <td class="ws-col"><span class="yes">✓</span> <span class="highlight">Instant (scripts generated at install time)</span></td>
</tr>

<tr>
  <td class="feature-name">Hook auto-update</td>
  <td><span class="yes">✓</span> <span class="cell-text"><code>autoupdate</code> (pinned SHA refs)</span></td>
  <td><span class="no">—</span></td>
  <td><span class="no">—</span></td>
  <td><span class="no">—</span></td>
  <td class="ws-col"><span class="yes">✓</span> <span class="cell-text"><code>generate-hooks</code> from <code>.pre-commit-config.yaml</code></span></td>
</tr>

<tr>
  <td class="feature-name">Enforcement tiers</td>
  <td><span class="no">—</span></td>
  <td><span class="no">—</span></td>
  <td><span class="no">—</span></td>
  <td><span class="no">—</span></td>
  <td class="ws-col"><span class="yes">✓</span> <span class="cell-text"><code>strict</code> / <code>poc</code> / <code>vendored</code> + <code>enforce</code> / <code>warn</code></span></td>
</tr>

<tr>
  <td class="feature-name">Language requirement</td>
  <td><span class="cell-text">Python 3.x</span></td>
  <td><span class="cell-text">Rust binary</span></td>
  <td><span class="cell-text">Node.js</span></td>
  <td><span class="cell-text">Go binary</span></td>
  <td class="ws-col"><span class="highlight">bash (ubiquitous; zero runtime to install)</span></td>
</tr>

</tbody>
</table>

</div>

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
