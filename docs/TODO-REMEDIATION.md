# Remediation TODO

**Status:** Active
**Rule:** Do not mark an item complete without recorded execution evidence.

Policy and exemption hardening is tracked separately in
`docs/TODO-POLICY-EXEMPTION-REMEDIATION.md`; both ledgers are mandatory for
completion.

## Fail-Open Gate Audit (2026-08-24; full-transcript evidence)

- [x] FO-1 coverage gate: pytest printed `FAIL Required test coverage of
      90% not reached` yet exited 0 (live-verified).       Root cause: the
      workspace-root pytest config runs the suite under xdist
      (`addopts = "-n 1"`, a documented interpreter-isolation
      necessity) and pytest-cov's `--cov-fail-under` exit code does
      not fire in the controller process under xdist. Every prior "green" check-push
      passed with the coverage threshold unenforced. Fix: Makefile
      `_test-push-impl` now enforces the threshold via
      `coverage report --fail-under=90` (coverage's own exit code);
      real unit coverage raised 89.0% -> 91% (8 new tool_catalog
      error-branch tests); `make _test-push-impl` rc=0 with 108 unit,
      100 integration, 91% enforced.
- [x] FO-2 dead-code gate contradiction: catalog said advisory
      ("always exits 0") while the rendered pre-push hook wrapped it
      blocking (`|| { ci_fail; exit 1; }`): unreachable code, gate
      theater. Ruling (operator 2026-08-24): non-failing by design.
      Fix: `advisory: true` in .pre-commit-config.yaml; awk parser and
      generate-hooks emit an rc-capturing wrapper that reports
      findings with ci_info and never exits 1.
- [x] FO-3 boot-layout audit: same contradiction, same ruling, same
      fix (advisory wrapper).
- [x] Blocking wrappers for all other hooks verified unchanged
      fail-closed (unit test asserts the blocking wrapper shape and
      the absence of a fail-closed wrapper for advisory entries).
- [x] Regenerate web/src/data/hook-sources.json after the generator
      change (`make extract-hook-sources`).
- [ ] After deploy: verify the rendered deployed hooks carry the
      advisory wrapper for check-dead-code and check-boot-venv-layout,
      and that an injected nonzero advisory exit is reported but does
      not fail the push (root/podman tier).
- [ ] Consider a periodic differential audit: every gate's printed
      verdict vs its propagated exit code (fail-open scanner), so a
      printed-FAIL/exited-0 divergence is caught by machine, not by
      incident.

## Reviewed-Ancestor Rollback (DECISION-REVIEWED-ANCESTOR-ROLLBACK-2026-08-24)

- [ ] Add `REV=<commit>` argument to `scripts/deploy-ci`; verify REV is a
      committed ancestor of fetched `origin/main` via
      `git merge-base --is-ancestor`; refuse anything else with a clear
      error.
- [ ] Construct the candidate at REV by fetching the rev from the source
      repository objects; never move the working checkout backwards.
- [ ] Replace the `HEAD == origin/main` precondition with
      `REV is an ancestor of origin/main`; with no REV given the target is
      the fetched `origin/main` tip (explicit, not a resolution chain).
- [ ] Pass `REV` through the Makefile `deploy-ci` target and
      `scripts/run-deploy-ci` wrapper.
- [ ] Preserve per-generation verification: candidate at REV runs that
      revision's own `check-push` in the namespace (no future-baseline
      retrojection; operator ruling 2026-08-24).
- [ ] Test: refuse non-ancestor REV, refuse REV not on main, refuse
      dirty-tree REV.
- [ ] Test (root/podman tier): happy-path deploy of a prior sanctioned
      rev restores healthy gates; subsequent ordinary deploy of fixed
      main supersedes it.
- [ ] Update SPEC-DEPLOYMENT and RUNBOOK-HOOKS with the REV flow and the
      deadlock-recovery sequence (rollback, fix through restored gates,
      redeploy main).

## Hook-Entry Integrity (deadlock prevention; 2026-08-24 portable_shell incident)

- [ ] Generation-time refusal: `scripts/generate-hooks` resolves every
      `config/required_hooks.yaml` `entry:` (shell: `declare -F` after
      sourcing `lib/checks.sh`; python: `python -m` import probe) before
      rendering; refuse to emit a hook with an unresolvable entry.
