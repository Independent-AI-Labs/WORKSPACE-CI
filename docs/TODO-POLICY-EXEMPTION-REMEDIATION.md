# Policy Exemption Remediation TODO

**Status:** Active
**Scope:** Banned-word exemptions, policy-integrity enforcement, shell-guard
coverage, deployment interpreter/tool execution, and regression evidence.
**Rule:** Do not mark an item complete without recorded command output or an
accepted root-only execution result.
**Matching contract:** `docs/requirements/REQ-BANNED-PATTERN-MATCHING.md` is
mandatory for scanner and exemption acceptance.

## P0 Execution Queue

- [ ] Stop deployment acceptance while any non-hermetic system interpreter remains reachable from `make deploy-ci`.
- [x] Replace all eight `/usr/bin/python3` deployment operations without another interpreter indirection. Removed `ci/deploy_immutability.py`, `ci/atomic_exchange.py`, `ci/verify_candidate_paths.py`; `scripts/deploy-ci` now uses native `chattr`/`find`, `grep -rlF` path verification, and `mv -T` publication; `bash -n scripts/deploy-ci` passes and the repo-wide scan reports zero findings in `scripts/deploy-ci`.
- [x] Complete path-independent absolute-system-interpreter enforcement: `if !`, `while`, `$(`, and backtick command contexts are detected; exact anchored single-file exemptions accepted and broad wildcard exemptions rejected; 107 shell unit tests pass.
- [x] Complete native batched immutable verification and its full validation gate. Deployed run verified 111,432/111,432 candidate descendants immutable at 100%.
- [x] Complete root deployment, publication, sealing, cleanup, and hook acceptance. `make deploy-ci` published `0862eca3a04dd3a256736f56f47e9e8c952cbbf1` at `/opt/workspace-ci`; root sealed, commit/tree verified, deployed Python runtime verified, protected hooks installed; Ansible recap ok=7 changed=1 failed=0.
- [ ] Install and validate non-exemptible policy-integrity enforcement before removing broad exemptions.
- [ ] Remove critical broad Python exemptions through guarded policy mutation.
- [ ] Only after all P0 items pass, implement the remaining matching-normalization requirements.

## Classification

- [ ] Classify every current exemption as either justified exact quoted data or a critical enforcement bypass.
- [ ] Record the owner commit, author, author date, and stated rationale for every exemption.
- [ ] Do not classify non-executable historical audit text as an execution attack surface.
- [ ] Do not classify policy files quoting their own rules as ordinary source violations.
- [ ] Treat broad executable-source, deployment, hook, bootstrap, and active-operator-documentation exemptions as critical until narrowed.
- [ ] Require each justified exemption to name the exact file, exact pattern, and reason it cannot be represented without quoting the pattern.
- [ ] Reject rationale based only on eliminating current scanner failures.

## Non-Exemptible Integrity

- [ ] Keep protected policy-integrity checker code only in immutable `/opt/workspace-ci` for normal commit and push validation of writable source.
- [ ] Do not introduce a duplicate WORKSPACE-GUARD implementation of WORKSPACE-CI policy semantics.
- [ ] Do not treat candidate self-tests as an independent security authority.
- [ ] Preserve the deployment rule that current `/opt/workspace-ci` is hidden and never executed during candidate construction.
- [ ] Add a protected policy-integrity checker that cannot be disabled by writable `banned_words.yaml` or `banned_words_exceptions.yaml` content.
- [ ] Run policy-integrity checks before the protected checker loads or applies ordinary writable-source exemptions.
- [ ] Scan writable policy structure even though policy-definition content is excluded from ordinary banned-word matching.
- [ ] Make policy-integrity failures from immutable `/opt/workspace-ci` block commit and push.
- [ ] Keep deployment acceptance under the existing reviewed Ansible, exact-source, namespace, publication, and sealing contract; do not add a new validation authority.
- [ ] Ensure per-project exemption files cannot weaken non-exemptible integrity rules.
- [ ] Ensure universal `.*` exceptions cannot weaken non-exemptible integrity rules.
- [ ] Ensure root ownership does not substitute for semantic policy validation.
- [ ] Require guarded YAML mutation for every root-owned policy change.

## Matching Engine

