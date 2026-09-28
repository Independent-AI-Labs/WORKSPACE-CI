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
   MUST NOT imply two trust postures.

## 3. Environment Construction

1. A protected hook MUST remove from its environment every CI override input
   before it launches a checker, including `CI_CONFIG_PATH_*`,
   `CI_CONFIG_OVERRIDES`, `CI_GUARD_CONFIG_OVERRIDES`, and any other variable
   that selects a config file.
2. A protected hook MUST set the sealed deployment variables itself:
   `CI_PROJECT_ROOT`, `CI_LIB_DIR`, `CI_CONFIG_DIR`, and `CI_BOOT_DIR` to the
   paths under `/opt/workspace-ci`.
3. A protected hook MUST set `CI_SCAN_ROOT` to the toplevel of the repository
   under check. It MUST NOT accept a caller-supplied scan root.
4. A protected hook MUST NOT forward a caller-supplied `PYTHONPATH`.
5. The override removal and the sealed assignments MUST be emitted by the hook
   generator into every stage, so that a new hook cannot be added without
   inheriting them.

## 4. Import Path And Code Selection

1. A python-module hook MUST resolve its package from the sealed artifact and
   MUST NOT admit the working directory as an import source. The generator
   MUST render the interpreter with the unsafe-path prepend disabled, for
   example `uv run python -P -m ci.<module>` with the sealed root on
   `PYTHONPATH`.
2. A repository that contains a directory named `ci` MUST NOT be able to shadow
   the sealed checker package.
3. Running a checker from a working tree MUST NOT change which checker runs.

## 5. Policy And Scan-Root Selection

1. A protected checker MUST NOT read a config or policy path from the
   environment. It MUST derive the path from its own resolved module location.
2. A protected checker MUST scan the repository under check, and MUST NOT scan
   a location selected by the caller.
3. Environment-driven overrides of config and policy are a developer and
   build-time interface only. They MUST NOT exist in any protected path.

## 6. Repository-Supplied Policy Data

1. Where policy permits a repository to supply data, for example an exemption
   file, the file MUST be a root-owned regular file, and the checker MUST fail
   closed when it is not.
2. Exemptions MUST follow the receipt and drift-check semantics of
   [REQ-BANNED-PATTERN-MATCHING](REQ-BANNED-PATTERN-MATCHING.md) section 19.

## 7. Trust Classes

1. Repository-tooling hooks, for example `make lint`, `make type-check`, and
   `make check-push`, run repository code by design. They MUST run unprivileged
   and MUST NOT be treated as a trust boundary.
2. No decision of a repository-tooling hook MAY authorize policy, grant an
   exemption, or select a checker.

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

## 9. Change Control

1. The hook generator, the hook entries, and every protected checker are
   security-control paths. A change to them MUST carry an operator review
   trailer and a known-defects statement.
2. Hooks are installed root-owned and immutable by the sealed installer. Their
   replacement is a root operation requested by its Makefile target, never
   reimplemented by the agent.

## 10. Acceptance

Acceptance tests MUST prove:

1. a hostile environment does not change the checker, the policy, or the scan
   root;
2. a shadow `ci` package in the checked repository does not run;
3. a planted inline-code, banned-pattern, or policy-integrity violation is
   still detected under the hostile environment;
4. an agent-writable exemption file fails the check;
5. every registered python-module hook passes items 1 through 3.