- [ ] Commit-time verification: `ci/check_required_hooks_present.py`
      verifies every catalog entry resolves in the sourced lib; a tree
      that drops a function while keeping its catalog entry cannot
      commit (runs in source pre-commit and in candidate `check-push`,
      hence also blocks deploy).
- [ ] Tests: entry-dropped-but-catalog-kept fails generation and the
      self-check; restored entry passes both.
- [ ] Root-cause record: the `a37d062`-era `lib/checks_files.sh` refactor
      dropped `ci_check_portable_shell` while `required_hooks.yaml:118`
      and `.pre-commit-config.yaml` kept it; the `000a754` deploy shipped
      the broken hook; every commit then failed at
      `check-portable-shell`. Function restored in tree 2026-08-24
      (pending commit); deployed copy still broken until the one-time
      unblock below.

## One-Time Deadlock Unblock (operator)

- [ ] Operator lands the staged working-tree fix (restored
      `ci_check_portable_shell` in `lib/checks_files.sh`, restored
      `tests/unit/test_deploy_ci.py`, message at
      `/tmp/opencode/pdf-msg.txt`) via root-path commit or `/opt`
      hand-patch, then `sudo make deploy-ci`.
- [ ] After the fix deploy: verify `check-portable-shell` resolves in
      `/opt/workspace-ci/lib/checks_files.sh` and a clean commit passes.

## Capability-Loss Restoration (AUDIT-CAPABILITY-LOSS-2026-08-23 backlog)

- [x] Restore `tests/test_rewrite_history.sh` with operator-context split
      (`014a524`; execute-path tests skip as agent, run as root/podman).
- [x] Restore `tests/unit/test_bootstrap_rust.py` with
      enter-candidate-namespace lockdown-assertion allowlist (`88587a6`).
- [x] Restore `tests/unit/test_podman_guard.py` unchanged (`3e09957`).
- [ ] Restore `tests/unit/test_deploy_ci.py` reconciled to the
      namespace-runner build architecture (staged in tree; blocked on the
      one-time unblock).
- [ ] Restore `tests/integration/test_dependency_checker_integration.py`.
- [ ] Restore `scripts/cleanup-precommit` as a documented operator-only
      tool plus its traps test (GATEWAY consumer was removed with the
      `clean-precommit` target).
- [ ] Restore the scaffold-ci subsystem (`scripts/scaffold-ci`,
      `lib/scaffold_lib.sh`, `lib/scaffold_analyze.sh`) deleted in
      `f7422dc`; consumer scaffolding vacuum was filled by the stale
      `../CI` clone when GATEWAY's config was regenerated 2026-08-22.
- [ ] Write `docs/audits/AUDIT-CAPABILITY-LOSS-2026-08-23.md`: systematic
      old `projects/CI` vs new tree differential; classify every
      divergence superseded / dead-reference / dropped-capability.
- [ ] Root-cause record: the rewritten-history rewriter's guard bypass
      (PATH prepend to real git) is doubly defeated as agent (shell-guard
      PATH normalization; `git.original` 0700 root); document the tool as
      operator-only.

## Pre-Commit Index-Snapshot Semantics (2026-08-24 finding)

- [x] `ci_check_unstaged` fails explicitly with instructions when nothing
      was pre-staged; retry succeeds by design (`000a754`; proven against
      stock git 2.43, 30/30 scratch trials with real git).
- [x] AGENTS.md §8 documents the one deliberate retry; §9 documents the
      auto-stage as a safety net.
- [ ] Verify the deployed `000a754`+ artifact shows the explicit
      pre-stage failure message (observed once live; keep as evidence).

## Immediate Safety

- [x] Remove the pre-existing `gw-clean` target and every `compose down -v` path.
- [x] Remove the invalid `gw-reset-clickhouse` target and per-container removal tasks.
- [x] Ensure `res/scripts/repair-clickhouse-tmp-merges.sh` is absent from both index and worktree.
- [x] Verify no Gateway command can delete all named volumes.
- [x] Do not run `gw-clean`, Compose `down -v`, `podman volume rm docker_clickhouse-data`, or direct ClickHouse filesystem deletion.
- [ ] Reconcile the partially changed live Gateway state: service stopped, APISIX container absent, ClickHouse volume still present.
- [ ] Independently review every proposed live mutation before execution.

## Destructive-Path Audit

