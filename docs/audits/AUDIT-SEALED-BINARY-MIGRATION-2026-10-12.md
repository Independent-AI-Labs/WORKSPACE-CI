# Audit: Sealed-Binary Directory Migration (One Sealed Directory, All Repos) of 2026-10-12

**Date:** 2026-10-12
**Auditor:** workspace-agent (opencode)
**Status:** Open - direction and ownership target recorded. Supersedes
the naming decision of
[`AUDIT-ORIGINAL-BINARY-EXPOSURE-2026-09-27.md`](AUDIT-ORIGINAL-BINARY-EXPOSURE-2026-09-27.md)
section 10 item 1 and item 2, and section 9.2.

## Scope and Method

Every guarded tool in the workspace keeps a copy of its real binary next to,
or derived from, the wrapper that replaces it. This audit inventories those
copies, the names they carry, and the calls that reach them. Evidence is
read-only static inspection across all repositories under `projects/` plus
the WORKSPACE-VM working tree:

- Content search for the four naming schemes (`.original`, `.real`,
  `real-`, `.distrib`) and for runtime path construction.
- Direct reads of each wrapper, installer, checker, guard source constant,
  and every cited caller.
- No repository state was modified while collecting findings.

The session began from an operator report that the scaffold and Makefile
generation still emit `bash.real`, and that no CI gate catches it.

## Summary

The finding is one naming-and-placement defect with a wide blast radius, and a
second defect: the calls that reach the real binaries are written so a text
scanner does not see them.

| # | Defect | Class | Severity |
| --- | --- | --- | --- |
| B1 | Four naming schemes for one idea, each with a hidden copy left behind | Naming / placement | High |
| B2 | Relocated real binaries are reachable by non-root or live in agent-writable paths | Exposure | Critical |
| B3 | Real binaries are invoked through variables, runtime `format!`, PATH prepends, and `printf`-written wrappers that no scanner matches | Hidden calls | High |
| B4 | No CI gate knows the real-binary tokens: no banned-word rule, no filename rule, no shell-guard rule outside command scope | Detection gap | High |
| B5 | The one detector test matches only literal `exec|sudo ... bash.real` | Detection gap | High |
| B6 | `scripts/rewrite-history` was standing automation whose only purpose was to bypass the git guard | Automation that must not exist | High (closed 2026-09-27) |
| B7 | Host guards are installed by two repositories with duplicated builder/installer/checker code, and podman has three launchers plus a stray copy | Redundancy / ownership | High |
| B8 | Root guard installs run from the agent-writable WORKSPACE-GUARD checkout, and a guard install depends on the CI artifact that the guard gates | Trust-boundary crossing | Critical |

## 1. Naming defect (B1)

One idea - "the frozen real binary the guard execs" - carries four names, and
each naming scheme also leaves a second, package-managed copy behind:

| Guard | Frozen real binary | Second copy | Kind | Resolved by |
| --- | --- | --- | --- | --- |
| Git (Rust) | `/usr/bin/git.original` | `/usr/bin/git.distrib`, `/usr/lib/git-core/git.distrib` | frozen copy + apt-divert target | hardcoded constant |
| Shell (Rust) | `/bin/bash.real` | `<bash>.distrib`, `/bin/sh.distrib` | frozen copy + apt-divert target | hardcoded constant |
| Binary lock (Rust) | `<path>.real` | `<path>.distrib` (8 SUID programs) | frozen copy + apt-divert target | runtime `format!("{}.real", ...)` |
| Podman (bash) | `.boot-linux/bin/real-podman` | - | symlink to the boot runtime, agent-writable dir | path relative to the wrapper |

`.original` for git, `.real` for the shell and the lock, `real-` for podman,
`.distrib` for the package-manager slots. The `.distrib` names have also leaked
into `res/suid-baseline.yaml` and `res/binary-lock.yaml`.

## 2. Exposure defect (B2)

- `real-podman` is a `0755` symlink in the agent-writable `.boot-linux/bin`,
  and `.boot-linux/bin/podman` is a `0755` bash wrapper. Any user runs the
  real podman directly; the wrapper is only a name earlier on `PATH`. The
  bootstrap summary advertises the bypass (`scripts/bootstrap-podman:463`,
  "Use real-podman to bypass (at your own risk)").
- `git.original` and `/bin/bash.real` are `0700 root:root`, so they are not
  world-reachable, but the placement is unrelated per tool (`/usr/bin` vs
  `/bin` vs `.boot-linux`).

