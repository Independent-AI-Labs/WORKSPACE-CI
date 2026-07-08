# SPEC-SCAFFOLD-CI: Consumer-Project CI Bootstrapper (Profile-Driven Generator)

**Date:** 2026-07-04
**Status:** DRAFT (specification; implementation pending)
**Type:** Specification
**Requirements:** [REQ-SCAFFOLD-CI](../requirements/REQ-SCAFFOLD-CI.md)

> **Implementation status:** Not started. This document is the design
> contract. All files referenced in §2 ("New Files") exist as proposals
> only; none are committed yet. The companion requirements document
> `REQ-SCAFFOLD-CI.md` defines acceptance criteria at the FR/NFR level.

---

**Cross-references:**

- [REQ-SCAFFOLD-CI](../requirements/REQ-SCAFFOLD-CI.md): companion requirements (FR-/NFR-level acceptance criteria)
- [HOOKS.md](../HOOKS.md): native hook generation contract (the downstream consumer of `.pre-commit-config.yaml`)
- [SPEC-BOOT-LAYOUT](SPEC-BOOT-LAYOUT.md): hierarchical `.boot-linux/` walk-up; the generated `Makefile` MUST honour this contract
- [`config/required_hooks.yaml`](../../config/required_hooks.yaml): the master hook registry; the source of truth for hook IDs, kinds, and applicability (read-only by the generator)
- [`scripts/generate-hooks`](../../scripts/generate-hooks): native hook generator; `scaffold-ci` produces its input file, `generate-hooks` consumes it
- [`lib/parse_precommit_config.awk`](../../lib/parse_precommit_config.awk): existing YAML parser; the implementation model for the new parser
- [`lib/makefile_contract.mk`](../../lib/makefile_contract.mk): the contract the generated `Makefile` MUST satisfy
- [`templates/quality_exceptions.template.yaml`](../../templates/quality_exceptions.template.yaml): existing template; `scaffold-ci` renders it per-consumer
- [`templates/project_enforcement.template.yaml`](../../templates/project_enforcement.template.yaml): existing workspace-level tier registry (NOT scaffolded per-consumer)
- AGENTS.md S5 (shell-first), S6 (precision edits), S13 (no silent fallback), S14 (shell strict mode): absolute constraints on the generator implementation

---

## 1. Overview

### 1.1 The Problem

Today, consumer projects (WORKSPACE-GUARD, WORKSPACE-VM, the freshly-created
WORKSPACE-GATEWAY) integrate with WORKSPACE-CI by **hand-writing** two files:

- `.pre-commit-config.yaml` -- a list of `repo: local` hooks, each with a
  path-specific `entry:` (e.g. `bash -c 'source ../CI/lib/checks.sh && ...'`
  for projects immediately under `projects/`, vs
  `bash -c 'source ../../CI/lib/checks.sh && ...'` for nested grandschildren).
- `Makefile` -- a hand-written contract Makefile with the 10 mandatory targets
  from `lib/makefile_contract.mk` (`init`, `install`, `install-ci`,
  `install-hooks`, `sync`, `check`, `lint`, `type-check`, `test`, `clean`,
  `preflight`).

The two files share a hidden invariant: the relative path from the consumer
to `projects/CI`. Every `entry:` in the YAML and every `CI_DIR` assignment
in the Makefile must encode that path consistently. There is no validator
for this invariant today -- drift is detected only at runtime, often as
`source: no such file` failures in the middle of a developer's `git commit`.