- [ ] Inventory every command in WORKSPACE-GATEWAY that can delete containers, volumes, tables, databases, users, or host state.
- [x] Inventory every command in WORKSPACE-CI that can delete containers, volumes, tables, databases, users, or host state (`docs/audits/AUDIT-CI-DESTRUCTIVE-PATHS-2026-08-21.md`).
- [ ] Inventory every command in WORKSPACE-GUARD that can delete containers, volumes, tables, databases, users, or host state.
- [x] Distinguish bounded temporary-file cleanup from persistent-data destruction (WORKSPACE-CI scoped; see the 2026-08-21 CI destructive-path audit).
- [ ] Remove unneeded persistent-data destruction mechanisms.
- [x] Remove Gateway whole-volume clean and ClickHouse-volume reset mechanisms.
- [x] Remove Guard state-purge and operator reset implementations from executable source.
- [ ] Remove stale `purge-guard-state` policy-manifest and generated-data entries through guarded policy editing.
- [ ] Review Guard uninstall paths separately from removed state-purge paths.
- [ ] Review history-rewrite execution and backup-ref behavior.
- [ ] Review bootstrap replacement cleanup to ensure it cannot target persistent runtime data.
- [ ] Require exact object scope and explicit confirmation for every justified destructive operation.
- [ ] Add tests proving protected persistent data cannot be deleted through ordinary lifecycle targets.
- [ ] Document the final destructive-operation inventory and ownership boundaries.

## ClickHouse Investigation

- [x] Map UUID `9f22ffe3-5d3d-49d6-833a-d9ddaa44f23a` to `system.metric_log`.
- [x] Determine that the table contains ClickHouse internal metrics history, not application data.
- [x] Record its `MergeTree` engine, monthly partitioning, and index-granularity setting; no TTL is present.
- [ ] Classify inode consumers as active parts, inactive parts, detached parts, mutation output, temporary inserts, or temporary merges.
- [x] Identify `system.metric_log` merge cleanup as the inode-exhaustion mechanism.
- [x] Attribute the inode growth to 10,699 `delete_tmp_tmp_merge_*` and 3,667 `tmp_merge_*` directory trees, commonly containing about 3,800 objects each.
- [x] Verify ClickHouse process state before recovery and confirm only ClickHouse is running afterward.
- [x] Start ClickHouse with ingestion disabled and allow ClickHouse-owned temporary-directory cleanup to complete.
- [x] Research ClickHouse recovery semantics identifying `tmp_` and `delete_tmp_` as startup-cleaned MergeTree temporary directories.
- [x] Add source configuration disabling `metric_log` and `asynchronous_metric_log` before recovery startup.
- [ ] Design a data-preserving recovery procedure.
- [ ] Prove the recovery procedure against an isolated copy or representative fixture.
- [ ] Obtain independent review before any ClickHouse data-directory mutation.
- [ ] Execute only an approved data-preserving recovery.
- [x] Verify application tables attach, query, and retain nonzero row counts after recovery.
- [x] Verify 54,234,547 free inodes are available for concurrent CI candidate construction.
- [ ] Record and monitor post-recovery inode usage through the full Gateway observation window.

## ClickHouse Prevention

- [ ] Review the proposed `parts_to_delay_insert` values.
- [ ] Review the proposed `parts_to_throw_insert` values.
- [ ] Review the proposed inactive-part limits.
- [x] Add `max_parts_in_total = 5000` to created and existing application tables.
- [x] Ensure settings apply to existing tables through idempotent `ALTER TABLE ... MODIFY SETTING` statements.
- [x] Verify all four application-table settings through running `system.tables.create_table_query`.
- [ ] Verify Vector batches request logs at the intended size and interval.
- [ ] Verify APISIX usage writes use functioning asynchronous inserts.
- [ ] Audit retry behavior for duplicate or unbounded inserts.
- [ ] Audit mutation scripts for retry loops and repeated failed mutations.
- [ ] Monitor active and inactive parts by table and partition.
- [ ] Monitor mutation failures, merge queue age, delayed inserts, rejected inserts, and asynchronous-insert queues.
- [ ] Resume ingestion only after ClickHouse remains stable during an observation window.

## CI Provisioner

