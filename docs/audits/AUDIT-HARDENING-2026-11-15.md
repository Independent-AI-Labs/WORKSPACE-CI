# AUDIT-HARDENING-2026-11-15: WORKSPACE-CI hardening audit

Status: Phase I audit in progress. Initial CI-01/CI-02 mitigation implemented
and tested in QEMU on 2026-11-20. GUARD remediation landed the same day.
Started 2026-11-15.
Scope: deployment chain, hook generation/trust boundary, policy locking, config
resolution, CI checkers, and QEMU coverage.
Companion: `projects/WORKSPACE-GUARD/docs/AUDIT-HARDENING-2026-11.md`.

Cross-references: `AUDIT-SEALED-BINARY-MIGRATION-2026-10-12.md`,
`AUDIT-DEPLOY-TOOL-INVENTORY-2026-09-06.md`,
`AUDIT-SABOTAGE-PATTERN-REVIEW-2026-08-21.md`, `AUDIT-DEPS.md`,
`docs/audits/*`.

## Method

- Code review on the host. Read-only for the host filesystem.
- Root-only exploit claims are not tested on the host.
- Root-chain tests must run in a disposable QEMU guest.
- Uncommitted local changes are not deployed by this audit.

## Findings

### CRITICAL

**CI-01: The root deploy chain executes agent-writable code before any integrity check. UNVERIFIED (code path).**
- `Makefile:38`: `DEPLOY_ANSIBLE_PLAYBOOK := $(abspath ../../.boot-linux/bin/ansible-playbook)`.
  The target is an agent-owned symlink into `$WORKSPACE_ROOT/.boot-linux/...` (the agent's workspace).
- `Makefile:661-662`: `deploy-ci` runs `./scripts/run-deploy-ci`.
- `scripts/run-deploy-ci:38`: executes the playbook at `$1/res/ansible/deploy-ci.yml`.
- `res/ansible/deploy-ci.yml:17-24`: explicitly requires the source root to be a
  **non-root-owned writable checkout**.
- `res/ansible/deploy-ci.yml:40`: runs `source_root/scripts/deploy-ci` with `/bin/bash`.
- `scripts/deploy-ci`: fetches `origin/main` and later requires `HEAD == origin/main`.
  It does **not** require a clean worktree.
- Impact: an agent can modify `scripts/deploy-ci`, `res/ansible/deploy-ci.yml`, or the
  `ansible-playbook` target without committing. An operator running `sudo make deploy-ci`
  executes that agent content as root. The later `HEAD == origin/main` check still passes.
- Fix direction: deploy from a root-owned trust anchor. Refuse a dirty worktree.
  Verify the exact script and playbook contents against `origin/main` before exec.
  Use a root-owned or sealed ansible binary, never a checkout symlink.
  Run the deployment from a root-owned clone or a pre-staged sealed runner.
- Test: reproduce in QEMU as root with a modified uncommitted script. Expect refusal.

**CI-02: `sudo make lock-repo` also executes an agent-writable checkout script as root. UNVERIFIED (code path).**
- `Makefile:231-235`: `lock-repo` runs `scripts/lock-repo` from the checkout, then
  `$(CI_DIR)/scripts/reinstall-hooks`.
- `scripts/lock-repo` is agent-writable source.
- Impact: same root-execution class as CI-01 for the policy-locking path.
- Fix direction: invoke a sealed, root-owned `lock-repo` from `/opt/workspace-ci`, or verify
  the checkout script hash against the deployed artifact before exec.
- Test: modify the uncommitted script in a QEMU guest; expect refusal.

### Initial mitigation 2026-11-20

Implemented:
- `scripts/run-deploy-ci` refuses a source root that is not a real directory,
  is not a Git worktree, or has any tracked/untracked/staged changes. The
  refusal runs before the ansible playbook or any source script is executed.
- `Makefile` uses the sealed
  `/opt/workspace-ci/.boot-linux/bin/ansible-playbook`, never a checkout
  `.boot-linux` symlink.
- `make lock-repo` uses the sealed `/opt/workspace-ci/scripts/lock-repo`, not
  the checkout copy.
- Tests added/updated: `tests/unit/test_run_deploy_ci.sh` covers the clean
  happy path, failure handling, interruption, and dirty-worktree refusal.

Verified in a QEMU guest:
- `tests/unit/test_run_deploy_ci.sh`: PASS.
- `tests/unit/test_deploy_ci_rev.sh`: PASS.

Residual:
- The bootstrap gap remains. A modified `run-deploy-ci` can skip its own
  dirty check. The first trusted deploy still needs an operator-reviewed
  launcher. After that, the sealed artifact carries the check.
- The root-owned trust anchor described below is still required.

### Proposed fix for CI-01/CI-02

The deploy path has a bootstrapping problem: any check placed only in the
agent-writable checkout has already executed before it can verify itself.

Proposed trust anchor:
1. A root-owned launcher holds the verification policy.
2. The launcher refuses a dirty worktree, including untracked files.
3. It requires `HEAD == origin/main` after a fetch.
4. It hashes every security-critical path against `HEAD` before execution:
   `scripts/run-deploy-ci`, `scripts/deploy-ci`, `res/ansible/deploy-ci.yml`,
   candidate namespace scripts, `scripts/verify-immutable*`, `scripts/lock-repo`,
   hook generation scripts, `lib/checks.sh`, and the policy catalogs.
5. It uses a root-owned ansible binary from `/opt/workspace-ci`, never a
   checkout symlink.
6. Only then does it execute the reviewed source script.
7. `lock-repo` uses the same launcher and checks.

The first such launcher must be reviewed and installed by the operator from a
known-good copy. Later versions can ship inside the sealed CI artifact.

This is documented, not implemented. It needs operator approval and a QEMU
test that proves dirty-tree and hash-mismatch refusal before execution.

### HIGH

**CI-03: Policy locking falls back to ownership-only without failing. UNVERIFIED (code path).**
- `scripts/lock-repo`: when `chattr` is unavailable or fails, it logs a warning and
  continues with ownership-only locking.
- The current guard loans `CAP_DAC_OVERRIDE` to git, so root ownership alone does not stop
  a git-side rewrite of policy files.
- Impact: on filesystems without immutable support, locked policy catalogs are writable
  through guarded git.
- Fix direction: fail closed when immutable locking is required and unavailable. Do not
  continue with a weaker posture.
- Note: the GUARD fix (HG-01) removes the DAC override, but locking must still fail closed.

**CI-04: CI has no QEMU end-to-end coverage. VERIFIED (infra review).**
- The guest mounts the host's sealed `/opt/workspace-ci` over 9p.
- CI source changes and `deploy-ci` are never exercised in a guest.
- Impact: a broken or malicious deploy path stays invisible to the authoritative e2e.
- Fix direction: add a QEMU test that deploys CI inside the guest and runs the hook suite.
  This needs new root-repo e2e infrastructure.

### MEDIUM

**CI-05: `generate-hooks` reads the consumer's `.pre-commit-config.yaml` while running as root. UNVERIFIED.**
- `scripts/generate-hooks` defaults `_config=".pre-commit-config.yaml"` relative to the
  caller's working directory.
- Registered entries render from the sealed registry. Custom entries remain verbatim,
  with validation.
- The generated hook re-execs as the repository owner, not root, which limits impact.
- Fix direction: pin the config path to the sealed artifact, or validate the consumer
  config against the reviewed tree before root generation. Confirm whether any custom
  entry can execute during generation.

**CI-06: Config override precedence is environment-sensitive. UNVERIFIED.**
- `lib/ci_config_paths.sh`: `CI_CONFIG_PATH_{STEM}` wins over the sealed default.
- `lib/checks.sh:10-15` unsets overrides when the check library loads, and the generated
  hook unsets them before sourcing.
- Other entry points that source `ci.sh` directly may still honor an agent-set override.
- Fix direction: audit every entry point. Unset overrides at the trust boundary, not only
  in `checks.sh`. Add a test that exercises each entry point with a hostile override.

### LOW / HYGIENE

**CI-07: Documentation and code drift in deployment notes. UNVERIFIED.**
- Confirm every documented deploy invariant matches the current scripts.

## QEMU e2e findings (root repo)

**E2E-4: No guest coverage of CI source, `deploy-ci`, or hook installation.** Same as CI-04.

**E2E-5: Guest mounts the host sealed artifact.** CI changes on the host are invisible to
the guest test, so the test validates the host deployment, not the source.

## Preliminary conclusions

- The root deploy trust anchor is the highest-risk area. It is agent-writable by design.
- The hook trust boundary has explicit environment clearing and owner re-exec. That is good,
  but entry points outside `checks.sh` need review.
- Policy locking depends on immutable support. It must fail closed.
- CI needs its own QEMU e2e before any host redeploy.

## Remediation plan (Phase II)

1. Add failing QEMU tests for CI-01..CI-04 before changing code.
2. Fix the root deploy trust anchor:
   - refuse a dirty worktree;
   - verify script and playbook hashes against `origin/main`;
   - execute from a root-owned or sealed runner;
   - use a root-owned ansible binary.
3. Fix `lock-repo` the same way. Fail closed when immutable locking is unavailable.
4. Audit every config-override entry point. Clear overrides at the trust boundary.
5. Pin `generate-hooks` input to the reviewed tree or sealed artifact.
6. Add guest-side CI deployment and hook e2e coverage.
7. Run the full CI test suite, shell tests, and the QEMU suites three times.
8. Prepare the host redeploy only after all gates pass. Operator runs it.

## Open items

- Reproduce CI-01 and CI-02 in a QEMU guest as root.
- Audit all `ci.sh` entry points for config overrides.
- Audit `generate-hooks` custom-entry handling end to end.
- Review `ci/*.py` checkers and `scripts/install-system-deps`.
- Review exemption manifest resolution and `config/required_hooks.yaml`.
- Confirm deploy rollback steps and evidence requirements.
