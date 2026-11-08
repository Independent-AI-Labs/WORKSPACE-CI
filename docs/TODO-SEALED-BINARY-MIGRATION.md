# TODO: Sealed-Binary Migration

**Date:** 2026-10-12
**Audit:** [AUDIT-SEALED-BINARY-MIGRATION-2026-10-12](audits/AUDIT-SEALED-BINARY-MIGRATION-2026-10-12.md)
**Status:** In progress

## Target state

One root-owned sealed tree, `/usr/lib/workspace-guard/sealed/`:

```text
/usr/lib/workspace-guard/sealed/<basename>       frozen real binary the guard execs
/usr/lib/workspace-guard/sealed/pkg/<basename>   dpkg-divert target for package upgrades
```

Directory `0700 root:root`, frozen binaries `0700 root:root` + `chattr +i`.
No `real-` prefix, no `.real`, no `.original`, no `.distrib` anywhere. Every
guard resolves its real binary through one shared constant; nothing builds the
path at runtime.

## Ordering rule

Source migration lands **before** detection. Adding the banned-word rules
while the old names still exist makes every commit fail. Detection is the last
source step, immediately before the cutover.

---

## Phase 1 - WORKSPACE-GUARD (anchor)

### 1.1 Shared constant
- [x] Add one shared module for the sealed path, used by `src/shell_guard`,
      `src/binary_guard`, and `git-guard` (`sealed_paths.rs`, `include!`d;
      also `scripts/lib/sealed-paths.sh` for the host scripts).
- [x] `src/shell_guard/main.rs` `REAL_SHELL` -> `SEALED_BASH`.
- [x] `git-guard/src/main.rs` `GIT_ORIGINAL_PATH` -> sealed path; update
      `git-guard/src/exec.rs` literals.
- [x] `src/binary_guard/main.rs` drop `format!("{}.real", ...)`; use
      `sealed_path(<basename>)`.

### 1.2 Installers / uninstallers / checkers
- [x] `scripts/install-shell-guard`: create `sealed/`, place frozen bash,
      divert target to `sealed/pkg/`, migrate an existing `.real`/`.distrib`
      on reconcile, remove old names.
- [x] `scripts/uninstall-shell-guard`: restore from the sealed tree.
- [x] `scripts/shell-guard-check`: verify the sealed paths.
- [x] Git guard Rust source (`WORKSPACE-GUARD/git-guard/src/*`) uses sealed
      `sealed/git` (messages + tests). The CI `lib/guard-*.sh` /
      `bootstrap-workspace-guard` sealed-path edits (2026-10-12) are
      **superseded** by audit section 10 and will be dropped; the installer
      moves into WORKSPACE-GUARD (Phase 2.1). **Design note:** `/usr/lib/git-core/git`
      is a distinct apt file with the same basename as `/usr/bin/git`; its
      package slot is `sealed/pkg/git-core/git` because two
      `dpkg-divert --divert` entries cannot share a target. See the audit
      decision 5.
- [x] `scripts/install-lock-runtime` and `scripts/uninstall-lock-runtime`:
      `<path>.real` -> `sealed/<basename>`, `<path>.distrib` ->
      `sealed/pkg/<basename>`.
- [x] `scripts/suid-drift-check`, `scripts/lib/binary-lock-yaml.sh`.
- [x] `scripts/check-guard-host-exec-readonly` (sealed git paths).
- [ ] `scripts/sync-gtfobins`, `scripts/guard-operator.sh` git paths.
- [ ] `res/suid-baseline.yaml`, `res/binary-lock.yaml`: drop `.distrib` names.

### 1.3 Tests
- [x] `tests/shell/05-binary-lock-yaml.bats`, `06-install-lock.bats`,
      `07-uninstall-lock.bats`, `21-shell-guard.bats`,
      `22-shell-guard-install.bats`, `lib/harness.bash` (sealed helpers).
- [x] `tests/shell/19-guard-operator-makefile.bats` assertions.
- [ ] Delete/replace `tests/shell/28-real-shell-invocation.bats` (Phase 4).
- [ ] `tests/shell/27-exempt-registry.bats` sealed sweep.
- [ ] `scripts/podman/run-shell-tests-in-container.sh:10-11`,
      `Containerfile.test:25`.

### 1.4 Policy and docs
- [ ] `config/shell_guard_policy.yaml` + matrix: add a rule for sealed/real
      paths (command + script scope).
- [ ] `src/shell_guard/main.rs` root exemption path (line 445) documented
      against the sealed tree.