Config files compound the problem. Per-project-overridable configs
(`coverage_thresholds.yaml`, `file_length_limits.yaml`, `dead_code.yaml`,
`dependency_excludes.yaml`, `duplicate_dependency_excludes.yaml`,
`markdown_docs.yaml`) SHOULD exist in every consumer's `config/` directory
so each project can tune them locally. There is no bootstrap mechanism:
new projects either skip them (and the corresponding checkers fall back to
CI's defaults, which may be wrong for a Rust repo) or copy them by hand
(creating drift as the canonical defaults evolve).

### 1.2 What `scaffold-ci` Does

`scaffold-ci` is a single command that takes a **consumer project directory**
plus a **CI profile YAML** (declaring desired hooks, stage, ordering, project
languages, and enforcement tier) and emits a complete, consistent CI
integration package:

1. **`ci-profile.yaml`** (lives at the consumer's repo root) -- the canonical
   per-project declaration of "what CI gates I want and in what order."
2. **`.pre-commit-config.yaml`** -- generated from the profile, with all
   relative paths computed from the consumer-to-CI offset.
3. **`Makefile`** -- generated with full contract targets; language-specific
   targets (`lint`, `type-check`, `test`) are stubs with `TODO` comments
   the consumer fills in.
4. **`config/` directory** -- the six per-project-overridable config files
   copied from CI defaults as starting seeds.
5. **`quality_exceptions.yaml`** -- rendered from the existing template with
   the project name substituted.

The generator is **idempotent and force-aware**: rerunning it with
`--force` regenerates `.pre-commit-config.yaml` and `Makefile` from the
profile; without `--force`, existing files are protected and the script
exits non-zero with a list of the files it refused to overwrite.

`scaffold-ci` sits **upstream** of `generate-hooks` in the lifecycle:

```
  ci-profile.yaml ── scaffold-ci ──> .pre-commit-config.yaml
                                          │
                                          v
                                  generate-hooks
                                          │
                                          v
                                  .git/hooks/{pre-commit,commit-msg,pre-push}
```

`scaffold-ci` produces the **input** for `generate-hooks`. It does NOT
replace `generate-hooks`. The two scripts are independent: a consumer can
re-run `make install-hooks` (which calls `generate-hooks`) without
re-running `scaffold-ci`, and vice versa.

### 1.3 Scope

**In scope:**

- The `ci-profile.yaml` YAML schema (§3) and its validation rules (§4).
- The relative-path computation algorithm (§5).
- Generation of `.pre-commit-config.yaml` from the profile + master
  `required_hooks.yaml` registry (§6).
- Generation of a contract-compliant `Makefile` with empty language-specific
  stubs (§7).
- Copy of CI's per-project-overridable config defaults into the consumer's
  `config/` directory (§8).
- Rendering of `quality_exceptions.yaml` from the existing template (§9).
- The `--emit-template` maintenance subcommand that regenerates
  `templates/ci-profile.template.yaml` from `config/required_hooks.yaml`,
  guaranteeing the template never drifts from the master list (§10).
- A `scaffold-ci` Makefile target in CI's own Makefile (§12).
- A manifest entry in `scripts/manifest.yaml` consumable by the wiki tooling
  page (§13).
- Unit and integration test plans (§14).

**Out of scope:**

- Modification of `generate-hooks` itself. `scaffold-ci` produces
  `.pre-commit-config.yaml` in the exact format `generate-hooks` already
  consumes.
- Generation of `moon.yml`. Each project has custom moon task graphs;
  consumers continue to author `moon.yml` by hand.
- Touching `project_enforcement.yaml` (the workspace-tier registry). It
  lives at the WORKSPACE-VM root and is autocreated per-machine by
  `generate-hooks` (see SPEC-BOOT-LAYOUT §10). `scaffold-ci` only READS
  the tier declared in `ci-profile.yaml` to drive mandatory-hook validation
  (§4.5); it does not write to `project_enforcement.yaml`.
- Generation of `.gitignore` entries. The generator emits only the five
  in-scope files (§1.2). `.gitignore` management is the consumer's
  responsibility.
- Copy of the global (non-overridable) configs:
  `banned_words.yaml`, `banned_words_exceptions.yaml`, `schemas`,
  `blocked_commit_patterns.yaml`, `required_hooks.yaml`,
  `silent_swallow_patterns.yaml`, `sensitive_files.yaml`,
  `boot_layout.yaml`. These belong to CI; consumers MUST NOT shadow them.

---

## 2. New Files

| # | File | Purpose | Lifetime |
|---|------|---------|----------|
| 1 | `CI/templates/ci-profile.template.yaml` | The reference profile containing every hook from `required_hooks.yaml`, pre-ordered by stage then safety/maturity. Consumers copy this as their `ci-profile.yaml`. | Maintained (regenerated by `--emit-template`) |
| 2 | `CI/config/ci-profile.schema.yaml` | JSON Schema (Draft-4) for the profile YAML. Used by the generator to validate input. | Maintained by hand |
| 3 | `CI/lib/parse_hook_yaml.awk` | Single awk parser capable of emitting FS-delimited records for both `ci-profile.yaml` and `required_hooks.yaml` (mode-flag dispatched). | Maintained by hand |
| 4 | `CI/scripts/scaffold-ci` | The generator itself. Pure bash, sources `lib/ci.sh` for output helpers. | Maintained by hand |
| 5 | `CI/tests/unit/test_scaffold_ci.sh` | Unit tests: path math, parsing, validation, auto-insertion ordering. | Maintained by hand |
| 6 | `CI/tests/integration/test_scaffold_ci.sh` | Integration test: scaffold a fake consumer in a temp dir, assert every generated artifact exists and contains expected relative paths. | Maintained by hand |

Files **modified** by implementation:

| # | File | Change |
|---|------|--------|
| 7 | `CI/Makefile` | Add `scaffold-ci` target (§12). |
| 8 | `CI/scripts/manifest.yaml` | Add `scaffold-ci` entry (§13). |
| 9 | `CI/README.md` doc table | Reference `SPEC-SCAFFOLD-CI` and `REQ-SCAFFOLD-CI`. |

---

## 3. The CI Profile YAML Schema

### 3.1 File Location & Name

- The consumer's working profile lives at `<consumer>/ci-profile.yaml`.
- The reference template (every hook listed) lives at
  `CI/templates/ci-profile.template.yaml`.
- The validator schema lives at `CI/config/ci-profile.schema.yaml` (JSON
  Schema Draft-4, matching the version supported by the existing
  `config/required_hooks.schema.yaml`).

### 3.2 Top-Level Structure

```yaml
version: 1
project: <string>            # required; rendered into quality_exceptions.yaml

# Project language profile. Drives hook applicability validation (§4.6).
# Valid values: any, python, rust, node. A consumer with mixed
# languages declares a list (e.g., [python, rust]). At least one entry
# is required.
languages:
  - any

# Enforcement tier. Determines which mandatory hooks apply.
# Valid: strict | poc | vendored.
# strict:    full contract; all mandatory + safety hooks required.
# poc:       safety hooks only (mandatory-true AND safety-true from
#             required_hooks.yaml).
# vendored:  no hooks; generator exits 0 early with a notice.
tier: strict

# Hook configuration. Each stage is an OPTIONAL key; omitting a stage
# entirely is valid (e.g., a profiles-only repo with no commit-msg checks).
# Order within each stage list is the order the user wants; the
# generator preserves it and appends any auto-inserted mandatory hooks
# (per §4.5) to the END of the stage list.
hooks:
  pre-commit:
    - check-unstaged
    - block-sensitive-files
    - gitleaks
    # ...
  commit-msg:
    - check-commit-message
    - block-coauthored
  pre-push:
    - ci-check-push
    - block-coauthored-history

# Optional explicit overrides for individual hook entries.
# Use sparingly: prefer trimming the template, not rewriting entries.
# The override ONLY changes the listed fields; the rest of the hook's
# metadata is preserved from required_hooks.yaml.
overrides:
  check-markdown-docs:
    entry: "uv run --project ../CI --no-sync python -m ci.check_markdown_docs --all-md --check-remote"
```

### 3.3 Field Reference (Exhaustive)

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `version` | int | yes | -- | MUST be `1`. Future profiles bump this. |
| `project` | string | yes | -- | Rendered into `quality_exceptions.yaml::project`. Used by the compliance checker to label violations. May contain alphanumerics, `_`, `-`, `.`. No whitespace. |
| `languages` | list[str] | yes | -- | Each entry in {any, python, rust, node}. `any` is exclusive (cannot coexist with others). |
| `tier` | string | yes | -- | One of {strict, poc, vendored}. |
| `hooks` | map | yes (unless tier=vendored) | -- | Map keyed by stage name. Stage keys: `pre-commit`, `commit-msg`, `pre-push`. Any other key is a validation failure. |
| `hooks.<stage>` | list[str] | no | `[]` | Each entry MUST be a hook ID present in `config/required_hooks.yaml`. |
| `overrides` | map | no | `{}` | Keys are hook IDs; values are partial hook metadata dicts. Allowed override fields: `entry`, `files`, `exclude`, `always_run`, `pass_filenames`. Any other field is a validation failure. |
| `overrides.<id>.entry` | string | no | inherited | Full entry string as it will appear in `.pre-commit-config.yaml`. The generator does NOT mutate it -- it writes it verbatim. Caller is responsible for embedding the correct relative path. |

### 3.4 Ordering Semantics

The list under `hooks.<stage>` is the **explicit order** for that stage.
The generator:

1. Validates every listed hook ID exists in `required_hooks.yaml` (§4.4).
2. Checks every mandatory hook applicable to the declared tier + languages
   is present. Missing mandatory hooks are **auto-inserted at the END** of
   their stage list with a printed notice (§4.5). They are NEVER inserted
   at the front; the user's declared order is canonical.
3. Emits the YAML in the resolved order.

The generator **never silently reorders** user-listed hooks. If a project
wants `gitleaks` before `check-unstaged`, the profile must list them in
that order; the generator emits them in that order.

### 3.5 The Template Profile

`CI/templates/ci-profile.template.yaml` is **generated** from
`config/required_hooks.yaml` (see §10 for the `--emit-template` mode).
It contains every hook from the master list, organised by stage, in the
recommended order:

1. **Safety hooks first within `pre-commit`** -- every hook with
   `safety: true` and `mandatory: true` appears before any non-safety
   hook in that stage.
2. **Strict-tier mandatory hooks second** -- `mandatory: true AND
   safety: false`.
3. **Exemptable / heuristic hooks third** -- `mandatory: false`.

The template's only decoration is comments:

```yaml
# ci-profile.template.yaml -- reference profile generated from
# config/required_hooks.yaml by `scripts/scaffold-ci --emit-template`.
# Copy this to <consumer>/ci-profile.yaml and trim per-project.
# DO NOT edit this template by hand; regenerate it via
# `make scaffold-ci ARGS=--emit-template`.
```

The template is a CONSUMER starting point. The generator does not require
the consumer profile to match the template; the template is documentation,
not a runtime input.

---

## 4. Profile Validation Algorithm

The validator runs in five phases BEFORE any file is written. Failure in
any phase exits non-zero BEFORE touching disk (per AGENTS.md Rule 13 --
no silent fallback, partial writes are forbidden).

### 4.1 Phase A: Schema Parse

Read the supplied profile YAML. If the file does not exist or contains
no top-level `version: 1` key, fail with `ci_fail` and exit 1. The awk
parser (`lib/parse_hook_yaml.awk`) emits FS-delimited records; the bash
driver collects them into shell variables. No Python dependency (per
AGENTS.md Rule 5 -- shell-first for CI hooks).

### 4.2 Phase B: Required Fields

Validate presence of: `version`, `project`, `languages`, `tier`, `hooks`
(unless `tier: vendored`, in which case `hooks` is forbidden -- its
presence is a validation failure, signalling the profile author may have
intended `strict`). Fail on first missing field with a list of all
missing fields in the diagnostic (collect-then-fail, not fail-on-first,
for a better developer experience).

### 4.3 Phase C: Field Value Validation

- `version` MUST == 1.
- `tier` MUST ∈ {strict, poc, vendored}.
- `languages` MUST be a non-empty list; each entry MUST ∈ {any, python,
  rust, node}. The sentinel `any` MUST NOT coexist with other language
  entries (fail with diagnostic).
- `project` MUST match `^[A-Za-z0-9][A-Za-z0-9_.-]*$` (alphanumeric start
  plus limited punctuation -- never whitespace, never shell metacharacters).
- Stage keys under `hooks` MUST ⊆ {pre-commit, commit-msg, pre-push}.
  Anything else is a validation failure.
- Each entry in a stage list MUST be a string (not number, not list).
- `overrides` keys MUST be hook IDs present in the profile's own `hooks`
  block. Overriding a hook that is not declared in `hooks` is a failure
  (don't override what you don't enable).
- Override field names MUST ⊆ {entry, files, exclude, always_run,
  pass_filenames}. Other fields are rejected.

### 4.4 Phase D: Hook ID Resolution

For every hook ID listed in `hooks.<stage>`:

1. Look up the ID in `config/required_hooks.yaml` (parsed via
   `parse_hook_yaml.awk`).
2. If the ID is unknown, fail with the exact message:
   ```
   FAILED: hook '$ID' listed in stage '$STAGE' of ci-profile.yaml
             is not registered in config/required_hooks.yaml.
             Add it to the master registry first, or remove it from
             the profile.
   ```
3. Cross-check `applicable_to`: the hook's `applicable_to` MUST intersect
   the profile's `languages`. By default (`--strict-applicable`, the
   default), a mismatch is a **hard error** (the hook would fail at commit
   time with no diagnostic; wiring it would be a disservice). The error
   message includes a hint to pass `--lax-applicable`:
   ```
   FAILED: hook '$ID': applicable_to=[$APP] does not intersect
            languages=[$LANGS] (wiring anyway would fail at commit
            time with no diagnostic; pass --lax-applicable to downgrade
            to warning)
   ```
   When `--lax-applicable` is given, the error is downgraded to a
   `ci_warn` warning to stderr and listed in the post-run summary, but the
   generator proceeds. This preserves the original behaviour for users
   who deliberately include a cross-language hook.

### 4.5 Phase E: Mandatory-Hook Completeness Check

For the declared `tier`:

- **`vendored`**: skip the entire scaffolding. Exit 0 with:
  ```
  INFO: tier=vendored: no CI integration generated.
  ```
- **`poc`**: the set of mandatory hooks = `{ h ∈ required_hooks.yaml |
  h.mandatory == true AND h.safety == true AND h.applicable_to intersects
  profile.languages }`. Every such hook MUST be present in the appropriate
  stage of the profile. Any missing ones are **auto-inserted** at the end
  of their natural stage (per the stage listed in `required_hooks.yaml`):
  - Print a `ci_warn` with the auto-inserted hook IDs.
  - The user is told they can stabilise the auto-insertion either by
    editing the profile to explicitly list the hook, or by accepting
    the generator's choice (the profle is rewritten via `--force` on the
    next scaffold; if `ci-profile.yaml` was committed in trimes state,
    the generator notices and surfaces the auto-inserts in a CHANGELOG
    header at the top of the rewritten file).
