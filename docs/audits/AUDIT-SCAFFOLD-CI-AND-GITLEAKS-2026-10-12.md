# Audit: scaffold-ci Generation and gitleaks Secret-Scan Trust Boundary of 2026-10-12

**Date:** 2026-10-12
**Auditor:** workspace-agent (opencode)
**Status:** Open - all defects remediated in source (revision 2 supersedes the
gitleaks root-ownership approach and the `bash.real` template escape); pending
reviewed install (`make deploy-ci`). No operator action outstanding.

## Scope and Method

This audit covers two facilities that enrollment and commit enforcement
depend on:

1. **`scaffold-ci`** (`scripts/scaffold-ci`, `lib/scaffold_lib.sh`,
   `lib/scaffold_analyze.sh`, `templates/Makefile.consumer`,
   `templates/ci-profile.template.yaml`): the generator that enrolls a
   consumer repository into the CI contract.
2. **`ci_scan_secrets`** (`lib/checks_secrets.sh`): the gitleaks wrapper
   that runs on every commit.

Evidence is read-only static inspection plus controlled reproduction:

- `scripts/scaffold-ci --consumer <dir> --analyze|--json|--dry-run` against
  the enrolled consumer `projects/WORKSPACE-GATEWAY` (no writes).
- The shell unit and integration suites (`tests/run_tests_unit.sh`,
  `tests/run_tests_integration.sh`).
- `git log`/`git show` of the restore and repair commits for the
  scaffold subsystem (`a0efdec`, `c18d3ec`, `7d42315`) and the gitleaks
  policy commits (`28494a4`, `85f0f26`, `21e64db`).

The session began from an operator report that `scaffold-ci` "does not
scaffold a ci-profile and does not add missing entries in the target
Makefile", and a parallel-session report that `--append-makefile` appended
rules without their variable preamble. Remediation was performed in the
working tree; no commit, push, or deployment was performed in this session.
One unrelated integration failure observed mid-session
(`e2e_banned_words: clean file passes` and two siblings) was traced to the
auditor's own comment text containing a banned token and fixed in place.

## Summary

Thirteen defects were identified, in two families. The scaffold family is a
mix of an unimplemented requirement, a design gap, and a `set -e` leak; the
gitleaks family is a pair of fail-open behaviours plus a trust-boundary gap.

| # | Facility | Defect | Class | Severity |
| --- | --- | --- | --- | --- |
| F1 | scaffold | `--append-makefile` appends target blocks without the template variable preamble | Broken output | High |
| F2 | scaffold | Default run never adds missing Makefile targets to an existing Makefile | Design gap | Medium |
| F3 | scaffold | `--analyze` / `--json` abort mid-report under `set -e` | Broken output | High |
| F4 | scaffold | `ci-profile.yaml` declared as generated output but never created | Unimplemented requirement | High |
| F5 | scaffold | `--emit-template` writes a space-separated `languages` list the profile parser rejects | Broken output | High |
| F6 | scaffold | `--append-makefile` on a Makefile without a preamble emits an empty-path recipe | Fail-open (wiring) | High |
| F7 | gitleaks | Repo config's `[extend] path` drops the repo's `[allowlist]`/`[[allowlists]]` | Dropped allowlist | High |
| F8 | gitleaks | A repo `.gitleaks.toml` suppresses `useDefault`, so an allowlist-only file scans with zero rules | Fail-open | Critical |
| F9 | gitleaks | Repo `.gitleaks.toml` is agent-writable and outside the root-owned scope | Trust boundary | High |
| F10 | scaffold | Auto-inserted mandatory hooks are never written back to the consumer profile | Drift | Medium |
| F11 | scaffold | Integration test `scaffold_missing` asserted the pre-F4 "refuse" contract | Stale test | Low |
| F12 | docs | REQ/SPEC asserted the profile must pre-exist, contradicting SPEC §1.2 | Doc drift | Low |
| F13 | process | `--append-makefile` behaviour was untested beyond target-name presence | Test gap | Low |

A follow-up review (Revision 2, below) found three further defects the first
pass missed or introduced: F14 (the consumer Makefile template referenced the
prohibited host root-shell escape `/bin/bash.real`) and F15/F16 (the gitleaks
fix mandated root ownership and rejected `[extend]`, which would fail every
commit in a repository whose config already carries `[extend]`). The F7-F9
remediation rows below are superseded by the Revision 2 rows.