- [x] Define normalized matching requirements in `REQ-BANNED-PATTERN-MATCHING.md`.
- [ ] Add explicit matching mode, case, boundary, separator, and variant fields to policy schema.
- [ ] Make normalized token rules case-insensitive by default.
- [ ] Detect leading, trailing, repeated, and mixed programming separators.
- [ ] Detect snake, kebab, dot, camel, Pascal, path, and versioned command forms.
- [ ] Add declared morphological rule families with negative controls.
- [ ] Add bounded multiline and escaped-representation matching.
- [ ] Add NFC, NFKC, Unicode case-folding, zero-width, control, whitespace, and confusable handling.
- [ ] Replace line-only matching with bounded whole-file matching and original location reporting.
- [ ] Replace replacement-character decoding with strict text decoding and fail-closed errors.
- [ ] Replace newline-delimited Git file discovery with NUL-delimited discovery.
- [ ] Add automatic positive and negative variant matrices for every normalized rule.
- [ ] Add regex safety validation, timeout reporting, and measured resource budgets.
- [ ] Add enforcement and tests that reject hardcoded protected-directory allowlists in checker code and policy; deleting one instance is insufficient.
- [x] Enforce the first non-exemptible system-interpreter content rule across every tracked text file.
- [x] Add arbitrary path, nested path, newly created directory, renamed basename, alternate-extension, and extensionless metamorphic tests for the first non-exemptible rule.
- [ ] Define an exact-file classification manifest and validate each non-executable classification before directory-independent scanning.
- [x] Add a regression test proving a newly created directory receives enforcement without a checker update.

## Ban Wildcard Exemptions

- [ ] Forbid `patterns: ['.*']` in every exemption entry.
- [ ] Forbid unquoted or quoted bare `.*` as an exemption pattern.
- [ ] Forbid regex-equivalent catch-all exemption patterns such as `.+`, `[^]*`, `[\s\S]*`, and unbounded alternations matching every string.
- [ ] Forbid wildcard exception-map keys that exempt files from all rules.
- [ ] Remove `patterns: ['.*']` from `config/banned_words.yaml`.
- [ ] Remove full-content exemption entries for `config/banned_words.yaml` and `config/banned_words_exceptions.yaml`.
- [ ] Replace policy-file self-exemption with explicit scanner architecture: skip ordinary content matching and always run structural policy-integrity validation.
- [ ] Replace binary-file wildcard exemptions with exact file-type exclusion handled before text decoding.
- [ ] Replace generated-file wildcard exemptions with deterministic generation and source-identity verification.
- [ ] Replace lockfile wildcard exemptions with exact lockfile classification and lock-specific validation.
- [ ] Replace reference/archive wildcard exemptions with exact non-executable documentation classification.
- [ ] Add tests for every forbidden catch-all spelling and regex-equivalent form.

## Ban Broad Path Exemptions

- [ ] Require exactly one file and one stable rule ID per exemption entry.
- [ ] Forbid multiple `paths` values in one exemption entry.
- [ ] Forbid multiple `patterns` or rule IDs in one exemption entry.
- [ ] Split every justified multi-file exemption into independently reviewed single-file entries.
- [ ] Require exemption paths to be anchored exact repository-relative file regexes ending in `$`.
- [ ] Forbid exemption paths equal to `.*`.
- [ ] Forbid extension-wide exemption paths such as `\.sh$`, `\.py$`, `\.yaml$`, and `\.toml$`.
- [ ] Forbid basename-wide exemption paths such as `Makefile$` without a directory and exact file.
- [ ] Forbid directory-wide exemption paths such as `scripts/`, `lib/`, `tests/`, `docs/`, `hitl/`, and `workspace/config/`.
- [ ] Forbid subtree regexes ending in `/.*` or equivalent recursive scope.
- [ ] Forbid path alternations that collectively cover an entire source class.
- [ ] Forbid overlapping exact exemptions that collectively recreate a directory-wide exemption.
- [ ] Forbid exemption paths targeting deployment, bootstrap, hook-generation, Ansible, or lifecycle files.
- [ ] Forbid exemptions for generated hook commands unless the generated file is verified against non-exempt source.
- [ ] Enforce a maximum of one exact file per exemption entry.
- [ ] Fail when an exemption path matches no tracked file.
- [ ] Fail when an exemption path matches more than one tracked file.
- [ ] Fail when an exemption path matches a directory.
- [ ] Add tests for extension-wide, directory-wide, recursive, overlapping, and zero-match path scopes.
- [ ] Add a mutation test that introduces a fixed-directory enforcement list and proves policy-integrity validation rejects it.

## Remove Critical Python Exemptions

