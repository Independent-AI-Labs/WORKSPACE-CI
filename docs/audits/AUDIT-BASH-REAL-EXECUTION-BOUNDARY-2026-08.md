# Audit: `/bin/bash.real` Execution Boundary

**Date:** 2026-08-17

**Status:** Open remediation audit

**Scope:** WORKSPACE-CI, WORKSPACE-GUARD, legacy `projects/CI`, consumer
repositories under `projects/`, generated artifacts, tests, hooks, and host
configuration references.

## 1. Executive Finding

`/bin/bash.real` is the root-only stock interpreter behind the WORKSPACE-GUARD
`/bin/bash` replacement. It is required as an implementation detail of the
guard, but it has escaped that boundary and become a general-purpose root
interpreter across the workspace.

The affected Makefiles assign `/bin/bash.real` to `SHELL`, `SCRIPT_BASH`, or
both whenever Make runs as root. This bypasses shell-guard policy for complete
recipes and explicitly invoked scripts. The same pattern reaches deployment,
tool bootstrap, hook installation, container orchestration, migrations,
tests, policy editing, and other unrelated operations.

This is not a regular privileged execution path. It is a workspace-wide policy
bypass propagated by a legacy consumer template and copied into active
repositories. The rationale embedded in those Makefiles is also obsolete:
WORKSPACE-GUARD commit `697bf7afd8b76920da77297ea42c969cd62674ab`
changed the guard on 2026-08-02 so effective UID 0 no longer fails solely
because `AT_SECURE == 0`.

The required end state is:

1. Normal automation invokes the normal guarded `/bin/bash` path regardless of
   effective UID.
2. Privileged operations are narrow commands with explicit authority, not an
   unmediated general shell.
3. WORKSPACE-GUARD alone owns the backing interpreter and its lifecycle.
4. Direct `.real` execution is restricted to the guard's internal dispatch and
   the minimum unavoidable install, uninstall, and repair bootstrap surface.
5. Source gates prevent the bypass from returning.

## 2. Audit Method

The audit searched all repositories below `/home/agent/WORKSPACE-VM/projects`
for direct and indirect references to:

- `/bin/bash.real`
- `bash.real`
- `SHELL` assignments to the real interpreter
- `SCRIPT_BASH`
- `REAL_BASH`
- `REAL_SHELL`
- interpreter shims and generated source mirrors

It also checked the active WORKSPACE-CI and WORKSPACE-GUARD Git hooks and
searched `/etc`, `/usr/local`, and `/opt` for matching configuration references.
No matching active hook or host-configuration reference was found. At audit
time `/opt/workspace-ci` was absent because deployment had not completed.

The inventory distinguishes executable bypasses from required guard internals,
isolated fixtures, generated mirrors, tests, and documentation.

## 3. Required Security Boundary

### 3.1 Permitted ownership

WORKSPACE-GUARD may:

- install and seal the stock interpreter used behind the guard;
- verify that interpreter before dispatch;
- execute it internally after guard policy has approved an invocation;
- use a narrowly scoped bootstrap path while installing, uninstalling, or
  repairing the shell guard itself;
- model it inside isolated container or QEMU test roots.

### 3.2 Prohibited ownership

WORKSPACE-CI and consumer repositories must not:

- set Make's `SHELL` to a diverted real binary;
- select a diverted real binary through `SCRIPT_BASH` or an alias;
- invoke a diverted real binary from scripts;
- create `bash` shims or compatibility symlinks targeting it;
- execute downloaded code through it;
- use it to avoid fixing a shell-guard policy violation;
- encode it into generated hooks or installed automation.

### 3.3 Privileged operations

Operations that legitimately require root authority or actions prohibited in
general shell text must use purpose-specific privileged executables or modules.
Examples include immutable-flag changes, atomic deployment publication, guard
installation, and protected hook installation. Copying agent-controlled shell
source into a root-owned location merely to gain trusted-tier status is not an
acceptable replacement because it launders provenance rather than narrowing
authority.

