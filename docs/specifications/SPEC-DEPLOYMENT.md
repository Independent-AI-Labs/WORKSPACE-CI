# SPEC-DEPLOYMENT: Immutable WORKSPACE-CI Deployment

**Date:** 2026-08-16
**Status:** Active remediation specification; current implementation non-compliant
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
checkout and assumes responsibility for that root invocation. The target invokes
the repository's root-owned Ansible deployment playbook or role. Ansible owns
the machine transition; no separate project, daemon, or installed deployment
control plane is introduced.

The target:

1. requires Linux and effective UID 0;
2. acquires `/run/lock/workspace-ci-deploy.lock`;
3. verifies mount-namespace, mount, atomic rename/exchange, filesystem, and
   immutable-attribute support before touching the current artifact;
4. removes only `/opt/.workspace-ci.candidate` if it exists from an interrupted
   invocation.

The Ansible deployment role uses host provisioning tools and the fresh
candidate. Before publication it does not source, import, or execute anything
below `/opt/workspace-ci`. The current artifact may be absent or unusable.

## 3. Source Binding

Deployment fetches `origin/main`, resolves its commit and root tree, and rejects
a writable source checkout that is on another branch, ahead, behind, or
divergent. Dirty and untracked worktree content is ignored because the candidate
is cloned from the reviewed upstream identity and detached at the resolved
commit.

The writable worktree supplies the operator entrypoint only. Its files are not
copied into the candidate.

## 4. Candidate Construction

The candidate is created directly under `/opt` so publication cannot cross a
mount boundary. All construction happens at
`/opt/.workspace-ci.candidate`:

1. clone and checkout the exact reviewed commit;
2. verify remote, commit, and root tree;
3. reject tracked symbolic links;
4. enter a private mount namespace and make mount propagation private;
5. retain access to the physical candidate through a namespace-private bind
   mount, hide the host `/opt` with a namespace-private temporary mount, and
   bind the candidate at `/opt/workspace-ci` in that namespace;
6. run `make bootstrap`, candidate installation/build steps, and locked runtime
   dependency installation through `/opt/workspace-ci` in that namespace;
7. execute the interpreter, required imports, generated entrypoints, and every
   protected-hook command through that final logical pathname;
8. leave the namespace and reject candidate-path coupling in symlinks,
   `pyvenv.cfg`, generated shebangs, entrypoints, and other runtime metadata;
   deployment does not rewrite those references;
9. normalize ownership and modes;
10. run artifact integrity and functional checks;
11. apply and verify immutable attributes on every non-symlink descendant while
   leaving only the candidate root inode renameable; sealed parent directories
   protect generated symlink entries because Linux does not support `chattr` on
   symlink inodes;
12. record expected values in process memory for final-path verification.

Immutable descendant verification is a native bulk shell operation, not a
per-path loop and not a Python program. `find -print0` creates a NUL-delimited
inventory, native tools measure its total, and `xargs -0` passes fixed-size
batches to `lsattr`. `xargs -P` provides bounded parallelism. The default worker
count is four and `CI_DEPLOY_VERIFY_JOBS` is the reviewed tuning control. `awk`
validates attribute records and aggregates batch completion. `set -o pipefail`
and `xargs` status propagation make any mutable path, malformed result, or
worker failure fail deployment.

The native aggregation pipeline owns operator progress for this bulk phase. It
updates one status line from actual completed-batch path counts and prints a
final completed/total summary. It does not print successful paths individually.
Failed attribute records are printed individually. Shell execution tracing is
disabled only while this pipeline owns output, preventing hundreds of thousands
of trace lines from obscuring its real progress. No Python executable, project
virtual environment, or host language runtime participates in this operation.

The namespace exposes only the physical candidate at `/opt/workspace-ci`.
Nothing in the host mount namespace changes, and no pre-publication process can
resolve the current artifact through that pathname.

Python virtual environments are created through their final logical pathname.
They are never created at the physical candidate pathname and then moved or
rewritten. This follows Python's requirement to recreate environments at their
target location while retaining complete candidate construction before atomic
publication.

Candidate and current artifacts must coexist until publication. Resource
preflight therefore uses a measured complete-candidate inode and byte budget
plus documented margin. Deployment does not use an unexplained fixed threshold.
The broken deployed artifact measured on 2026-08-19 contains 114,618 filesystem
objects and occupies 4,185,591,808 allocated bytes. These values are a baseline,
not a preflight threshold; a successful clean candidate build must supply the
authoritative peak measurement.

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
- absence of dangling generated symlinks;
- absence of unresolved candidate-path runtime metadata;
- boot-tool and runtime executable identities;
- deployed interpreter startup and required dependency imports;
- generated entrypoint and protected-hook command execution;
- no group/other writable artifact paths.

After verification, `chattr +i` is applied recursively and `lsattr` confirms
the result. The artifact root itself is sealed because its parent `/opt` is
root-controlled; later deployment may clear immutability only as part of the
locked root replacement operation.

