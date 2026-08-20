# Decision: Ansible Owns WORKSPACE-CI Deployment

**Date:** 2026-08-19
**Status:** Accepted; supersedes conflicting deployment-authority wording
**Audit:** [Deployment deadlock audit](../audits/AUDIT-DEPLOYMENT-DEADLOCK-2026-08-19.md)

## Decision

The existing root-owned Ansible bootstrap is the sole machine-provisioning
authority for WORKSPACE-CI. No separate deployment project, daemon, installed
control plane, or one-off repair script is introduced.

`make deploy-ci` remains the operator-facing command. It delegates to the
reviewed Ansible deployment playbook/role. The agent-writable Makefile does not
implement or authorize the root filesystem transition itself.

Ansible constructs and verifies the complete candidate without reading or
executing the current `/opt/workspace-ci`. An absent or unusable current
artifact must not prevent a fresh reviewed installation.

The hermetic `.boot-linux` and `.venv` remain part of the immutable artifact.
Ansible constructs them in a private mount namespace where the physical
candidate is exposed at `/opt/workspace-ci`. The host namespace and current
artifact remain unchanged. This creates generated runtime metadata with its
final path instead of moving or rewriting a virtual environment.

Candidate-path references in symlinks, `pyvenv.cfg`, generated shebangs, or
other runtime metadata are deployment failures. Deployment rejects them and
does not attempt textual or symlink repair.

## Superseded Wording

This decision supersedes only the conflicting authority and verification
portions of the 2026-08-10 decision record:

- D-003 remains valid for fixed candidate and deployed paths, but candidate
  completeness now includes post-transition execution tests.
- D-005 now requires the repository's Ansible playbook/role, rather than merely
  permitting Ansible content.
- D-010 is replaced: the Make target is the operator interface; root-owned
  Ansible is deployment authority.
- D-012 remains valid only when Ansible has verified the published runtime and
  can rerun without using the current artifact.

The no-history and no-restoration decisions remain unchanged. Re-running the
same normal Ansible clean-install flow is convergence, not rollback.

## Required Evidence

Acceptance requires an automated Linux test that starts from an unusable
`/opt/workspace-ci`, runs normal Ansible provisioning, and proves a complete
sealed installation without any pre-publication execution from the unusable
tree. Tests also prove namespace isolation, final-path runtime construction,
real atomic publication, and rejection rather than rewriting of candidate-path
metadata.

Bulk immutable verification remains deployment verification under Ansible
authority. It uses existing native `find`, `xargs`, `lsattr`, and `awk` tools,
NUL-delimited bounded batches, and bounded configurable `xargs` parallelism
rather than one process pipeline per descendant. Python and other language
runtimes are forbidden for this operation. Progress derives from completed
paths against a measured total; successful paths are not individually traced,
and any failed path or worker fails deployment.