- [x] Correct namespace and verifier helpers to resolve from the writable checkout.
- [x] Verify current `origin/main` does not contain or need the new repair helpers.
- [ ] Independently review the checkout-owned helper correction.
- [ ] Confirm no other repair-critical deployment code resolves through the candidate.
- [ ] Ensure the candidate contains only exact reviewed `origin/main` artifact input.
- [ ] Verify the current artifact is never read or executed before publication.
- [ ] Verify the private namespace exposes only the physical candidate at `/opt/workspace-ci`.
- [ ] Verify the host namespace retains its existing `/opt/workspace-ci` view during construction.
- [ ] Verify all generated runtime metadata uses `/opt/workspace-ci`.
- [ ] Reject candidate-path references without rewriting files or symlinks.
- [ ] Verify candidate and destination are on the same filesystem.
- [ ] Implement measured byte and inode capacity preflight.
- [ ] Derive capacity thresholds from a successful complete candidate build.
- [ ] Verify first installation uses atomic rename.
- [ ] Verify replacement uses atomic directory exchange.
- [ ] Fix post-publication cleanup so the displaced artifact is removed after every later failure.
- [ ] Verify no candidate or displaced tree remains after success or failure.
- [ ] Verify failure before publication leaves the current artifact untouched.
- [ ] Verify failure after publication leaves the new artifact current without rollback.

## CI Python Runtime

- [ ] Build `.venv` through logical `/opt/workspace-ci`.
- [ ] Verify `.venv/bin/python` resolves to an existing final-path interpreter.
- [ ] Verify `pyvenv.cfg` contains no candidate path.
- [ ] Verify all generated Python entrypoint shebangs contain no candidate path.
- [ ] Execute required imports inside the candidate namespace.
- [ ] Execute the published interpreter after atomic publication.
- [ ] Execute the runtime again after immutable sealing.

## CI Podman Runtime

- [ ] Prevent candidate construction from mutating live `~/.config/containers`.
- [x] Isolate candidate construction under private `HOME=/mnt/user` and bind its container configuration path directly to candidate storage.
- [ ] Prove in the root namespace test that writes through `$HOME/.config/containers` land in the candidate and leave the live home unchanged.
- [ ] Stage `containers.conf` and `registries.conf` inside the candidate.
- [ ] Ensure staged configuration contains only `/opt/workspace-ci` helper paths.
- [ ] Install user Podman configuration only after successful publication.
- [ ] Define failure behavior for post-publication user-configuration installation.
- [ ] Verify `podman`, `real-podman`, `conmon`, `crun`, `netavark`, and `aardvark-dns`.
- [ ] Verify Podman can list containers and networks after deployment.
- [ ] Verify no Podman configuration references `/opt/.workspace-ci.candidate`.
- [ ] Verify no Podman configuration references `projects/CI`.

## Protected Hooks

- [x] Stop `scripts/generate-hooks` from emitting direct `.venv/bin/python`.
- [x] Generate Python checks through deployed `uv` with explicit project and `--no-sync`.
- [x] Update hook-generator tests for the corrected invocation.
- [x] Update generated hook-source documentation and data (`bc6c0b0`, regenerated `web/src/data/hook-sources.json`).
- [x] Verify every protected pre-commit command after publication (commits `d956844`/`bc6c0b0` passed the full deployed hook chain against `/opt/workspace-ci`).
- [x] Verify commit-message hooks (observed failing closed on a missing body, then passing with one; coauthored/history checks exercised by the commit-msg hook suite).
- [x] Verify every protected pre-push command (push of `d956844` ran the full pre-push quality gate, blocked-pattern history scan, dead-code analysis, and offline OSV scan; all green).
- [ ] Verify hooks fail closed when `/opt/workspace-ci` is absent or unverifiable.
- [ ] Verify hook installation failure does not modify or unseal the artifact.
- [ ] Verify hook installation succeeds after the bootstrap deployment.

## CI Acceptance

- [ ] Test first installation with no deployed artifact.
- [ ] Test replacement of a healthy artifact.
- [ ] Test replacement of an unusable artifact.
- [ ] Test candidate-bound absolute symlink rejection.
- [ ] Test candidate-bound `pyvenv.cfg` rejection.
- [ ] Test candidate-bound shebang rejection.
- [ ] Test a runtime that works before rename but fails after rename.
- [ ] Test dangling symlink rejection after publication.
- [ ] Test every generated hook command after publication.
- [ ] Test execution after immutable sealing.
- [ ] Test pre-publication failure isolation.
- [ ] Test post-publication failure cleanup.
- [ ] Test host mount-namespace isolation.
- [ ] Run the root-only namespace integration test rather than reporting it skipped.
- [x] Run Ansible syntax validation.
- [x] Run focused Python deployment tests: 8 passed, 1 root-only case skipped.
- [x] Re-run the complete `make check-push` gate after the latest scanner, verifier, namespace, and deployment changes; exit 0 with 107 shell unit tests, 582/360/229/12 pytest suites, and all e2e integration tests passing (2026-08-20).
- [ ] Keep implementation status non-compliant until the live Linux acceptance run passes.