- **`strict`**: same set as `poc` plus `{ h | h.mandatory == true AND
  h.safety == false AND h.applicable_to intersects profile.languages }`.
  Auto-insertion rules identical.

The generator NEVER removes a user-declared hook from the profile, even
if removing it would bring the profile closer to some canonical set. The
generator adds; it does not subtract. (Subtraction is human-only: edit
the profile, re-run scaffold.)

### 4.6 Validation Pseudocode

```
phase A: parse YAML -> {version, project, languages, tier, hooks, overrides}
         if parse error or version != 1: fail-fast

phase B: required = {version, project, languages, tier}
         if tier != vendored: required += {hooks}
         missing = required - parsed.keys
         if missing: fail with list

phase C: validate field values per §4.3
         collect all errors, fail at end of phase

phase D: registry = parse required_hooks.yaml
         for stage in {pre-commit, commit-msg, pre-push}:
           for id in profile.hooks[stage]:
             if id not in registry: accumulate error
             else:
               applicable = registry[id].applicable_to
               if "any" not in applicable and
                  none(lang in applicable for lang in profile.languages):
                   ci_warn "hook $id: applicable=$applicable does not intersect profile.languages=$profile.languages"
         if errors: fail with list

phase E: if tier == vendored: exit 0
         required = { id for id, h in registry if
                     h.mandatory and tier_allows(h, tier) and
                     applicable_intersection(h, profile.languages) }
         present = union of all profile.hooks[*]
         missing = required - present
         for id in missing:
            stage = registry[id].stage
            profile.hooks[stage].append(id)   # auto-insert at end
            ci_warn "auto-inserted required hook '$id' into stage '$stage'"
```

---

## 5. Path Computation Contract

### 5.1 Inputs

- `$CONSUMER_DIR` -- the path passed via `--consumer`. MUST be a directory.
  Trailing slashes stripped before use.
- `$CI_ROOT` -- the absolute path to `projects/CI` (computed by the script
  as the parent of the script's own location: `_CI_ROOT="$(cd "$(dirname
  "$0")/.." && pwd)"`, identical to the pattern in `generate-hooks` line 9).

### 5.2 The Single Computed Constant

```
REL_CI = realpath --relative-to="$CONSUMER_DIR" "$CI_ROOT"
```

Examples:
- Consumer `projects/WORKSPACE-GUARD` → `REL_CI = ../CI`
- Consumer `projects/WORKSPACE-GATEWAY` → `REL_CI = ../CI`
- Consumer `projects/groups/sub` → `REL_CI = ../../CI`

`REL_CI` is the ONLY path constant. It is substituted into:

- Every shell-sourced `entry:` in `.pre-commit-config.yaml`:
  `bash -c 'source <REL_CI>/lib/checks.sh && <fn>'`
- The `Makefile::CI_DIR` assignment:
  `CI_DIR := $(abspath $(REPO_ROOT)/<REL_CI>)`
- The `Makefile::install-hooks` recipe:
  `bash <REL_CI>/scripts/generate-hooks`

`realpath --relative-to` is POSIX extension `realpath(1)` behaviour. It is
available in coreutils >= 8.23 (already required by the workspace; the
existing `generate-hooks` script at line 53 uses the same call). For
defensiveness, if `realpath` is missing, the script fails fast with:
```
FAILED: realpath(1) not found -- install coreutils >= 8.23.
```
No silent fallback to `readlink -f` heuristic (per Rule 13).

### 5.3 Why Not Just Compute from `git rev-parse --show-toplevel`?

Because the consumer directory may not yet be a git repo (the user may run
`scaffold-ci` before `git init` on a brand-new project). The script MUST
work on a non-git directory. `realpath --relative-to` is filesystem-pure
and requires no git context.

If `$CONSUMER_DIR/ci-profile.yaml` does not exist, the script refuses
(unless `--profile` is given to point at a profile path elsewhere). The
recommended workflow is to `cp templates/ci-profile.template.yaml
<consumer>/ci-profile.yaml`, trim, then run `scaffold-ci --consumer
<consumer>`.

---

## 6. Generation Phase: `.pre-commit-config.yaml`

### 6.1 Output Format

The generated file follows the EXACT structure of WORKSPACE-GUARD's
existing `.pre-commit-config.yaml` (the canonical non-self-referencing
consumer config). One `repos:` block with a single `- repo: local` entry;
`hooks:` is a flat YAML list of `- id:` blocks.

```yaml
# AUTO-GENERATED by <REL_CI>/scripts/scaffold-ci [<timestamp>]
# Source: ci-profile.yaml | tier=<tier> | languages=<languages>
# Re-generate: make scaffold-ci CONSUMER=<consumer> --force
repos:
  - repo: local
    hooks:
      - id: check-unstaged
        name: Block Unstaged Changes
        entry: "bash -c 'source ../CI/lib/checks.sh && ci_check_unstaged'"
        language: system
        pass_filenames: false
        always_run: true
      ...
