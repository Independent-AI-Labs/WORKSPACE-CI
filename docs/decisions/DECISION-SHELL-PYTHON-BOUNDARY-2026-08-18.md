# Implementation Boundary: Shell, CLI Tools, and Python

**Date:** 2026-08-18
**Status:** Accepted
**Authority:** Human decision recorded during the 2026-08-18 working session.

## Decision

WORKSPACE-CI uses the smallest implementation layer that preserves behavior:

1. Shell owns orchestration, lifecycle entrypoints, Git hook dispatch, and
   composition of existing command-line tools.
2. An existing CLI owns behavior when it already provides the required safe
   operation.
3. Python is retained only for structured parsing or validation that shell and
   installed CLI tools cannot perform without losing correctness.
4. Changing implementation language to evade a shell-guard rule is forbidden.
   Privileged lifecycle operations require an explicitly authorized action at
   the policy boundary.
5. Python modules are not executable entrypoints. Bash wrappers or generated
   Bash hooks invoke hermetic Python modules through `uv` when Python is
   justified by rule 3.

## Current Boundary

Python remains justified for Python AST inspection, TOML and strict YAML
validation, duplicate-key detection, Markdown parsing, dependency and lockfile
parsing, typed policy validation, and the checked Linux
`renameat2(RENAME_EXCHANGE)` syscall wrapper. GNU `mv` on the target has no
exchange operation.

Shell and installed CLI tools are sufficient for process orchestration,
filesystem checks exposed by `find`, `stat`, and `lsattr`, Git queries, checksum
commands, and JSON reshaping with `jq`.

## Audited Deletions

The 2026-08-18 audit proved these Python removals without reducing behavior:

- `ci/exemption_files.py`: no production caller; active provenance enforcement
  already exists in `lib/ci_exemptions.sh`.
- `scripts/extract-code-stats.py`: orchestration plus JSON reshaping that Bash
  and the installed `jq` binary provide directly.
- `_INHERIT_OWNER_RE`, `validate_exclusions_text`, and `PathCheckResult`: unused
  symbols confirmed by repository-wide reference search and dead-code analysis.

The rejected `ci/hook_immutability.py` working-tree experiment is not an
architecture. Hook installation remains a shell lifecycle operation. After
publication, deployment invokes the root-owned immutable
`/opt/workspace-ci/scripts/reinstall-hooks`; the shell guard classifies that
sealed script as trusted. Agent-writable copies remain scanned and cannot route
blocked `chattr` execution through another language.

Source pre-commit validation checks the hook manifest and exception policy; it
does not require the installed hooks to match an uncommitted source tree.
Deployment and WORKSPACE-GUARD own installed hook identity, ownership, mode,
and immutability. This separation prevents hook installation from becoming a
prerequisite for committing the deployment change that installs those hooks.

## Documentation Consequences

- “Native hooks” means generated `.git/hooks/*` Bash dispatch with no
  pre-commit framework, worktree stashing, or remote hook environments.
- It does not mean every checker is implemented in Bash or that no checker
  invokes the hermetic Python runtime.
- New Python code must identify the structured behavior unavailable from shell
  and installed CLI tools. Otherwise, use shell or delete the feature code.
