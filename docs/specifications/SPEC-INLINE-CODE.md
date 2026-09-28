# Specification: WORKSPACE-CI Inline Code Detection

**Status:** Active blank-slate specification, implementation pending

## 1. Components

The feature is delivered by these components, all resolved from immutable
`/opt/workspace-ci` during protected hooks:

| Component | Role |
| --------- | ---- |
| `ci/check_inline_code.py` | Checker entry point, invoked as a module: discovery, masking, detection, reporting |
| `config/inline_code.yaml` | Universal policy: rules, allowed constructs, decode depth |
| `config/inline_code.schema.yaml` | Structural validation of the policy |
| `config/inline_code_exceptions.yaml` | Consumer project exemptions overlaid at scan time |
| `config/required_hooks.yaml` | Hook manifest entry that wires the checker |
| `tests/unit/test_check_inline_code.py` | Unit tests for the checker and the evasion cases |

The checker reuses the normalization views, offset mapping, input validation,
and model code of `ci/banned_scan/`. It does not reimplement them.

## 2. Discovery

The checker enumerates every non-gitignored file with NUL-delimited Git output
covering tracked files and untracked non-ignored files. Enumeration is stable
and independent of the index. Symlink entries are read as link text. Each
discovered file is read once.

## 3. Policy Model

The sealed `config/inline_code.yaml` declares the universal policy:

- `rules`: detection rules, each with a stable identity, mode
  (`raw-regex` or `normalized-token`), category, case behavior, boundary
  behavior, and pattern.
- `allowed_constructs`: per-language or per-format constructs excluded at scan
  time. An entry is either a region, declared by opening and closing syntax, or
  a token, declared by a single pattern; each carries an identity, language
  selector, permitted level, and reason.
- `decode`: the declared and bounded encoding and compression depth.

A consumer repository supplies project exemptions in
`config/inline_code_exceptions.yaml`. The checker overlays those entries onto
the sealed policy at scan time. Exemptions follow the exact file plus rule
identity semantics of REQ-BANNED-PATTERN-MATCHING section 8.

Policy resolution is anchored to the checker's own tree and ignores the
environment, per
[REQ-HOOK-TRUST-BOUNDARY](../requirements/REQ-HOOK-TRUST-BOUNDARY.md)
section 5. A protected hook removes override variables before the checker
runs, so no environment input selects the policy.

A new policy file is authored under `config-staging/`, moved into `config/` by
the operator as a single command, and committed as ordinary source, per the
repository policy for new policy files.

## 4. Scan Pipeline

For each discovered file:

1. Classify the exact file type. Binary files are reported or skipped by
   declared classification, never by a broad content exemption.
2. Apply strict UTF-8 input validation, failing closed on invalid bytes, NUL
   bytes, and unreadable input.
3. Detect the language or format and select the active allowed constructs.
4. Mask allowed construct regions, preserving the offset map. An unterminated
   construct is an error.
5. Compute the normalized views and the declared decode views once.
6. Match every rule against the masked content in each required view.
7. Report findings with original location, matched text, and matched view.
8. Resolve exemptions and emit the receipt.

One file is processed once. Rules are compiled once per process. Views are
computed once per file.

## 5. Allowed Constructs

Allowed constructs are the generic mechanism for code that a language permits.
A Markdown document declares a level-one fenced code block as allowed. The
masker removes the fenced region, including its fence lines, and leaves all
other bytes of the document subject to detection. A fenced block nested inside
another allowed region is at a deeper level and remains subject to detection.
The same mechanism also carries token constructs, applied by masking each
match: a Markdown inline code span, a shell script's own interpreter
invocation, and a YAML command field that names a shell. The language or
format, not the file path, selects which constructs are active.

The mechanism is data, not code: a new language is supported by adding a
declared construct, reviewed as a policy change. No checker code change is
required to allow a new construct.

## 6. Findings And Exit Codes

The checker exits zero when no finding remains after masking and exemptions.
It exits non-zero when any rule matches, when input fails validation, when the
policy fails structural validation, or when a resource budget is exceeded.
Each non-zero result names the responsible rule identity and location.

## 7. Hook Wiring

The hook manifest declares a `check-inline-code` entry with kind
`python_module`, entry `ci.check_inline_code`, stage `pre-commit`,
`always_run: true`, `pass_filenames: false`, and `mandatory: true`. The
`check_required_hooks_present` gate requires the entry, so a consumer cannot
drop the check.

An undeclared interpreter payload is replaced by a tracked module rather than
kept inline: the deploy sanity check runs `ci.verify_runtime` instead of an
inline interpreter one-liner.

## 8. Optional Analysis Mode

A separate, explicitly requested analysis mode MAY run a probabilistic
classifier over the same masked content. The mode is never part of a protected
hook. It is non-blocking and its output is advisory. The protected path loads
no learned model and performs no network access.

## 9. Tests

Unit tests exercise every rule against known-bad and known-good fixtures,
covering the REQ-INLINE-CODE acceptance list: prefix trimming, multiline
construction, heredoc, block scalar, base64, double encoding, zero-width
insertion, confusable substitution, rename, extension change, extensionless
paths, Markdown level-one fencing, nested fencing, and unterminated fencing.
The variant matrix derives cases from each rule's declared behavior.

## 10. Consumer Migration

A consumer that carries a repository-local inline-code test replaces its body
with a thin call to the shared checker or removes the local test and relies on
the hook. Repository-specific loader shapes become consumer policy, not checker
code. The WORKSPACE-GATEWAY SQL structure documents are updated in the same
change.