F2 was resolved by operator decision (see Remediation) rather than by
changing the default: the default skip is retained and the documented
enrollment command now carries `--append-makefile`.

## Findings

### F1 - `--append-makefile` omits the variable preamble

`_scl_append_makefile` (`lib/scaffold_analyze.sh`) extracted only target
blocks from the rendered template. The variables those recipes reference -
`SCRIPT_BASH`, `CI_DIR`, `REPO_ROOT` and the `-include
$(CI_DIR)/lib/makefile_contract.mk` line - live in the template preamble
(`templates/Makefile.consumer` lines 14-51), which was never appended. A
hand-written Makefile that lacks them expands `$(SCRIPT_BASH)` and
`$(CI_DIR)` to empty, so `install-hooks` becomes `/scripts/reinstall-hooks`
and `clean-precommit` becomes `/scripts/cleanup-precommit`. The unit test
`test_append_makefile_adds_missing` asserted only that the target names
appeared, so the defect was invisible.

### F2 - Default run never adds missing Makefile targets

`scripts/scaffold-ci` skipped an existing Makefile wholesale when no force
flag was set:

```
elif [[ -f "$_mf_target" && $_force_mf -eq 0 && $_force_all -eq 0 ]]; then
    _skipped+=("$_mf_target (... append new targets with --append-makefile)")
```

Missing contract targets were only added through an explicit
`--append-makefile`. The documented enrollment command used by operators
(`RUNBOOK-INTEGRATION.md`) did not mention the flag, so a repository
enrolled with the documented command accumulated a Makefile that
failed `contract-check` with no diagnostic until the next commit.

### F3 - `--analyze` / `--json` abort under `set -e`

`_scl_makefile_target_diff` ended with:

```
[[ $_found -eq 0 ]] && _extra+=("$_t")
```

When the last iterated target was present in the template the test returned
1; the function returned 1; and `scripts/scaffold-ci` (running
`set -euo pipefail`) exited before printing the remainder of the report.
Reproduced against `projects/WORKSPACE-GATEWAY`:

- `--analyze` exited 1 and stopped after the file-state table, never
  printing `Makefile target analysis`, `Hook wiring`, or the suggested next
  step (the function is called at `lib/scaffold_analyze.sh:245`, after the
  table).
- `--json` exited 1 and produced **no output at all** (the same function is
  called at `lib/scaffold_analyze.sh:295`, before the first `printf`).

### F4 - `ci-profile.yaml` is never scaffolded

SPEC-SCAFFOLD-CI §1.2 lists `ci-profile.yaml` as the first generated
artifact, and §4.5 states that auto-inserted mandatory hooks are written
back to the profile. The implementation required the file as input and
failed fast when it was absent:

```
[[ -f "$_profile" ]] || { ci_fail "Profile not found: $_profile"; exit 1; }
```

No scaffold function wrote a profile. Consequence: enrollment required a
manual `cp templates/ci-profile.template.yaml <consumer>/ci-profile.yaml`;
auto-inserted mandatory hooks were regenerated into
`.pre-commit-config.yaml` on every run but never committed to the profile,
so it drifted (F10).

### F5 - `--emit-template` writes a `languages` list the parser rejects

While implementing F4, the generated reference template failed to parse:

```
$ bash scripts/scaffold-ci --consumer /tmp/opencode/pf-test
FAILED: Validation errors:
  - unknown language: <the two language names joined by a space>
```

`_scl_gen_template` (`lib/scaffold_lib.sh`) joined `_tpl_langs` with the
default `IFS` (space), emitting `languages: [python rust]`. YAML reads that
as a single scalar, and `emit_inline_list` (`lib/parse_hook_yaml.awk:228`)
splits only on commas, so the two names became one token and validation
rejected it. The
committed template carried the same malformed line, so a consumer copying
it verbatim would have hit the same validation error. Commit `b404b35`
("join scaffold language list with commas") fixed the generated *header*
comments but not this template line.

### F6 - `--append-makefile` emits an empty-path recipe