## 3. Hidden-call defect (B3)

The calls that reach the real binaries are written so a naive text search does
not match them.

| Location | What it does | How it hides |
| --- | --- | --- |
| `WORKSPACE-GUARD/tests/shell/lib/harness.bash:258-268`, called at `:301` | When run as root it writes a fake `bash` with `#!/bin/bash.real`, `exec /bin/bash.real`, and prepends it to `PATH`; every `sudo make test-shell` then runs the unguarded shell | path in a variable, script written by `printf` from a template |
| `WORKSPACE-GUARD/scripts/podman/e2e-policy-matrix.sh:88-93` | Copies the real git onto `/usr/local/bin/git`; the `cp` second path drops mode-000 until `chmod` runs | labelled as test seeding, but it plants the unguarded git on `PATH` |
| `WORKSPACE-CI/scripts/deploy-ci:34,38` | `chattr "${2:-+i}"` / `chattr "$1"` | the `-i` flag arrives only as an argument, so the chattr-strip rule never sees it |
| `WORKSPACE-GUARD/src/binary_guard/main.rs:233,239` | Computes `<exe>.real` at runtime | the path is never a literal |
| `WORKSPACE-GUARD/docs/OPERATOR.md:82-86` | Walks the operator through `sudo /bin/bash.real /var/lib/workspace-guard/shg-repair` | a written bypass recipe |
| `WORKSPACE-CI/scripts/bootstrap-workspace-guard:41-197` | Runs `chattr -i` / `mv` directly on `git.original` / `git.distrib` | a second, out-of-band way to mutate the guard's binaries |
| `WORKSPACE-CI/scripts/rewrite-history:40-59` | Prepended the real git directory to `PATH` so `filter-branch` skips the guard | deleted 2026-09-27 (audit decision 3) |

Full caller inventory, by repository:

| Repository | Real-binary callers |
| --- | --- |
| WORKSPACE-CI | `scripts/bootstrap-podman:75,113,298,300,414-417,463` (podman); `res/podman-guard:7` (podman); `scripts/bootstrap-workspace-guard` (git); `scripts/deploy-ci` (chattr) |
| WORKSPACE-GUARD | `src/binary_guard/main.rs` (lock); `git-guard/src/{main,exec}.rs` (git); `src/shell_guard/main.rs` (shell); `scripts/install-shell-guard`, `scripts/uninstall-shell-guard`, `scripts/shell-guard-check`; `scripts/podman/run-shell-tests.sh:10,16,17,31` (podman); `Makefile:434,437` (podman); `scripts/podman/e2e-host-exec.sh:150`, `e2e-policy-matrix.sh:88-93` (git); `tests/shell/lib/harness.bash` (shell) |
| WORKSPACE-VM (root) | `workspace/scripts/utils/git-guard:18` (git); `workspace/scripts/utils/git-status-all:70-77` (git); `workspace/scripts/utils/podman-guard:15` (podman) |
| WORKSPACE-GATEWAY | `tests/config/yaml_helpers.sh:18,53` (podman); `tests/test_migrate_opencode_stats.sh:58,60,87-135` (podman) |
| RUST-ZK-PORTAL | `res/ansible/dev.yml:60-62` links the real podman onto `PATH` |

## 4. Detection defect (B4, B5)

- `WORKSPACE-GUARD/tests/shell/28-real-shell-invocation.bats` matches only
  `(exec|sudo|nohup|env|command) <x>bash.real`. Nothing in section 3 matches.
- No banned-word rule exists for any real-binary token; the 09-27 audit
  section 9.1 proposed them and they were never added.
- `lib/check_resolution_shapes.py` has no notion of a real-binary token and
  misses probes, links, copies, assignments inside conditions, and nested
  `if`/`elif`.
- The shell guard's `podman-command` rule is `scope: command`, so a script body
  calling `real-podman` is permitted; there are no rules at all for
  `git.original`, `bash.real`, or any `.distrib` path.

## 5. Decided direction (2026-10-12)

Decisions taken by the operator this session:

1. **One sealed directory.** Every frozen real binary lives under one
   root-owned directory:
   `/usr/lib/workspace-guard/sealed/<basename>`. The `real-` prefix, the
   `.real` suffix, and the `.original` suffix are removed. The dpkg-divert
   target for package upgrades uses a `pkg/` subdirectory of the same sealed
   tree (`/usr/lib/workspace-guard/sealed/pkg/<basename>`), so role is
   distinguished by directory, not by a filename suffix, and `.distrib`
   disappears. The sealed tree is `0700 root:root`.