```

### 6.2 Per-Kind Entry Rendering

The hook `kind` from `required_hooks.yaml` determines the `entry:` form:

| `kind` | Generated `entry:` template |
|--------|----------------------------|
| `shell` | `bash -c 'source <REL_CI>/lib/checks.sh && <entry>'` |
| `shell_inline` | `<entry>` (already complete; the entry IS the inline command) |
| `shell_with_arg` (commit-msg stage) | `bash -c 'source <REL_CI>/lib/checks.sh && <entry> "$1"' --` |
| `python_module` | `<REL_CI>/.venv/bin/python -m <entry>` |
| `python_module_files` | `<REL_CI>/.venv/bin/python -m <entry> "$@"` (pass_filenames: true) |
| `makefile_target` | `make <entry>` (the consumer's Makefile owns the implementation; no path injection needed) |

The relative path `<REL_CI>` is substitute into the shell-source entries
only. `makefile_target` entries run `make <target>` from the consumer's
repo root (`$GIT_ROOT`), and the consumer's own Makefile resolves
`CI_DIR` internally -- no `entry:` rewrite is needed.

### 6.3 Override Application

If the profile declares an `overrides` entry for a hook ID, the listed
override fields REPLACE the corresponding values from the master registry.
Unlisted fields fall through. The override is applied BEFORE the path
substitution rule above, so if the user provides an `override.entry`, the
generator uses the user's entry verbatim (no `<REL_CI>` substitution).
The override MUST be a complete and valid entry; partial-shell-functions
are the user's responsibility.

### 6.4 Preservation of the Mutable Fields

The following `required_hooks.yaml` fields are copied verbatim into the
generated `.pre-commit-config.yaml` (after override application):

- `pass_filenames`
- `always_run`
- `files` (if present)
- `exclude` (if present)
- `stages` is NOT emitted -- the generator groups hooks by stage as in
  `ci-profile.yaml`'s `hooks:` map, producing the same effect via the
  `stage` positional in the manifest. The existing `generate-hooks` parser
  already supports both forms (single `stages: [pre-push]` and grouped
  by file location).

### 6.5 Failure Modes

- If `required_hooks.yaml` is missing, the script fails fast:
  `FAILED: config/required_hooks.yaml not found at <CI_ROOT>/config/`.
  No generation occurs.
- If a hook entry template references an unknown `kind`, the script fails
  with the offending hook ID and the unrecognised `kind` value. New kinds
  require a code change to `scaffold-ci` (§6.2) -- adding entries to
  `required_hooks.yaml` is insufficient.
- If the profile's `protobuf-style` schema validation encounters a YAML
  parse error, the script surfaces the `awk` parser's line number with the
  failing line content and exits 1. No partial YAML is ever written.

---

## 7. Generation Phase: `Makefile`

### 7.1 Skeleton (Contract-Compliant Empty Stubs)

The generated `Makefile` implements all 10 mandatory targets from
`lib/makefile_contract.mk` (CONTRACT_TARGETS line 13). The
language-specific targets are STUBS with `TODO` comments and an exit-0
`@:` body so `make check` succeeds out-of-the-box. The contract check
(`make contract-check`) passes via `make -n` (it only checks the target
IS defined; the recipe body is irrelevant to the contract).

```makefile
# AUTO-GENERATED by <REL_CI>/scripts/scaffold-ci [<timestamp>]
# Source: ci-profile.yaml | tier=<tier> | languages=<languages>
# Re-generate: make -C <REL_CI>/.. scaffold-ci CONSUMER=<consumer> --force
#
# Language-specific targets (lint, type-check, test, check-push) are
# intentional stubs. Fill them in per your project's stack. See
# <REL_CI>/Makefile for the canonical example.

SHELL := /bin/bash
.DEFAULT_GOAL := help

CI_DIR := $(abspath $(REPO_ROOT)/<REL_CI>)
REPO_ROOT := $(shell git rev-parse --show-toplevel 2>/dev/null || pwd)

-include $(CI_DIR)/lib/makefile_contract.mk

# =============================================================================
# Help
# =============================================================================
.PHONY: help
help: ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# =============================================================================
# Setup
# =============================================================================
.PHONY: preflight init install install-ci install-deps install-hooks sync
preflight: ## Verify environment
	@test -d "$(CI_DIR)" || { echo "ERROR: CI directory not found at $(CI_DIR)" >&2; exit 1; }
	@test -f "$(CI_DIR)/scripts/generate-hooks" || { echo "ERROR: generate-hooks missing" >&2; exit 1; }
	@echo "✓ Preflight OK"

init: ## Install system-level dependencies
	@echo "TODO: implement per-project system dependencies."
	@:

install: install-deps install-hooks ## Full install: deps + hooks
	@:

install-ci: install-deps ## CI install: deps only, no hooks
	@:

install-deps: ## Install project dependencies
	@echo "TODO: implement per-project dependency install (uv sync / npm ci / cargo build)."
	@:

install-hooks: ## (Re)generate native git hooks
	bash $(CI_DIR)/scripts/generate-hooks

sync: install-deps install-hooks ## Sync deps + reinstall hooks
	@:

# =============================================================================
# Quality Gates (stubs -- implement per your stack)
# =============================================================================
.PHONY: check lint type-check test check-push clean clean-precommit

check: lint type-check test ## Run all quality gates
	@echo "TODO: wire lint+type-check+test implementations; this stub passes vacuously."

lint: ## Lint -- TODO: implement (ruff / eslint / clippy -- see CI/Makefile for examples)
	@echo "TODO: lint stub -- exit 0 (vacuous pass)."
	@:

type-check: ## Type-check -- TODO: implement (mypy / tsc / cargo check)
	@echo "TODO: type-check stub -- exit 0 (vacuous pass)."
	@:

test: ## Test -- TODO: implement (pytest / vitest / cargo test)
	@echo "TODO: test stub -- exit 0 (vacuous pass)."
	@:

check-push: ## Pre-push quality gate -- TODO: implement
	@echo "TODO: check-push stub -- exit 0 (vacuous pass)."
	@:

# =============================================================================
# Cleanup
# =============================================================================
clean: ## Remove build artifacts
	@echo "TODO: implement per-project clean (rm -rf target/ node_modules dist/...)."
	@:

clean-precommit: ## Remove pre-commit framework traces
	bash $(CI_DIR)/scripts/cleanup-precommit