## CI Bootstrap Deployment

- [x] Recover enough inodes for candidate construction without deleting committed ClickHouse data; 54,234,547 free inodes were recorded before the deployment run.
- [x] Inventory deployment-path interpreter execution: eight `/usr/bin/python3` calls and two deployed-`uv` Python checks are currently reachable.
- [x] Remove system Python from `remove_candidate` immutable-attribute clearing in `scripts/deploy-ci`; replaced by native `seal_tree`/`attr_root` `chattr` operations, zero interpreter calls remain in `scripts/deploy-ci`.
- [x] Remove system Python from cleanup-time deployed-root resealing in `scripts/deploy-ci`; replaced by native `attr_root +i`.
- [x] Remove system Python from candidate-path metadata verification in `scripts/deploy-ci`; replaced by native `verify_candidate_paths` shell function (`grep -rlF`, `find -printf`).
- [x] Remove system Python from candidate descendant sealing in `scripts/deploy-ci`; replaced by native `seal_tree`.
- [x] Remove system Python from candidate-root unsealing in `scripts/deploy-ci`; replaced by native `attr_root -i`.
- [x] Remove system Python from deployed-root unsealing before atomic exchange in `scripts/deploy-ci`; replaced by native `attr_root -i` plus `mv -T` rename publication (same-filesystem rename is an allowed publication form).
- [x] Remove system Python from atomic directory exchange in `scripts/deploy-ci`; replaced by two `mv -T` renames with guarded previous-artifact removal.
- [x] Remove system Python from final deployed-root sealing in `scripts/deploy-ci`; replaced by native `attr_root +i`.
- [ ] Preserve the two deployed-`uv --project /opt/workspace-ci --no-sync python` runtime checks as hermetic final-artifact verification.
- [x] Identify why banned-word scanning missed system Python: blanket `python3?` exceptions cover all `.sh`/`.py` files and all `scripts/` paths.
- [ ] Remove blanket `python3?` exceptions for `.sh`, `.py`, and `scripts/` from banned-word policy.
- [ ] Replace blanket Python exceptions with exact path-scoped exceptions only for justified language detection, documentation, generated data, and bootstrap directory names.
- [ ] Complete the authoritative scanner and exemption items in `docs/TODO-POLICY-EXEMPTION-REMEDIATION.md`; do not duplicate their completion state here.
- [x] Add a policy-integrity test that rejects extension-wide or directory-wide exceptions for the deprecated-Python category (`tests/unit/test_policy_integrity.py`, 13 tests, wired as mandatory `check-policy-integrity` hook in `d956844`).
- [ ] Edit root-owned banned-word policy only through the guarded YAML interface and regenerate scanner documentation data.
- [x] Enable native Bash execution tracing in `scripts/deploy-ci` so commands appear when executed.
- [x] Keep deployment stdout and stderr directed to the actively tailed per-run log.
- [x] Remove custom `START`, `DONE`, periodic-counter, spinner, timer, and delayed-output mechanisms from the provisioning design.
- [x] Keep Make command echoing enabled and prohibit `@` suppression on deployment recipes.
- [x] Run `scripts/build-candidate.sh` Make invocations without silent flags so targets and commands appear when executed.
- [ ] Use native verbose modes for silent filesystem operations where they provide useful bounded output.
- [ ] Do not enable per-file output for recursive operations when it would emit an unbounded line for every artifact; expose the exact command when execution begins instead.
- [x] Remove the per-descendant `lsattr | awk | grep` immutable verification loop.
- [x] Delete the proposed Python immutable verifier and its Python tests.
- [x] Prohibit Python and other language runtimes from immutable descendant verification.
- [x] Create a native `find -print0` immutable-verification inventory that supports spaces, newlines, and other valid path bytes.
- [x] Measure the immutable-verification total with existing native tools before worker execution.
- [x] Verify immutable attributes with native `xargs -0` and batched `lsattr` calls.
- [x] Aggregate validation and progress with native `awk` under shell `pipefail`.
- [x] Add bounded `xargs -P` read-only verification parallelism with default four workers and `CI_DEPLOY_VERIFY_JOBS` override.
- [ ] Keep recursive ownership, mode mutation, and `chattr` mutation on native batched serial traversal until measurements justify parallel writes.
- [x] Replace per-path xtrace output with one real completed/total progress status owned by the bulk verifier.
- [x] Print individual paths only when immutable verification fails for those paths.
- [x] Fail deployment on a mutable path, malformed `lsattr` result, pipeline failure, or `xargs` worker failure.
- [x] Add tests for spaces, newlines, mutable descendants, worker failure, completed/total progress, final summary, and suppression of per-path success output; 105 shell unit tests pass.
- [ ] Measure serial and bounded-parallel immutable verification on the complete candidate and record elapsed time and worker count.
- [x] Keep Ansible task transitions visible through its normal callback output.
- [x] Tail the deployment log until Ansible exits and the final deployment log line has been emitted; focused wrapper test observes `final line` on success and failure.
- [x] Preserve Ansible's exact exit status through `scripts/run-deploy-ci`; focused wrapper test verifies status 17.
- [x] Terminate the Ansible child process when the operator wrapper is interrupted.
- [x] Remove the invalid `/dev/tty` dependency from Ansible module execution.
- [x] Remove every direct `bash.real` invocation from candidate namespace construction.
- [x] Preserve the shell guard's required root-owned mode-`0700` backing shell without invoking it directly from provisioning.
- [ ] Execute the root-only namespace test proving the candidate owner cannot execute `bash.real` and the host artifact view is unchanged.
- [x] Make `scripts/bootstrap-podman` honor `CONTAINERS_CONF_DIR`, create it, write both required configuration files, and verify both are nonempty before returning.
- [x] Verify candidate `containers.conf` and `registries.conf` immediately after bootstrap and again before candidate validation completes.
- [x] Extend `ci/verify_candidate_paths.py` to reject missing Podman configuration and candidate-path references in those files before publication.
- [ ] Add focused tests for Podman configuration generation in an explicit destination directory.
- [x] Add focused tests for missing and candidate-bound Podman configuration rejection; 26 focused tests pass with the silent-output catalog.
- [x] Add focused tests proving the deployment wrapper emits the final log line, preserves Ansible's exit status, retains failed-run diagnostics, terminates interrupted execution, and removes interrupted temporary logs.
- [x] Extend silent-output detection to reject delayed Ansible `register` plus `debug` replay while accepting a command that writes to an actively tailed log sink.
- [x] Add positive detector fixtures for actively tailed log sinks.
- [x] Add negative detector coverage for delayed debug replay and remove nominal stream-variable exemptions.
- [x] Run shell syntax checks, Ansible syntax validation, focused tests, banned-pattern checks, silent-output checks, module-size checks, and `make check-push`; the 2026-08-21 push of `d956844` passed the complete gate after the res/ansible output-surfacing rewrite.
- [ ] Diagnose and correct the failed candidate Podman configuration production independently of provisioning-output remediation.
- [x] Fail candidate construction before ownership changes, sealing, or publication when either required Podman configuration file is absent.
- [x] Replace shell-guard-blocked inline candidate build code with an explicit reviewed `.sh` provisioner script.
- [x] Replace shell-guard-blocked inline namespace setup with an explicit reviewed `.sh` provisioner script.
- [ ] Run `make deploy-ci` through the established root-owned execution path using the corrected writable provisioner.
- [ ] Rebuild current `origin/main` through logical `/opt/workspace-ci`.
- [ ] Verify the deployed commit remains exact current `origin/main`.
- [ ] Verify rebuilt Python, Podman, and hooks are functional.
- [ ] Verify ownership, modes, immutable attributes, and candidate cleanup.
- [x] Use repaired hooks to commit and push the permanent CI remediation (`d956844` and `bc6c0b0` pushed through the deployed pre-commit/pre-push gate).
- [ ] Redeploy the new exact `origin/main`.
- [ ] Repeat complete final-path and hook verification.