- [ ] Remove the `python3?` exemption covering every `.sh`, `.py`, `.yaml`, `.yml`, `.toml`, and Makefile.
- [ ] Remove the `python3?` exemption covering all `lib/`, `tests/`, and `scripts/` paths.
- [ ] Remove the `python3?` exemption covering all documentation.
- [ ] Retain only exact files that must quote a Python token for language detection or rejection tests.
- [ ] Require exact test fixtures rather than exempting complete test implementation files.
- [ ] Add a non-exemptible absolute-system-interpreter rule for `/usr/bin/python`, `/usr/bin/python3`, `/bin/python`, and `/bin/python3`.
- [ ] Reject equivalent paths containing repeated separators, `..`, symlinks, or environment expansion.
- [ ] Reject bare `python` and `python3` in deployment, bootstrap, hook, Ansible, and lifecycle source.
- [ ] Accept only reviewed hermetic `uv run --project <exact-path> --no-sync python` execution where Python is justified.
- [ ] Add positive tests for deployed hermetic `uv` execution.
- [ ] Add negative tests for every absolute and bare system-Python form.

## Deployment Interpreter Inventory

- [ ] Complete the authoritative deployment-interpreter removal items in `docs/TODO-REMEDIATION.md`; do not duplicate their completion state here.

## Other System Tools

- [ ] Inventory every absolute system binary executed by `make deploy-ci`.
- [ ] Classify each system binary as bootstrap trust, kernel/filesystem primitive, or unjustified host dependency.
- [ ] Require exact absolute paths for approved bootstrap system tools.
- [ ] Reject system-tool execution through Python, Perl, Ruby, Node, Lua, or another interpreter indirection.
- [ ] Reject system-tool execution through `env` or shell aliases when an exact approved path is required.
- [ ] Verify `find`, `xargs`, `lsattr`, `chattr`, `mount`, `unshare`, `runuser`, `flock`, `install`, `stat`, `git`, and `getent` against the deployment trust model.
- [ ] Document why each approved host tool cannot come from candidate `.boot-linux` before candidate construction.
- [ ] Move every post-bootstrap tool invocation to candidate or deployed hermetic tooling when available.
- [ ] Add tests proving unapproved absolute system tools fail deployment policy.

## Shell Guard Coverage

- [ ] Extend `alt-interp` to match absolute interpreter paths.
- [ ] Extend interpreter enforcement from command scope to untrusted script scope.
- [ ] Add tests for `/usr/bin/python3 script.py` inside an untrusted shell script.
- [ ] Add tests for absolute Perl, Ruby, Node, Lua, PHP, and other interpreter paths.
- [ ] Add tests for path normalization and symlink aliases to blocked interpreters.
- [ ] Prevent interpreter indirection from hiding blocked `chattr`, deletion, Podman, or filesystem operations.
- [ ] Audit `Invocation::PassThrough` and document its exact allowed boundary.
- [ ] Audit `ScriptClass::Trusted` and require exact immutable identity before bypassing body scans.
- [ ] Audit the root `/bin/bash.real` escape as host authority outside repository provisioning.
- [ ] Prohibit every repository provisioning reference to `/bin/bash.real`.
- [ ] Add integration tests proving guarded `/bin/bash` remains usable while the candidate owner cannot execute `/bin/bash.real` directly.
- [ ] Inventory commands allowed solely because the shell guard uses a denylist rather than an allowlist.
- [ ] Decide whether deployment requires an exact system-tool allowlist enforced independently of command regexes.

## Test Exemptions

- [ ] Remove directory-wide `tests/` exemptions for unsafe code, suppressions, alternate-resolution behavior, historical paths, reflection, and weak typing.
- [ ] Convert intentional forbidden-string tests into exact data fixtures.
- [ ] Separate scanner fixture data from executable test logic.
- [ ] Scan executable test logic with production rules.
- [ ] Verify scanner tests cannot exempt themselves.
- [ ] Remove full wildcard exemptions for `tests/unit/test_checks.sh` and `tests/integration/test_e2e_checks.sh`.
- [ ] Add mutation tests proving scanner tests fail when executable logic contains a forbidden pattern outside fixture data.

## Documentation Exemptions

