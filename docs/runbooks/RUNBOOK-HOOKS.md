# Hook Installation

Run `make deploy-ci` as root to invoke the root-owned Ansible deployment. Ansible
builds and verifies `/opt/.workspace-ci.candidate`, atomically publishes it at
`/opt/workspace-ci`, verifies and seals the artifact, then installs protected
hooks. A hook-installation failure does not alter or restore the artifact;
rerun the same Ansible-owned `make deploy-ci` flow after correcting the failure.

Candidate runtimes are created in a private mount namespace where the candidate
is visible at `/opt/workspace-ci`. This does not replace or expose the host's
current artifact. Candidate-path metadata is a deployment failure and must not
be repaired by editing generated environments.

Protected hooks resolve `/opt/workspace-ci` directly. Source-development hooks
may still be generated from a writable checkout, but they are not protected
deployment hooks.

Ansible construction and verification never source or execute the current
`/opt/workspace-ci`. If the deployed artifact is absent or unusable, rerunning
normal provisioning constructs a fresh reviewed candidate and replaces it. Do
not repair hook runtimes or virtual-environment links directly below `/opt`.

## Deadlock Recovery: Reviewed-Ancestor Rollback

When the deployed artifact itself gates every commit (observed 2026-08-24: a
rendered hook referenced a function missing from the artifact, so no commit
carrying the fix could land), recover by deploying a prior sanctioned
generation:

```
sudo make deploy-ci REV=<commit>     # committed ancestor of origin/main
```

Sequence: deploy the last-known-good ancestor (restores healthy gates); land
the fix through the restored gates; redeploy the fixed tip with plain
`make deploy-ci`. REV values that do not resolve or are not ancestors of the
fetched `origin/main` are refused. The candidate at REV runs that revision's
own gates; the working checkout is never moved. See
`docs/decisions/DECISION-REVIEWED-ANCESTOR-ROLLBACK-2026-08-24.md`.
