# WORKSPACE-CI Agent Operating Rules

## Blank-Slate Scope

This repository defines one clean installation of WORKSPACE-CI on one Linux
machine. There are no prior releases, tags, alternate branches, parallel
operators, external consumers, migration requirements, support windows,
rollback targets, or recovery targets. Other workspace projects may break.

The lifecycle is:

```text
root-owned Ansible bootstrap
  -> exact reviewed origin/main tree
  -> cryptographic build verification
  -> complete root-owned candidate
  -> atomic directory publication
  -> immutable /opt/workspace-ci artifact
  -> protected WORKSPACE-CI hook installation
```

There is no `CI.previous`, `CI.backup`, migration snapshot, rollback, recovery,
alternate release, or fleet rollout.

## Trust Domains

| Path                           | Role                                                  | Ownership                |
| ------------------------------ | ----------------------------------------------------- | ------------------------ |
| `projects/WORKSPACE-CI`        | Writable CI source                                    | Agent-owned working tree |
| `origin/main`                  | Installation source authority                         | Reviewed upstream        |
| `/opt/workspace-ci`            | Immutable deployed artifact, including `.boot-linux/` | Root-controlled          |
| `/opt/.workspace-ci.candidate` | Fixed same-filesystem deployment candidate            | Root-controlled          |
| `projects/WORKSPACE-GUARD`     | Git/filesystem guard                                  | Root-controlled boundary |

`make deploy-ci` clones the exact reviewed upstream tree into
`/opt/.workspace-ci.candidate`. That checkout builds and verifies its complete
artifact with local `.boot-linux` tools through `/opt/workspace-ci` in a private
mount namespace before atomic publication. The host's current artifact remains
hidden from candidate construction; generated runtime paths are never rewritten.

## Clean Installation

`make deploy-ci` is the root deployment entrypoint. The operator assumes
responsibility for invoking the writable Makefile. The target constructs and
verifies `/opt/.workspace-ci.candidate`, atomically publishes it at
`/opt/workspace-ci`, verifies and seals the artifact, then installs protected
hooks as a separate operation.

Required behavior:

1. Bind the exact reviewed source commit and tree.
2. Build and verify the complete candidate without changing the current artifact.
3. Publish by same-filesystem rename or atomic directory exchange.
4. Verify and seal `/opt/workspace-ci` with `chattr +i`.
5. Install protected hooks without modifying or restoring the artifact.

## Hook Execution

`.pre-commit-config.yaml` is declarative hook input. Protected hooks resolve
WORKSPACE-CI directly at `/opt/workspace-ci`.

## Source Changes and Validation

Before changing this repository:

```bash
git status
```

Run focused tests for changed code, then the relevant full gate. For module-size
changes, run:

```bash
source lib/checks.sh && ci_check_module_size
```

Never fix a failing gate by bypassing hooks or editing installed deployment
files. Fix source, validate the fresh clean-install path, and install only
through the root-owned Ansible bootstrap.

## Policy YAML Editing

Never use `sed -i`, shell redirection, `rm` plus `cp`, or ad hoc rewrites on
root-owned policy files. Use the secure WORKSPACE-GUARD interface:

```bash
sudo make -C ../WORKSPACE-GUARD yaml-set \
  FILE=/path/to/policy.yaml KEY=some.scalar VALUE=value
sudo make -C ../WORKSPACE-GUARD yaml-add \
  FILE=/path/to/policy.yaml KEY=list FIELDS="name=value"
sudo make -C ../WORKSPACE-GUARD yaml-remove \
  FILE=/path/to/policy.yaml KEY=list FIELDS="name=value"
sudo make -C ../WORKSPACE-GUARD yaml-unset \
  FILE=/path/to/policy.yaml KEY='hooks[].field'
sudo make -C ../WORKSPACE-GUARD yaml-remove-comment \
  FILE=/path/to/policy.yaml VALUE='exact comment text'
sudo make -C ../WORKSPACE-GUARD yaml-delete \
  FILE=/path/to/policy.yaml EXPECT_SHA256=<reviewed-digest>
```

Policy changes belong in source and become active only through a fresh
reviewed installation. The installed artifact is not a policy-editing target.
All mutations below `/opt` are forbidden. Deletion is single-file,
non-recursive, and requires a digest reviewed immediately before execution.

## Recovery and Break-Glass

No recovery, rollback, migration, backup, selector, or break-glass workflow
exists for this blank-slate installation. A failed or absent install is handled
by rerunning `make deploy-ci` from reviewed source.
