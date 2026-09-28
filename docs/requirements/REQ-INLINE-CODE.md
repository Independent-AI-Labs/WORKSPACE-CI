# REQ-INLINE-CODE: Inline Code Detection And Allowed Constructs

**Date:** 2026-09-28
**Status:** Active blank-slate requirement, implementation pending

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
contract's normalization, encoding, discovery, and exemption semantics. It does
not introduce a second WORKSPACE-GUARD implementation of WORKSPACE-CI matching
semantics.

## 2. Authority And Failure

1. Protected commit and push hooks MUST invoke the checker from immutable
   `/opt/workspace-ci`.
2. Writable repositories MAY supply policy data only after non-exemptible
   structural validation succeeds.
3. Invalid policy, invalid patterns, unreadable files, invalid text encoding,
   internal errors, and resource-limit failures MUST fail the check.
4. The checker MUST NOT warn and skip invalid policy.
5. The checker MUST NOT replace invalid input bytes and continue.
6. Matching, masking, and exemption behavior MUST be deterministic across
   repeated runs on identical input.
7. Protected invocation MUST satisfy
   [REQ-HOOK-TRUST-BOUNDARY](REQ-HOOK-TRUST-BOUNDARY.md): no environment
   variable, working directory, or `PYTHONPATH` supplied by the triggering
   process may select the checker, the policy, or the scan root.

## 3. Discovery

1. Discovery MUST enumerate every non-gitignored file in the repository,
   always, without regard to which files are staged.
2. Discovery MUST use NUL-delimited Git output for both tracked and untracked
   non-ignored files.
3. Ignored paths MAY be excluded. Nothing else is excluded by position,
   extension, or name.
4. Symlink entries MUST be scanned as link text and MUST NOT be followed to an
   arbitrary target.
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
   inline-code detection at scan time. A construct is declared either as a
   region, by opening and closing syntax, or as a token, by a single pattern
   whose matches are excluded.
4. **Level** is the nesting depth of a construct. A level-one construct is not
   nested inside another allowed construct.

## 5. Detection Modes

1. Every detection rule MUST declare a matching mode. Supported modes are
   `raw-regex` for punctuation-significant syntax and `normalized-token` for
   word, directive, and command forms after normalization.
2. Every rule MUST declare a category. Required categories are query statement,
   interpreter invocation, and remote execution payload.
3. Every rule MUST declare case behavior, boundary behavior, and separator
   behavior. Rules MUST NOT rely on implicit pattern defaults.
4. A rule MUST NOT match a code construct that policy has declared allowed for
   the file's detected language or format.
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
3. Decode depth MUST be declared and bounded. An ordinary text file MUST NOT
   be decoded as unlimited nested encodings.
4. Required views MUST be computed once per file, not once per rule.
5. Whole-file matching MUST preserve original line and column reporting.
6. The checker MUST NOT execute source or evaluate a language.

## 7. Allowed Constructs

1. Policy MUST declare allowed constructs per detected language or format, not
   per file path.
2. Each allowed-construct entry MUST declare a stable identity, the language
   or format selector that activates it, the permitted level, the reason it is
   allowed, and either the opening and closing syntax (region form) or a single
   token pattern (token form).
3. The checker MUST apply allowed constructs at scan time by excluding their
   byte regions from detection while preserving the offset map.
4. The default policy MUST allow level-one fenced code blocks in Markdown
   documents.
5. A construct at a level other than the declared level MUST remain subject to
   detection.
6. An unterminated allowed construct MUST fail the check.
7. Excluding an allowed construct MUST NOT exclude content outside its region.
8. Adding, changing, or removing an allowed construct is a policy change and
   MUST follow the reviewed policy procedure of this project.

## 8. Exemptions

1. Exemptions MUST reference a stable rule identity and exactly one anchored
   repository-relative regular file.
2. Exemption entries MUST NOT contain multiple files, multiple rules, globs,
   directories, extensions, alternation, or optional segments.
3. Exemptions MUST NOT change normalization, decoding, case, or boundary
   behavior.
4. A rule declared non-exemptible MUST remain active for every file.
5. Exemption resolution and its receipt MUST follow the exemption semantics and
   drift-check requirement of REQ-BANNED-PATTERN-MATCHING section 19.

## 9. Path Independence

1. Content rules MUST apply to every non-gitignored file regardless of
   directory, basename, or extension.
2. The checker MUST NOT hardcode a list of protected source directories.
3. Moving or renaming a file MUST NOT change whether the same inline code is
   detected.
4. A newly created directory MUST receive identical enforcement without a
   policy or checker change.
5. Metamorphic tests MUST copy identical inline code across root-level, nested,
   renamed, extensionless, and alternate-extension paths and MUST require
   identical results.

## 10. Unicode Safety

1. Text MUST be matched in NFC and NFKC views where applicable.
2. Zero-width characters inside a code construct MUST NOT defeat detection.
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

1. The protected hook path MUST be deterministic and MUST NOT use network
   access or a learned model.
2. A learned or probabilistic classifier MAY be offered as an optional,
   explicitly requested analysis mode.
3. The optional analysis mode MUST NOT be part of any protected hook, MUST NOT
   block a commit, and MUST NOT supply policy authority.

## 13. Diagnostics And Receipts

1. Diagnostics MUST be stable, ordered, repository-relative, and fail closed.
2. A file that cannot be safely inspected is an error, not an omitted result.
3. Resolved exemptions MUST be emitted as a generated receipt and drift-checked
   against the committed artifact, following REQ-BANNED-PATTERN-MATCHING
   section 19.

## 14. Performance

1. File content MUST be read once.
2. Required views MUST be computed once.
3. Matching MUST NOT spawn one process per file, rule, or line.
4. Time and memory budgets MUST be documented from measured runs.
5. Exceeding a budget MUST fail closed with a specific diagnostic.

## 15. Acceptance

Acceptance tests MUST prove:

1. query statements, interpreter invocations, and remote execution payloads are
   detected in every declared context;
2. prefix trimming, multiline construction, heredoc, block scalar, base64,
   double encoding, zero-width insertion, confusable substitution, and rename
   or extension change cannot evade detection;
3. a level-one Markdown fenced code block is allowed, and a nested fenced block
   is not;
4. an unterminated allowed construct fails the check;
5. invalid encoding, NUL bytes, and unreadable files fail closed;
6. identical inline code moved among arbitrary paths produces identical
   results;
7. newly introduced directory names require no checker or policy update;
8. no hardcoded protected-directory allowlist exists;
9. every exemption resolves to one file and one rule identity, with a receipt
   that fails on unreviewed drift;
10. the protected hook path performs no network access and loads no learned
    model;
11. the optional analysis mode is inert unless explicitly requested.
