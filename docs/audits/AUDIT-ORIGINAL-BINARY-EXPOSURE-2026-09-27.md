# Audit: Guard Original-Binary Exposure

| Field  | Value                                                                   |
| ------ | ----------------------------------------------------------------------- |
| Date   | 2026-09-27                                                              |
| Scope  | Repositories under `projects/` plus the WORKSPACE-VM root               |
| Method | Read-only source scan; no files were changed while collecting findings   |
| Status | Open                                                                    |
| Owner  | workspace-ci                                                            |

## 1. Summary

Guarded tools keep their relocated real binary under two different naming
schemes, and one of them is reachable by every user:

1. `git.original` and `bash.real` are root-owned `0700` sealed binaries.
   The guard resolves each through one hardcoded absolute path.
2. `real-podman` is a symlink created inside the agent-writable boot
   directory. The podman wrapper resolves it with a path derived from its
   own location, so the resolution breaks whenever the wrapper is staged
   through the shell guard. Authors then called the original binary
   directly, and `bootstrap-podman` documents that call as a supported
   bypass.

The shell guard knows the token `real-podman`, but its `podman-command`
rule is `scope: command`. Script bodies are not command scope, so a staged
script can call `real-podman` and the guard permits it. There is no rule at
all for `git.original` or `bash.real`.

The git side carries two direct bypasses plus two duplicate guard scripts,
and a checkout boot path that the workspace instructions forbid is still in
the tree.

## 2. Method

- `git ls-files` and recursive content search over every repository under
  the workspace root, with `.git`, `node_modules`, `target`,
  `.venv`, and `.boot-linux` excluded.
- Direct reads of each cited file and the surrounding function.
- No repository state was modified during collection.

## 3. Naming defect

### 3.1 Two conventions

| Current name              | Kind                              | Permissions            | Resolved by                    |
| ------------------------- | --------------------------------- | ---------------------- | ------------------------------ |
| `/usr/bin/git.original`   | relocated real git                | `0700 root:root`       | hardcoded absolute path        |
| `/bin/bash.real`          | relocated real bash               | `0700 root:root`       | hardcoded absolute path        |
| `.boot-linux/bin/real-podman` | relocated real podman         | symlink in agent-writable dir | path relative to the wrapper |
| `/usr/bin/git.distrib`    | apt-diverted stock git            | package-controlled     | `dpkg-divert`                  |
| `/usr/lib/git-core/git.distrib` | apt-diverted exec-path git  | `0700 root:root`       | `dpkg-divert`                  |

`git.original` uses the `.original` suffix; bash uses `.real`; podman uses
the `real-` prefix; apt uses `.distrib`. Four shapes for one idea.

### 3.2 Target convention

- Relocated real binary of a guarded tool: `<tool>.original`
  (`git.original`, `podman.original`, `bash.original`).
- Apt-diverted stock binary: `<tool>.distrib` (kept distinct so it cannot
  be confused with the guarded original, and never callable by a user).
- The `real-` prefix and the `.real` suffix are removed.
- Any other relocated stock tool follows the same suffix, for example
  `sudo.original` in place of `sudo.real`.
- Every guard resolves its original through one hardcoded absolute path,
  matching `git-guard/src/exec.rs:100` (`GIT_ORIGINAL`) and
  `src/shell_guard/main.rs:19` (`REAL_SHELL`).

## 4. Exposure findings

### 4.1 World-reachable original binary

`scripts/bootstrap-podman` links the real podman into the agent-writable
boot directory and copies the wrapper next to it:

| Location                                             | Effect                                             |
| ---------------------------------------------------- | -------------------------------------------------- |
| `WORKSPACE-CI/scripts/bootstrap-podman:75`           | `ln -sf ... real-podman` (macOS)                   |
| `WORKSPACE-CI/scripts/bootstrap-podman:298`          | `ln -sf ... real-podman` (Linux, `usr/local/bin`)  |
| `WORKSPACE-CI/scripts/bootstrap-podman:300`          | `ln -sf ... real-podman` (Linux, `bin`)            |
| `WORKSPACE-CI/scripts/bootstrap-podman:80`           | copies `res/podman-guard` to `.../bin/podman`      |
| `WORKSPACE-CI/scripts/bootstrap-podman:307`          | copies `res/podman-guard` to `.../bin/podman`      |

The symlink sits in a directory the agent owns, so any non-root user runs
the original podman directly. The wrapper is only a name in `PATH`.
`git.original` and `/bin/bash.real` are `0700 root:root`, so this exposure
is specific to podman.

### 4.2 Path-relative guard resolution

Both podman wrappers locate the original next to themselves:

| Location                                              | Code                                             |
| ----------------------------------------------------- | ------------------------------------------------ |
| `WORKSPACE-CI/res/podman-guard:7`                     | `PODMAN_REAL="$(dirname "$(readlink -f "$_SELF")")/real-podman"` |
| `WORKSPACE-VM/workspace/scripts/utils/podman-guard:15`| same expression                                  |

When the shell guard stages the wrapper through `/proc/self/fd/*`,
`readlink -f "$_SELF"` yields a staged path and the sibling lookup yields
`//real-podman`. This is the stated reason the GATEWAY and ZK-PORTAL
callers reached for the original binary.

### 4.3 Documented bypass

`WORKSPACE-CI/scripts/bootstrap-podman:463` prints, in the bootstrap
summary:

    Use real-podman to bypass (at your own risk)

The exposure in 4.1 is advertised to the user.

### 4.4 Probes of the original

| Location                                                       | Form                                  |
| -------------------------------------------------------------- | ------------------------------------- |
| `WORKSPACE-CI/scripts/bootstrap-podman:113`                    | `"${VENV_DIR}/bin/real-podman" --version` |
| `WORKSPACE-CI/scripts/bootstrap-podman:414-417`                | same, labelled "direct check"         |
| `WORKSPACE-GATEWAY/tests/config/yaml_helpers.sh:18`            | `[ -x .../real-podman ]`              |
| `WORKSPACE-GATEWAY/tests/test_migrate_opencode_stats.sh:58,60` | `[ -x .../real-podman ]` and `command -v` |
| `WORKSPACE-GUARD/Makefile:434`                                 | `command -v real-podman`              |

Each probe prefers or tests the original binary before the wrapper.

### 4.5 Direct invocation of the original

| Location                                                              | Note                                   |
| --------------------------------------------------------------------- | -------------------------------------- |
| `WORKSPACE-GUARD/scripts/podman/run-shell-tests.sh:10,16,17,31`       | pinned to `real-podman`                |
| `WORKSPACE-GUARD/Makefile:434,437`                                    | `sync-gtfobins-linux` runs the original |
| `WORKSPACE-GATEWAY/tests/config/yaml_helpers.sh:53`                   | runs `$PODMAN_BIN` (original)          |
| `WORKSPACE-GATEWAY/tests/test_migrate_opencode_stats.sh:87,97,100,112,115,125,135` | runs `$PODMAN_BIN` (original) |
| `RUST-ZK-PORTAL/res/ansible/dev.yml:60-62`                            | links the original onto a local `PATH` |

The GATEWAY comment at `tests/config/yaml_helpers.sh:14-16` states the
reason: the wrapper resolves the original relative to `$0` and fails under
a file-descriptor harness, so the test selects the boot runtime directly.
The ZK-PORTAL comment at `res/ansible/dev.yml:51-55` states the same reason
for ansible shell tasks.

### 4.6 Git-side bypasses

| Location                                                  | Form                                                    |
| --------------------------------------------------------- | ------------------------------------------------------- |
| `WORKSPACE-CI/scripts/rewrite-history:40-59`              | selects the original git and prepends it to `PATH`      |
| `WORKSPACE-VM/workspace/scripts/utils/git-guard:18`       | `GIT_REAL="/usr/bin/git.original"` then `exec`          |
| `WORKSPACE-VM/workspace/scripts/utils/git-status-all:70-77` | `real-git` sibling, then `command -v git`            |
| `WORKSPACE-GUARD/scripts/podman/e2e-host-exec.sh:150`     | executes `/usr/bin/git.original --version` as the agent |
| `WORKSPACE-GUARD/scripts/podman/e2e-policy-matrix.sh:88-92` | copies `git.original` onto `/usr/local/bin/git`       |

`rewrite-history:34-35` states that it prepends the real git directory so
that every git call bypasses the guard, because `filter-branch` needs
`--force` which the guard blocks. `e2e-host-exec.sh:150` proves the
negative by attempting the execution; a mode or inode assertion would prove
the same fact without running the binary.

### 4.7 Duplicate guards

| Canonical                                     | Duplicate                                              |
| --------------------------------------------- | ------------------------------------------------------ |
| `WORKSPACE-CI/res/podman-guard`               | `WORKSPACE-VM/workspace/scripts/utils/podman-guard`    |
| `WORKSPACE-GUARD/git-guard/` (Rust)           | `WORKSPACE-VM/workspace/scripts/utils/git-guard` (bash)|

The bash `git-guard` is the predecessor of the Rust guard. It is also a
required workspace marker, so deleting it also changes the Rust guard's
workspace detection (`git-guard/src/exec.rs:392`, `git-guard/src/wsroot.rs`,
`git-guard/src/exec_tests.rs:321`).

### 4.8 Forbidden checkout boot path

