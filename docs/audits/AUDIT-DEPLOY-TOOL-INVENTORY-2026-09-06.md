# Deployment system-tool inventory and trust classification (2026-09-06)

Scope: every absolute system binary reachable from `make deploy-ci`
(`scripts/deploy-ci`, `res/ansible/deploy-ci.yml`), classified against
ledger items 127-135. Method: `grep -oE '/(usr/)?(s)?bin/...'` over
both files plus a read of each invocation site.

## Inventory

| Binary | Sites | Class | Justification |
|---|---|---|---|
| `/bin/bash` | deploy-ci wrapper, ansible module | kernel/filesystem primitive | The guarded shell itself; host authority required before any candidate exists |
| `/bin/true` | ansible task | kernel/filesystem primitive | POSIX no-op used as task guard |
| `/bin/podman` + `/bin/podman-user-generator` | candidate runtime bootstrap | bootstrap trust | Container runtime provisioned by reviewed bootstrap before candidate construction; user generator configures candidate-local runtime |
| `/bin/uv` | hermetic final-artifact verification (2 sites) | bootstrap trust | Boot-provisioned toolchain manager; the sanctioned hermetic interpreter channel |
| `/usr/bin/unshare` (+ `/bin/unshare`) | private mount namespace | kernel/filesystem primitive | Namespaces are kernel calls; no candidate tool can exist before the namespace that hides the candidate |
| `/usr/bin/chattr` / `/usr/bin/lsattr` | sealing + immutable verification | kernel/filesystem primitive | chattr operates on the filesystem below any userspace the candidate could provide |
| `/usr/bin/env` | wrapper exec | kernel/filesystem primitive | exec-time environment resolution used only with absolute interpreter paths alongside |
| `/usr/sbin/runuser` | agent-side validation drops | kernel/filesystem primitive | uid-switch primitive; root-only by design |

No interpreter indirection exists: zero `/usr/bin/python*`, perl, ruby,
node, lua, or php invocations remain in either file (this is the
previously completed interpreter-removal work, re-verified 2026-09-06).

## Classification rationale (ledger 133)

Each host tool above cannot come from candidate `.boot-linux` because
it is needed *before or below* candidate construction: namespace setup
must hide the host `/opt` before the candidate path even exists;
sealing attributes apply to the published tree after candidate
validation; podman/uv bootstrap the candidate's own runtime from
reviewed pins. `.boot-linux` provisioning references in both files are
path prefixes for candidate-owned tooling, not host executions.

## Post-bootstrap migration status (ledger 134)

The two `uv` verification sites intentionally execute the *deployed*
artifact's own `.boot-linux/bin/uv` (hermetic final-path verification);
they are already candidate-owned tooling. Podman invocation migrates to
candidate-local configuration (`CONTAINERS_CONF_DIR`) per the existing
bootstrap contract; host `/bin/podman` remains the runtime binary.

## Enforcement gaps (ledger 135, open)

- No machine check yet rejects a *new* unapproved absolute system tool
  introduced into deploy-ci. The banned-pattern rule
  `protected-system-interpreter` covers interpreters; a deployment-tool
  allowlist check would need the exact-binary inventory above as policy
  data. Proposed as `ci/check_deploy_tools.py` validating
  `scripts/deploy-ci` + `res/ansible/deploy-ci.yml` against a reviewed
  allowlist manifest; deferred for operator decision (ledger 151).