- [ ] Specs/requirements/README/OPERATOR: `REQ-SHELL-GUARD`, `REQ-SANDBOX`
      (`REQ-LCK-*`), `REQ-GIT-GUARD` (`REQ-GGUARD-002/005/147/150/162`),
      `REQUIREMENTS.md`, `SPEC-SHELL-GUARD`, `SPEC-GIT-GUARD*`, `SPEC-SANDBOX`,
      `SPEC-PODMAN-TESTING`, `ROOT-ONLY-MODE.md`, `README.md`.

---

## Phase 2 - WORKSPACE-CI (drops guard installation entirely)

Decision 2026-10-12 (audit section 10): WORKSPACE-GUARD owns every host guard.
CI keeps only the `/opt/workspace-ci` deploy, the podman bundle extraction, and
the contract checks the git guard calls.

### 2.1 Move the git installer into GUARD (do first, in Phase 1)
- [x] Created `WORKSPACE-GUARD/scripts/install-git-guard` (+
      `scripts/lib/guard-{build,drift,host-exec,install,pam}.sh`) from the CI
      kit. It takes `CI_DIR` for the Rust toolchain only; the install logic is
      local. Sources resolve `$_SCRIPT_DIR/lib`.
- [x] GUARD Makefile git targets call the local scripts
      (`scripts/guard-root-exec scripts/install-git-guard ...`), no longer
      `/opt/workspace-ci/scripts/bootstrap-workspace-guard`.
- [x] `guard-root-exec` now exports `SHG_SCRIPT_PATH` so a staged installer
      resolves its real repo root.
- [x] `check-guard-host-exec-readonly` is the single git checker.
- [x] `tests/shell/19` updated to the new wiring; `make test-shell` 445/445.

### 2.2 Podman becomes a binary_guard entry
- [x] New non-root policy kind: `PolicyKind::ArgValidateAllUsers`
      (`src/binary_guard/policy_types.rs`, `main.rs`) + build.rs mapping
      `arg-validate-all`. Same reject validation as `arg-validate` but
      non-root invocations are allowed. Unit tests added; `cargo clippy
      --features binary-guard -D warnings` + `cargo test` green.