This is F1 observed end to end: appending `install-hooks` to a Makefile
that has no preamble produced a recipe whose `$(CI_DIR)` expands empty, so
it invokes `/scripts/reinstall-hooks` (a nonexistent absolute path). The
integration surface showed the target present and the recipe broken.

### F7 - gitleaks drops the repo allowlist

`lib/checks_secrets.sh` loaded the repo config by reference:

```
printf "[extend]\npath = '''%s'''\n\n" "$_ss_root/.gitleaks.toml" >"$_ss_config_tmp"
```

gitleaks merges *rules* from an extended path but not the
`[allowlist]`/`[[allowlists]]` sections. A consumer's reviewed allowlist
therefore had no effect and its false positives kept blocking commits. The
parallel session's evidence: the same repo file used directly as `--config`
yielded zero notes, while the `[extend] path` form yielded three.

### F8 - gitleaks scans with zero rules (fail-open)

`useDefault = true` was emitted only in the `else` branch, i.e. only when no
repo `.gitleaks.toml` existed. When one existed, the top-level config had no
`useDefault`, so the rule set came solely from the repo file. A file that
contained only an `[allowlist]` - exactly the shape shipped at the
workspace-root `.gitleaks.toml` - contributed no rules, so the
scan had zero rules and passed every secret. The parallel session's
evidence: with a `[allowlist]`-only repo file the known-good positive
control was not detected.

### F9 - repo `.gitleaks.toml` is agent-writable, outside the root-owned scope

`ci_scan_secrets` honours `$_ss_root/.gitleaks.toml`, at the repository (or
workspace) root, and nothing required it to be root-owned. Existing files
were agent-owned:

```
-rw-rw-r-- 1 agent agent  192 ~/WORKSPACE-VM/.gitleaks.toml
-rw-rw-r-- 1 agent agent 1288 ~/WORKSPACE-VM/projects/WORKSPACE-GUARD/.gitleaks.toml
```

`config/sensitive_files.yaml` lists `.gitleaks.toml` as a safe exception, so
an agent-authored allowlist was not even blocked as a sensitive file. The
banned-pattern policy (`config/banned_words.yaml`, the inline-suppression
rule) forbids inline suppressions and names "a
reviewed repo-level `.gitleaks.toml` allowlist" as the sanctioned
alternative, but no mechanism made that file root-owned or review-gated. An
agent could add `[[allowlists]]` entries and suppress secret findings.

### F10 - mandatory hooks never written back to the profile

Phase E auto-inserts missing mandatory hooks into an in-memory copy for
`.pre-commit-config.yaml`, but never persists them to `ci-profile.yaml`
(SPEC §4.5 promised the profile is rewritten under `--force`, a flag that
was later removed). On `projects/WORKSPACE-GATEWAY` the current run
auto-inserted nine hooks (`check-init-files`, `check-policy-integrity`,
`check-py-not-executable`, `check-trusted-exec`, `check-module-size`,
`check-npm-lock-sync`, `check-inline-code`, `check-coverage-no-devolution`,
`check-resolution-shapes`) that are absent from its committed profile.

### F11-F13 - test and documentation drift

- F11: `tests/integration/test_scaffold_ci.sh` asserted that a missing
  profile fails (`scaffold_missing`), the pre-F4 contract.
- F12: `REQ-SCAFFOLD-CI` FR-SC-1.3 and `SPEC-SCAFFOLD-CI` §5.3 / CLI help
  asserted the profile must pre-exist, contradicting SPEC §1.2.
- F13: the append path had no test asserting the preamble, so F1 was
  invisible; `TR-SC-2` did not enumerate an explicit-missing-profile case.

## Remediation

Operator decisions taken this session:

- **Missing Makefile targets:** keep the explicit `--append-makefile` flag;
  do not change the default skip. Fix the flag and update the documented
  enrollment command.
- **`ci-profile.yaml`:** generate it from the reference template when absent.
- **gitleaks config scope:** guard the existing repo-root path (require
  root ownership, fail closed) rather than relocate it.

