# Audit: v5 policy activation, posture verification, and guarded-interface tool hardening (2026-09-06)

## Scope

Execution of the single-cut replacement (2026-09-05 staged generation)
through the operator root flow, the posture challenge that preceded it,
and the WORKSPACE-GUARD `workspace-yaml-edit` hardening the activation
required. Evidence artifacts live under `/tmp/opencode/` (operator
transcripts, reference findings, dry-runs, gate outputs).

## 1. Posture verification (operator challenge)

Mechanical reconciliation of the staged v5 generation against v4 before
activation:

- Rules: 232 v4 (221 banned + 1 directory + 10 filename) to 225 v5
  (214 rules incl. the interpreter rule moved from code + 1 + 10). The
  only removals are 8 vocabulary rules exempted by `paths: ['.*']` in
  v4 (enforced nothing; zero-delta deletion). Directory and filename
  pattern sets are identical.
- One real weakening caught and fixed pre-activation:
  `\bcompatibility\b` had been production-scoped though absent from the
  v4 tests carve-out; scope equality with the v4 carve-out is now
  asserted exactly (19 patterns).
- Three v4 carve-out entries (`:\s*Any\b`, `#[allow\(`,
  `reason=.*not implemented yet`) exempted rules that never existed:
  dead entries, deleted with zero delta.
- Classification narrowed to the 3 policy ledgers that quote absolute
  system-interpreter invocations as historical evidence (the only
  sanctioned escape for a non-exemptible rule, REQ 14.6 / ledger 27);
  AGENTS.md, REQ-BANNED-PATTERN-MATCHING, TODO-CHECKER-OPTIMISATION,
  and both exemption-data-model/classification audits were probed with
  the engine and left unclassified and fully scanned (AGENTS.md now
  carries exactly one exception, the em-dash, versus twelve in v4).

Accepted deltas (veto-able, documented): `' -- '` scoped to docs
(extension-wide exemptions are ledger-forbidden; zero current
instances outside prose); the 3 classified ledgers lose soft-rule
scanning (forced by non-exemptibility; identical interpreter posture
to v4). Tightenings: segment-based test matching (kills `not-tests/`
leakage), case-folded interpreter rules, filename rules apply to
classified files.

## 2. Activation (operator, root)

`/tmp/opencode/operator-policy-flip.sh`: digest-preflighted mv
publication of the five staged files, removal of the guard-sealed
stale staging copy, guarded `yaml-add` registering
`check-policy-integrity` in `required_hooks.yaml` (P0 item 18 root
piece), guarded digest-verified deletion of
`policy_integrity_baseline.yaml` + schema (v5 makes broad entries
structurally unrepresentable; the baseline's shrink endpoint is zero),
and the guarded wiki-label unset. Ownership normalization (root:root
644) completed the publication.

## 3. Guarded-interface tool hardening (WORKSPACE-GUARD)

The activation exposed two real `workspace-yaml-edit` gaps, fixed in
source and deployed through `make install-yaml-edit`:

1. Indentless block sequences (Python `yaml.safe_dump` shape) are not
   splice-editable: `region_end` treats a dash at key indent as
   region-terminating and every list edit fails closed with
   `expected N entries, found none` (the 2026-08-25 ledger defect;
   the standing "generators emit indented sequences" mitigation had
   already failed once). Per the operator ruling (2026-09-06), syntax
   + format are separate pre-mutation steps: new `check` intent
   (unprivileged syntax + schema + shape preflight, one precise error
   per offending key), new `format` intent (audited, verified,
   idempotent, comment-preserving reindent), and a preflight in
   `mutate()` refusing indentless targets (exit 2, precise remediation message)
   before any transform. Compiled-in exception schemas follow the v5
   entry shape. SPEC-YAML-EDIT 3.4/3.7/8 updated.
2. `unset` could not address map keys containing dots or slashes
   (classification manifest entries are file paths): segment charset
   now allows `/` and resolution is literal-first (longest join that
   exists as a key wins, mirroring REQ-YE-204).

Validation: 90/90 yaml-edit tests (10 new shape tests, 2 new
path-key tests), full guard workspace suite, `clippy -D warnings`
clean, `cargo fmt` applied, live verification (`check` diagnosis, `format`
dry-run diff, `remove` refusal, `unset` dry-run diff) against the
real policy files.

## 4. Guarded cleanup and final state

Through the hardened interface: dead `^lib/ci_paths\.py$` exception
removed (v4 zero-match relic; the module has always been `ci/paths.py`),
six stale `config-staging/*` classification entries unset (staging is
empty post-flip; untracked staged files can never satisfy
exactly-one-tracked-file). Gates as the agent user:

- banned-words: PASS
- silent-swallow: PASS
- policy-integrity: exactly the three pre-commit-window entries (two
  `AUDIT-EXEMPTION-DATA-MODEL` exception paths and the manifest
  self-entry reference still-untracked files; they resolve when the
  migration commit's pre-commit auto-stage tracks them)

Final digests (2026-09-06):

| File | SHA-256 |
|---|---|
| config/banned_words.yaml | `eb423888a27276ef1e2743bd36371b565a10c44f4b1f3986fa5a9ba90629a2bb` |
| config/banned_words_exceptions.yaml | `b76e9916c8c008db11dd64dae0977cfa6ee7882bb9aa0890d66926496767c279` |
| config/silent_swallow_exceptions.yaml | `3974dee8926ad69142b97d6e64f44365200fd827d8f9080b42c0fb211eb75179` |
| config/file_classifications.yaml | `29899e6fc4669b2390da69b9c7b2667822270c18b42adb8549df22b54be925d8` |
| config/required_hooks.yaml | `2233b5a205880986cbe14cfadda22207f1b3513ca8ea535bc5b409b2f2afe88c` |

## 5. Process defects recorded

Three filter/probe defects in operator scripts surfaced through gate
refusals and were corrected with failing output in hand: a `get`-based
presence probe blind to map-valued entries, a non-exclusive window
grep, and a strip pattern that missed the `']: ` quoting around
manifest keys. The host guard itself correctly rejected `>/dev/null`
suppression, `|| true` exit masking, and `rc=$?` capture shapes in
draft scripts. The v5 converter now emits indented sequences
(`IndentDumper`), so future generations are born splice-editable;
the tool preflight makes the shape contract enforceable regardless.