```

### 7.2 Why Stubs Pass `make check` Vacuously

The stub `lint`, `type-check`, and `test` targets each have `@:` (the
bash no-op) as their recipe body, which exits 0. `make check` chains
`lint && type-check && test`, all of which exit 0, so `make check` exits
0. This is intentional: a brand-new project can immediately run `make
install-hooks` and commit without picking up CI's strictness. The
consumer INCREMENTS in real implementations, replacing each `@:` with a
real recipe. The `TODO:` comments are highly visible (echoed during the
run), so the consumer cannot accidentally ship a stub to production
without noticing.

The alternative (scaffold `check: false` to fail loudly) breaks the
"clean bootstrap" UX: a brand-new project would fail every commit until
the consumer hand-wires test commands. We sacrifice early loud-failure
for late-but-easy opt-in.

### 7.3 Makefile-Contract Validation

The generated Makefile `-include`s `$(CI_DIR)/lib/makefile_contract.mk`
which provides `make contract-check`. The contract validator only checks
target PRESENCE via `make -n <target>` -- it does not inspect the recipe.
Stubs satisfy the contract by definition (target is defined, `make -n`
exits 0).

---

## 8. Generation Phase: `config/` Defaults

### 8.1 Copy List (Per-Project-Overridable)

The following six files are copied from `CI/config/` into `<consumer>/config/`:

| Source (CI) | Destination (consumer) | Tuning scope |
|---------------|-------------------------|--------------|
| `coverage_thresholds.yaml` | `config/coverage_thresholds.yaml` | Unit / integration min coverage, source paths. **CRITICAL:** the generator post-processes this file to substitute `source_path: ci` for `source_path: <project>` (the project name from the profile). |
| `file_length_limits.yaml` | `config/file_length_limits.yaml` | Max lines (default 512), recognised extensions. |
| `dead_code.yaml` | `config/dead_code.yaml` | `scan_paths`, `entry_points`. **CRITICAL:** generator substitutes `scan_paths: [ci]` with `scan_paths: [<project-language-default-dir>]` based on declared languages. For `rust`, defaults to `[src]`. For `python`, defaults to `[]` (no scan paths; the consumer fills them). For `node`, defaults to `[]`. |
| `dependency_excludes.yaml` | `config/dependency_excludes.yaml` | PyPI / npm excludes. |
| `duplicate_dependency_excludes.yaml` | `config/duplicate_dependency_excludes.yaml` | Duplicate-dep heuristic exceptions. |
| `markdown_docs.yaml` | `config/markdown_docs.yaml` | Markdown check targets. |

### 8.2 Why These Six (and No Others)

These six are the per-project-OVERRIDABLE configs -- checkers look at
`<consumer>/config/<file>` first and fall back to CI defaults if absent.
The remaining CI configs (`banned_words.yaml`, `silent_swallow_patterns.yaml`,
`sensitive_files.yaml`, `blocked_commit_patterns.yaml`,
`required_hooks.yaml`, `boot_layout.yaml`, `*_schema.yaml`) are workspace
POLICY shared across all consumers; copying them into each consumer would
create silent shadow-copies that drift.

`boot_layout.yaml` is intentionally NOT scaffolded -- it lives at the
WORKSPACE-VM root and at repos with their own `.boot-linux/` (per
SPEC-BOOT-LAYOUT §4.1). Only repos that own a `boot_dir` need it; the
generator therefore leaves `boot_layout.yaml` to the consumer's
discretion (and the existing `check-boot-venv-layout` non-blocking audit
catches missing files).

### 8.3 Overwrite Policy

- If `<consumer>/config/<file>` does not exist: copy unconditionally.
- If it exists AND its contents match the canonical CI default (modulo the
  auto-generated timestamp header): copy (effectively a no-op refresh, no
  user-visible change). The comparison strips the timestamp line so an
  un-customised config file rotated by a `--force-configs` refresh is
  detected as `IN_SYNC` rather than spuriously flagged as customised.
- If it exists AND its contents differ from the rendered template AND
  `--force-configs` / `--apply-configs` is NOT set: skip with a `ci_warn`
  listing the file and suggesting `--force-configs` to refresh or `--diff`
  to inspect the differences (per Rule 13: no silent overwrite).
- If it exists AND its contents differ from the rendered template AND
  `--force-configs` / `--apply-configs` IS set: overwrite, but the script
  prints a summary of the overwritten files at the end so the user can
  `git diff` and re-apply any intentional local edits.

The overwrite comparison now honours existing on-disk customisations
during rendering: when the `dead_code` postproc detects an existing
non-empty `scan_paths` value on disk, it preserves that value instead of
resetting it to the language-based guess. Likewise, the `coverage`
postproc preserves existing `unit.*` fields from the on-disk copy rather
than letting the `source_path` sed substitution clobber per-stack test
runner config.

### 8.4 Manifest Validation

After copy, the script verifies each copy is byte-equal to its source
(unless post-processed per §8.1). If a copy is corrupted (e.g., disk
full mid-write), the script fails fast with the affected file path and
exits non-zero.

---

## 9. Generation Phase: `quality_exceptions.yaml`

### 9.1 Rendering

The generator reads `CI/templates/quality_exceptions.template.yaml`,
substitutes `__PROJECT_NAME__` with the profile's `project` field, and
writes `<consumer>/quality_exceptions.yaml`.

The template body is:

```yaml
version: 1
project: __PROJECT_NAME__
exceptions: []
```

The rendered file is minimal and valid: empty exceptions list, magic
name substituted. The consumer will add real entries later as needed.

### 9.2 Overwrite Policy

- If the consumer doesn't already have `quality_exceptions.yaml`: write.
- If it exists: NEVER overwrite (this file is reviewer-visible per
  `templates/quality_exceptions.template.yaml` lines 5-7; overwriting
  loses exception history). Print a `ci_warn` and continue. The user is
  told the existing file is being preserved.

This is stricter than the `config/` overwrite policy (§8.3) because
`quality_exceptions.yaml` is socially audited via PR review; the
`config/` files are operational tuning.

---

## 10. `--emit-template` Maintenance Mode

### 10.1 Purpose

The template `CI/templates/ci-profile.template.yaml` MUST stay in sync
with `CI/config/required_hooks.yaml`. Hand-editing the template invites
drift: a future contributor adds a hook to `required_hooks.yaml` and
forgets to add it to the template -> consumers who scaffold later get a
stale starting point. `--emit-template` eliminates the drift risk.

### 10.2 Behaviour

```
scaffold-ci --emit-template
```

1. Parse `config/required_hooks.yaml` via `lib/parse_hook_yaml.awk`.
2. Group by `stage`. Within each stage, sort by:
   - safety: true first
   - mandatory: true second
   - mandatory: false (exemptable) last
   - Within each tier, preserve `required_hooks.yaml`'s declaring order
     (stable sort).
3. Render to `templates/ci-profile.template.yaml` with the prefix
   comment block (see §3.5).
4. Each hook listed as a bare string (`- <id>`), no inline metadata. The
   template is a starting point, not a runtime config.
5. Include a footer comment block enumerating the totals:
   ```
   # Total hooks: <N> (pre-commit=<A>, commit-msg=<B>, pre-push=<C>)
   # Generated: <timestamp>
   # Source: config/required_hooks.yaml
   ```

### 10.3 Workflow

When a hook is added to `required_hooks.yaml`, the maintainer runs:

```
make scaffold-ci ARGS=--emit-template
```

This rebuilds the template. The change is committed alongside the
`required_hooks.yaml` addition. CI's own `check-required-hooks-present`
will catch the missing template update if a maintainer forgets.

### 10.4 Implementation Note

`--emit-template` ignores all other arguments (`--consumer`, `--profile`,
`--force`, `--dry-run`). It does not touch disk beyond the single
template file. The Makefile target invocation `make scaffold-ci
ARGS=--emit-template` passes the flag through via the existing
`ARGS=...` convention used by `code-stats` (see `Makefile` line 232).

---

## 10.1 Inspection Modes (`--analyze`, `--diff`, `--json`)

Three read-only modes report state without touching disk:

| Flag | Output format | Use case |
|------|---------------|----------|
| `--analyze` | Text table: per-file state (MISSING / IN_SYNC / CUSTOMIZED), Makefile target diff (missing / common / extra), hook-wiring drift, override path checks | Pre-flight audit before a CI upgrade |
| `--diff` | Unified diffs of each file that differs from the rendered template; MISSING files show the full rendered content | Review customisations before force-refreshing |
| `--json` | Single JSON object: `consumer`, `profile`, `files[]` (path + state), `makefile_targets` (missing / common / extra arrays), `hook_drift` (state + config/exec counts) | Dashboard / CI-pipeline consumption; pipe to `jq` |

All three render the generated content in-memory (via the same
`_scl_gen_precommit`, `_scl_gen_makefile`, and `_scl_render_config`
functions used by the apply path) and compare against on-disk state.
State detection strips the volatile `# AUTO-GENERATED` timestamp line
before comparing, so a file that matches the template modulo the
timestamp is reported as `IN_SYNC`, not `CUSTOMIZED`.