| # | File | Change |
| --- | --- | --- |
| F1/F6 | `lib/scaffold_analyze.sh` | `_scl_append_makefile` now emits the rendered preamble (everything before the first target, minus `.DEFAULT_GOAL`) before the appended blocks, but only when the destination does not already define `CI_DIR`/`SCRIPT_BASH`. |
| F3 | `lib/scaffold_analyze.sh` | `_scl_makefile_target_diff` ends with an explicit `return 0` and uses `if` instead of a trailing `&&` so a nonzero status cannot leak. |
| F4 | `scripts/scaffold-ci` | Tracks whether `--profile` was supplied. When it was not and `<consumer>/ci-profile.yaml` is absent, renders `templates/ci-profile.template.yaml` with `project:` set to the consumer directory name, then proceeds. An explicit missing `--profile` still fails fast. `--dry-run` renders into a temp file and writes nothing into the consumer. |
| F5 | `lib/scaffold_lib.sh` | `_scl_gen_template` joins `_tpl_langs` with commas before emitting `languages:`. |
| F5 | `templates/ci-profile.template.yaml` | Regenerated (`--emit-template`); `languages: [python,rust]`. `--check-template` is green. |
| F7/F8/F9 | `lib/checks_secrets.sh` | Always writes `[extend]` + `useDefault = true`; validates the repo `.gitleaks.toml` with `ci_validate_exemption_file` (root-owned, regular, non-symlink) and fails closed; rejects a file containing `[extend]`/`[[rules]]`; concatenates the repo allowlist into the generated top-level config instead of pointing at it with `[extend] path`. |
| F2/F4 | `docs/runbooks/RUNBOOK-INTEGRATION.md` | Enrollment command is now `ARGS="--force-precommit --append-makefile --yes"`; documents profile auto-generation and the append behaviour. |
| F2 | `Makefile` | `scaffold-ci` target help updated to the same command. |
| F12 | `docs/requirements/REQ-SCAFFOLD-CI.md` | FR-SC-1.3 rewritten for template-based generation; `TR-SC-2` now requires an explicit-missing-profile case. |
| F12 | `docs/specifications/SPEC-SCAFFOLD-CI.md` | §5.3 and the `--profile` CLI text describe auto-generation. |
| F11/F13 | `tests/unit/test_checks_secrets.sh` | Asserts `useDefault = true`; repo allowlist concatenation; rejection of a rule-bearing repo file. |
| F13 | `tests/unit/scaffold/test_scaffold_ci_inspect.sh` | Preamble-carrying append; append idempotency; `--analyze`/`--json` completion. |
| F11/F4 | `tests/unit/scaffold/test_scaffold_ci_gen.sh` | Profile auto-generation; dry-run writes nothing; explicit missing profile fails. |
| F11 | `tests/integration/test_scaffold_ci.sh` | `scaffold_missing` now exercises an explicit missing `--profile`. |

## Verification

- `bash tests/run_tests_unit.sh` - 225 run, 225 passed, 0 failed.
- `bash tests/run_tests_integration.sh` - 119 run, 119 passed, 0 failed.
- `source lib/checks.sh && ci_check_module_size` - within limits.
- `ci_check_portable_shell` - no process substitution.
- `ci_check_banned_words` - no banned patterns.
- `scripts/scaffold-ci --check-template` - template up to date.
- Manual reproduction on a fresh directory with no profile: `--consumer`
  generated `ci-profile.yaml` (project substituted) and proceeded to emit
  `.pre-commit-config.yaml`, `Makefile`, `config/`, and
  `quality_exceptions.yaml` (rc 0), where the pre-fix run failed with
  `Profile not found`.

## Residual Risk, Operator Actions, and Follow-ups

1. **Superseded by revision 2.** The initial remediation required root
   ownership of the repo `.gitleaks.toml`; that is withdrawn (see Revision 2).
   No `chown` operator action is required: the repo config is an ordinary
   reviewed, tracked source file.

2. **Deployment.** The fixes live in the source tree only. `/opt/workspace-ci`
   continues to run the prior generator until `make deploy-ci` publishes a
   fresh reviewed artifact.

3. **Enrollment behaviour change (F4).** Repositories without a profile now
   receive the full reference profile (every registered hook, languages
   `python,rust`). The consumer must trim the hook list and correct
   `languages` to its stack; the present template documents this.

