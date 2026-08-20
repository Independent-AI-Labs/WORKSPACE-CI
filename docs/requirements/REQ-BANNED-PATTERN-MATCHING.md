# REQ-BANNED-PATTERN-MATCHING: Normalized Content Enforcement

**Date:** 2026-08-20
**Status:** Active remediation requirement

## 1. Scope

This contract defines how protected banned-pattern checks match repository
content, filenames, paths, and exemptions. It closes evasion through case,
identifier syntax, path syntax, encoding, Unicode, multiline construction, and
exception scope.

For normal commit and push operations, protected checker code executes only from
immutable `/opt/workspace-ci` and scans writable repository source. Writable
source does not supply checker authority. This contract does not introduce a
second WORKSPACE-GUARD implementation of WORKSPACE-CI matching semantics.

## 2. Authority And Failure

1. Protected commit and push hooks MUST invoke the checker from immutable
   `/opt/workspace-ci`.
2. Writable repositories MAY supply policy data only after non-exemptible
   structural validation succeeds.
3. Invalid policy, invalid regular expressions, unreadable text, invalid text
   encoding, internal checker errors, and resource-limit failures MUST fail the
   check.
4. The checker MUST NOT warn and skip an invalid rule.
5. The checker MUST NOT replace invalid input bytes and continue.
6. Matching and exemption behavior MUST be deterministic across repeated runs.

## 3. Matching Modes

Every rule MUST declare one matching mode:

- `raw-regex`: match syntax whose punctuation and spacing are semantically
  significant.
- `normalized-token`: match forbidden words, directives, command names, tool
  names, and identifier forms after required normalization.
- `normalized-path`: match executable paths and repository-relative paths after
  path normalization.
- `filename`: match normalized basenames and complete repository-relative
  filenames.

Rules MUST NOT rely on implicit Python regular-expression defaults. Policy
schema MUST declare matching mode, case behavior, boundary behavior, and
allowed separator behavior.

## 4. Case Normalization

1. `normalized-token`, `normalized-path`, and `filename` rules MUST be
   case-insensitive by default.
2. Matching MUST cover lowercase, uppercase, title case, camel case, and Pascal
   case where token boundaries are present.
3. Unicode text MUST use full Unicode case folding after Unicode normalization.
4. A case-sensitive rule requires an explicit policy field and an exact reason.
5. Exemptions MUST NOT change a rule's case behavior.

Required examples for a protected `python3` token include:

```text
python3
PYTHON3
Python3
python3
```

## 5. Programming Identifier Boundaries

Normalized token matching MUST recognize boundaries formed by:

- start and end of input;
- whitespace;
- `_` and repeated `_`;
- `-` and repeated `-`;
- `.`;
- `/` and `\`;
- `:`;
- quotes and brackets;
- transitions from lowercase to uppercase;
- transitions between letters and digits where a rule declares a versioned
  command family.

The checker MUST detect leading, trailing, and repeated separators. Required
forms include:

```text
_python3
__python3
python3_
ci_python3
python3_exec
python3-command
tool.python3
/usr/bin/python3
```

Normalized matching MUST avoid uncontrolled substring matching. A rule for
`python` MUST NOT automatically reject an unrelated natural-language word that
only contains those letters without a valid normalized boundary.

## 6. Identifier Styles

For rules marked as identifier-sensitive, the checker MUST derive and test:

- snake case;
- kebab case;
- dot-separated form;
- camel case;
- Pascal case;
- leading private-name underscores;
- trailing implementation suffixes;
- command version suffixes;
- common programming prefixes declared by the rule family.

Variant derivation MUST be bounded and declared. The checker MUST NOT apply
uncontrolled stemming to arbitrary prose.

## 7. Morphological Families

Word rules that cover a family MUST declare the accepted family explicitly.
Supported declared forms include:

- singular and plural;
- base verb, third-person form, past form, and gerund;
- adjective and adverb forms;
- approved prefixes and suffixes.

The policy compiler MUST generate the declared forms or reject an incomplete
family declaration. It MUST include positive and negative controls for each
family to prevent unrelated substring matches.

## 8. Path And Tool Normalization

1. Protected tool rules MUST match bare command names and absolute paths.
2. Path matching MUST collapse repeated separators and lexical `.` segments.
3. Lexical `..` segments MUST be resolved without following an untrusted
   filesystem target.
4. Quoted and backslash-escaped path forms MUST match the same protected tool.
5. Versioned executable names such as `python3.13` MUST map to their protected
   tool family.
6. Tool matching MUST operate after wrappers and assignments including `sudo`,
   `env`, `exec`, `xargs`, `timeout`, `nice`, `nohup`, and variable assignments.
7. Protected deployment rules MUST cover `/usr/bin`, `/bin`, `/usr/local/bin`,
   and normalized equivalent paths.
8. Symlink aliases and alternate executable names require explicit identity
   tests where filesystem identity is part of enforcement.

## 9. Multiline And Split Forms

The checker MUST support patterns represented across physical lines through:

- shell line continuations;
- YAML folded and literal blocks;
- TOML multiline strings;
- JSON strings;
- adjacent string literals;
- bounded source-language string concatenation;
- escaped whitespace between command tokens.

Whole-file matching MUST preserve original line and column reporting. The
checker MUST NOT execute source or attempt unrestricted language evaluation.
Lexical reconstruction MUST be bounded and limited to documented forms.

## 10. Escaped Representations

For protected command, directive, and interpreter families, the checker MUST
detect equivalent representations using:

- hexadecimal escapes;
- octal escapes;
- Unicode escapes;
- escaped separators;
- quoted path components;
- URL encoding when an operator command or executable path is represented.

Decoding MUST be context-bounded. Ordinary prose MUST NOT be repeatedly decoded
as arbitrary nested encodings.

## 11. Unicode Safety

1. Text MUST be normalized to NFC and NFKC views for applicable matching.
2. Matching MUST use Unicode case folding.
3. Zero-width characters inside protected tokens MUST NOT defeat matching.
4. Bidirectional control characters MUST be rejected in source and policy text
   unless an exact non-executable fixture is approved.
5. Non-ASCII whitespace MUST act as a token separator.
6. Protected command and interpreter names MUST receive Unicode confusable
   skeleton checks.
7. Reports MUST show original text and the normalized form that matched.

## 12. Input And Encoding

1. Text files MUST decode as strict UTF-8 unless an exact file type declares a
   different reviewed encoding.
2. Invalid bytes in declared text MUST fail the check.
3. NUL bytes in declared text MUST fail the check.
4. CRLF and LF MUST produce equivalent matching behavior.
5. Binary files MUST be classified before text decoding.
6. Binary classification MUST use exact tracked file type, not a content
   exemption that disables every rule.
7. Unreadable tracked files MUST fail the check.

## 13. Git Filename Handling

1. File discovery MUST use NUL-delimited Git output.
2. Spaces, tabs, newlines, and non-ASCII bytes in valid filenames MUST not split
   file records.
3. Filename rules MUST inspect both normalized basename and complete normalized
   repository-relative path.
4. Symlink entries MUST be scanned as symlink text without following arbitrary
   targets outside the repository.
5. Path reports MUST use an unambiguous escaped representation.

## 14. Path-Independent Security Rules

1. Non-exemptible content rules MUST apply to every tracked text file regardless
   of its current directory, basename, or extension.
2. The checker MUST NOT hardcode a list of "protected" source directories as a
   substitute for repository-wide enforcement.
3. Moving or renaming a file MUST NOT change whether the same forbidden content
   is detected.
4. A newly created directory MUST receive the same enforcement without a
   checker-code or policy update.
5. Executable-content enforcement MUST NOT depend on names such as `scripts/`,
   `lib/`, `ci/`, `tools/`, `res/ansible/`, or `Makefile`.
6. Content may leave ordinary executable-source scanning only through an
   independently validated exact non-executable classification, such as a
   binary file, deterministic generated data, or exact quoted fixture data.
7. Non-executable classification MUST be based on exact file identity and
   validation semantics, not directory placement or extension alone.
8. A non-executable classification MUST NOT authorize execution or operator
   command consumption from that file.
9. Metamorphic tests MUST copy the same forbidden content across root-level,
   nested, renamed, newly created, extensionless, and alternate-extension paths
   and require identical results.
10. Tests that exercise one named directory MUST NOT be accepted as evidence of
    repository-wide enforcement.

## 15. Exemption Equivalence

1. Exemptions MUST reference stable rule IDs, not duplicate raw regular
   expression strings.
2. Each exemption entry MUST name exactly one anchored repository-relative
   regular file and exactly one stable rule ID.
3. Exemption entries MUST NOT contain multiple paths or multiple rule IDs.
4. Exemption paths MUST NOT use directories, extensions, globs, regex groups,
   alternation, optional segments, or any expression matching more than one
   tracked file.
5. Every exempt file MUST be listed in its own independently reviewed entry.
6. Exemptions MUST not change normalization, case, boundary, path, or Unicode
   behavior.
7. A valid exemption for a quoted rule applies to the exact file and exact rule
   identity only.
8. Wildcard, extension-wide, basename-wide, and directory-wide exemption paths
   are forbidden.
9. Exemption paths MUST undergo the same path normalization as scanned files.
10. Non-exemptible rules remain active for every case, separator, escaped, and
   path variant.
11. Exemption matching zero files or multiple files MUST fail policy integrity.
12. A rename or move MUST invalidate the old exemption and require a new exact
    reviewed entry.

## 16. Regex Integrity

1. Every regular expression MUST compile successfully before scanning starts.
2. Regex compilation failure MUST block commit and push.
3. Policy validation MUST reject known catastrophic-backtracking structures.
4. Rules MUST have bounded input and execution limits.
5. Normalization MUST occur once per file per required view, not once per rule.
6. Rules and exception paths MUST be compiled once per checker process.
7. A timeout MUST fail the check and report the responsible rule ID.

## 17. Automatic Variant Matrix

Every normalized rule MUST generate a test matrix from its declared behavior.
Applicable rows include:

- lowercase, uppercase, title, camel, and Pascal case;
- leading and trailing underscore;
- repeated underscore and hyphen;
- snake, kebab, dot, and path forms;
- attached approved prefixes and suffixes;
- versioned executable names;
- quoted and escaped forms;
- multiline and continuation forms;
- Unicode normalization and confusable forms;
- strict-encoding failures;
- filename spaces, tabs, and newlines.

Each matrix requires positive violations and negative controls. Disabling any
normalization stage in mutation testing MUST cause at least one required test to
fail.

Path cases MUST include arbitrary generated directory names and metamorphic
rename/move operations. The expected result MUST derive from content and exact
classification, never from a hardcoded directory name.

## 18. Performance

1. File content MUST be read once.
2. Required normalized views MUST be computed once.
3. Matching MUST not spawn one process per file, rule, or line.
4. Performance tests MUST include the complete policy and representative large
   repositories.
5. Maximum time and memory budgets MUST be documented from measured runs.
6. Exceeding a resource budget MUST fail closed with a specific diagnostic.

## 19. Acceptance

Acceptance tests MUST prove:

1. case variants cannot evade any normalized rule;
2. `_`, `-`, `.`, path, camel, Pascal, and version variants are covered where
   applicable;
3. absolute and bare protected interpreters are detected;
4. wrapper commands and assignments do not hide protected tools;
5. multiline and escaped representations are detected;
6. Unicode normalization, zero-width, control, whitespace, and confusable cases
   are handled as required;
7. invalid encoding and unreadable text fail closed;
8. Git filenames with spaces, tabs, and newlines remain single file records;
9. exemptions cannot weaken normalization or non-exemptible rules;
10. exact quoted policy and fixture cases remain expressible without broad
    exemptions;
11. invalid or expensive regexes fail policy integrity;
12. output identifies rule ID, original location, matched original text, and
    normalized match reason;
13. protected commit and push hooks execute the implementation from immutable
    `/opt/workspace-ci`.
14. moving identical forbidden content among arbitrary tracked text paths never
    changes the result;
15. newly introduced directory names require no checker update;
16. no hardcoded protected-directory allowlist exists in checker code or policy.
17. every exemption entry resolves to one tracked regular file and one rule ID;
18. no exemption entry contains a list of files or rules.