2. **All repositories.** The migration covers WORKSPACE-CI, WORKSPACE-GUARD,
   WORKSPACE-VM (root), WORKSPACE-GATEWAY, and RUST-ZK-PORTAL.
3. **No automation for history rewriting.** `scripts/rewrite-history` is
   deleted with every reference (already done 2026-09-27; audit decision 3).
   Rewriting history is an operator responsibility with no repository script.
4. **No path-scoped exemptions** for the real-binary tokens. Detection fails
   on any reference; the only allowlist entries are the single constant
   definition the guard needs and the doc-classified audit/specification
   files, listed exhaustively and reviewed.
5. **Distinct basenames need distinct package slots.** Two `dpkg-divert
   --divert` entries cannot share a target path. On this host `/usr/bin/git`
   (the guard) and `/usr/lib/git-core/git` (an apt file, a symlink to
   `/usr/bin/git`) share the basename `git`, so their package slots are
   `sealed/pkg/git` and `sealed/pkg/git-core/git` respectively. The frozen
   real binary remains the single `sealed/git`. This is a directed exception
   to the flat `sealed/pkg/<basename>` rule, keyed by source directory, and is
   recorded here rather than left implicit.
6. **Legacy-migration code is the one source allowlist.** The installers and
   checkers that *remove* the old names (`install-shell-guard`,
   `uninstall-shell-guard`, `install-lock-runtime`, `uninstall-lock-runtime`,
   `shell-guard-check`) must name `.real` / `.distrib` to detect and migrate
   an existing install. These files, plus the single constant-definition
   file, are the exhaustive non-doc allowlist. No other source file may
   reference the tokens.

This supersedes section 10 items 1 and 2 and section 9.2 of the 09-27 audit
(the `<tool>.original` convention with `.distrib` retained). The 09-27 audit's
remaining decisions (workspace-root record refactor, duplicate-guard removal,
podman capability loan, its section 9.4-9.7) still stand and are carried by
reference.

## 6. Migration plan

Ordered; guard first, then CI, then consumers, then detection.

1. **Shared constant.** Define the sealed path in one place
   (`/usr/lib/workspace-guard/sealed/<basename>`) and have all three Rust
   guards read it instead of their own constants or runtime `format!`.
2. **Installers.** `install-shell-guard`, the git installation, and
   `install-lock-runtime` create the sealed tree (`0700 root:root`), place the
   frozen copy at `sealed/<basename>`, `chattr +i` it, and point `dpkg-divert
   --divert` at `sealed/pkg/<basename>`. Reconcile moves any existing
   `.original` / `.real` / `.distrib` file into the sealed tree and removes
   the old names.
3. **Podman.** `bootstrap-podman` places the real podman at
   `sealed/podman` (`0700 root:root`), copies the wrapper to
   `.boot-linux/bin/podman`, and stops creating the `real-podman` symlink.
   The wrapper resolves `sealed/podman` through the shared constant and takes
   the capability loan (09-27 section 9.5) so a non-root user runs podman only
   through the wrapper. The summary bypass line is removed.
4. **Checkers and data.** `shell-guard-check`, `suid-drift-check`,
   `binary-lock-yaml.sh`, `check-guard-host-exec-readonly`, and the drift
   check verify `sealed/<basename>`; `res/suid-baseline.yaml` and
   `res/binary-lock.yaml` drop `.distrib` names.