Recursive ownership, mode normalization, and immutable mutation retain their
native batched traversal. They are not parallelized without measurement because
parallel metadata writes can increase filesystem contention. Read-only
immutable verification uses bounded parallelism because batches are independent.

## 7. Hook Installation

After the artifact is published, verified, and sealed, deployment invokes the
root-owned immutable `/opt/workspace-ci/scripts/reinstall-hooks` while its
working directory remains the writable source checkout receiving the hooks.
The shell guard trusts the sealed installer; it continues to scan and reject
equivalent immutable-flag mutations in agent-writable scripts. Generated hooks
embed or resolve the absolute deployed path `/opt/workspace-ci`.
Deployment exports its held-lock marker before invoking the installer, so the
child reuses the parent serialization boundary rather than acquiring the same
lock again.

Hook installation is not part of artifact publication. If it fails:

1. deployment exits nonzero;
2. `/opt/workspace-ci` remains the new verified artifact;
3. no displaced artifact is restored;
4. protected Git operations fail closed until a later successful installation.

After installation, Ansible executes each protected hook in its read-only
verification mode. Deployment is not reported successful until these checks
run from the sealed `/opt/workspace-ci` artifact.

## 8. Failure Semantics

| Failure point                 | Result                                                                     |
| ----------------------------- | -------------------------------------------------------------------------- |
| Before publication            | Existing `/opt/workspace-ci` remains untouched; candidate is removed.      |
| Atomic rename/exchange        | Operation fails without a remove-then-rename alternative.                  |
| After publication             | New artifact remains current; command fails and candidate path is cleaned. |
| Final verification or sealing | Command fails visibly; no automatic restoration occurs.                    |
| Hook installation             | New artifact remains sealed; hooks remain a separate failed operation.     |

Rerunning the Ansible-owned `make deploy-ci` flow is the only convergence
operation. Because candidate construction never executes the current artifact,
the same operation converges when `/opt/workspace-ci` is absent or unusable.

### 8.1 Reviewed-Ancestor Rollback

`make deploy-ci REV=<commit>` deploys a prior sanctioned generation instead of
the upstream tip. REV must resolve in the source repository and verify as a
committed ancestor of the fetched `origin/main` (`git merge-base
--is-ancestor`); every other value is refused, keeping the deployable set
equal to the sanctioned set. The working checkout is never moved: the
candidate is cloned from the source repository's objects and checked out at
REV. Argument validation runs before the root gate so refusals are testable
unprivileged. The candidate at REV runs that revision's own `check-push`
inside the private namespace (per-generation verification; policy is
forward-activating, so a historical generation is not measured against
future baselines).

Rollback exists so recovery never depends on the broken component: when a
deployed artifact gates every commit (for example a hook whose entry no
longer resolves), deploying the last-known-good ancestor restores healthy
gates, the fix commits normally, and the fixed tip is redeployed in the
ordinary way. The rollback redeploys an immutable ancestor; history stays
forward-only. Evidence basis and binding conditions:
`docs/decisions/DECISION-REVIEWED-ANCESTOR-ROLLBACK-2026-08-24.md`.

## 9. Acceptance Strategy

The deployment acceptance suite runs on Linux with the same fixed candidate and
deployed paths used in production, inside an isolated machine or container
fixture capable of atomic directory exchange and immutable attributes.

The suite injects failures into candidate symlinks, `pyvenv.cfg`, generated
shebangs, and hook commands. It proves that these defects are rejected rather
than rewritten, performs the actual rename or exchange, and then executes the
complete runtime. It also starts from an unusable current artifact and records
all pre-publication filesystem and process accesses to prove Ansible did not
read or execute that tree. Namespace tests prove the host view of
`/opt/workspace-ci` remains unchanged during construction.

The defective implementation must fail each injected path-coupling case. The
replacement is accepted only when first installation, healthy replacement, and
unusable-current replacement all pass through the same Ansible role.

## 10. Source Basis

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
- [Linux mount namespaces](https://man7.org/linux/man-pages/man7/mount_namespaces.7.html)
- [Python virtual environments](https://docs.python.org/3/library/venv.html)
- [POSIX `rename()`](https://pubs.opengroup.org/onlinepubs/9799919799/functions/rename.html)
- [Linux `chattr(1)`](https://man7.org/linux/man-pages/man1/chattr.1.html)
- [Capistrano deployment structure](https://capistranorb.com/documentation/getting-started/structure/)
- [Nix profiles and atomic upgrades](https://nix.dev/manual/nix/latest/package-management/profiles)
- [OSTree atomic upgrades](https://ostreedev.github.io/ostree/atomic-upgrades/)

## 11. Implementation Status

| Item                              | Status   |
| --------------------------------- | -------- |
| Specification                     | Revised after 2026-08-19 audit |
| Ansible deployment role           | Implemented; Linux acceptance pending |
| Make target delegation            | Implemented |
| Final-path namespace construction | Implemented; privileged run pending |
| Atomic exchange wrapper           | Implemented |
| Hook/GUARD path migration         | Implemented through sealed installer trust |
| Real-transition fault tests       | Partial; privileged deployment pending |
| Linux acceptance                  | Failed on audited deployment |