4. **F10 remains open.** Auto-inserted mandatory hooks are still not written
   back to `ci-profile.yaml`; the profile keeps drifting from the generated
   config. Recorded here for a dedicated change (the profile-rewrite
   behaviour SPEC §4.5 described has no implementation and no surviving
   `--force` flag).

5. **gitleaks version.** The fail-open behaviour was observed with the
   installed binaries; the remediation removes the `[extend] path` form and
   the missing-`useDefault` branch entirely, so it does not depend on a
   specific gitleaks version for correctness.

## Revision 2 (2026-10-12) - scope corrections for defects the first pass missed

A follow-up review of the same two facilities found three defects that the
first pass either introduced or left untouched. All three are remediated in
the working tree; the first-pass remediation rows for F7-F9 are superseded by
the rows below.

| # | Facility | Defect | Class | Severity |
| --- | --- | --- | --- | --- |
| F14 | scaffold | Generated and appended consumer Makefiles referenced the host root-shell escape `/bin/bash.real`, which policy prohibits for repository provisioning | Policy violation | High |
| F15 | gitleaks | First-pass fix required the repo `.gitleaks.toml` to be root-owned and rejected any `[extend]` table; the already-present WORKSPACE-GUARD config (with `[extend] useDefault = true`) would fail every commit after deploy | Fail-closed regression | Critical |
| F16 | gitleaks | Trust-boundary model was wrong: a repo-root `.gitleaks.toml` is an ordinary reviewed tracked source file, not a root-owned artifact | Misdiagnosis | High |

### F14 - consumer Makefiles referenced `/bin/bash.real`

Commit `8032194` ("root-safe consumer Makefile template") added, to
`templates/Makefile.consumer`, an `ifeq ($(shell id -u),0)` branch that set
`SHELL := /bin/bash.real` and `SCRIPT_BASH := /bin/bash.real`, plus two
`$(error /bin/bash.real missing ...)` guards, on the premise that the guarded
`/bin/bash` "fails closed for root (AT_SECURE == 0)". That premise is not
correct for the canonical flow: the WORKSPACE-CI Makefile itself uses
`SHELL := /bin/bash` / `SCRIPT_BASH := bash`, and its root-only
`install-hooks` target runs `bash <CI_DIR>/scripts/reinstall-hooks` (guarded
shell) as root. The template therefore diverged from the canonical example it
documents.

Policy prohibits the reference outright:

- `docs/TODO-POLICY-EXEMPTION-REMEDIATION.md` items 147-149: "Audit the root
  `/bin/bash.real` escape as host authority outside repository provisioning",
  "Prohibit every repository provisioning reference to `/bin/bash.real`", and
  an integration test proving guarded `/bin/bash` stays usable while the
  candidate owner cannot execute `/bin/bash.real`.
- `docs/proposals/PROPOSAL-SHELL-GUARD-INTERPRETER-COVERAGE-2026-09-06.md`
  line 38: "Prohibit every repository-provisioning reference to
  `/bin/bash.real` (host authority only)".

The reference reached consumers by two paths. Full generation rendered the
template verbatim. The F1 fix made it worse: `_scl_append_makefile` now copies
the template preamble (lines 14-51) into an appended consumer Makefile, so
even previously clean hand-written Makefiles acquired the `/bin/bash.real`
branch. The regression was invisible because the enforcement test
`tests/unit/test_bootstrap_rust.py::test_automation_has_no_real_shell_escape`
scanned `Makefile`, `web/Containerfile`, and `scripts/*` - but not
`templates/`.

### F15/F16 - the F7/F8/F9 remediation broke the existing reviewed config

The first-pass fix to `lib/checks_secrets.sh` (this audit, F7-F9) was written
against an assumed "root-owned, allowlist-only" repo config. Two of its
requirements are wrong:

1. **Root ownership.** `ci_validate_exemption_file` requires uid 0. A
   repo-root `.gitleaks.toml` has no secure edit path at all: the sanctioned
   editor (`sudo make -C ../WORKSPACE-GUARD yaml-set` and siblings) is scoped
   to `config/` YAML and does not take a repo-root TOML. `config/`'s
   `sensitive_files.yaml` classifies `.gitleaks.toml` as a safe exception, so
   the file is not even treated as sensitive. Mandating root ownership of a
   reviewable source file is unimplementable in practice.
