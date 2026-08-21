# Policy Exemption Classification Audit

**Date:** 2026-08-21
**Scope:** Every `universal_exceptions` entry in `config/banned_words.yaml`
as of commit `e005d53`.
**Method:** Each entry was classified as JUSTIFIED QUOTED DATA (non-executable
content that must quote a forbidden string), LEGITIMATE SYNTAX (the banned
byte sequence is real syntax in that file type), or CRITICAL BYPASS
(executable-source coverage lost). Broad entries are now frozen by
`lib/check_policy_integrity.py` against
`config/policy_integrity_baseline.yaml`; new or modified broad entries fail
commit and push.

## Verdict Summary

| # | Entry (paths -> patterns) | Class | Disposition |
|---|---------------------------|-------|-------------|
| 1 | policy definition files (`config/banned_words*.yaml`) -> `.*` | Policy self-definition | KEEP until structural validation replaces content exemption (baseline item) |
| 2 | CI meta-config/schema files -> `.*` | Policy self-definition | Same as #1 |
| 3 | test/web fixtures, hook-source JSON -> `.*` | Generated/quoted data | Baseline; replace with digest verification |
| 4 | `docs/references/`, `docs/archive/` -> `.*` | Non-executable quote archives | Baseline; replace with exact classification |
| 5 | lockfiles (`uv.lock`, `package-lock.json`) -> `.*` | Generated data | Baseline; replace with lockfile parser |
| 6 | `workspace/config/patterns/` -> `.*` | Pattern catalog quoting rules | Baseline |
| 7 | Guard sandbox profiles -> catch-all pattern keys | Policy data | Baseline |
| 8 | `AGENTS.md` -> listed patterns | Operator doc quoting policy | Baseline; exact-file acceptable long-term |
| 9 | `.pre-commit-config.yaml` -> `\bsilent` | Config quoting checker ids | Baseline |
| 10 | install-e2e/test register-extension paths -> `.venv/bin/python` | Layout assertions | Baseline; exact files |
| 11 | `workspace/config/` -> listed patterns | Config quoting own rules | Baseline |
| 12 | `tests/` -> listed patterns | Test-quality rules on fixtures | CRITICAL (directory-wide executable tests); shrink first |
| 13 | `.toml`/`.sh`/`Makefile`/`.yaml` -> ` -- ` | Legitimate syntax | KEEP (real syntax), but scope via baseline until narrowed |
| 14 | silent-swallow detector files -> `\bsilent` etc. | Subject-matter terms | KEEP (detector's own domain language) |
| 15 | `ci/check_duplicate_dependencies.py` -> `dict[..., Any]` | Correct TOML-parse return type | KEEP |
| 16 | `.sh/.yaml/.toml/Makefile/.py` -> system-interpreter pattern | Bootstrap dir names + language detection | CRITICAL (extension-wide; hid deployment system-Python); shrink first |
| 17 | `lib/`, `tests/`, `scripts/` -> system-interpreter pattern | Language detection | CRITICAL (directory-wide; hid all 8 system-interpreter deployment calls); shrink first |
| 18 | boot-layout checker files -> `.venv/bin/python` | Advisory messages quoting old forms | Baseline; exact files |
| 19 | `web/Containerfile$` -> system-interpreter pattern | OCI interpreter path | Baseline; exact file |
| 20 | `.*` -> technical terms (underscore/harness/navigate/dynamic) | Legitimate NOUN/technical sense | KEEP (semantic exception, not a bypass) |
| 21 | `web/src/data/standards.json` -> the three hype terms (naming them is itself banned) | Official governance terms | KEEP |
| 22 | `docs/audit-09.08.2026/` -> `.*` | Historical audit text | Baseline; documentation-only |
| 23 | exact 5-file `protected-system-interpreter` entry (added 2026-08-20) | Justified quoted data | KEEP; conforms to one-file-one-rule shape |

## Critical Bypasses (removal order)

1. **#17 `lib/`, `tests/`, `scripts/` -> system-interpreter pattern**: traced to commit
   `7255c11` (workspace-agent, 2026-07-07); this is the entry that let all
   eight deployment system-interpreter calls through. Replace with exact
   language-detection fixture files.
2. **#16 extension-wide system-interpreter pattern**: traced to commit `d1f4a67`
   (V, 2026-06-09). Same replacement; bootstrap directory names move to a
   structural exception handled outside content matching.
3. **#12 `tests/` directory-wide test-quality rules**: executable test
   logic escapes production rules. Convert fixtures to exact data files.

## Enforcement

`ci_check_policy_integrity` (pre-commit, mandatory, non-exemptible) freezes
all baseline entries by exact digest. Shrinking the policy requires
regenerating the baseline through review; adding or widening any broad entry
fails closed. Activation: next `make deploy-ci`.