The `--json` output is emitted on stdout; all warnings (auto-insert
notices, applicability hints) are printed to stderr so they do not
corrupt the JSON payload.

## 10.2 Append Mode (`--append-makefile`)

```bash
scaffold-ci --consumer <path> --append-makefile --yes
```

Parses target names from the existing `Makefile` at `<path>/Makefile`
and from the rendered template content. For each template target absent
from the existing Makefile, the entire target block (header line + recipe
lines starting with TAB) is appended to the existing file. A marker
comment is inserted before the appended blocks:

```makefile
# -- Appended by scaffold-ci --append-makefile [<timestamp>] --
```

Targets present in both the template and the existing Makefile are
skipped (assumed in sync or intentionally customised). If no targets
are missing, the script reports "no missing targets" and the Makefile is
not modified.

This mode is the safe alternative to `--force-makefile` for consumers
with a hand-edited Makefile: existing recipes are preserved, and only
new contract targets are added.

---

## 11. CLI: `scripts/scaffold-ci`

### 11.1 Usage

```
Usage: scaffold-ci --consumer PATH [--profile PATH] [--dry-run]
                   [--force-precommit|--apply-precommit]
                   [--force-makefile|--apply-makefile]
                   [--force-configs|--apply-configs]
                   [--force-all|--apply-all]
                   [--append-makefile] [--analyze] [--diff] [--json]
                   [--yes] [--no-backup] [--lax-applicable]
       scaffold-ci --emit-template

  Default (no flags):    Print analyze table; generate any MISSING file;
                         leave existing files untouched. Fresh-scaffold
                         (all files missing) writes everything.
  --consumer PATH        Consumer project directory (required for scaffolding).
                         MUST exist on disk; need not be a git repo.
  --profile PATH         Profile YAML path. Default: <consumer>/ci-profile.yaml.
                         The file MUST exist; the script does not create it.
  --dry-run              Print every file's intended content via `cat` to stdout;
                         do not write any file. Output is prefixed with a
                         per-file header suitable for diffing.

  Overwrite flags (granular; --apply-* are aliases of --force-*):
  --force-precommit      Overwrite .pre-commit-config.yaml only.
  --force-makefile       Overwrite Makefile only. REFUSES if the existing
                         Makefile has been customised (differs from the
                         template); delete the file by hand to regenerate.
  --force-configs        Overwrite config/*.yaml (6 files) only.
  --force-all            Equivalent to all three --force-* flags.

  Append mode:
  --append-makefile      Append any template targets missing from the existing
                         Makefile without touching existing recipes. Reports
                         what was added; useful for wiring in new scaffold
                         targets into a hand-edited Makefile.

  Inspection flags (never write):
  --analyze              Print per-file state table (MISSING/IN_SYNC/
                         CUSTOMIZED) and exit; no writes, including missing
                         files.
  --diff                 Print unified diffs against on-disk files and exit.
  --json                 Print machine-readable analyze JSON. Implies
                         --analyze semantics (no writes). Pipe to jq or a
                         dashboard consumer.

  Hooks:
  --yes                  Skip the interactive confirmation prompt (required
                         when stdout is not a TTY).
  --no-backup            Do not write *.scaffold-bak.<epoch> backups before
                         overwriting (backups are on by default).
  --lax-applicable       Downgrade applicable_to mismatch from hard error to
                         warning (default is strict: refuse to wire a hook
                         the registry says does not apply to these languages).
  --emit-template        Regenerate CI/templates/ci-profile.template.yaml from
                         config/required_hooks.yaml and exit. Maintenance-only mode;
                         ignores all other flags.
  -h | --help            Show this usage.
```

### 11.2 Strict-Mode Compliance (per AGENTS.md Rule 14)

The script begins with `#!/usr/bin/env bash` and `set -euo pipefail`.
No `head`/`tail` pipes anywhere in the script. Where a pipeline is used,
`PIPESTATUS[0]` is captured on the very next line.

### 11.3 Sourcing Discipline

```bash
_SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
_CI_ROOT="$(cd "$_SCRIPT_DIR/.." && pwd)"

if ! source "$_CI_ROOT/lib/ci.sh"; then
    echo "ERROR: failed to source $_CI_ROOT/lib/ci.sh" >&2
    exit 2
fi
```

Pattern mirrors `scripts/generate-hooks` lines 8-13 exactly. `ci.sh`
provides `ci_pass`, `ci_fail`, `ci_warn`, `ci_info`, color helpers, and
the `ci_resolve_tier` / `ci_autocreate_project_enforcement` helpers
already used by `generate-hooks`.

### 11.4 Argument Parsing

Arg parsing is a `while [[ $# -gt 0 ]]; do case ... esac; done` loop
identical to `generate-hooks` lines 27-41. Unknown flags call `ci_fail`
and exit 1.

### 11.5 Output Sequencing

For a normal (`--dry-run`-off, `--emit-template`-off) run, the output to
stdout (in order):

1. Header banner: `==> scaffolding CI integration for <consumer> (tier=..., languages=...,_REL_CI=...)`
2. Phase-by-phase validation notices (info / warn / fail).
3. Generation notices (one per file generated or skipped).
4. Summary block:
   ```
   ✓ Generated: <list of files>
   ✓ Skipped (already exists, no --force): <list>
   ⚠  Auto-inserted mandatory hooks: <list>
   ⚠  Warnings: <count>
   ```
5. Exit 0 on success. Exit 1 on any validation failure. Exit 2 on
   environment error (missing `realpath`, unsourceable `lib/ci.sh`).

### 11.6 Dry-Run Output

With `--dry-run`, no file is written. The script prints each intended
file content preceded by:

```
================================================================================
Would write: <consumer>/.pre-commit-config.yaml  (REPO_REL_CI=<REL_CI>)
================================================================================
<file content>
```

This format is diff-friendly: a user can run `scaffold-ci --dry-run` and
pipe through a script that splits the output into separate files for
manual review.

---

## 12. Makefile Target (in CI's own Makefile)

Add to `CI/Makefile` after the existing `compliance-all` target (line 224):