## Gateway Provisioning

- [x] Remove the invalid reset lifecycle implementation.
- [x] Remove the pre-existing all-volume clean lifecycle implementation.
- [ ] Keep Compose as the sole owner of Gateway container dependency ordering.
- [x] Ensure teardown operations preserve every named volume.
- [ ] Resolve CI tooling only through `/opt/workspace-ci`.
- [ ] Remove all runtime `projects/CI` references.
- [ ] Remove all runtime candidate-path references.
- [ ] Review Gateway Makefile changes mixed with earlier shell-guard work.
- [ ] Validate `res/ansible/compose.yml`.
- [ ] Validate `res/ansible/dev.yml`.
- [ ] Ensure status tasks use the selected absolute Podman runtime rather than bare `podman`.
- [ ] Ensure Compose commands receive the selected Podman path consistently.
- [ ] Ensure the systemd unit is regenerated only through Ansible.
- [ ] Ensure no deployed unit or Podman configuration is manually edited.

## Gateway Startup

- [ ] Define a recovery/start mode that starts ClickHouse without Vector or APISIX ingestion.
- [ ] Verify ClickHouse health and schema before starting writers.
- [ ] Start Vector only after ClickHouse acceptance.
- [ ] Start APISIX only after Vector and ClickHouse acceptance.
- [ ] Start and verify OpenBao, Prometheus, Grafana, and etcd.
- [ ] Ensure systemd cannot report successful startup while Compose is wedged.
- [ ] Ensure all required containers exist before reporting success.
- [ ] Ensure all required containers are running before reporting success.
- [ ] Add bounded startup and health timeouts.
- [ ] Verify failed startup exits nonzero and leaves an observable failure state.