## 4. Critical Runtime Inventory

### 4.1 WORKSPACE-CI global bypass

`Makefile:18-51` selects `/bin/bash.real` for all root recipes and all scripts
invoked through `SCRIPT_BASH`. The selection affects, among other targets:

- system and language tool bootstrap;
- Homebrew, Rust, Podman, uv, gitleaks, OSV Scanner, cloc, Moon, Ansible,
  certbot, and npm operations;
- web tooling;
- hook reinstall and cleanup;
- repository locking;
- workspace audits and compliance reports;
- history rewrite and code statistics;
- syslog enforcement;
- WORKSPACE-GUARD build, install, uninstall, purge, and checks;
- `deploy-ci` at `Makefile:649-650`.

**Required change:** remove root-specific `SHELL` and `SCRIPT_BASH` routing,
remove the parse-time `/bin/bash.real` requirement, and run ordinary targets
through normal `/bin/bash`.

### 4.2 WORKSPACE-CI downloaded installer bypass

`scripts/bootstrap-rust:203-227` downloads `https://sh.rustup.rs` and executes
the downloaded shell script through `/bin/bash.real` when effective UID is 0.

This gives network-delivered shell source an unmediated root interpreter.

**Required change:** never execute this installer as root. Use a pinned and
cryptographically verified `rustup-init` artifact under the unprivileged build
owner, then assemble verified outputs into the candidate.

### 4.3 WORKSPACE-CI deployment boundary

`Makefile:649-650` reaches `scripts/deploy-ci` through the global bypass. The
deployment script performs privileged operations, including immutable-flag
changes, that are intentionally unavailable to ordinary untrusted shell text.

**Required change:** preserve `make deploy-ci` as the operator entrypoint, but
move privileged deployment operations behind a narrow root-owned executable or
Ansible module. Build and verification must run as the unprivileged source
owner; the privileged component should perform only candidate assembly,
verification, atomic publication, sealing, and protected hook installation.

The interrupted-candidate cleanup defect is separate and remains open. Signal
handling currently permits repeated cleanup behavior and emitted races between
`chattr`, `find`, and candidate disappearance after interruption.

### 4.4 WORKSPACE-GUARD global bypass

`WORKSPACE-GUARD/Makefile:25-68` selects `/bin/bash.real` for nearly every root
recipe and explicit script invocation. It also propagates that interpreter into
`YAML_SH`.

Additional direct execution occurs at:

- `Makefile:263-267`: creates a temporary `bash` shim that executes
  `/bin/bash.real`, then runs Bats through it;
- `Makefile:377-378`: runs `scripts/shell-guard-check` through
  `/bin/bash.real`;
- `scripts/guard-operator.sh:84-85`: repeats the root health-check bypass.

**Required change:** remove global routing. Build and normal tests must be
unprivileged. Host shell tests must run in the existing isolated Podman/QEMU
environment. Health checking should use guarded execution or compiled
operator functionality. Only guard lifecycle bootstrap may retain a direct
real-interpreter path.

### 4.5 WORKSPACE-VM global bypass and shim

`WORKSPACE-VM/Makefile:19-31` selects `/bin/bash.real` for every root recipe and
explicit script. This reaches CI hook operations and OpenCode moderator
installation. `Makefile:557` additionally symlinks a temporary `bash` command
to `/bin/bash.real`.

**Required change:** remove both assignments and the shim. Execute the affected
test in an isolated fixture and verify normal guard mediation.

### 4.6 Consumer repository bypasses

The following active consumer Makefiles contain root-specific `.real` routing:

| Repository | Global `SHELL` | `SCRIPT_BASH` | Representative affected work |
| --- | --- | --- | --- |
| WORKSPACE-STREAMS | Yes | Yes | Hook generation |
| WORKSPACE-GATEWAY | Yes | Yes | Containers, migrations, logs, tests, hooks |
| WORKSPACE-PORTAL | Yes | Yes | Hook lifecycle and checks |
| DATAOPS | Yes | Yes | Stub patching and hook lifecycle |
| RUST-ZK-COMPLIANCE-API | Yes | Yes | Hook reinstall and cleanup |
| WORLD-GENERATION | No | Yes | Hook generation |

**Required change:** remove all `.real` routing, test root targets through the
normal guard, and refactor any target that fails into narrow privileged work
rather than restoring an interpreter bypass.

### 4.7 Legacy CI propagation source

The retired `projects/CI` repository duplicates WORKSPACE-CI's global routing
and downloaded Rust installer behavior. Its
`templates/Makefile.consumer:14-40` is an authoritative propagation source for
the consumer pattern and contains the obsolete `AT_SECURE` explanation.

**Required change:** retire the legacy repository as required by the clean
transition. Until deletion, remove the executable bypass from its Makefile,
bootstrap script, and consumer template so it cannot propagate further.

## 5. Legitimate WORKSPACE-GUARD Inventory

### 5.1 Internal dispatch

`WORKSPACE-GUARD/src/shell_guard.rs` defines `REAL_SHELL`, validates its
metadata, and executes it after classification and policy processing. A shell
replacement necessarily needs a backing interpreter.

**Disposition:** retain. This is the core implementation use.

### 5.2 Installation, uninstallation, and repair

The following sources create, verify, stage around, restore, or remove the
backing interpreter:

- `scripts/install-shell-guard`
- `scripts/uninstall-shell-guard`
- `scripts/shell-guard-check`
- `scripts/guard-operator.sh`
- installation and lifecycle tests

The installer and uninstaller have a real bootstrap constraint because they
modify the interpreter path being used by the guard.

**Disposition:** retain only the minimum lifecycle access. Remove convenience
and routine health-check bypasses. Prefer compiled lifecycle operations where
that eliminates shell bootstrap ambiguity.

### 5.3 Isolated test fixtures

The following create a fixture `/bin/bash.real` inside isolated test roots or
containers:

- `WORKSPACE-GUARD/Containerfile.test`
- `scripts/podman/run-shell-tests-in-container.sh`
- `tests/shell/22-shell-guard-install.bats`
- shell test harness support

**Disposition:** retain only when isolation from the host root is asserted.
Tests must never create, chmod, replace, expose, or delete the production host
interpreter.

## 6. Documentation and Requirement Defects

### 6.1 Obsolete root failure model

Commit `697bf7afd8b76920da77297ea42c969cd62674ab` changed the guard to reject
`AT_SECURE == 0` only for non-root users. Current code explicitly states that
effective UID 0 bypasses that gate.

The following still claim that root guard execution fails closed by design:

- WORKSPACE-CI `Makefile:18-27`;
- WORKSPACE-GUARD `Makefile:25-33` and `:54-56`;
- WORKSPACE-VM `Makefile:19-22`;
- affected consumer Makefile comments;
- legacy `projects/CI/templates/Makefile.consumer:14-33`;
- WORKSPACE-GUARD `docs/OPERATOR.md:32-36`.

**Required change:** delete the obsolete rationale and document that normal
root `/bin/bash` execution is mediated while command strings remain scanned.

### 6.2 Contradictory trusted-tier model

`REQ-SHELL-GUARD.md:183-202` and current implementation say direct trusted
scripts execute by path without raw-text body scanning. Older clauses at
`REQ-SHELL-GUARD.md:240-246` and `:321-331` still say trusted-tier script
bodies receive the same policy scan. The specification mostly reflects the
newer exemption, while operator guidance retains older root behavior.

**Required change:** choose one normative model, reconcile every requirement,
specification, operator document, README statement, test, and comment, and
distinguish direct script execution from `bash -c` command text.

### 6.3 General escape-hatch guidance

