# REQ-HOOK-TRUST-BOUNDARY: Protected Hook Trust Boundary

**Date:** 2026-09-28
**Status:** Active binding requirement

## 1. Scope

This contract binds every protected git hook that WORKSPACE-CI installs, in
the WORKSPACE-CI repository and in every consumer repository. It defines the
trust boundary at which a protected hook starts, so that a hook decision is
never steered by the process that triggers it.

The triggering process is untrusted: the committing or pushing user, that
user's environment, that user's working directory, and the contents of the
repository under check. A protected hook MUST execute trusted code with trust
inputs chosen by the installer, never by the trigger.

This contract complements
[REQ-BANNED-PATTERN-MATCHING](REQ-BANNED-PATTERN-MATCHING.md),
[REQ-INLINE-CODE](REQ-INLINE-CODE.md), and
[REQ-SCAFFOLD-CI](REQ-SCAFFOLD-CI.md). It governs how those contracts are
invoked, not what they match.

## 2. The Invariant

1. A protected hook MUST execute only code that resolves from the sealed
   artifact at `/opt/workspace-ci`.
2. The identity of the executed code, the policy it reads, the root it scans,
   and the exception data it honors MUST be fixed by the hook generator and
   the sealed artifact. None of these MUST be selectable by an environment
   variable, the working directory, `PYTHONPATH`, or any other input supplied
   by the triggering process.
3. Every protected hook MUST hold the same invariant whether it is written as
   a shell entrypoint or as a python-module entrypoint. Two execution paths
   MUST define exactly one trust posture.

## 3. Environment Construction

1. A protected hook MUST remove from its environment every CI override input
   before it launches a checker, including `CI_CONFIG_PATH_*`,
   `CI_CONFIG_OVERRIDES`, `CI_GUARD_CONFIG_OVERRIDES`, and any other variable
   that selects a config file.
2. A protected hook MUST remove from its environment every git variable that
   selects the repository, working tree, index, object store, or discovery
   behavior: `GIT_DIR`, `GIT_WORK_TREE`, `GIT_COMMON_DIR`, `GIT_INDEX_FILE`,
   `GIT_PREFIX`, `GIT_OBJECT_DIRECTORY`, `GIT_ALTERNATE_OBJECT_DIRECTORIES`,
   `GIT_NAMESPACE`, `GIT_CEILING_DIRECTORIES`, and
   `GIT_DISCOVERY_ACROSS_FILESYSTEM`. A checker that enumerates tracked files
   MUST enumerate the repository under check as fixed by the sealed artifact. `GIT_CONFIG_*` MUST be retained: the root-owned artifact's
   `safe.directory` trust is carried through git configuration.
3. A protected hook MUST set the sealed deployment variables itself:
   `CI_PROJECT_ROOT`, `CI_LIB_DIR`, `CI_CONFIG_DIR`, and `CI_BOOT_DIR` to the
   paths under `/opt/workspace-ci`.
4. A protected hook MUST set `CI_SCAN_ROOT` to the toplevel of the repository
   under check and MUST use only that toplevel as the scan root.
5. A protected hook MUST clear any caller-supplied `PYTHONPATH`.
6. The override removal and the sealed assignments MUST be emitted by the hook
   generator into every stage, so that every new hook inherits them.

## 4. Import Path And Code Selection

1. A python-module hook MUST resolve its package only from the sealed artifact.
   The generator MUST render the interpreter with the unsafe-path prepend
   disabled, for example `uv run python -P -m ci.<module>` with the sealed root
   on `PYTHONPATH`.
2. The sealed checker package MUST take precedence over any repository
   directory named `ci`.
3. Running a checker from a working tree MUST run the sealed checker.

## 5. Policy And Scan-Root Selection

1. A protected checker MUST derive the config and policy path from its own
   resolved module location.
2. A protected checker MUST scan only the repository under check.
3. Environment-driven overrides of config and policy SHALL be confined to
   developer and build-time use.

## 6. Repository-Supplied Policy Data

1. Where policy permits a repository to supply data, for example an exemption
   file, the file MUST be a root-owned regular file, and the checker MUST fail
   closed unless it is.
2. Exemptions MUST follow the receipt and drift-check semantics of
   [REQ-BANNED-PATTERN-MATCHING](REQ-BANNED-PATTERN-MATCHING.md) section 19.

