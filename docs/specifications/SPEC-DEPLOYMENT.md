# SPEC-DEPLOYMENT: Immutable WORKSPACE-CI Deployment

**Date:** 2026-08-16
**Status:** Target specification; implementation pending
**Requirements:** [REQ-DEPLOYMENT](../requirements/REQ-DEPLOYMENT.md)

## 1. Layout

```text
/opt/
  workspace-ci/                 root-owned deployed artifact
  .workspace-ci.candidate/      root-owned staging, present only during deploy

/run/lock/
  workspace-ci-deploy.lock      root-owned serialization lock

~/WORKSPACE-VM/projects/
  WORKSPACE-CI/                 agent-owned source checkout
```

`/opt/workspace-ci` is a real directory. There is no deployment symlink,
release directory, state file, manifest registry, predecessor archive, or
alternate active path.

## 2. Entrypoint

The operator runs `make deploy-ci` from the writable `WORKSPACE-CI` source
checkout and assumes responsibility for that root invocation. The Makefile owns
the deployment flow; no separate installed control plane is introduced.

The target:

1. requires Linux and effective UID 0;
2. acquires `/run/lock/workspace-ci-deploy.lock`;
3. verifies required system calls, filesystem support, and immutable-attribute
   support before touching the current artifact;
4. removes only `/opt/.workspace-ci.candidate` if it exists from an interrupted
   invocation.

## 3. Source Binding

Deployment fetches `origin/main`, resolves its commit and root tree, and rejects
a writable source checkout that is dirty, untracked, on another branch, ahead,
behind, or divergent. The candidate is cloned from the reviewed upstream
identity and detached at the resolved commit.

The writable worktree supplies the operator entrypoint only. Its files are not
copied into the candidate.

## 4. Candidate Construction

The candidate is created directly under `/opt` so publication cannot cross a
mount boundary. All construction happens at
`/opt/.workspace-ci.candidate`:

1. clone and checkout the exact reviewed commit;
2. verify remote, commit, and root tree;
3. reject tracked symbolic links;
4. run `make bootstrap` using candidate-local paths;
5. run candidate installation/build steps;
6. install locked runtime dependencies into the candidate;
7. normalize ownership and modes;
8. run artifact integrity and functional checks;
9. apply and verify immutable attributes on every descendant while leaving only
   the candidate root inode renameable;
10. record expected values in process memory for final-path verification.

No artifact build or dependency installation runs against
`/opt/workspace-ci`.

## 5. Atomic Publication

### First Installation

When `/opt/workspace-ci` is absent, publish with a same-filesystem rename:

```text
rename("/opt/.workspace-ci.candidate", "/opt/workspace-ci")
```

The target first verifies that the destination is absent and the candidate and
`/opt` refer to the expected root-owned filesystem objects.

### Replacement

When `/opt/workspace-ci` exists, atomically exchange the two non-empty
directories:

```text
renameat2(
  AT_FDCWD, "/opt/.workspace-ci.candidate",
  AT_FDCWD, "/opt/workspace-ci",
  RENAME_EXCHANGE
)
```

The exchange is one Linux VFS operation. Readers resolving
`/opt/workspace-ci` see either the complete old artifact or the complete new
artifact, never an absent path or partially copied tree.

Immediately before the syscall, deployment clears `FS_IMMUTABLE_FL` only on the
candidate and current root directory inodes. Their descendants remain
immutable. Immediately after a successful exchange it sets the flag on the new
`/opt/workspace-ci` root before hook installation or unrelated work. The
root-owned `/opt` parent prevents unprivileged directory-entry replacement.

GNU coreutils 9.4 on the target does not provide `mv --exchange`; implementation
therefore needs one minimal checked wrapper around `renameat2`. The wrapper owns
no policy or state.

After exchange, the displaced artifact is located at
`/opt/.workspace-ci.candidate`. It is removed immediately after publication and
is never considered deployable state.

## 6. Final Verification and Sealing

Final-path verification recomputes the values captured from the candidate and
performs no writes inside the artifact. It verifies at least:

- real directory, not a symlink;
- root ownership and fixed modes;
- source commit and root tree;
- expected file inventory and absence of tracked symlinks;
- boot-tool and runtime executable identities;
- no group/other writable artifact paths.

After verification, `chattr +i` is applied recursively and `lsattr` confirms
the result. The artifact root itself is sealed because its parent `/opt` is
root-controlled; later deployment may clear immutability only as part of the
locked root replacement operation.

## 7. Hook Installation

After the artifact is published, verified, and sealed, deployment invokes the
hook installer from `/opt/workspace-ci`. Generated hooks embed or resolve the
absolute deployed path `/opt/workspace-ci`.

Hook installation is not part of artifact publication. If it fails:

1. deployment exits nonzero;
2. `/opt/workspace-ci` remains the new verified artifact;
3. no displaced artifact is restored;
4. protected Git operations fail closed until a later successful installation.

## 8. Failure Semantics

| Failure point                 | Result                                                                     |
| ----------------------------- | -------------------------------------------------------------------------- |
| Before publication            | Existing `/opt/workspace-ci` remains untouched; candidate is removed.      |
| Atomic rename/exchange        | Operation fails without a remove-then-rename alternative.                  |
| After publication             | New artifact remains current; command fails and candidate path is cleaned. |
| Final verification or sealing | Command fails visibly; no automatic restoration occurs.                    |
| Hook installation             | New artifact remains sealed; hooks remain a separate failed operation.     |

Rerunning `make deploy-ci` is the only convergence operation.

## 9. Source Basis

- POSIX `rename()` guarantees atomic replacement where the destination type is
  replaceable, but cannot replace a non-empty directory.
- Linux `renameat2(RENAME_EXCHANGE)` atomically exchanges two existing paths,
  including non-empty directories.
- Capistrano, Nix, and OSTree build immutable trees away from the active path
  and switch a selector atomically. This deployment retains the build-away
  principle but uses direct directory exchange to avoid their release and
  selector machinery.
- `chattr +i` prevents modification, deletion, and rename until root explicitly
  clears the attribute.

Primary references:

- [Linux `rename(2)`](https://man7.org/linux/man-pages/man2/rename.2.html)
- [POSIX `rename()`](https://pubs.opengroup.org/onlinepubs/9799919799/functions/rename.html)
- [Linux `chattr(1)`](https://man7.org/linux/man-pages/man1/chattr.1.html)
- [Capistrano deployment structure](https://capistranorb.com/documentation/getting-started/structure/)
- [Nix profiles and atomic upgrades](https://nix.dev/manual/nix/latest/package-management/profiles)
- [OSTree atomic upgrades](https://ostreedev.github.io/ostree/atomic-upgrades/)

## 11. Implementation Status

| Item                              | Status   |
| --------------------------------- | -------- |
| Specification                     | Complete |
| Deployment script and Make target | Pending  |
| Atomic exchange wrapper           | Pending  |
| Hook/GUARD path migration         | Pending  |
| Linux tests                       | Pending  |
