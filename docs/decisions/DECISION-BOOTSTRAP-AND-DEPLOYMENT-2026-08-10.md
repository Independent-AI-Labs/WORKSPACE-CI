# Human Decisions: Bootstrap and Deployment

**Date:** 2026-08-10
**Status:** Accepted
**Authority:** Human decisions recorded during the 2026-08-10 working session.

Authority and relocation portions are superseded by
[DECISION-ANSIBLE-DEPLOYMENT-AUTHORITY-2026-08-19](DECISION-ANSIBLE-DEPLOYMENT-AUTHORITY-2026-08-19.md).

This document is the decision authority for bootstrap and deployment wording.

## Decisions

### D-001: One complete related change

The current working tree is one related change set. It will be validated in a
working state and committed as one complete commit containing only this related
work.

### D-002: Human decisions precede implementation claims

Human-driven decisions are recorded before further implementation changes.
Specifications, requirements, runbooks, and README claims must agree with this
record.

### D-003: Deployment builds a complete candidate under `/opt`

`make deploy-ci` clones the exact reviewed `origin/main` commit and tree into
`/opt/.workspace-ci.candidate`. The candidate builds and verifies its complete
artifact using local `.boot-linux` tools. `/opt/workspace-ci` is the immutable
deployed target.

As superseded by the 2026-08-19 decision, runtime construction uses a private
mount namespace that exposes the physical candidate at `/opt/workspace-ci`.
Generated environments are not relocated or rewritten.

First installation uses a same-filesystem rename. Replacement uses Linux
`renameat2(RENAME_EXCHANGE)` to atomically exchange the complete non-empty
candidate and deployed directories. The displaced tree is removed immediately.

The installed `/opt/workspace-ci` checkout is the exact reviewed `origin/main` clone,
including its immutable `.boot-linux/` directory.

Downloaded boot tools use cataloged version, source, asset SHA-256, and
executable identity. Locally built boot tools use the reviewed source commit,
locked build inputs, and resulting executable SHA-256.

The immutable `/opt/workspace-ci` deployment and `chattr +i` sealing flow runs on
Linux. macOS retains `.boot-macos` development support.

### D-004: Clean installation is the only lifecycle

There are no prior releases, tags, branches, consumers, parallel operators, or
compatibility obligations to preserve. Bootstrap installs from the exact
reviewed `origin/main` tree into a fresh deployment. The current filesystem
state is not a recovery target and is not carried forward as a backup.

### D-005: Root-required installation is real machine deployment

The target is an actual root-controlled installation on this machine, not a
source-only prototype or readiness label. Root is required for candidate
construction, atomic publication, immutable sealing, and protected hooks.

The repository may hold the source implementation, Make targets, Ansible
playbooks, schemas, tests, and build inputs. The root-owned machine targets are
installed artifacts and state, not files edited in the agent-owned checkout.

### D-006: Full alignment is required

Documentation and implementation must be aligned across bootstrap, boot layout,
dependency validation, and the clean-install lifecycle. New target behavior is
activated only after the fresh deployment passes verification.

### D-007: Remove the previous methodology

The previous deployment methodology, migration path, compatibility layer,
backup path, selector history, rollback path, recovery path, and consumer
support are not requirements. They must be deleted from active documentation,
source, configuration, and tests. Other workspace projects may break.

### D-008: Installation source is reviewed upstream

Bootstrap binds the exact reviewed upstream commit and tree before cloning the
candidate checkout.

### D-009: Deployment sealing

After successful final-path deployment and verification, `chattr +i` seals the
deployed `/opt/workspace-ci` tree.

### D-010: Operator owns writable-Makefile invocation

The operator assumes full responsibility for invoking `make deploy-ci` from the
writable source checkout with root authority. The Makefile remains the
deployment authority; no separate installed deployment control plane is added.

### D-011: Fixed candidate and no deployment history

The only candidate is `/opt/.workspace-ci.candidate`, serialized by a root-owned
deployment lock. There is no candidate registry or unique candidate naming.
Incomplete candidate content is removed at the start of the next invocation.

### D-012: Hooks are separate from artifact publication

Protected hooks resolve `/opt/workspace-ci` directly and are installed only
after the artifact is published, verified, and sealed. Hook failure does not
change, restore, or unseal the artifact. The operator fixes the failure and
reruns `make deploy-ci`.

## Required Documentation Consequences

- Describe the `make deploy-ci`, candidate bootstrap, atomic publication, and
  separate hook-installation flow.
- Keep installation documentation aligned with the deployed checkout.