`WORKSPACE-VM/workspace/scripts/bootstrap/bootstrap_playwright.sh:49`
selects `${PROJECT_ROOT}/projects/WORKSPACE-CI/.boot-macos/bin/uv`, a
checkout boot directory that the workspace instructions mark as
FORBIDDEN LEGACY (items removed; not to be recreated). The sibling branch
at line 51 uses the deployed path.

### 4.9 Shell-check coverage gap

`ci_check_portable_shell` inspects only `/opt/workspace-ci/lib` and
`/opt/workspace-ci/scripts`. Scripts inside a consumer tree are not
inspected, so a portability violation committed in a consumer is not
caught by that check.

## 5. Shell-guard gap

`WORKSPACE-GUARD/config/shell_guard_policy.yaml` matches command or script
text against a pattern table. Relevant facts:

- `podman-command` (line 71-74) matches `(real-)?podman` but is
  `scope: command`, so it does not apply to staged script bodies.
- There is no entry for `git.original`, `bash.real`, or `.distrib` paths.

Consequence: an agent command line calling `real-podman` is blocked, but a
script that calls `real-podman` runs. The GATEWAY and GUARD test scripts are
exactly that case.

## 6. Scanner coverage gaps

`WORKSPACE-CI/lib/check_fallback_resolution.py` detects several
competing-source shapes but misses:

| Gap                                                            | Example                                                     |
| -------------------------------------------------------------- | ----------------------------------------------------------- |
| Assignment inside a condition                                  | `WORKSPACE-VM/workspace/scripts/utils/git-status-all:71-73` |
| Nested `if`/`elif` chains                                      | `WORKSPACE-GATEWAY/tests/config/yaml_helpers.sh:17-25`      |
| Probe, link, or copy of an original binary                     | `bootstrap-podman`, `yaml_helpers.sh`, `dev.yml`            |

The scanner also has no notion of an original-binary token.

## 7. Inventory by repository

| Repository            | Original-binary finding                                                                 | Bypass | Duplicate |
| --------------------- | --------------------------------------------------------------------------------------- | ------ | --------- |
| WORKSPACE-CI          | `bootstrap-podman` links and probes `real-podman`; `res/podman-guard` resolves it       | `rewrite-history` | wrapper duplicated in VM |
| WORKSPACE-GUARD       | `run-shell-tests.sh` and `Makefile` run `real-podman`; e2e executes `git.original`      | e2e exec | bash `git-guard` superseded by Rust |
| WORKSPACE-GATEWAY     | `tests/config/yaml_helpers.sh`, `tests/test_migrate_opencode_stats.sh` run `real-podman` | yes    | no        |
| WORKSPACE-VM (root)   | `podman-guard`, `git-guard`, `git-status-all`; checkout `.boot-macos` path               | yes    | both wrappers |
| RUST-ZK-PORTAL        | `res/ansible/dev.yml` links `real-podman` onto `PATH`                                    | yes    | no        |
| RUST-ZK-COMPLIANCE-API| documentation reference only                                                            | no     | no        |

## 8. Risk

- A non-root user runs the real podman with no wrapper supervision. The
  destructive-operation blocks in the wrapper are bypassed by name.
- Scripts in CI and GUARD use the same bypass, so the guarded path is not
  exercised where it matters most.
- The bypass is documented in the bootstrap output, so the exposure is
  discoverable and expected.
- Git history rewrite has a standing bypass script in the authority
  repository.

## 9. Required changes

Ordered. Every item below also appears in the session task list.

### 9.1 CI automation and hooks (first)

1. Add banned-word rules for `git.original`, `podman.original`,
   `bash.original`, `real-podman`, `real-git`, `bash.real`, `sudo.real`,
   and `*.(distrib)`, with path-scoped exemptions for the guard source and
   installation specifications.
2. Add filename rules for the `real-` prefix and the `.real` suffix.
3. Extend `check_fallback_resolution.py` to detect probes, links, and
   copies of original binaries.
4. Extend `check_fallback_resolution.py` to detect assignments inside
   conditions and nested `if`/`elif` chains.
5. Add `shell_guard_policy` rules for original-binary paths in both command
   and script scope.
6. Enforce that every original binary is `root:root 0700` and never
   world-executable.
7. Regenerate the exemption file and the embedded hook and script sources.
8. Add unit tests for each new rule and detector.

### 9.2 Naming unification

9. `bootstrap-podman` creates `podman.original` as `root:root 0700`.
10. `res/podman-guard` and `workspace/scripts/utils/podman-guard` resolve
    `podman.original` through one hardcoded absolute path; keep one copy.
11. `WORKSPACE-GUARD/scripts/podman/*` use `podman.original`.
12. The shell guard renames `/bin/bash.real` to `/bin/bash.original`
    (Rust constant, install, uninstall, check, Makefile template, tests).
13. GATEWAY tests use the wrapper or a fixed `podman.original` path.
14. ZK-PORTAL ansible stops linking the original onto `PATH`.
15. `Containerfile.test` uses `bash.original`.
16. Update the specifications and requirements to the `.original`
    convention.