```makefile
.PHONY: scaffold-ci
scaffold-ci: ## Scaffold CI integration for a consumer project (usage: make scaffold-ci CONSUMER=path [ARGS="--force"])
	@if [ -z "$(CONSUMER)" ] && [ "$(ARGS)" != "--emit-template" ]; then \
		echo "ERROR: CONSUMER= required unless ARGS=--emit-template." >&2; \
		echo "  Example: make scaffold-ci CONSUMER=projects/WORKSPACE-GATEWAY" >&2; \
		echo "  Example: make scaffold-ci ARGS=--emit-template" >&2; \
		exit 1; \
	fi
	bash scripts/scaffold-ci --consumer $(CONSUMER) $(ARGS)
```

When `ARGS=--emit-template` is given, `--consumer` is dummy (empty
string) and the script's logic ignores it (per §10.4). The guard above
detects this and emits no missing-CONSUMER error.

---

## 13. Manifest Entry (`scripts/manifest.yaml`)

Append to the `scripts:` list:

```yaml
  - id: scaffold-ci
    path: scripts/scaffold-ci
    summary: Scaffold CI integration for a consumer project from its ci-profile.yaml.
    usage: scaffold-ci --consumer PATH [--profile PATH] [--dry-run] [--force]
    category: bootstrap
    args:
      - { name: --consumer, description: "Consumer project directory (required)" }
      - { name: --profile, description: "Profile YAML path (default: <consumer>/ci-profile.yaml)" }
      - { name: --dry-run, description: "Print what would be written without touching disk" }
      - { name: --force, description: "Overwrite existing .pre-commit-config.yaml / Makefile" }
      - { name: --emit-template, description: "Re-generate templates/ci-profile.template.yaml from required_hooks.yaml and exit (maintenance mode)" }
    output: "Generates .pre-commit-config.yaml, Makefile, config/*.yaml, quality_exceptions.yaml in the consumer directory."
    make_target: scaffold-ci
```

Manifest completeness is validated by `ci/check_required_hooks_present.py`
which already inspects the manifest; adding the entry there is sufficient.

---

## 14. Test Plan

Two new test files, both shell-based (matching the existing
`tests/unit/test_*.sh` and `tests/integration/test_*.sh` convention):

### 14.1 `tests/unit/test_scaffold_ci.sh`

Unit tests run in-process (no temp dirs, no filesystem writes beyond
the existing test scaffolds'). Cover:

- **`ci_parse_relative_path`**: given two directories, returns the
  expected `<REL_CI>`. Test all three depth branches: sibling
  (`../CI`), grandnephew (`../../CI`), same-level (`CI`).
- **`ci_validate_profile languages`**: enforcement of `any` exclusion
  with other languages, empty list, unknown language ID.
- **`ci_validate_tier`**: each tier is accepted; unknown tier is
  rejected.
- **`ci_validate_hook_id`**: known IDs pass; unknown IDs fail.
- **`ci_validate_mandatory_completeness`**: a profile missing a
  mandatory hook for the declared tier gets it auto-inserted; a profile
  in `vendored` tier with a non-empty `hooks` block fails.
- **`ci_render_entry`**: each `kind` in `required_hooks.yaml` renders
  the correct `entry:` template with `<REL_CI>` substituted.

### 14.2 `tests/integration/test_scaffold_ci.sh`

Integration tests create a temp directory, run the script end-to-end,
and assert filesystem state:

- **`scaffold_full`**: build a temp repo, drop a trimmed
  `ci-profile.yaml` into it, run `scaffold-ci --consumer <temp>`, then
  assert:
  - `<temp>/.pre-commit-config.yaml` exists and contains the expected
    `<REL_CI>` path string N times (once per shell-sourced hook).
  - `<temp>/Makefile` exists, contains all 10 contract targets
    (`grep` for each target name).
  - `<temp>/config/coverage_thresholds.yaml` exists and has
    `source_path: <project-name>` (substituted, not `ci`).
  - `<temp>/quality_exceptions.yaml` exists and contains
    `project: <project-name>`.
  - `<temp>/ci-profile.yaml` UNCHANGED by the run (the script never
    mutates the profile file -- only the staged-down to auto-inserted
    hooks is captured in runtime state, not on disk).
- **`scaffold_dry_run`**: same setup, with `--dry-run`; assert NO file
  was created in `<temp>` and stdout contains the header block for each
  intended file.
- **`scaffold_force`**: pre-existing `.pre-commit-config.yaml` is
  overwritten; without `--force`, the run skips it with a warning.
- **`scaffold_em_template`**: invoke `--emit-template`, assert the
  `templates/ci-profile.template.yaml` file on disk is rewritten and
  contains every `id:` from `required_hooks.yaml`.
- **`scaffold_vendored`**: profile with `tier: vendored` exits 0 and
  writes NO file (profile is read, evaluated, no generation).
- **`scaffold_profile_missing`**: missing profile file (no
  `--profile`) exits non-zero with the expected error message.
- **`scaffold_unknown_hook`**: profile lists a fake hook ID;
  generator fails with the exact diagnostic (§4.4).

### 14.3 Existing Hooks

After implementation, the new `scaffold-ci` script itself must be
registered in `required_hooks.yaml`'s compliance check? NO --
`scaffold-ci` is a Makefile target, not a git hook. It does not appear
in `.pre-commit-config.yaml` and is not validated by
`check_required_hooks_present`. Its manifest entry IS validated
(optionally) by a future stricter manifest checker -- currently
`check_required_hooks_present` only validates the manifest exists; it
does not check individual entries.

---

## 15. Phased Implementation

### Phase 1: Schema and parser foundation

- [ ] Author `CI/config/ci-profile.schema.yaml` documenting the schema
  in JSON Schema Draft-4. Same draft as other `*.schema.yaml` files.
- [ ] Author `CI/lib/parse_hook_yaml.awk`: a single awk parser that
  emits FS-delimited records for both `ci-profile.yaml` and
  `required_hooks.yaml` (mode-flag dispatched). Re-use the patterns from
  `lib/parse_precommit_config.awk`. The parser does no validation; pure
  tokeniser.
- [ ] Unit tests for the parser (round-trip: parse → re-emit → diff).

### Phase 2: Generator script

- [ ] Author `CI/scripts/scaffold-ci` implementing §11. Strict-mode
  compliant. Sources `lib/ci.sh`. Uses `lib/parse_hook_yaml.awk`.
- [ ] Implement Phase A-E validation (§4) -- fail-fast, no partial
  write.
- [ ] Implement all six generation outputs (`.pre-commit-config.yaml`,
  `Makefile`, six `config/` files with post-processing, one
  `quality_exceptions.yaml`).
- [ ] Implement `--dry-run`, `--force`, `--emit-template` flags.
- [ ] Unit tests (§14.1).

### Phase 3: Makefile target and manifest

- [ ] Add `scaffold-ci` target to `CI/Makefile` (§12).
- [ ] Add `scaffold-ci` entry to `CI/scripts/manifest.yaml` (§13).

### Phase 4: Integration tests and template bootstrap

- [ ] Generate `CI/templates/ci-profile.template.yaml` via
  `make scaffold-ci ARGS=--emit-template`. Verify contents.
- [ ] Author `tests/integration/test_scaffold_ci.sh` (§14.2).
- [ ] Run the full workspace test suite (`make check-push`) to verify
  no regressions.

### Phase 5: Documentation

- [ ] Add reference entries in `CI/README.md`'s documentation table.
- [ ] Author `docs/requirements/REQ-SCAFFOLD-CI.md` companion
  requirements document.
- [ ] Add an example in `docs/HOOKS.md` showing the full
  "copy-template → trim → scaffold → install-hooks" lifecycle.

---

## 16. Open Questions

1. **`moon.yml` generation?** SPEC: no. Each project's moon task graph
   is custom. The generator leaves `moon.yml` to the consumer. If a
   future maintainer wants a `moon.template.yml` stub, that's a separate
   feature gated by its own SPEC.

2. **`check` target: chain or independent?** SPEC §7.1: chain as
   `lint && type-check && test`. With vacuous stubs, all three exit 0
   so `check` exits 0. The chain order matches the existing CI
   Makefile's own `check` target (lines 110-113). If the consumer wants
   `check` to run only lint + test (skip type-check), they edit their
   own Makefile -- the generator never regenerates it without `--force`.

3. **Python module hook entry form: direct venv or `uv run --project`?**
   SPEC §6.2 table: `<REL_CI>/.venv/bin/python -m <entry>`. Direct venv
   path, NOT `uv run --project`. Rationale: `uv run --project` is for
   cross-project invocation (e.g., WORKSPACE-GUARD invoking CI's Python
   check); the direct-venv path is simpler and matches CI's own
   `.pre-commit-config.yaml` line 121
   (`.venv/bin/python -m ci.check_markdown_docs`). WORKSPACE-GUARD uses
   `uv run --project ../CI` (its `.pre-commit-config.yaml` line 52)
   because it has no Python project of its own; consumers that DO have
   Python deps need the direct venv path. The `overrides` block lets a
   consumer opt into the `uv run` form if they want it.

4. **Should `scaffold-ci` add the six config files to a `scaffolded`
   manifest the consumer can check-in?** SPEC: no. Each consumer tracks
   their git status as normal; the generator's `--dry-run` is the
   pre-commit-sha audit. Adding a manifest would create coupling: a
   future config file added to the bootstrap list wouldn't show up
   unless the manifest was bumped.

5. **Should `scaffold-ci` add a `.gitignore` entry to the consumer
   so scaffolded files don't get accidentally committed?** SPEC: no.
   The whole purpose is to commit them -- they're the CI contract. The
   only thing that SHOULD be gitignored is `ci-profile.yaml` if the
   consumer wants machine-local tier profiles, but that's a per-project
   decision the generator leaves to the consumer.

6. **Should `ci-profile.yaml` itself be gitignored?** SPEC: NO. The
   profile is the per-project CI contract; checking it in ensures
   every contributor runs the same hooks. If a maintainer wants
   machine-local tier overrides (e.g., developer-laptop vs CI runner),
   they use the existing `project_enforcement.yaml` mechanism (which IS
   gitignored per `templates/project_enforcement.template.yaml` lines
   1-7) -- `ci-profile.yaml` is the per-repo source of truth.

7. **What happens if a consumer reorders mandatory hooks?** SPEC §4.5:
   the generator never reorders user-declared hooks. If a profile puts
   `ci-check-push` before `block-coauthored-history` in the `pre-push`
   stage list, the generator emits them in that order. The user owns
   ordering.

8. **What if `--emit-template` is run during a release freeze, and
   the regenerated template differs from the committed one?**
   SPEC: `--emit-template` always writes the file; the diff is reviewed
   at PR time. If a maintainer wants to preview without writing, they
   can temporarily redirect the script's stdout (the script writes the
   file via a final `mv -f`, so a SIGTERM mid-write aborts cleanly and
   the old file is preserved). A future `--dry-run --emit-template`
   variant could be added but is not in the initial spec.