WORKSPACE-GUARD requirements and documentation repeatedly tell root to invoke
`/bin/bash.real` for forbidden idioms. That advice normalized the backing
interpreter as an automation interface.

**Required change:** limit documentation to internal dispatch and explicit
guard lifecycle/recovery. Routine automation must use normal guarded execution
or narrow privileged commands.

### 6.4 Existing correct HITL rule

WORKSPACE-CI already states the correct boundary in:

- `docs/requirements/REQ-HITL-GUARD.md:73`;
- `docs/specifications/SPEC-HITL-GUARD.md:129`.

HITL must use guarded `/bin/bash -c` and must not invoke diverted real
binaries. This prohibition should become a workspace-wide automation rule.

## 7. Tests and Generated Artifacts

### 7.1 Tests enforcing the bypass

`tests/web/lib/makefile-parser.test.ts:87-88` asserts the obsolete
`/bin/bash.real` requirement. WORKSPACE-GUARD shell tests assert root Makefile
routing and direct health-check execution.

**Required change:** replace those assertions with negative tests that reject
diverted-real interpreter assignments and positive tests that exercise normal
guarded root execution.

### 7.2 Generated script source data

`web/src/data/script-sources.json` mirrors the current `bootstrap-rust` source,
including its direct bypass. The legacy CI repository contains the same
generated mirror.

**Required change:** fix source first, then regenerate canonical data and run
the generated-data drift gate. Do not hand-edit generated JSON.

### 7.3 Container compatibility symlink

`web/Containerfile:49` creates `/bin/bash.real` as a symlink to `/bin/bash`.
This exists to satisfy source assumptions rather than to model a real protected
host.

**Required change:** remove the symlink after eliminating the Makefile
dependency and run web/container tests with normal `/bin/bash`.

### 7.4 Protected hooks

No `.real` reference was found in the inspected active WORKSPACE-CI and
WORKSPACE-GUARD Git hooks. Deployment and regeneration remain incomplete,
however, so this is not final acceptance evidence.

**Required change:** regenerate every protected hook after deployment and
verify that no hook contains `.real` interpreter references or retired
`projects/CI` paths.

## 8. Required Architecture Changes

### 8.1 Normal shell selection

- Linux Makefiles use `/bin/bash` for recipes.
- macOS retains the existing Homebrew Bash selection where Bash 5 is required.
- Script invocation uses the normal selected interpreter without an EUID
  branch.
- Root and non-root behavior differ by authorization at the operation, not by
  selecting different interpreters.

### 8.2 Narrow privileged operations

Introduce the minimum purpose-built privileged surface needed for:

- immutable candidate and artifact flag changes;
- atomic candidate publication;
- protected hook ownership, mode, and immutable flags;
- shell-guard installation, uninstallation, and repair;
- any other operation proven impossible through guarded automation.

Each operation must validate fixed paths, ownership, object type, and expected
state. It must not accept arbitrary shell text or arbitrary executable paths.

### 8.3 Unprivileged build

The deployment build and downloaded tool bootstrap must run as the resolved
non-root source owner. Root should assemble and publish already verified
outputs, not execute package managers or downloaded installer scripts.

### 8.4 Deployment interruption safety

Deployment cleanup must:

- execute exactly once;
- disable signal and exit traps before cleanup work;
- tolerate an already absent candidate;
- avoid traversing a path concurrently being deleted;
- preserve or reseal the current deployed artifact;
- return the original interruption or failure status;
- leave neither a mutable deployed root nor a stale candidate.

## 9. Preventive Enforcement

Add a workspace-wide source gate rejecting executable references to diverted
real binaries outside an explicit WORKSPACE-GUARD allowlist.

At minimum, reject:

```text
/bin/bash.real
/usr/bin/bash.real
SHELL := ...bash.real
SCRIPT_BASH := ...bash.real
REAL_BASH=...bash.real
#!/bin/bash.real
PATH shims or symlinks targeting bash.real
```

The allowlist should be limited to:

- shell-guard internal dispatch;
- reviewed install, uninstall, and repair lifecycle code;
- isolated container/QEMU fixtures;
- documentation that describes, but does not recommend, the implementation.

The gate must scan templates and generated executable inputs so the pattern
cannot be reintroduced through regeneration.

## 10. Remediation Sequence

1. Approve the normative allowlist and automation prohibition.
2. Reconcile WORKSPACE-GUARD requirements and implementation documentation.
3. Remove WORKSPACE-GUARD global Make and host-test bypasses.
4. Implement narrow privileged deployment and hook operations.
5. Refactor WORKSPACE-CI deployment to use guarded entry and unprivileged
   build execution.
6. Fix single-execution deployment cleanup and interruption tests.
7. Remove WORKSPACE-CI global Make routing.
8. Replace the root downloaded Rust installer path.
9. Remove the web container compatibility symlink and update tests.
10. Remove or retire the legacy CI propagation sources.
11. Remediate WORKSPACE-VM and every affected consumer repository.
12. Replace tests that enforce bypass behavior.
13. Regenerate canonical web data and protected hooks.
14. Add the workspace-wide diverted-real source gate.
15. Run focused tests and full repository gates.
16. Deploy `/opt/workspace-ci` through the corrected clean-install path.
17. Verify the immutable artifact, exact commit/tree, and protected hooks.
18. Remove the temporary legacy CI transition injection.

## 11. Acceptance Criteria

Remediation is complete only when all of the following are true:

- No application or CI Makefile assigns a diverted real binary to `SHELL` or
  `SCRIPT_BASH`.
- No application or CI script directly executes `/bin/bash.real`.
- No downloaded script executes as root through an unmediated interpreter.
- No runtime test creates a host PATH shim targeting `/bin/bash.real`.
- WORKSPACE-GUARD direct references are limited to the approved internal and
  lifecycle allowlist.
- Requirements, specifications, operator docs, README content, code comments,
  and tests describe the same root and trusted-tier behavior.
- Deployment enters through normal guarded execution and delegates only narrow
  privileged operations.
- Deployment interruption leaves no candidate and preserves a sealed current
  artifact.
- All generated hooks use `/opt/workspace-ci`, contain no retired `projects/CI`
  path, and contain no diverted-real interpreter reference.
- The source gate rejects a deliberately introduced forbidden reference.
- Focused tests, module-size checks, and all relevant full gates pass.
- `/opt/workspace-ci` is the exact reviewed `origin/main` commit and tree,
  root-owned and immutable.
- The temporary legacy CI module-size injection is removed after deployment
  verification.

## 12. Open Remediation Inventory

- Define and approve the normative allowlist.
- Reconcile WORKSPACE-GUARD requirements, specification, operator docs, README,
  comments, and tests.
- Remove WORKSPACE-GUARD global Make routing.
- Replace WORKSPACE-GUARD host test and health-check bypasses.
- Restrict guard lifecycle access.
- Design narrow privileged deployment and protected-hook operations.
- Refactor WORKSPACE-CI deployment and build privilege separation.
- Fix interrupted deployment cleanup.
- Remove WORKSPACE-CI global Make routing.
- Replace root Rust installer execution.
- Remove the web container compatibility symlink.
- Replace bypass-preserving tests.
- Regenerate web source data.
- Retire or remediate legacy CI and its consumer template.
- Remediate WORKSPACE-VM.
- Remediate WORKSPACE-STREAMS.
- Remediate WORKSPACE-GATEWAY.
- Remediate WORKSPACE-PORTAL.
- Remediate DATAOPS.
- Remediate RUST-ZK-COMPLIANCE-API.
- Remediate WORLD-GENERATION.
- Regenerate and inspect protected hooks.
- Add workspace-wide preventive enforcement.
- Run all focused and full validation gates.
- Commit and push reviewed corrections.
- Deploy and verify the clean installation.
- Remove the temporary legacy transition mutation.
