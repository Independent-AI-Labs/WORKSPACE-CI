# REQ-INLINE-CODE: Inline Code Detection And Allowed Constructs

**Date:** 2026-11-08
**Status:** Active requirement; detector consolidated in WORKSPACE-GUARD

## 1. Scope

This contract defines how protected checks detect executable or query code that
is embedded in a file where the file's own grammar, format, or sanctioned
loader does not carry it. Detection runs over every non-gitignored file in a
consumer repository on every protected commit and push, independent of staging
state, file extension, directory, or language.

The contract also defines a generic allowed-construct mechanism so that a
construct which is legitimately code in one language is not reported as inline
code when that language uses it, for example a level-one fenced code block in a
Markdown document.

This contract complements
[REQ-BANNED-PATTERN-MATCHING](REQ-BANNED-PATTERN-MATCHING.md). It reuses that
contract's normalization, encoding, discovery, and exemption semantics.

Detection is implemented once, in Rust, in WORKSPACE-GUARD. WORKSPACE-CI is a
consumer: it owns discovery, language selection, path exemptions, and
reporting, and obtains detection results from the sealed guard scanner.

## 2. Authority And Failure

1. Protected commit and push hooks MUST invoke the checker from immutable
   `/opt/workspace-ci`.
2. Writable repositories MAY supply policy data only after non-exemptible
   structural validation succeeds.
3. Invalid policy, invalid patterns, unreadable files, invalid text encoding,
   internal errors, and resource-limit failures MUST fail the check.
4. The checker MUST fail on invalid policy.
5. The checker MUST fail on invalid input bytes.
6. Matching, masking, and exemption behavior MUST be deterministic across
   repeated runs on identical input.
7. Protected invocation MUST satisfy
   [REQ-HOOK-TRUST-BOUNDARY](REQ-HOOK-TRUST-BOUNDARY.md): the checker, the
   policy, and the scan root MUST be fixed by the sealed artifact and MUST be
   independent of the caller environment and working directory.
8. The checker MUST invoke the sealed WORKSPACE-GUARD inline scanner. Before
   use it MUST verify that the scanner is a root-owned regular file with mode
   0755 under the sealed guard root, with the sealed guard root at mode 0711
   so the CI user can traverse to it.
9. An absent, unreadable, incompatible, or failed scanner MUST fail the
   check.
10. The system MUST provide exactly one inline-code detector: the sealed
    WORKSPACE-GUARD scanner.
11. Deployment order MUST install the guard scanner before the CI artifact
    that consumes it.

## 3. Discovery

1. Discovery MUST enumerate every non-gitignored file in the repository,
   always, without regard to which files are staged.
2. Discovery MUST use NUL-delimited Git output for both tracked and untracked
   non-ignored files.
3. Ignored paths MAY be excluded. Nothing else is excluded by position,
   extension, or name.
4. Symlink entries MUST be scanned as link text without following the target.
5. Enumeration order MUST be stable.
6. An unreadable or missing discovered file MUST fail the check.

## 4. Definitions

1. **Inline code** is code-bearing content that appears where the file's own
   syntax, format, or sanctioned loader does not carry it. Inline code includes
   query statements, interpreter invocations, and remote-execution payloads
   that live in data contexts such as string literals, heredocs, block scalars,
   comments, documentation, data files, renamed files, and extensionless files.
2. **Code construct** is a syntax that a declared language or format uses to
   carry code that belongs in that file.
3. **Allowed construct** is a code construct that policy declares to be
   permitted for a language or format. An allowed construct is excluded from
   inline-code detection at scan time. A construct is declared as a region,
   by opening and closing syntax; as a token, by a single pattern whose
   matches are excluded; or as a category, by naming one rule category whose
   matches are excluded for the language.
4. **Level** is the nesting depth of a construct. A level-one construct is not
   nested inside another allowed construct.

## 5. Detection Modes

Rule evaluation is performed by the WORKSPACE-GUARD engine. WORKSPACE-CI
supplies file paths and detected languages and does not evaluate patterns.

1. Every detection rule MUST declare a matching mode. Supported modes are
   `raw-regex` for punctuation-significant syntax and `normalized-token` for
   word, directive, and command forms after normalization.
2. Every rule MUST declare a category. Required categories are query statement,
   interpreter invocation, and remote execution payload.
3. Every rule MUST declare case behavior, boundary behavior, and separator
   behavior explicitly.
4. A rule MUST skip code constructs that policy declares allowed for the
   file's detected language or format.
5. Detection output MUST name the rule identity, the original location, the
   matched original text, and the normalized form that matched.

## 6. Normalization And Decoding

1. The checker MUST reuse the normalized views and offset mapping of
   REQ-BANNED-PATTERN-MATCHING: line-continuation joining, bounded escape
   decoding, zero-width and format-character removal, non-ASCII whitespace
   separation, NFC and NFKC views, Unicode case folding, and confusable
   homoglyph folding.
2. The checker MUST additionally derive declared decode views for bounded
   base32, base64, hexadecimal, percent, and URL encodings, for gzip, zlib,
   xz, and bzip2 compression, for single-member archives, and for UTF-16
   text.
3. Decode depth MUST be declared and finite for every file.
4. Required views MUST be computed once per file, not once per rule.
5. Whole-file matching MUST preserve original line and column reporting.
6. The checker SHALL be a static analyzer.
7. The guard engine MUST compute the declared views and preserve the original
   byte offsets used for reporting.

## 7. Allowed Constructs

1. Policy MUST declare allowed constructs per detected language or format, not
   per file path.