- [ ] Keep policy-definition documentation distinguishable from executable operator instructions.
- [ ] Permit exact quoted forbidden strings in policy-reference documents.
- [ ] Reject system interpreter commands in active runbooks unless explicitly marked as rejection examples.
- [ ] Remove directory-wide `docs/` Python and direct-venv exemptions.
- [ ] Keep historical audit directories documentation-only and non-executable.
- [ ] Verify no Makefile, Ansible playbook, hook, or script resolves executable content from audit/archive directories.
- [ ] Replace whole-directory audit exemptions with exact documentation classification where practical.
- [ ] Do not describe non-executable audit text as an execution attack vector without an actual execution path.

## Generated And Binary Files

- [ ] Exclude binary PNG and PDF content before text scanning based on exact tracked file type.
- [ ] Validate generated hook-source and script-source JSON against their authoritative source digests.
- [ ] Remove wildcard exemptions for generated source-display JSON after deterministic verification exists.
- [ ] Validate lockfiles with lock-specific parsers rather than banned-word exemptions.
- [ ] Verify production TypeScript such as `web/src/lib/patterns.ts` is generated policy data or remove its wildcard exemption.
- [ ] Scan any handwritten executable portion of generated-data adapters normally.

## Exception Semantics

- [ ] Add required exemption fields: exact pattern ID, exact file, rationale, owner, and review date.
- [ ] Add an expiry or removal condition for every exemption that is not intrinsic policy-definition data.
- [ ] Require a nonempty reason that states why the exact file must quote the exact rule and how the file remains non-executable.
- [ ] Reject duplicate exemptions across universal and per-project files.
- [ ] Reject exemptions for categories marked non-exemptible.
- [ ] Mark system interpreters, destructive lifecycle operations, persistent-data deletion, hook bypasses, and policy-integrity rules non-exemptible.
- [ ] Generate a machine-readable effective-exemption report during CI.
- [ ] Fail CI when an exemption is unused.
- [ ] Fail CI when a new tracked file begins matching an existing exemption.
- [ ] Fail CI when an exemption's match set expands after a rename or directory move.

## Provenance Review

- [ ] Review commit `d1f4a67c64263e925bb51531f3a34ee4d6c173bf` for initial extension-wide Python and tests exemptions.
- [ ] Review commit `7255c11ddfa3c3ea9dd5c69b32362932dbf0deec` for the explicit `scripts/` Python exemption.
- [ ] Review commit `0ed799b3da8eecea98839a8d0435893587469bc7` for full wildcard and meta-policy exemptions.
- [ ] Review commit `19b0ebbe17d371c290a64be7289355e8c5e36523` for global `paths: ['.*']` semantic exemptions.
- [ ] Review commit `2f4e2bd6b6036c0b480c999cdd99c8e16847cd69` for broad documentation exemptions.
- [ ] Review commit `f7422dc119d2a63770225a243e448b6327427729` for the historical audit-directory exemption.
- [ ] Record implementation effects without asserting malicious intent absent evidence.

## Guarded Policy Mutation

- [ ] Review current policy digests immediately before mutation.
- [ ] Remove unsafe entries only through `workspace-yaml-edit` or the approved WORKSPACE-GUARD Make interface.
- [ ] Do not edit root-owned policy YAML with redirection, `sed -i`, copy replacement, or direct deletion.
- [ ] Validate every guarded edit against the schema and new semantic policy-integrity checker.
- [ ] Regenerate `web/src/data/swallow-detectors.json`, hook-source data, and script-source data after policy changes.
- [ ] Verify generated data contains the exact reviewed policy commit and no stale exemptions.

## Acceptance

- [ ] The effective exemption report contains no wildcard pattern exemption.
- [ ] The effective exemption report contains no extension-wide exemption.
- [ ] The effective exemption report contains no directory-wide exemption.
- [ ] Every exemption resolves to exactly one tracked regular file.
- [ ] No exemption applies to deployment, bootstrap, hook-generation, Ansible, or lifecycle implementation.
- [ ] Absolute and bare system interpreters fail protected checks.
- [ ] Hermetic deployed-`uv` Python checks pass.
- [ ] Policy files can define forbidden patterns without exempting their structure from integrity validation.
- [ ] Exact fixture and quoted-policy cases pass without broad source exemptions.
- [ ] Shell Guard blocks absolute interpreter paths and interpreter indirection tests.
- [ ] `make check-push` passes with the hardened effective policy.
- [ ] Protected commit and push hooks pass with the hardened effective policy.
- [ ] `make deploy-ci` contains no unjustified system interpreter execution.
- [ ] Root deployment and final artifact verification pass.
