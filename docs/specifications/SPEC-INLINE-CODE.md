# Specification: WORKSPACE-CI Inline Code Detection

**Status:** Active specification; detector owned by WORKSPACE-GUARD

## 1. Components

| Component | Owner | Role |
| --------- | ----- | ---- |
| `ci/check_inline_code.py` | WORKSPACE-CI | Consumer: discovery, language selection, scanner verification, exemption overlay, reporting |
| `/usr/lib/workspace-guard/sealed/inline-scan` | WORKSPACE-GUARD | Sealed scanner entrypoint, a hardlink of the guard binary |
| WORKSPACE-GUARD inline library | WORKSPACE-GUARD | Rust rule engine, decode views, allowed-construct mask, findings |
| WORKSPACE-GUARD inline policy | WORKSPACE-GUARD | Canonical rules, allowed constructs, decode depth, contexts |
| `config/inline_code_exceptions.yaml` | Consumer | Consumer path exemptions applied by the CI wrapper |
| `config/required_hooks.yaml` | WORKSPACE-CI | Hook manifest entry that wires the consumer |
| `tests/unit/test_check_inline_code.py` | WORKSPACE-CI | Integration tests for the consumer and evasion cases |

WORKSPACE-CI delegates matching, masking, decoding, and rule evaluation to the
guard library. Those functions exist once, in Rust.

## 2. Authority And Dependency

1. The protected hook invokes the checker from immutable `/opt/workspace-ci`.
2. The checker invokes the sealed guard scanner. It verifies the scanner is a
   root-owned regular file with mode 0700 under the sealed guard root.
3. An absent, unreadable, incompatible, or failed scanner fails the check.
4. The checker consumes the sealed guard scanner.
5. The guard scanner is installed before the CI artifact that consumes it.
6. The CI deployment preflight verifies the scanner before publication.

## 3. Discovery

The checker enumerates every non-gitignored file with NUL-delimited Git output
covering tracked files and untracked non-ignored files. Enumeration is stable
and independent of the index. Symlink entries are read as link text. Each
discovered file is reported once.

Discovery, skip-class filtering, and language selection remain in
WORKSPACE-CI. The checker sends the guard scanner a manifest of paths and
languages.

## 4. Policy Model

The canonical policy lives in WORKSPACE-GUARD and is compiled into the guard
binary from root-owned configuration. It declares:

- `rules`: stable identity, contexts, mode, category, case and boundary
  behavior, pattern, hint, reason, mask behavior, and exemptible flag.
- `allowed_constructs`: per-language region, token, or category constructs.
- `decode`: declared and bounded encoding and compression depth.

Contexts are `file`, `command`, and `script`:

- `file`: consumer file scans. Allowed constructs apply.
- `command`: `-c` command text. The command rule set applies.
- `script`: untrusted script bodies. The script rule set applies.

A rule may declare `mask: false` so it evaluates the original text. Such a
rule is used for structural checks that must see text an allowed construct
would otherwise mask.

A rule may declare `exemptible: false`. The consumer resolves exemptions only
for exemptible rules. The structural substitution rule is non-exemptible.

Policy changes require a guard rebuild and installation. The guard policy is
the single rule-set authority; WORKSPACE-CI carries only the consumer.

## 5. Scanner Protocol

The checker sends one JSON request on standard input:

- `schema`: request schema version.
- `files`: array of `{path, language}` entries.

The scanner returns one JSON response on standard output:

- `schema`: response schema version.
- `findings`: array of `{path, rule, category, line, column, view, matched,
  reason, hint, block}`.

Rules are evaluated in declared order. The scanner returns every finding. The
consumer applies path exemptions, ordering, and reporting. A schema mismatch
is an error.

The scanner accepts strict UTF-8 only. Invalid UTF-8 or NUL bytes in a file
selected for scanning fail the request. There is no secondary decode path.

## 6. Scan Pipeline

The checker performs these steps:

1. Discover files.
2. Classify exact file types and apply declared skip classes.
3. Detect the language or format for each file.
4. Verify the sealed scanner.
5. Send the path and language manifest.
6. Apply consumer exemptions to returned findings.
7. Report findings and exit non-zero when any remain.

The guard engine performs these steps for each file:

1. Validate strict UTF-8 input.
2. Select active allowed constructs for the language.
3. Mask allowed construct regions and token matches for rules whose mask
   behavior applies, preserving byte offsets.
4. Compute normalized and declared decode views once.
5. Match every active rule in every required view.
6. Return findings with original line and column.

One file is processed once. Rules are compiled once per process. Views are
computed once per file.

## 7. Allowed Constructs

Allowed constructs are the generic mechanism for code that a language permits.
A Markdown document declares a level-one fenced code block as allowed. The
masker removes the fenced region, including its fence lines, and leaves all
other bytes subject to detection. A fenced block nested inside another allowed
region is at a deeper level and remains subject to detection.

Token constructs are applied by masking each match: a Markdown inline code
span, a shell script's own interpreter invocation, and a YAML command field
that names a shell. The language or format, not the file path, selects which
constructs are active.

A category-form construct names a rule category. Its active language excludes
every rule of that category from matching. Rules of every other category stay
active, so a SQL source file allows SQL statement syntax while an interpreter
invocation or remote-execution payload written in the same file is still
reported.

The mechanism is data, not checker code. A new language is supported by adding
a declared construct to the guard policy.

## 8. Findings And Exit Codes

The checker exits zero when no finding remains after masking and exemptions.
It exits non-zero when any rule matches, when input fails validation, when the
scanner fails or is missing, when the scanner schema is incompatible, or when
the policy fails structural validation. Each non-zero result names the
responsible rule identity and location.

## 9. Hook Wiring

The hook manifest declares a `check-inline-code` entry with kind
`python_module`, entry `ci.check_inline_code`, stage `pre-commit`,
`always_run: true`, `pass_filenames: false`, and `mandatory: true`. The
`check_required_hooks_present` gate requires the entry, so every consumer
keeps the check.

## 10. Native Hook Rendering

Native hooks rendered by `scripts/generate-hooks` carry the check command
directly. Registered hooks render from `config/required_hooks.yaml`. Custom
entries render verbatim. Native hook bodies contain only the check command,
with no inline interpreter wrapper.

## 11. Tests

- Guard unit tests cover rule evaluation, allowed constructs, decode views,
  contexts, and the structural substitution rule.
- Guard conformance vectors define the shared expected findings.
- WORKSPACE-CI integration tests exercise the consumer against the sealed
  scanner: discovery, language selection, exemption overlay, scanner
  verification, schema mismatch, invalid UTF-8, and the evasion list in
  REQ-INLINE-CODE.
- Both consumers MUST produce identical findings for the shared vectors.

## 12. Consumer Migration

A consumer that carries a repository-local inline-code test replaces its body
with a thin call to the shared checker or removes the local test and relies on
the hook. Repository-specific loader shapes become consumer policy, not
checker code. The WORKSPACE-GATEWAY SQL structure documents are updated in the
same change.