## 7. Trust Classes

1. Repository-tooling hooks, for example `make lint`, `make type-check`, and
   `make check-push`, run repository code by design. They MUST run unprivileged
   and remain outside the trust boundary.
2. Only the sealed artifact MAY authorize policy, grant an exemption, or select
   a checker.
3. Catalog consistency is a producer-side check. The rules that every
   `ci/check_*.py` in the CI source tree is registered in that tree's
   `config/required_hooks.yaml`, and that every manifest entry resolves in
   that tree's `lib/` and `ci/`, MUST be enforced against the deployment
   candidate during candidate validation. The invocation MUST be made by the
   deployment build script against the candidate, not solely by
   candidate-controlled Makefile logic. These rules MUST be enforced only by
   the producer gate.
4. A protected hook MUST treat the WORKSPACE-CI checkout exactly like any
   other consumer: it executes the sealed checker and reads pooled policy from
   the sealed artifact. It MUST read catalog completeness and entry resolution
   only from the sealed artifact.
5. Inline-code detection is a sealed WORKSPACE-GUARD dependency. The CI
   checker MUST verify the guard scanner as a root-owned regular file with
   mode 0755 under the sealed guard root before use, with the sealed guard root
   at mode 0711 so the CI user can traverse to it. A missing or incompatible
   scanner MUST fail the check. The checker MUST obtain detection from the
   sealed scanner.
6. The sealed real shell is a WORKSPACE-GUARD dependency at the fixed
   documented path `/usr/lib/workspace-guard/sealed/bash`: root-owned regular
   file, mode 0700, under the sealed guard root at mode 0711. CI MUST NOT
   hardcode an obsolete real-shell path. A missing or non-conforming sealed shell
   MUST fail closed.

## 8. Verification

1. A regression suite MUST run every python-module hook under a hostile
   environment that sets `CI_CONFIG_DIR`, `CI_CONFIG_PATH_*`,
   `CI_CONFIG_OVERRIDES`, `CI_SCAN_ROOT`, and `PYTHONPATH`, and under a
   repository that plants a shadow `ci` package, and MUST prove that the
   sealed checker runs and that a planted violation is still detected.
2. The suite MUST enumerate the registered hooks, so that a new hook inherits
   the proof without a new test.
3. A generator test MUST assert that no rendered hook invokes an interpreter
   outside the sealed, unsafe-path-disabled form.
4. A test MUST prove the inline checker verifies the sealed guard scanner and
   fails closed when the scanner is absent, unreadable, or reports an
   incompatible schema.
5. A test MUST prove the producer-side catalog gate of section 7.3: the
   candidate check fails on an unregistered `ci/check_*.py`, passes when that
   file is registered in the candidate's own `config/required_hooks.yaml`, and
   fails when a registered entry has no matching implementation in the
   candidate `lib/` or `ci/`.
6. A test MUST prove that a protected hook reads catalog completeness and
   entry resolution only from the sealed artifact.
7. A test MUST prove candidate producer checks run candidate code and never
   import the current sealed artifact.
8. A test MUST prove candidate verification is non-mutating: generated-data
   verification writes only to a temporary directory.
9. A test MUST reject hardcoded obsolete guard paths in provisioning code and
   verify that each language-local constant matches the fixed documented sealed
   path.

## 9. Change Control

1. The hook generator, the hook entries, and every protected checker are
   security-control paths. A change to them MUST carry an operator review
   trailer and a known-defects statement.
2. Hooks are installed root-owned and immutable by the sealed installer. Their
   replacement is a root operation requested by its Makefile target and
   performed only by the operator.

## 10. Acceptance

Acceptance tests MUST prove:

1. a hostile environment leaves the checker, the policy, and the scan root
   unchanged;
2. the sealed checker runs when a shadow `ci` package is present;
3. a planted inline-code, banned-pattern, or policy-integrity violation is
   still detected under the hostile environment;
4. an agent-writable exemption file fails the check;
5. every registered python-module hook passes items 1 through 3;
6. the protected hook treats the CI checkout as a consumer and reads catalog
   completeness and entry resolution only from the sealed artifact;
7. the candidate build fails when a `ci/check_*.py` is missing from the
   candidate's own `config/required_hooks.yaml`, or when a registered entry has
   no matching implementation in the candidate tree.
