# REQ-TRUSTED-EXEC: Trusted-Code Service-Killing Pattern Detection

**Date:** 2026-10-04
**Status:** Active requirement; implementation in progress

## 1. Scope

This contract defines how protected checks detect destructive
service-killing operations that are authored into a repository's own
executable code. The runtime shell guard scans only agent command text
and untrusted script bodies; it does not scan trusted code (root-owned
repo scripts, ansible `shell:` and `command:` task bodies, systemd
`ExecStart*` directives, Makefile recipes, or application source). The
defects recorded in
[`AUDIT-SERVICE-KILLING-DEV-TOOLING-2026-10-03.md`](../audits/AUDIT-SERVICE-KILLING-DEV-TOOLING-2026-10-03.md)
live in that unscanned surface. This contract closes it.

Detection runs over every non-gitignored file in a consumer repository
on every protected commit and push, independent of staging state,
directory, or file extension.

The contract complements
[REQ-INLINE-CODE](REQ-INLINE-CODE.md) and
[REQ-BANNED-PATTERN-MATCHING](REQ-BANNED-PATTERN-MATCHING.md) and reuses
their discovery, normalization, decoding, and classification semantics.
It does not introduce a second implementation of those semantics.

## 2. Authority And Failure

1. Protected commit and push hooks MUST invoke the checker from
   immutable `/opt/workspace-ci`.
2. A repository MUST NOT supply exemptions or overrides for this check.
   Every rule is non-exemptible.
3. Invalid policy, invalid patterns, unreadable files, invalid text
   encoding, internal errors, and resource-limit failures MUST fail the
   check.
4. The checker MUST NOT warn and skip invalid policy.
5. The checker MUST NOT replace invalid input bytes and continue.
6. Matching, carrier selection, and definitional skipping MUST be
   deterministic across repeated runs on identical input.
7. Protected invocation MUST satisfy
   [REQ-HOOK-TRUST-BOUNDARY](REQ-HOOK-TRUST-BOUNDARY.md): no environment
   variable, working directory, or `PYTHONPATH` supplied by the
   triggering process may select the checker, the policy, or the scan
   root.

## 3. Discovery

1. Discovery MUST enumerate every non-gitignored file in the repository,
   always, without regard to which files are staged.
2. Discovery MUST use NUL-delimited Git output for both tracked and
   untracked non-ignored files.
3. Ignored paths MAY be excluded. Nothing else is excluded by position,
   extension, or name, except the carriers excluded in section 7 and the
   definitional files in section 8.
4. Symlink entries MUST be scanned as link text and MUST NOT be followed
   to an arbitrary target.
5. Enumeration order MUST be stable.
6. An unreadable or missing discovered file MUST fail the check.

## 4. Definitions

1. **Service-killing pattern** is an authored command or pipeline that
   terminates or removes a process, container, pod, or network by an
   ownership-free predicate: a port number, a process-name pattern, a
   status filter, or a shared resource name, rather than the specific
   instance the code is allowed to touch.
2. **Carrier** is the declared grammar or format of a file that makes a
   pattern executable: shell, YAML (ansible, compose, systemd
   templates), systemd unit, Makefile, JavaScript or TypeScript, Python,
   or Lua.
3. **Definitional file** is a file that carries rule patterns or their
   fixtures rather than executed code, and is excluded from detection
   (section 8).

## 5. Detection Modes And Categories

1. Every rule MUST declare a matching mode. Supported modes are
   `raw-regex` for punctuation-significant syntax and `normalized-token`
   for word and command forms after normalization.
2. Every rule MUST declare a category. Categories name the defect
   class, for example `service-manager`, `port-kill`,
   `process-name-kill`, `orphan-remove`, `network-remove`,
   `mass-container-remove`, and `compose-run`.
3. Every rule MUST declare the carriers it applies to (section 7).
4. Matching MUST run against the original, normalized, and decoded
   views (section 6), and MUST report the original location.
5. Detection output MUST name the rule identity, the category, the
   original location, the matched original text, and the view that
   matched.

## 6. Normalization And Decoding

1. The checker MUST reuse the normalized views and offset mapping of
   REQ-BANNED-PATTERN-MATCHING and the bounded decode views of
   REQ-INLINE-CODE.
2. Decode depth MUST be declared and bounded. An ordinary text file MUST
   NOT be decoded as unlimited nested encodings.
3. Required views MUST be computed once per file, not once per rule.
4. Matching MUST preserve original line and column reporting.
5. The checker MUST NOT execute source or evaluate a language.

## 7. Carriers

1. The checker MUST detect the carrier from the file extension, the
   filename for Makefiles, or the shebang line for extensionless
   scripts.
2. The supported carriers are shell, YAML, systemd unit, Makefile,
   JavaScript or TypeScript, Python, and Lua.
3. Markdown is not a carrier and MUST NOT be scanned; prose is not
   executed.
4. A file whose carrier is not one of the supported carriers MUST be
   scanned with every rule, so that renamed or extensionless executable
   code is not excluded by renaming.
5. Carrier detection MUST NOT hardcode a protected source directory.

## 8. Non-Exemptibility And Self-Reference

1. Every rule MUST be declared non-exemptible. A policy that declares
   an exemption MUST fail to load.
2. A repository MUST NOT be able to exempt a rule, by any file, path,
   glob, environment variable, or configuration overlay.
3. Definitional files that carry rule patterns, schemas, or fixtures
   are excluded by the exact-file classification mechanism already used
   by the sibling checks: `config/file_classifications.yaml` entries of
   class `policy-definition`, plus the checker's fixed definitional
   file set. This is the same explicit exception mechanism as the other
   content gates; it is not a repository exemption.
4. Excluding a definitional file MUST NOT exclude any other file.

## 9. Diagnostics And Receipts

1. Diagnostics MUST be stable, ordered, repository-relative, and fail
   closed.
2. A file that cannot be safely inspected is an error, not an omitted
   result.
3. The checker MUST emit one finding per location with the rule
   identity, category, view, and reason.

## 10. Performance

1. File content MUST be read once.
2. Required views MUST be computed once.
3. Matching MUST NOT spawn one process per file, rule, or line.
4. Time and memory budgets MUST be documented from measured runs.
5. Exceeding a budget MUST fail closed with a specific diagnostic.

## 11. Acceptance

Acceptance tests MUST prove:

1. `fuser -k <port>` is detected in a shell script, an ansible
   `shell:` body, and a systemd `ExecStart*` line;
2. a kill-by-port pipeline through `lsof`, `ss`, or `netstat` and
   `xargs kill` is detected;
3. `pkill` and `killall` process-name kills are detected;
4. `--remove-orphans`, `network rm -f`, and a status-only
   `ps ... | xargs ... rm` container sweep are detected;
5. `podman-compose run` without `--no-deps` is detected;
6. the same code is detected in JavaScript, TypeScript, Python, Lua,
   and a Makefile recipe, and in an extensionless shebang script;
7. Markdown prose quoting a pattern is not reported;
8. base64, hexadecimal, and percent encodings of a pattern are
   detected within the declared depth;
9. a definitional policy file that carries the patterns is not
   reported, and no other file is excluded with it;
10. the same inline code moved among root-level, nested, renamed, and
    alternate-extension paths produces identical results;
11. no repository exemption can suppress a finding;
12. the protected hook path performs no network access and loads no
    learned model.
