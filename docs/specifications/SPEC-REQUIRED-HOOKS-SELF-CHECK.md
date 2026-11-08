# SPEC-REQUIRED-HOOKS-SELF-CHECK: Required-Hooks Self-Check

**Date:** 2026-11-08
**Status:** Active
**Contract:** [`REQ-HOOK-TRUST-BOUNDARY.md`](../requirements/REQ-HOOK-TRUST-BOUNDARY.md), sections 2, 7.3, 7.4, and 8.4

## 1. Purpose

`ci/check_required_hooks_present.py` validates the hook infrastructure of the
project that invokes it.

The checker has two distinct roles:

- a protected pre-commit hook, consumed by every repository, including
  WORKSPACE-CI;
- a producer-side consistency gate, run against the deployment candidate before
  publication.

These roles must not share policy sources. This specification fixes which role
owns which invariant. It removes the bootstrap deadlock where a new
`ci/check_*.py` could not be committed until a sealed manifest that could only
be produced by deploying that commit already contained it.

## 2. Role Of WORKSPACE-CI

At hook time, the WORKSPACE-CI checkout is a consumer. Its `.git/hooks` executes
the sealed checker from `/opt/workspace-ci`, the same as every other repository.

WORKSPACE-CI is also the source of the artifact. That producer role is
exercised only during candidate construction, never by the installed hook.

The presence of `scripts/generate-hooks` in the checkout does not change the
hook's trust posture.

## 3. Invariants

| # | Invariant | Role | Data source |
| --- | --- | --- | --- |
| 1 | Every `ci/check_*.py` in the tree is registered in that tree's `config/required_hooks.yaml` | Producer-side catalog gate | Candidate tree |
| 2 | `quality_exceptions.yaml` is schema-valid against the registry | Protected hook | Sealed manifest |
| 3 | Rendered hooks carry a marker for every applicable required hook | Protected hook | Sealed manifest |
| 4 | Every registry entry resolves in the shipping `lib/` and `ci/` | Protected hook and producer gate | Sealed tree in protected mode; candidate tree in producer mode |

Invariants 2 and 3 are protected-hook only. They use the sealed artifact.

Invariant 1 is producer-only. Invariant 4 runs in both roles, each against its
own tree. Neither producer check authorizes or selects executed code.

## 4. Protected Hook

### 4.1 Root

The sealed root is the checker's import root, two directory levels above the
module file. The installed hook runs the checker from `/opt/workspace-ci`, so
the sealed root is `/opt/workspace-ci`. `CI_CONFIG_DIR` and every other
environment input are ignored.

In protected mode this root owns:

- the manifest used by invariants 2, 3, and 4;
- the `lib/` and `ci/` against which invariant 4 resolves entries;
- all code that the hook executes.

### 4.2 No source registry read

The protected hook MUST NOT read the checked repository's
`config/required_hooks.yaml`. In particular, the presence of
`scripts/generate-hooks` MUST NOT enable a source-manifest comparison.

Catalog consistency is not an enforcement decision. A protected hook that
evaluated a working-tree registry would either block future development or
weaken its own authority. It does neither. It leaves that check to the
producer.

### 4.3 Consumer behavior

For every repository, including WORKSPACE-CI, the protected hook:

- runs invariants 2, 3, and 4;
- reads the sealed manifest;
- imports only the sealed `ci` package with `-P`;
- never imports, sources, or runs working-tree code.

## 5. Producer-Side Consistency Gate

### 5.1 Location

The consistency gate runs during candidate construction. The candidate is
bind-mounted at `/opt/workspace-ci` by
`scripts/enter-candidate-namespace.sh`.

The deployment build script MUST invoke the gate directly against the
candidate. It MUST NOT rely solely on candidate-controlled Makefile logic to
invoke it. This keeps the gate explicit even when candidate tooling is edited.

### 5.2 Behavior

Invariants 1 and 4 run in this mode.

Invariant 1:

- reads `<candidate>/config/required_hooks.yaml`;
- scans `<candidate>/ci/check_*.py`;
- fails when a module has no matching `python_module` entry.

Invariant 4:

- reads the same candidate manifest;
- resolves every `shell` entry against `<candidate>/lib/*.sh`;
- resolves every `python_module` entry against `<candidate>/ci/`;
- fails when an entry has no matching implementation.

No environment variable selects these paths.

### 5.3 Why the producer gate is safe

- It runs unprivileged as repository tooling, consistent with REQ section 7.1.
- It runs against the exact tree that will be sealed.
- It cannot authorize a hook. It only proves that the artifact's own catalog is
  internally complete and that every entry resolves in the candidate tree.
- Publication remains a root operation.

## 6. Bootstrap Flow

A new python-module checker is added in one commit:

1. Add `ci/check_<name>.py`.
2. Add the matching `kind: python_module` entry to
   `config/required_hooks.yaml`.
3. Add the hook to `.pre-commit-config.yaml` when it applies to the CI
   repository itself.
4. Regenerate `templates/ci-profile.template.yaml` when the hook is part of
   the consumer catalog.
5. Commit.

At commit time the protected hook runs invariants 2, 3, and 4. These are
unchanged. It does not evaluate the new file or the source registry. The commit
is not blocked by the sealed manifest.

After `make deploy-ci` the deployment build invokes the producer gate against
the candidate. The gate checks registration and entry resolution. A missing
registration or an unresolved entry fails the deploy. A complete catalog is
sealed. The next commit validates the new module against the sealed manifest
through invariants 2, 3, and 4.

Consumer hooks and consumer behavior are unchanged.

## 7. Failure Behavior

Protected hook:

- invalid sealed manifest: infrastructure error, exit 2;
- invariant violation: exit 1;
- no source registry is read.

Producer gate:

- missing candidate `ci/` directory: violation;
- unregistered `ci/check_*.py`: violation naming the file;
- registered entry does not resolve in candidate `lib/` or `ci/`: violation;
- missing or unreadable candidate `config/required_hooks.yaml`: violation; the
  sealed manifest is never substituted.

## 8. Tests

- Protected-hook tests prove sealed-manifest selection, environment
  independence, and that a checkout `config/required_hooks.yaml` is never read.
- Producer-gate tests prove candidate completeness: registered passes,
  unregistered fails, missing registry fails.
- Producer-gate invariant 4 tests prove candidate resolution:
  registered-and-resolved passes, registered-but-missing fails.
- Invariant 4 tests prove entry resolution against the shipping tree and the
  rename case.
- Generator tests prove every rendered hook uses the sealed interpreter form.

## 9. Non-Goals

- This specification does not authorize working-tree code execution.
- This specification does not add a commit-time catalog mandate.
- This specification does not change invariants 2 or 3, or any consumer hook
  behavior.
- This specification does not change deploy-time candidate validation other
  than adding the producer-side consistency gate.