5. **Remove hidden calls.** Delete `_stock_bash_override`. Replace the e2e
   git seeding with a non-git dummy. Make `deploy-ci`'s `chattr` flags
   literal. Remove the `OPERATOR.md` bypass recipe. Delete
   `bootstrap-workspace-guard`'s direct mutations of the guard's binaries
   (that work stays with the guard's installer). Delete `rewrite-history` and
   every reference. Delete or repoint the duplicate
   `workspace/scripts/utils/{git-guard,podman-guard,git-status-all}`.
6. **Consumers.** GATEWAY tests stop probing and running the real podman;
   use the wrapper or the sealed path only in a root-owned context.
   RUST-ZK-PORTAL ansible stops linking the real podman onto `PATH`.

## 7. Detection plan

1. Add banned-word rules in WORKSPACE-CI for `git.original`, `bash.real`,
   `bash.original`, `podman.original`, `real-podman`, `real-git`, `sudo.real`,
   and `.distrib`, with an exhaustive allowlist of the constant-definition
   file and doc-classified audit/specification files. No glob and no
   `.*` wildcard.
2. Add filename rules for the `real-` prefix and the `.real` / `.original` /
   `.distrib` suffixes.
3. Extend `lib/check_resolution_shapes.py` to detect probes, links, copies,
   assignments inside conditions, nested `if`/`elif`, and runtime path
   construction for real-binary tokens.
4. Replace `tests/shell/28-real-shell-invocation.bats` with a check over all
   tracked non-doc files in both repositories for every sealed-path form:
   the removed suffixes, the `sealed/` path, and runtime construction. Its
   allowlist names exactly the constant-definition file.
5. Add a shell-guard policy rule for real-binary paths in both command and
   script scope.
6. Add a scaffold test asserting the generated consumer Makefile contains
   none of the tokens.
7. Add unit tests for each new rule and detector.

## 8. Redundancy and ownership defect (B7)

Extending the audit to the question "who owns a host guard's install" exposes
that the four host guards are not installed the same way, and that the same
install is written more than once.

Who installs what:

| Host guard | Rust code | Built by | Installed by | Make targets |
| --- | --- | --- | --- | --- |
| Shell (`/bin/bash`, `/bin/sh`) | GUARD `src/shell_guard` | GUARD | GUARD `scripts/install-shell-guard` | GUARD only |
| Binary lock (SUID) | GUARD `src/binary_guard` | GUARD | GUARD `scripts/install-lock-runtime` | GUARD only |
| Git | GUARD `git-guard/` | **CI** `lib/guard-build.sh` | **CI** `lib/guard-install.sh`, `guard-host-exec.sh`, `guard-drift.sh`, `scripts/bootstrap-workspace-guard` | **both** |
| Podman | none (bash) | - | **CI** `bootstrap-podman`, `deploy-ci` | CI |

Redundancies:

1. Git targets are defined twice: CI Makefile:657-677 and GUARD
   Makefile:310-375. The GUARD copies shell out to CI's
   `bootstrap-workspace-guard`. `install-guard` and `check-guard` "REMOVED"
    removed-target notes exist in both.
2. Two git health checkers: CI's `bootstrap-workspace-guard check-host-exec`
   (via `guard-drift.sh`) and GUARD `scripts/check-guard-host-exec-readonly`.
   They assert the same paths, modes, diversions and capabilities.
3. Two build paths for git-guard: CI `lib/guard-build.sh` runs cargo inside the
   GUARD tree; GUARD `build` / `build-host-stack` also build it.
4. Two sealing implementations: CI `guard-install.sh` + `bootstrap-workspace-guard`
   rollback, versus GUARD `install-shell-guard` / `install-lock-runtime` with
   `lib/sealed-paths.sh`. The sealed-path constant now exists three times
   (`sealed_paths.rs`, GUARD `scripts/lib/sealed-paths.sh`, and the CI
   `guard-host-exec.sh` constants added 2026-10-12).
5. Podman has three launchers plus a stray copy: `res/podman-guard`; the
    `real-podman` symlink; the `/usr/local/bin/podman` wrapper written by
   `deploy-ci:230-241` and `bootstrap-podman:339`; and a duplicate
   `WORKSPACE-VM/workspace/scripts/utils/podman-guard`.
6. `guard-operator.sh` (`up|refresh|check|down`) reaches into
   `CI_ROOT=/opt/workspace-ci` for the git leg while the shell/lock legs are
   local.

## 9. Trust-boundary crossing defect (B8)

1. **CI runs root installs from the agent-writable checkout.** CI
   Makefile:643 sets `WORKSPACE_GUARD_ROOT ?= ../WORKSPACE-GUARD`, so
   `sudo make install-guard-host-exec` installs binaries built in a
   non-root-owned tree. GUARD's own root targets go through `guard-root-exec`
   and the planned `/opt/workspace-guard` deploy; the CI path bypasses both.
2. **A guard install depends on the artifact the guard gates.** GUARD
   Makefile:319,353,366 runs `/opt/workspace-ci/scripts/bootstrap-workspace-guard`,
   so installing the git guard depends on a CI deployment, while the git guard
   gates CI commits. This is a cycle: CI builds/installs the guard, the guard
   gates CI.
3. **CI builds another repository's privileged binary.** `lib/guard-build.sh`
   builds GUARD's privileged package and chowns GUARD `target/` trees back to
   `SUDO_USER`.
4. **`deploy-ci` writes a host binary outside `/opt/workspace-ci`**
   (`/usr/local/bin/podman`, deploy-ci:230-241), so CI's deploy doubles as a
   guard installer.
5. **Specs encode the crossing.** GUARD `REQ-PODMAN-TESTING`
   (REQ-POD-052/090) and `SPEC-PODMAN-TESTING:90,159-249` require
   `/opt/workspace-ci/scripts/bootstrap-workspace-guard`;
   `SPEC-PODMAN-TESTING:98` documents `real-podman` as a bypass.
6. **Test fixtures copy CI into the container** to install GUARD's own git
   guard (`scripts/podman/run-shell-tests-in-container.sh`).
7. **CI's security-control regex** (`lib/checks_commit.sh:261`) lists
   `lib/guard-*.sh` and `scripts/bootstrap-workspace-guard` as CI
   security controls, although that code belongs to GUARD.

## 10. Decided ownership target (2026-10-12)

Decision taken by the operator this session, resolving B7 and B8:

1. **WORKSPACE-GUARD owns every host guard** - build, install, uninstall,
   check, and the sealed paths - for the shell, git, binary-lock, and podman
   guards. All root targets run from `/opt/workspace-guard` through
   `guard-root-exec`. There is one sealed-path definition (`sealed_paths.rs`),
   the shell copy is `scripts/lib/sealed-paths.sh`, and a test enforces that the
   two agree.
2. **Git installation moves into GUARD** as `scripts/install-git-guard`,
   `scripts/uninstall-git-guard`, and `scripts/git-guard-check`, built on the
   same divert and sealing helpers as the shell guard and the binary lock.
   `check-guard-host-exec-readonly` becomes the single git checker.
3. **Podman becomes a `binary_guard` entry** with a deny-argv policy
   (`rm`/`rmi -a`, `system prune|migrate|reset`, `volume prune` and bulk `rm`,
   `image prune -a`, `container`/`network prune`). The real binary is sealed at
   `sealed/podman`; the guard is installed at `/usr/local/bin/podman` by
   `install-lock` from `res/binary-lock.yaml`. There is no separate podman
   wrapper script and no `real-podman` name.
4. **WORKSPACE-CI drops all guard installation.** Remove
   `lib/guard-{build,install,host-exec,drift,pam}.sh` and
   `scripts/bootstrap-workspace-guard` (with its tests); remove the CI Makefile
   guard targets; remove `res/podman-guard`; stop `bootstrap-podman` creating
   `real-podman` or copying a guard; delete `deploy-ci:230-241`; narrow the
   `checks_commit.sh:261` security regex. CI keeps only the deploy of
   `/opt/workspace-ci`, the podman bundle extraction, and the contract checks
   the git guard calls (REQ-GGUARD-083/103, unchanged).
5. **Callers use plain `podman`** on `PATH`: GUARD `Makefile:477` and
   `scripts/podman/run-shell-tests.sh:10`, and the WORKSPACE-GATEWAY tests.
   Delete `WORKSPACE-VM/workspace/scripts/utils/podman-guard`. `guard-operator.sh`
   loses `CI_ROOT`. Update the podman-testing REQ/SPEC.

Order of work:

1. Build the GUARD git installer and the podman `binary_guard` entry, with
   tests (`make test-shell` 445 plus new cases, cargo tests).
2. Delete the guard-install code and targets from CI.
3. Repoint callers and update specs.
4. Add the detection rules (section 7).
5. Operator cutover: deploy the GUARD tree, then `install-git-guard`,
   `install-shell-guard`, `install-lock`, then `deploy-ci`.

The in-flight edits made 2026-10-12 to CI `lib/guard-*.sh` and
`bootstrap-workspace-guard` (sealed-path rename only) are superseded by this
decision and will be dropped rather than shipped.

## 11. Operator and root steps

After the source fixes land:

1. Reinstall the reworked guard so every frozen real binary is
   `root:root 0700` under the sealed tree and the podman wrapper holds the
   capability loan.
2. Reinstall the shell guard after the move, then run `make deploy-ci` from
   the reviewed commit and re-run the featured consumer gates.

## 12. Note on this document

This document names the real-binary tokens in order to ban them. Once section
7.1 lands, it needs the doc-classified allowlist entry, or it should be deleted
after the migration lands.