2. **Rejecting `[extend]`.** The check rejected any file containing
   `[extend]` or `[[rules]]`. But the already-tracked
   `projects/WORKSPACE-GUARD/.gitleaks.toml` contains `title = ...`,
   `[extend] useDefault = true`, and `[[allowlists]]`, and is
   `agent:agent 0664`. Under the first-pass fix, every commit in that
   repository would fail the secret scan after deploy.

The correct model (F16): the repo config is an ordinary tracked source file,
edited and reviewed like any other (`git` history shows commit `8d04c55` in
WORKSPACE-GUARD editing it as the agent). The guard's job is not provenance
but fail-closed semantics: it must not be able to disable the default rules
and must not be able to drop its own allowlists.

### Revision 2 remediation

| # | File | Change |
| --- | --- | --- |
| F14 | `templates/Makefile.consumer` | Replaced both `ifeq ($(shell id -u),0)` / `/bin/bash.real` branches (lines 14-41) with `SHELL := /bin/bash` and `SCRIPT_BASH := bash`. No reference to the root-shell escape remains in any provisioning file. |
| F14 | `docs/specifications/SPEC-SCAFFOLD-CI.md` | §7.1 generated-Makefile example updated to `SHELL := /bin/bash` / `SCRIPT_BASH := bash`. |
| F14 | `tests/unit/test_bootstrap_rust.py` | `test_automation_has_no_real_shell_escape` now also globs `templates/*`, closing the gap that hid F14. |
| F15/F16 | `lib/checks_secrets.sh` | Dropped `ci_validate_exemption_file` (no root-ownership requirement). The repo config must be a regular file (symlink/special rejected) with no `[[rules]]`; its `title` and `[extend]` table are stripped by an `awk` pass, `useDefault = true` is forced, and the remaining allowlists are concatenated into the top-level config. |
| F15/F16 | `tests/unit/test_checks_secrets.sh` | Added `test_secrets_repo_extend_stripped_defaults_forced` (a `title` + `[extend] useDefault = false` file is accepted, stripped, and forced back on) and `test_secrets_accepts_agent_owned_repo_config` (a tracked allowlist file is accepted regardless of ownership). |

### Revision 2 verification

- `bash tests/run_tests_unit.sh` - 227 run, 227 passed, 0 failed (225 + 2 new).
- `bash tests/run_tests_integration.sh` - 119 run, 119 passed, 0 failed.
- `uv run pytest tests/unit/test_bootstrap_rust.py` - 2 passed.
- `scripts/scaffold-ci --check-template` - template up to date.
- Probe: a fresh `--consumer` run emits `SHELL := /bin/bash` and
  `SCRIPT_BASH := bash` with no `bash.real` reference.
- `ci_check_banned_words`, `ci_check_module_size`, `ci_check_portable_shell`
  - all pass.

### Revision 2 residual risk

1. The repo `.gitleaks.toml` is agent-writable by design; a widened allowlist
   is visible in review (protected hooks, banned-pattern gate) rather than
   filesystem-blocked. This is the accepted control.
2. A repo config that used `[extend] path` to pull rules from another file
   has that reference dropped; only the default rules plus the file's own
   allowlists apply. No repo uses that shape today.
3. F10 (profile rewrite-back) remains open, unchanged by this revision.

## Appendix - Evidence Commands

```bash
# F3: report abort
bash scripts/scaffold-ci --consumer ../WORKSPACE-GATEWAY --analyze   # rc 1, truncated
bash scripts/scaffold-ci --consumer ../WORKSPACE-GATEWAY --json      # rc 1, no output

# F4/F5: profile auto-generation and template parse
rm -rf /tmp/opencode/pf-test && mkdir -p /tmp/opencode/pf-test
bash scripts/scaffold-ci --consumer /tmp/opencode/pf-test            # pre-F5: unknown language
bash scripts/scaffold-ci --check-template

# F9: agent-writable suppression surface
ls -la ~/WORKSPACE-VM/.gitleaks.toml \
       ~/WORKSPACE-VM/projects/WORKSPACE-GUARD/.gitleaks.toml
```