# REQ-DEPLOYMENT: Immutable WORKSPACE-CI Deployment

**Date:** 2026-08-16
**Status:** Active blank-slate requirement
**Specification:** [SPEC-DEPLOYMENT](../specifications/SPEC-DEPLOYMENT.md)

## 1. Scope

This contract defines the one-machine Linux deployment requested by
`make deploy-ci` and performed by the root-owned Ansible bootstrap. The operator
assumes responsibility for invoking the agent-writable Makefile with root
authority. The Makefile is the operator interface; Ansible is the machine
provisioning authority.

The deployment contains one current artifact at `/opt/workspace-ci`. It has no
release registry, active selector, state database, retained predecessor,
migration path, or restoration workflow.

## 2. Requirements

### Source and Serialization

1. `make deploy-ci` MUST run as root and MUST serialize deployment with one
   root-owned lock through the reviewed Ansible deployment playbook or role.
2. Deployment MUST resolve the exact reviewed `origin/main` commit and tree.
   Local uncommitted, untracked, unpushed, divergent, or stale source MUST NOT
   enter the artifact. A dirty operator checkout MUST NOT block Ansible because
   its worktree content is not an artifact input.
3. The candidate MUST be a fresh clone or checkout of that exact upstream
   identity. Deployment MUST NOT update the current artifact in place or copy
   files from the writable source worktree.
4. Candidate construction and verification MUST NOT read, source, import, or
   execute the current `/opt/workspace-ci`. An absent or unusable current
   artifact MUST NOT prevent normal Ansible provisioning.

### Candidate

5. The only candidate path MUST be `/opt/.workspace-ci.candidate`.
6. `/opt` and the candidate MUST be root-owned. Candidate creation, bootstrap,
   dependency installation, build, and verification MUST occur under root
   control.
7. At startup, while holding the deployment lock, Ansible MUST remove
   an incomplete candidate left by an interrupted earlier invocation. No other
   path may be treated as deployment state.
8. Candidate and destination MUST be on the same mounted filesystem. A
   cross-filesystem copy or move MUST fail closed.
9. The candidate MUST contain the complete runtime artifact, including its
   `.boot-linux` tools, hermetic `.venv`, and runtime dependencies, before
   publication.
10. Candidate runtimes MUST be created in a private Linux mount namespace in
    which the physical candidate is exposed at `/opt/workspace-ci`. Generated
    runtime metadata MUST therefore name the final deployed pathname without
    moving or rewriting an already-created virtual environment. The host mount
    namespace and current artifact MUST remain unchanged during construction.
11. Candidate verification MUST prove source identity, expected files, no
   tracked symlinks, ownership, modes, executable identities, dependency lock
   conformance, and required quality/integrity checks.
12. Candidate verification MUST reject candidate-path references in
    runtime symlinks, `pyvenv.cfg`, generated shebangs, entrypoints, and other
    execution metadata. It MUST NOT repair these references by rewriting files
    or links. It MUST execute the interpreter, required imports, generated
    entrypoints, and protected-hook commands through the final pathname in the
    private namespace and after the real publication transition.
13. Before publication, candidate descendants MUST have their final immutable
    attributes applied and verified. The candidate root inode remains
    renameable only for publication.
    Immutable verification MUST NOT launch a shell pipeline or attribute
    process for each descendant. It MUST use the existing native `find`,
    `xargs`, `lsattr`, and `awk` tools with NUL-delimited filename-safe bounded
    batches and bounded configurable `xargs` parallelism. It MUST NOT invoke
    Python or another language runtime. Any batch or path failure MUST fail
    verification. While verification runs, operator output MUST report actual
    completed paths against the measured total without printing every
    successful path. Only failed paths require individual output.

### Publication

14. The only deployed path MUST be the real directory `/opt/workspace-ci`. It
    MUST NOT be a symbolic link.
15. First installation MUST publish the candidate with a same-filesystem atomic
    rename.
16. Replacement MUST atomically exchange the complete candidate and current
    non-empty directory using Linux `renameat2(RENAME_EXCHANGE)` or an exact
    wrapper around that system call. A remove-then-rename sequence is forbidden.