## Gateway Deployment

- [ ] Review Gateway OAuth and plugin changes separately from incident-recovery changes.
- [ ] Review ClickHouse batching and schema changes.
- [ ] Run focused shell, Lua, config, and Ansible tests.
- [ ] Run the complete Gateway validation gate.
- [ ] Commit and push Gateway changes through repaired hooks.
- [ ] Run `make gw-deploy`.
- [ ] Recreate the missing APISIX container through Compose.
- [ ] Verify the generated user systemd unit references `/opt/workspace-ci`.
- [ ] Verify the complete stack starts through the user systemd unit.
- [ ] Run `make gw-status`.
- [ ] Run `make gw-verify`.
- [ ] Run the full Gateway test suite against the running stack.

## Gateway Live Verification

- [ ] Verify APISIX public and Admin endpoints.
- [ ] Verify ClickHouse HTTP and native endpoints.
- [ ] Verify Vector ingestion and ClickHouse sink health.
- [ ] Verify OpenBao health and unsealed state.
- [ ] Verify etcd health.
- [ ] Verify Prometheus readiness and scraping.
- [ ] Verify Grafana health and provisioned dashboards.
- [ ] Verify provider synchronization.
- [ ] Verify schema migrations.
- [ ] Verify no repeated merge or mutation failure.
- [ ] Verify no missing-helper or stale-path error.
- [ ] Verify no foreground Compose process remains wedged.
- [ ] Verify inode use remains bounded after traffic resumes.

## WORKSPACE-GUARD

- [ ] Review and commit the explicit `WORKSPACE_GUARD_ROOT` bootstrap change.
- [ ] Validate regenerated script-source data.
- [ ] Delete `config/system-deps.yaml.rep` only through the guarded YAML deletion interface with its reviewed digest.
- [ ] Investigate and safely clean leaked `hp-*` test accounts.
- [ ] Fix `tests/shell/17-host-provision-sudo.bats` cleanup so failed tests cannot leak users.
- [ ] Re-run Guard Rust and shell validation.
- [ ] Re-run protected integration checks after CI deployment.

## Documentation

- [ ] Independently review the remediation audit for unsupported claims.
- [ ] Correct the earlier deployment audit's claim that dirty-worktree tolerance alone resolves the commit deadlock.
- [ ] Align requirements, specification, decision record, runbook, and implementation.
- [ ] Document the writable-provisioner bootstrap boundary explicitly.
- [ ] Document Podman configuration publication behavior.
- [ ] Document post-publication cleanup behavior.
- [ ] Document data-preserving ClickHouse recovery only after it is proven.
- [ ] Remove reset and volume-deletion instructions.
- [ ] Record exact acceptance evidence and skipped cases.
- [ ] Do not mark implementation compliant until all mandatory live cases pass.

## Completion

- [ ] Every item above is either complete with evidence or explicitly rejected with rationale.
- [ ] WORKSPACE-CI is deployed from exact reviewed upstream and passes live acceptance.
- [ ] WORKSPACE-GATEWAY is deployed through established lifecycle mechanisms and passes live acceptance.
- [ ] ClickHouse committed data is preserved and inode use is stable.
- [ ] No ordinary target can destroy persistent Gateway volumes.
