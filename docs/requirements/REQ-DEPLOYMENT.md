# REQ-DEPLOYMENT: Immutable WORKSPACE-CI Deployment

**Date:** 2026-08-16
**Status:** Active blank-slate requirement
**Specification:** [SPEC-DEPLOYMENT](../specifications/SPEC-DEPLOYMENT.md)

## 1. Scope

This contract defines the one-machine Linux deployment performed by
`make deploy-ci`. The operator assumes responsibility for invoking the
agent-writable Makefile with root authority. The Makefile remains the deployment
entrypoint and authority.

The deployment contains one current artifact at `/opt/workspace-ci`. It has no
release registry, active selector, state database, retained predecessor,
migration path, or restoration workflow.

## 2. Requirements

### Source and Serialization

1. `make deploy-ci` MUST run as root and MUST serialize deployment with one
   root-owned lock.
2. Deployment MUST resolve the exact reviewed `origin/main` commit and tree.
   Local uncommitted, untracked, unpushed, divergent, or stale source MUST NOT
   enter the artifact.
3. The candidate MUST be a fresh clone or checkout of that exact upstream
   identity. Deployment MUST NOT update the current artifact in place or copy
   files from the writable source worktree.

### Candidate

4. The only candidate path MUST be `/opt/.workspace-ci.candidate`.
5. `/opt` and the candidate MUST be root-owned. Candidate creation, bootstrap,
   dependency installation, build, and verification MUST occur under root
   control.
6. At startup, while holding the deployment lock, `make deploy-ci` MUST remove
   an incomplete candidate left by an interrupted earlier invocation. No other
   path may be treated as deployment state.
7. Candidate and destination MUST be on the same mounted filesystem. A
   cross-filesystem copy or move MUST fail closed.
8. The candidate MUST contain the complete runtime artifact, including its
   `.boot-linux` tools and runtime dependencies, before publication.
9. Candidate verification MUST prove source identity, expected files, no
   tracked symlinks, ownership, modes, executable identities, dependency lock
   conformance, and required quality/integrity checks.
10. Before publication, candidate descendants MUST have their final immutable
    attributes applied and verified. The candidate root inode remains
    renameable only for publication.

### Publication

11. The only deployed path MUST be the real directory `/opt/workspace-ci`. It
    MUST NOT be a symbolic link.
12. First installation MUST publish the candidate with a same-filesystem atomic
    rename.
13. Replacement MUST atomically exchange the complete candidate and current
    non-empty directory using Linux `renameat2(RENAME_EXCHANGE)` or an exact
    wrapper around that system call. A remove-then-rename sequence is forbidden.
14. Replacement MAY clear the immutable attribute only from the two root
    directory inodes immediately around the exchange. Descendants MUST remain
    immutable. The new deployed root MUST be resealed before any unrelated
    post-publication operation.
15. After exchange, the displaced tree exists only at the candidate path and
    MUST be removed during the same invocation. It MUST NOT be retained,
    named, indexed, or used as a restoration source.
16. Publication MUST NOT use `projects/CI`, a symlink selector, generations,
    content-addressed release directories, or persistent transaction metadata.

### Immutability and Verification

17. `/opt/workspace-ci` and its contents MUST be root-owned and non-writable by
    group or other users.
18. After publication, deployment MUST verify the final path and then apply and
    verify Linux immutable attributes throughout the deployed tree.
19. No installation step may mutate artifact contents after final artifact
    verification. Post-publication verification is read-only.
20. Failure before publication MUST leave the current artifact unchanged and
    remove the candidate. Failure after publication MUST leave the new artifact
    in place, report failure, and require a fresh `make deploy-ci` invocation.
    It MUST NOT exchange the displaced tree back.

### Hooks

21. Protected hooks and GUARD integration MUST resolve WORKSPACE-CI directly at
    `/opt/workspace-ci`; they MUST NOT resolve `projects/CI` or the writable
    source checkout.
22. Hook installation is a separate post-publication operation. Hook failure
    MUST NOT alter, replace, or unseal the deployed artifact.
23. Missing, replaced, mutable, or unverifiable `/opt/workspace-ci` MUST make
    protected Git operations fail closed.

### Platform

24. Protected deployment is Linux-only. Unsupported kernels, filesystems,
    immutable attributes, or atomic exchange support MUST fail before changing
    the current artifact.
25. macOS remains a source-development platform and does not implement this
    protected deployment contract.

## 3. Acceptance

Tests MUST prove:

1. exact `origin/main` source binding;
2. rejection of dirty, stale, divergent, or symlink-bearing input;
3. fixed root-owned candidate and deployment paths;
4. same-filesystem enforcement;
5. first-install atomic rename and replacement atomic exchange;
6. current artifact continuity during replacement;
7. candidate cleanup before and after publication failures;
8. no retained displaced tree or deployment metadata;
9. final ownership, modes, identity, and immutable attributes;
10. direct `/opt/workspace-ci` hook references;
11. fail-closed Git behavior when the deployed artifact is absent or replaced;
12. hook-installation failure leaving the new artifact unchanged.

## 4. Implementation Status

| Item                            | Status    |
| ------------------------------- | --------- |
| Requirement contract            | Specified |
| `make deploy-ci` implementation | Pending   |
| Atomic exchange helper          | Pending   |
| Hook and GUARD path migration   | Pending   |
| Linux acceptance run            | Pending   |