17. Replacement MAY clear the immutable attribute only from the two root
    directory inodes immediately around the exchange. Descendants MUST remain
    immutable. The new deployed root MUST be resealed before any unrelated
    post-publication operation.
18. After exchange, the displaced tree exists only at the candidate path and
    MUST be removed during the same invocation. It MUST NOT be retained,
    named, indexed, or used as a restoration source.
19. Publication MUST NOT use `projects/CI`, a symlink selector, generations,
    content-addressed release directories, or persistent transaction metadata.

### Immutability and Verification

20. `/opt/workspace-ci` and its contents MUST be root-owned and non-writable by
    group or other users.
21. After publication, deployment MUST verify the final path and then apply and
    verify Linux immutable attributes throughout the deployed tree.
22. Final-path verification MUST execute the deployed interpreter, required
    imports, generated entrypoints, and every protected-hook command before the
    deployment is reported successful.
23. No installation step may mutate artifact contents after final artifact
    verification. Post-publication verification is read-only.
24. Failure before publication MUST leave the current artifact unchanged and
    remove the candidate. Failure after publication MUST leave the new artifact
    in place, report failure, and require a fresh `make deploy-ci` invocation.
    It MUST NOT exchange the displaced tree back.

### Hooks

25. Protected hooks and GUARD integration MUST resolve WORKSPACE-CI directly at
    `/opt/workspace-ci`; they MUST NOT resolve `projects/CI` or the writable
    source checkout.
26. Hook installation is a separate post-publication operation. Hook failure
    MUST NOT alter, replace, or unseal the deployed artifact.
27. Missing, replaced, mutable, or unverifiable `/opt/workspace-ci` MUST make
    protected Git operations fail closed.

### Platform

28. Protected deployment is Linux-only. Unsupported kernels, filesystems,
    immutable attributes, or atomic exchange support MUST fail before changing
    the current artifact.
29. macOS remains a source-development platform and does not implement this
    protected deployment contract.
30. Deployment MUST fail before candidate construction when available space or
    inodes cannot hold a complete concurrent candidate. Any preflight threshold
    MUST be derived from measured artifact requirements and documented margin;
    an arbitrary fixed inode count is forbidden.

## 3. Acceptance

Tests MUST prove:

1. exact `origin/main` source binding;
2. exclusion of dirty worktree content and rejection of stale, divergent, or
   symlink-bearing artifact input;
3. fixed root-owned candidate and deployment paths;
4. same-filesystem enforcement;
5. first-install atomic rename and replacement atomic exchange;
6. current artifact continuity during replacement;
7. candidate cleanup before and after publication failures;
8. no retained displaced tree or deployment metadata;
9. final ownership, modes, identity, and immutable attributes;
10. direct `/opt/workspace-ci` hook references;
11. fail-closed Git behavior when the deployed artifact is absent or replaced;
12. hook-installation failure leaving the new artifact unchanged;
13. candidate-path references in symlinks, `pyvenv.cfg`, and generated
    entrypoints are rejected rather than rewritten;
14. interpreter, import, entrypoint, and hook execution succeeds through the
    final pathname during isolated construction, after the real pathname
    transition, and after sealing;
15. normal Ansible provisioning replaces an absent or unusable current artifact
    without executing it;
16. the mount namespace does not alter the host view of `/opt/workspace-ci`;
17. resource preflight values are traceable to measured candidate construction.
18. native immutable verification handles spaces and newlines in paths, rejects
    a mutable descendant or `xargs` worker failure, reports completed and total
    path counts, and does not emit one success line or process pipeline per path.

## 4. Implementation Status

| Item                            | Status    |
| ------------------------------- | --------- |
| Requirement contract            | Specified |
| Ansible deployment role         | Implemented; Linux acceptance pending |
| `make deploy-ci` delegation     | Implemented |
| Atomic exchange helper          | Implemented |
| Hook and GUARD path migration   | Pending   |
| Namespace/fault-injection tests | Implemented; privileged run pending |
| Linux acceptance run            | Failed on 2026-08-19 deployment audit |
