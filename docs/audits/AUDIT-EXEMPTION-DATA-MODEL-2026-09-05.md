# Audit: exemption data model violates REQ-BANNED-PATTERN-MATCHING §15 (2026-09-05)

## Scope

Full audit of the banned-words exemption data model and its enforcement
implementation, triggered by the blanket-exemption removal work
(2026-08-28 through 2026-09-05).

## Findings

### F-1 Exemptions are keyed by raw regex strings (§15.1 violation, baked in)

REQ-BANNED-PATTERN-MATCHING §15.1: "Exemptions MUST reference stable rule
IDs, not duplicate raw regular expression strings." Every entry in both
exemption stores (`universal_exceptions` in banned_words.yaml and
`banned_words_exceptions.yaml`) uses the raw pattern regex as its key.
No `id:` field exists on any banned rule. Consequences realized during
this work:

- Tightening a rule regex orphans every exemption keyed by the old
  string (python3 re-key, pending em-dash re-key).
- Regexes as YAML keys make guarded edits transport-hostile: make
  recursion eats `$X` sequences, single quotes terminate the wrapper's
  `bash -c '...'` script, over-correction produced `\\.` paths that
  match zero files (5 dead universal entries, 2026-09-05).
- `yaml-remove` set-matching on 80-character regex keys is brittle.

### F-2 Structural violations against §15.2-15.8 (47 findings, 2026-09-05)

`check_policy_integrity.py` against the then-current worktree config:

- 5 universal `protected-system-interpreter` entries with `\\.`
  over-escaped paths matching zero tracked files (§15.11).
- 38 project entries unanchored (no `^`) or multi-path, absent from the
  frozen baseline: classified broad, not reviewed (§15.2-15.5).
- 3 universal entries (config-staging, required_hooks pair, reshaped
  AGENTS.md entry) likewise unbaselined.

### F-3 Unsolicited implementation features (no requirement clause)

| Feature | Location | Disposition |
|---------|----------|-------------|
| `_INTERPRETER_PATTERNS` never-grandfather list + `_is_interpreter_mask` + 6 tests | check_policy_integrity.py:82-104 (d956844) | Delete in the single replacement cut (still present in the worktree; the earlier "DELETED 2026-09-05" claim in this row was false). §15 + baseline already enforce no-blankets uniformly; the per-string special case is the inverse of policy |
| `FORBIDDEN_SCOPES` hardcoded directory list | check_policy_integrity.py:40-45 | Delete in the single cut; no clause mandates it. Replaced by structural path-independent enforcement with mutation tests (REQ §14.2, acceptance 19.16) |
| `_SYSTEM_INTERPRETER_INVOCATION_RE` rule in code with private exemption channel | check_banned_words.py:32-43,124-145,148-163 | Becomes policy data with a stable rule ID in the single cut; the private exemption channel is deleted (§2 authority, §15.1) |
| `.*` wildcard exemption support | check_banned_words.py:81-83,124-145 | Deleted outright in the single cut; enables what §15.4/15.8 forbid |
| Baseline fail-open when absent | check_policy_integrity.py:206-210 | Fixed to fail-closed in the single cut; violates §2.3 |

### F-4 Stale mandate corrected

REQ/SPEC-SCAFFOLD-CI §6.2 mandated `.venv/bin/python` hook entries while
the generator emits `uv run --project`; fixed in the same work stream
(committed together with this audit and the single replacement cut).

## Mandated fix path

Per TODO-POLICY-EXEMPTION-REMEDIATION items 86-104 and 185-194: replace the
exemption model in one cut with stable rule IDs (one `rule: <id>` + one
anchored `^path$` per entry, rationale/owner/review-date fields), delete
wildcard machinery outright, regenerate the baseline (which must shrink
toward empty), and add the effective-exemption report. Checkers parse only
the final model; no former-format parsing, dual keys, transition window,
or adapter layer exists anywhere after the cut. Pattern regexes become
freely tightenable without touching exemptions.

## Provenance

Blanket removal, pattern tightening, HITL vocabulary refactor, boot-dir
composition hardening, and this audit: 2026-08-28..2026-09-05 sessions;
operator hand-edits to config acknowledged in F-2 (transport damage
repaired through the guarded interface only).