9. **How does `scaffold-ci` interact with the existing workspace-guard
   binary (the SUID wrapper)?** SPEC: orthogonal. `scaffold-ci` runs
   WITHOUT root and without `sudo`. It writes user-owned files into the
   consumer directory. The workspace guard blocks `--no-verify`,
   `--force`, etc. at the syscall layer; `scaffold-ci`'s `--force` is a
   flag on the script itself, not on `git`. The two never conflict.

10. **What if a consumer wants NO checks at all?** SPEC: use
    `tier: vendored` in `ci-profile.yaml`. The generator exits 0 and
    writes nothing. The consumer's `make install-hooks` will then find
    no `.pre-commit-config.yaml` and `generate-hooks` already handles
    that case (it emits no hooks). For partial opt-out (some checks,
    not all), use `tier: poc`.

---

## 17. Acceptance Criteria Summary (cross-reference to REQ-SCAFFOLD-CI)

The implementation satisfies REQ-SCAFFOLD-CI when ALL of the following
hold (see REQ-SCAFFOLD-CI.md for full FR/NFR numbering):

- **FR-1**: `make scaffold-ci CONSUMER=<path>` writes the five
  in-scope files into `<path>` with correct relative-path computation
  (`<REL_CI>` verified by integration test).
- **FR-2**: `make scaffold-ci ARGS=--emit-template` regenerates
  `CI/templates/ci-profile.template.yaml` from
  `CI/config/required_hooks.yaml`.
- **FR-3**: The generated `Makefile` passes `make contract-check`
  (all 10 required targets are defined).
- **FR-4**: The generated `.pre-commit-config.yaml` is consumable by
  `scripts/generate-hooks` without modification (round-trip test:
  scaffold → `generate-hooks` → inspect `.git/hooks/*`).
- **NFR-1**: The generator is pure bash + awk (no Python). Sourced
  libraries restricted to `lib/ci.sh`.
- **NFR-2**: No silent fallback. Every failure prints a diagnostic and
  exits non-zero. `--force` does not silently overwrite
  `quality_exceptions.yaml` or already-customised `config/` files.
- **NFR-3**: Shell strict-mode compliant. No `| head`/`| tail` pipes;
  `PIPESTATUS[0]` captured on the line following every pipeline. No
  bare `.` source -- only `source ... || exit N`.
- **NFR-4**: No banned words per `config/banned_words.yaml`
  (`unwrap`, `silent`, `mock`, `stub`, `fallback`, etc.) in the
  implementation.
- **NFR-5**: All implementation files under 512 lines
  (per `config/file_length_limits.yaml`).
- **NFR-6**: Idempotent: running the generator twice with `--force`
  produces byte-identical output (modulo the timestamp comment in the
  generated files, which is the only permissible drift).

---

## 18. Post-Implementation: Bootstrapping WORKSPACE-GATEWAY

Once the feature is live, the WORKSPACE-GATEWAY project (already partially
set up in $WORKSPACE/projects/WORKSPACE-GATEWAY) boots CI
integration by:

1. `cp projects/CI/templates/ci-profile.template.yaml
   projects/WORKSPACE-GATEWAY/ci-profile.yaml`
2. Edit `ci-profile.yaml`: set `project: WORKSPACE-GATEWAY`, declare
   `languages: [rust]` (gateway is Rust Proxy-Wasm + Rust sidecars +
   Lua plugins; no Python), `tier: strict`, trim the hook list to the
   applicable-given-Rust set (drop `check-init-files`,
   `check-py-not-executable`, `check-no-dead-imports` -- Python-only).
3. `make -C projects/CI scaffold-ci CONSUMER=projects/WORKSPACE-GATEWAY`
4. Verify the generated `.pre-commit-config.yaml` references `../CI`
   correctly.
5. Run `make -C projects/WORKSPACE-GATEWAY install-hooks` (which calls
   `generate-hooks`).
6. Commit the five generated files plus the now-permanent
   `ci-profile.yaml`.

This workflow replaces the current ad-hoc hand-writing of
`.pre-commit-config.yaml` and `Makefile` for each new consumer project.

---

**End of SPEC-SCAFFOLD-CI.**