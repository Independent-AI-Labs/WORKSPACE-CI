# Audit: Deployment Relocation and Repair Deadlock

**Date:** 2026-08-19
**Status:** Confirmed critical design failure; remediation specified
**Affected deployment:** `0862eca3a04dd3a256736f56f47e9e8c952cbbf1`

## 1. Executive Finding

The intended clean-install flow published a hermetic Python environment that
was still bound to the candidate pathname. Atomic publication changed the
artifact pathname without making the environment valid at its deployed
pathname. Protected hooks then depended on the broken environment, while the
deployment entrypoint rejected the dirty source tree containing the repair.

This violated the primary availability invariant: normal root-owned Ansible
provisioning must be able to replace an absent or unusable WORKSPACE-CI
installation without executing that installation.

The operator used the documented deployment flow. The failure was in the
deployment design, implementation, and acceptance coverage.

## 2. Observed Failure

The deployed virtual environment retained candidate-bound values after
publication:

```text
/opt/workspace-ci/.venv/bin/python
  -> /opt/.workspace-ci.candidate/.boot-linux/python/.../python3.13

/opt/workspace-ci/.venv/pyvenv.cfg
  home = /opt/.workspace-ci.candidate/.boot-linux/python/.../bin
```

The candidate directory was atomically renamed or exchanged to
`/opt/workspace-ci`. The absolute values still named the now-absent candidate
tree. Protected hooks that invoked `/opt/workspace-ci/.venv/bin/python` could
not run.

The source checkout then contained the provisioning correction. A normal
commit required the broken protected hooks, and `make deploy-ci` rejected the
dirty checkout. These dependencies formed a repair cycle:

```text
working deployed artifact -> local commit -> reviewed deployment input
         ^                                      |
         +-------------- deployment ------------+
```

Rejecting the dirty operator checkout was unnecessary: candidate source is
cloned from exact reviewed `origin/main`, so worktree content does not enter the
artifact. The corrected provisioner ignores dirty worktree content while still
requiring local `HEAD` and fetched `origin/main` identity to agree.

## 3. Root Causes

### 3.1 Path-transition behavior was unspecified

The requirements called the candidate complete before publication but did not
define completeness across the actual candidate-to-deployed pathname change.
Hermetic dependency ownership was incorrectly treated as proof of pathname
independence.

### 3.2 Verification omitted runtime relocation

Candidate checks ran while the artifact still occupied its build pathname.
They did not reproduce publication under a different pathname and execute the
resulting interpreter, imports, generated entrypoints, and protected hook
commands.

### 3.3 Symlink checks were structural, not functional

Tracked symlinks were rejected and generated symlinks were excluded from
immutable-inode checks, but deployment did not reject dangling generated links
after publication. Regular files containing candidate paths, including
`pyvenv.cfg` and generated shebangs, were also outside the acceptance contract.

### 3.4 Provisioning authority was assigned to the wrong layer

Documentation assigned deployment authority to the agent-writable Makefile.
The root-owned Ansible bootstrap was described as optional repository content
rather than the independent machine-provisioning authority. That left no
specified normal provisioning path guaranteed to operate when
`/opt/workspace-ci` was unusable.

### 3.5 Failure prevention was asserted without destructive tests

The acceptance suite did not start with an absent, dangling, or otherwise
unusable `/opt/workspace-ci` and prove that normal Ansible provisioning could
construct and publish a replacement without reading or executing it.

## 4. Incorrect Conclusions During Remediation

The initial remediation focused only on converting candidate-internal absolute
symlinks to relative links. That was incomplete because virtual-environment
configuration and generated scripts can also embed absolute paths. The repair
was described as complete before `pyvenv.cfg` was inspected.

A subsequent remediation prototype searched generated runtime files and
rewrote candidate pathname bytes to the deployed pathname. That is also
rejected: Python virtual environments are not portable, arbitrary execution
metadata cannot be safely discovered and rewritten, and binary metadata may
embed paths. Runtimes must instead be created through their final logical
pathname.

The discussion also incorrectly proposed a separate installed deployment
control plane. No additional project or service is required. Root-owned
Ansible is already the correct independent provisioning layer.

Source-hosting process changes were also raised even though they do not repair
the deployment defect. They are outside this remediation.

## 5. Corrected Architecture

Root-owned Ansible owns the complete machine transition. `make deploy-ci` may
remain the operator command, but it delegates to the reviewed Ansible
playbook/role and is not itself the authority.

Ansible performs this sequence:

1. acquire the root-owned deployment lock;
2. bind the exact reviewed `origin/main` commit and tree;
3. construct `/opt/.workspace-ci.candidate` without using the current artifact;
4. enter a private mount namespace that exposes the physical candidate at
   `/opt/workspace-ci` without changing the host namespace;
5. build the complete hermetic toolchain and environment through that final
   logical pathname;
6. execute interpreter, import, entrypoint, and hook-command checks there;
7. reject, rather than rewrite, any physical candidate-path metadata;
8. verify and seal candidate descendants;
9. atomically publish the candidate;
10. execute the same checks at `/opt/workspace-ci`;
11. seal the deployed root and install protected hooks;
12. execute the installed protected hooks in read-only verification mode.

No pre-publication step may read or execute `/opt/workspace-ci`. The current
artifact is relevant only as the exchange operand at the atomic publication
boundary.

## 6. Mandatory Acceptance Cases

The implementation is not complete until automated tests prove all cases:

1. first installation with `/opt/workspace-ci` absent;
2. replacement with a healthy current artifact;
3. replacement with an unusable current artifact;
4. candidate environment containing an absolute symlink to the candidate path;
5. candidate `pyvenv.cfg` containing the candidate path;
6. generated entrypoint containing a candidate-bound shebang;
7. candidate succeeds before rename but fails after rename;
8. publication leaves a dangling symlink;
9. every generated protected-hook command executes after publication;
10. the complete artifact remains executable after immutable sealing;
11. a pre-publication failure leaves the current artifact untouched;
12. rerunning normal Ansible provisioning converges without a one-off `/opt`
    mutation.

Each fault-injection case must fail against the defective implementation and
pass against the replacement.

## 7. Immediate Remediation Rule

The current machine must be repaired through the normal root-owned Ansible
bootstrap after that bootstrap contains final-path namespace construction and
transition checks. Direct edits below `/opt`, runtime metadata rewriting, ad hoc
symlink replacement, and a second deployment project are not acceptable
remedies.

## 8. Documentation Impact

This audit requires coordinated updates to:

- `REQ-DEPLOYMENT.md`;
- `SPEC-DEPLOYMENT.md`;
- `REQ-BOOT-LAYOUT.md`;
- `SPEC-BOOT-LAYOUT.md`;
- `RUNBOOK-HOOKS.md`;
- the bootstrap and deployment decision record.

Implementation status must remain non-compliant until the Ansible-owned
end-to-end acceptance cases pass on the real Linux publication path.