### 9.3 Remove bypasses

17. Delete `scripts/rewrite-history` and every reference.
18. Replace the `e2e-host-exec.sh` execution with a mode or inode
    assertion.
19. Delete `workspace/scripts/utils/git-guard` and refactor workspace-root
    detection onto a root-owned record (section 11).
20. Delete or repoint `workspace/scripts/utils/git-status-all`.
21. Delete the duplicate podman wrapper.

### 9.4 Remove competing-source resolution

22. GATEWAY nested resolvers.
23. `bootstrap_playwright.sh` checkout boot path.
24. Any further violation the new scanners surface in featured
    repositories.

### 9.5 Podman guard hardening

25. Make `podman.original` `root:root 0700` and give the podman wrapper
    the capability loan used by the git and bash guards, so a non-root user
    runs podman only through the wrapper.

### 9.6 Verify

26. Commit and push CI, deploy `/opt/workspace-ci`, re-run the featured
    consumer gates.

### 9.7 Operational state and queue

Repository state the fixes above must carry or clear:

| Item                | State                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| `WORKSPACE-CI`      | clean at `844e28e`; the hardening is not committed                                                        |
| `WORKSPACE-GUARD`   | clean at `6726a9d`, pushed                                                                                |
| `WORKSPACE-VM`      | `8ed86b1` pushed; `config/required_hooks.yaml` deleted but uncommitted; `web/public/embed/workspace-capabilities.html` pending |
| `WORKSPACE-GATEWAY` | `fa0bf3b` ahead of origin by 1, not pushed                                                                |
| `WORKSPACE-DIAGRAM` | `ed9598d`, no remote                                                                                      |
| `/opt/workspace-ci` | sealed at `844e28e`; the hardening is not deployed                                                        |
| Guard host-exec     | installed and healthy                                                                                     |

Root and operator operations required after the source fixes land:

1. Install the reworked guard so every original is `root:root 0700` and the
   podman wrapper holds the capability loan.
2. Reinstall the shell guard after the `bash.original` rename.
3. `make deploy-ci` from the reviewed commit.
4. Re-run the featured consumer gates.

## 10. Decisions (resolved 2026-09-27)

1. `bash.real` is renamed to `bash.original` in full: Rust constant,
   install, uninstall, check, Makefile template, `Containerfile.test`,
   and tests. Requires a shell-guard uninstall and reinstall with root.
2. The `.distrib` suffix stays for apt-diverted stock binaries. Only the
   `real-` prefix and the `.real` suffix become `.original`.
3. `scripts/rewrite-history` is deleted outright, with every reference.
   History rewriting becomes a root-only procedure with no repository
   script.
4. The workspace-root markers are removed by refactor, not by editing the
   marker list (section 12). The marker mechanism is the defect: identity
   inferred from agent-writable tree contents.
5. The naming and cleanup work applies to all thirteen repositories now.

## 11. Workspace-root detection refactor

The defect: `wsroot.rs` decides "is this inside the workspace" by testing
for `WORKSPACE_MARKERS` (`config/shared_paths.yaml:22`), which today are
`.boot-linux` and `workspace/scripts/utils/git-guard`. Both live in the
agent-writable tree. The second is the superseded bash guard that finding
4.6 names as a bypass, so the guard's own identity test requires the
existence of a bypass file. A partial match is treated as tampering and
fails closed, so deleting the bypass file also makes the guard mistrust
the workspace.

The refactor: stop inferring workspace identity from tree contents. The
install records the canonical workspace root in a root-owned, immutable
location next to the guard, and detection reads that record:

```text
record: /usr/lib/workspace-guard/workspace-root   (root:root 0644)
```

`classify_workspace_root(toplevel)` returns `Full(record)` when `toplevel`
is the record path or a descendant, and `None` otherwise. The `Partial`
state and the tamper-fail-closed path disappear, because a record that is
absent or unreadable is simply "not a workspace", and the record itself
cannot be forged by the agent. This removes `WORKSPACE_MARKERS` from
`build.rs`, `wsroot.rs`, `exec.rs`, `gitdir.rs`, `reconcile.rs`, the
config schema, and the tests.

Impact on the bypass removal:
- `workspace/scripts/utils/git-guard` can be deleted; nothing depends on
  it for identity.
- `scripts/install-guard-host-exec` writes the record (`0644 root:root`);
  the drift check verifies it against `WORKSPACE_ROOT`; the uninstall
  removes it.
- `config/shared_paths.yaml` and its schema drop `workspace_markers`.

## 12. Note on this document

Once item 9.1 adds the original-binary tokens to the banned-word catalog,
this document references those tokens and will need a path-scoped
exemption, or it should be deleted after the remediation lands.