2. Each allowed-construct entry MUST declare a stable identity, the language
   or format selector that activates it, the permitted level, the reason it is
   allowed, and exactly one selector: the opening and closing syntax (region
   form), a single token pattern (token form), or a rule category (category
   form).
3. The guard engine MUST apply allowed constructs at scan time by excluding
   their content from detection while preserving the offset map. A rule may
   declare that masking does not apply to it so structural checks see the
   original text.
4. The default policy MUST allow level-one fenced code blocks in Markdown
   documents.
5. A construct at a level other than the declared level MUST remain subject to
   detection.
6. An unterminated allowed construct MUST fail the check.
7. Excluding an allowed construct MUST leave content outside its region
   subject to detection.
8. Adding, changing, or removing an allowed construct is a policy change and
   MUST follow the reviewed policy procedure of this project.
9. A category-form construct MUST exclude only the rules whose declared
   category equals the named category. Every rule of every other category
   MUST remain active for the language.
10. The default policy MUST declare SQL statement syntax as the category-form
    allowed construct for SQL source files, so SQL is permitted in a SQL
    source file while interpreter invocations and remote-execution payloads
    remain subject to detection there.

## 8. Exemptions

1. Exemptions MUST reference a stable rule identity and exactly one anchored
   repository-relative regular file.
2. An exemption MUST name exactly one rule and one file.
3. Exemptions MUST leave normalization, decoding, case, and boundary behavior
   unchanged.
4. A rule declared non-exemptible MUST remain active for every file.
5. Exemption resolution and its receipt MUST follow the exemption semantics and
   drift-check requirement of REQ-BANNED-PATTERN-MATCHING section 19.
6. WORKSPACE-CI MUST resolve exemptions after the guard engine returns
   findings. Repository path exemptions SHALL apply only in the consumer
   wrapper.

## 9. Path Independence

1. Content rules MUST apply to every non-gitignored file regardless of
   directory, basename, or extension.
2. Detector scope MUST be content-defined, with no hardcoded source-directory
   list.
3. Moving or renaming a file SHALL preserve the detection result for the same
   content.
4. A newly created directory MUST receive identical enforcement without a
   policy or checker change.
5. Metamorphic tests MUST copy identical inline code across root-level, nested,
   renamed, extensionless, and alternate-extension paths and MUST require
   identical results.

## 10. Unicode Safety

1. Text MUST be matched in NFC and NFKC views where applicable.
2. Detection SHALL ignore zero-width characters inside a code construct.
3. Bidirectional control characters MUST be rejected in scanned text unless an
   exact approved non-executable fixture is declared.
4. Non-ASCII whitespace MUST act as a token separator.
5. Interpreter and query tokens MUST receive Unicode confusable homoglyph
   checks.
6. Directional override and Unicode tag characters MUST be reported as hidden
   content.

## 11. Input And Encoding

1. Text files MUST decode as strict UTF-8 unless an exact file type declares a
   different reviewed encoding.
2. Invalid bytes or NUL bytes in declared text MUST fail the check.
3. CRLF and LF MUST produce equivalent matching behavior.
4. Binary files MUST be classified before text decoding, by exact tracked file
   type and not by a broad content exemption.
5. Unreadable discovered files MUST fail the check.

## 12. Determinism And Analysis Separation

1. The protected hook path MUST be deterministic and offline.
2. A learned or probabilistic classifier MAY be offered as an optional,
   explicitly requested analysis mode.
3. The optional analysis mode MUST be absent from every protected hook, MUST be
   non-blocking, and MUST be advisory.

## 13. Diagnostics And Receipts

1. Diagnostics MUST be stable, ordered, repository-relative, and fail closed.
2. A file that cannot be safely inspected is an error, not an omitted result.
3. Resolved exemptions MUST be emitted as a generated receipt and drift-checked
   against the committed artifact, following REQ-BANNED-PATTERN-MATCHING
   section 19.

## 14. Performance

1. File content MUST be read once.
2. Required views MUST be computed once.
3. The checker MUST dispatch one scanner process per batch, not one per file,
   rule, or line.
4. Time and memory limits SHALL preserve detection results. The checker MUST
   process the full batch to completion or fail with a specific diagnostic.

## 15. Acceptance

Acceptance tests MUST prove:

1. query statements, interpreter invocations, and remote execution payloads are
   detected in every declared context;
2. prefix trimming, multiline construction, heredoc, block scalar, base64,
   double encoding, zero-width insertion, confusable substitution, and rename
   or extension change are all detected;
3. a level-one Markdown fenced code block is allowed; a nested fenced block is
   reported;
4. an unterminated allowed construct fails the check;
5. invalid encoding, NUL bytes, and unreadable files fail closed;
6. identical inline code moved among arbitrary paths produces identical
   results;
7. newly introduced directory names work without a checker or policy update;
8. detector scope is content-defined;
9. every exemption resolves to one file and one rule identity, with a receipt
   that fails on unreviewed drift;
10. the protected hook path is deterministic and offline;
11. the optional analysis mode activates only when explicitly requested;
12. a category-form construct excludes exactly its named category: a SQL source
    file allows SQL statement syntax while interpreter invocations and
    remote-execution payloads in the same file are still reported;
13. the sealed guard scanner is verified before use, and a missing or
    incompatible scanner fails the check;
14. WORKSPACE-CI and the guard produce identical findings for the shared
    conformance vectors;
15. a textual substitution that rebuilds an interpreter inline token is
    rejected in every context;
16. no native hook renders an inline interpreter wrapper.