- [x] Generator fix: `scripts/lib/binary-lock-yaml.sh` now emits each matched
      rule's `reject_patterns` block verbatim into `res/binary-lock.yaml`
      (previously always `reject_patterns: []`; build.rs reads the lock, not
       the catalog, so sudo's CVE rejects were unenforced and unlogged). Tests in
      `tests/shell/05-binary-lock-yaml.bats` (`make test-shell` 448/448).
- [x] Extras mechanism: `res/binary-lock-extras.yaml` lists guarded binaries
      outside GTFOBins/live surface (podman). Folded in only when the catalog
      has an explicit name rule (else skipped with a warning, to avoid the
      deny-all catch-all locking agents out).
- [x] Staged catalog rule: `config-staging/binary_guard_policy_rules.podman-rule.yaml`
      (bare mapping, for `make yaml-add-block KEY=rules BLOCK=...`).
- [x] Generator precedence fix: an explicit `name:` rule now wins over tag/
      `"*"` catch-alls regardless of position, so `add-block`'s append lands
      before the catch-all semantically. Test in `05-binary-lock-yaml.bats`
      (`make test-shell` 454/454).
- [ ] **Operator (root):** `sudo /tmp/opencode/install-podman-guard.sh`
      (step 1 = `make yaml-add-block`; step 2 = `sync-gtfobins` with
      `BINARY_LOCK_EXTRA_PATHS=podman=<entrypoint>` + `build-binary-guard`;
      step 3 = `install-lock`).
- [ ] Install path: seal the real podman (`sealed/podman`) and install the
      binary guard at the podman entrypoint (boot-dir `bin/podman`; the
       `/usr/local/bin/podman` wrapper is root-only quadlet plumbing). Decide
      dedicated installer vs extending install-lock with an extras path source.
- [ ] Delete `res/podman-guard`; drop `tests/unit/test_podman_guard.py`.
- [ ] `scripts/bootstrap-podman`: stop creating `real-podman`, stop copying a
       guard, stop writing the wrapper; only extract the podman bundle.
- [ ] Delete `scripts/deploy-ci:230-241` (the `/usr/local/bin/podman` wrapper).
- **Do NOT remove the bash podman wrapper until the podman lock row exists**;
      without a baked policy the guard fails closed (exit 127) and agents lose
      podman. Sequence: operator inserts rule → regenerate → build → install,
      then delete the wrapper.

### 2.3 Delete the CI guard installer
- [x] Removed `lib/guard-{build,install,host-exec,drift,pam}.sh`,
      `scripts/bootstrap-workspace-guard`, `tests/unit/test_guard_build.sh`.
- [x] Removed the CI Makefile guard targets; `moon.yml` `build-guard` task;
      `tests/run_tests_unit.sh` entry; `checks_commit.sh` security regex.
- [x] Repointed GUARD `tests/shell/15`,`18` to source
      `$GUARD_ROOT/scripts/lib/guard-*.sh`. `make test-shell` 445/445, CI
      `make test-shell` and `make test-python` (821 passed) green.
- [ ] **Operator (root-owned files):** remove the `bootstrap-workspace-guard`
      entry from `scripts/manifest.yaml` (lines 65-76) and the
       `test_guard_build.sh` row from the swallow-exceptions policy
      (~line 130). Regenerated `web/src/data/script-sources.json` drops the
      entry but `make extract-script-sources` warns until the manifest is fixed.
- [ ] Commit needs `Deletion-Review:` lines for each deleted path (the
      deployed `/opt/workspace-ci` still references them).

### 2.4 Delete bypass automation
- [x] Delete `scripts/rewrite-history` and every reference (done 2026-09-27;
      file and its test are absent from `git ls-files`).
- [ ] `scripts/podman/e2e-policy-matrix.sh:88-93`: seed a non-git dummy.
- [x] DONE 2026-11-08: `WORKSPACE-GUARD/docs/OPERATOR.md` recovery recipe now
      names the sealed shell path, not `/bin/bash.real`.

### 2.5 Consumers and callers
- [x] `WORKSPACE-GUARD/scripts/guard-operator.sh`: dropped unused `CI_ROOT`.
- [ ] `WORKSPACE-GUARD/Makefile:477` and
      `scripts/podman/run-shell-tests.sh:10`: use plain `podman` (blocked on 2.2).
- [ ] `WORKSPACE-GATEWAY/tests/config/yaml_helpers.sh:18-21`,
      `tests/test_migrate_opencode_stats.sh:60-63`: use plain `podman` (blocked on 2.2).
- [ ] `git ls-files` sweep for `git.original`, `real-podman`, `real-git`,
      `.distrib` across CI docs; update or delete.

---

## Phase 3 - Consumer repositories

- [ ] `WORKSPACE-VM` root: `workspace/scripts/utils/git-guard`,
      `workspace/scripts/utils/git-status-all`,
      `workspace/scripts/utils/podman-guard` - delete or repoint.
- [ ] `WORKSPACE-GATEWAY`: `tests/config/yaml_helpers.sh:18,53`,
      `tests/test_migrate_opencode_stats.sh`.
- [ ] `RUST-ZK-PORTAL`: `res/ansible/dev.yml:60-62`.
- [ ] Sweep every repo under `projects/` for the tokens.

---

## Phase 4 - Detection (last)

- [ ] `config/banned_words.yaml`: rules for `git.original`, `bash.real`,
      `bash.original`, `podman.original`, `real-podman`, `real-git`, `sudo.real`,
      and `.distrib`. Exhaustive allowlist only (constant-definition file +
      doc-classified audit/spec/requirement files); no glob, no `.*`.
- [ ] Filename rules for the `real-` prefix and `.real` / `.original` /
      `.distrib` suffixes.
- [ ] `lib/check_resolution_shapes.py`: detect probes, links, copies,
      assignments in conditions, nested `if`/`elif`, runtime path construction.
- [ ] Replace `WORKSPACE-GUARD/tests/shell/28-real-shell-invocation.bats` with a
      sealed-path detector over all tracked non-doc files; allowlist exactly the
      constant-definition file.
- [ ] `tests/unit/test_bootstrap_rust.py:14`: widen the scan set beyond
      `Makefile`, `web/Containerfile`, `scripts/*` to include `templates/`.
- [ ] Scaffold test: generated consumer Makefile contains none of the tokens.
- [ ] Shell-guard policy rule tests.
- [ ] Regenerate exemption file + embedded hook/script sources.

---

## Phase 5 - Cutover (operator)

- [ ] Prepare + review `/tmp/opencode/migrate-sealed-binaries.sh`.
- [ ] Deploy CI (`make deploy-ci`) at the reviewed commit.
- [ ] Reinstall shell guard, git guard, binary lock (migrates binaries).
- [ ] Reinstall hooks in every consumer repo.
- [ ] Verify: `check-guard-host-exec-readonly`, `shell-guard-check`,
       `suid-drift-check`, `check-exec-policy`, basic check as the agent.
- [ ] Rollback path: `uninstall-*` targets restore stock bytes.

---

## Phase 6 - Close

- [ ] `make check` green; shot-battery / consumer gates green.
- [ ] Mark `AUDIT-SEALED-BINARY-MIGRATION-2026-10-12` remediated.
- [ ] Delete this TODO (or fold remaining items into `docs/TODO-REMEDIATION.md`).