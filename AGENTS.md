# WORKSPACE-CI Code

## Article I — Scope

§1. One installation of WORKSPACE-CI on one Linux machine.

§2. Lifecycle, in order: root-owned bootstrap; exact reviewed
   origin/main tree; verified candidate at
   `/opt/.workspace-ci.candidate`; atomic publication at
   `/opt/workspace-ci`; sealed artifact; protected hook
   installation.

§3. A failed or absent install is remedied only by rerunning
   `make deploy-ci` from reviewed source, or by deploying a prior
   sanctioned generation: `make deploy-ci REV=<commit>` where REV is
   a committed ancestor of origin/main (verified at deploy time).
   Reviewed-ancestor rollback restores healthy gates without
   rewriting history or mutating the working tree; see
   docs/decisions/DECISION-REVIEWED-ANCESTOR-ROLLBACK-2026-08-24.md.
   Recovery never falls back to unsealed source-tree gates.

## Article II — Trust Domains

| Path                           | Role                 | Control  |
| ------------------------------ | -------------------- | -------- |
| `projects/WORKSPACE-CI`        | CI source            | Agent    |
| `origin/main`                  | Source authority     | Upstream |
| `/opt/workspace-ci`            | Sealed artifact      | Root     |
| `/opt/.workspace-ci.candidate` | Deployment candidate | Root     |
| `projects/WORKSPACE-GUARD`     | Git/filesystem guard | Root     |

§4. `make deploy-ci` clones origin/main into the candidate, builds
   and verifies it with local `.boot-linux` tools in a private mount
   namespace, publishes atomically on the same filesystem, seals
   with `chattr +i`, then installs protected hooks as a separate
   operation. The current artifact never participates in candidate
   construction. Generated runtime paths are never rewritten.

§5. All mutations below `/opt` are prohibited. The artifact is not
   an editing target.

§6. Root ownership of paths in the working tree, including `.git/`
   metadata and `config/`, is the guard's designed state. It is not
   damage, not drift, and not reportable.

## Article III — Git Procedure

§7. All git invocations pass through the guard. No git operation is
   performed outside it.

§8. The commit flow is exactly one command: `git commit` with the
    message via `-F` file; the commit-msg gate requires a body. If
    nothing was staged, the pre-commit gate stages everything and
    fails with instructions; re-running the same command succeeds
    (git decides "anything to commit?" from its pre-hook index
    snapshot, proven against stock git 2.43, 2026-08-24).

§9. The pre-commit hook auto-stages anything left unstaged as a
    safety net and runs the gates. There is no other flow: no
    selective staging, no unstaging, no `restore` or `checkout` of
    paths, no snapshot maneuvers.

§10. A dirty tree rides the next commit as-is. Foreign or
    unexpected files in the tree are reported to the operator
    before any commit that would include them.

§11. A failing gate is never fought. Fix source and commit again.

§12. History is forward-only: no `--amend`, no `reset`, no
    force-push. `git stash` is prohibited; baselines use
    `git worktree add /tmp/wt-baseline HEAD`; snapshots use
    `git diff > /tmp/change.patch`.

§13. `.git/` metadata is never touched manually: no chown, no
    deletion, no rebuild. An unexpected git failure is reported to
    the operator, never repaired by the agent.

## Article IV — Policy Data

§14. Policy changes belong in source and activate only through a
    fresh reviewed installation.

§15. Existing files in root-owned `config/` are edited only
    through the secure interface: `sudo make -C
    ../WORKSPACE-GUARD yaml-set`, `yaml-add`, `yaml-remove`,
    `yaml-unset`, `yaml-remove-comment`, or `yaml-delete
    FILE=... EXPECT_SHA256=<digest>`. `sed -i`, redirection,
    `rm` plus `cp`, and ad hoc rewrites are prohibited. Deletion is
    single-file and requires a digest reviewed immediately before
    execution.

§16. A new policy file is created by the agent under
    `config-staging/`, then moved into `config/` by the operator
    with a single `mv` command, then committed as ordinary source.

## Article V — Root Operations

§17. Root operations are performed by the operator only. An
    operation with an existing Makefile target is requested by that
    target, never reimplemented. An operation expressible as one
    command is given as that command.

§18. A script in `/tmp/opencode/` is permitted only for a root
    operation that has no Makefile target and no one-command form.
    Such scripts are never committed and never become Makefile
    targets.

## Article VI — Validation

§19. Before changing this repository: `git status`.

§20. Run focused tests for changed code, then the relevant full
    gate. For module-size changes:
    `source lib/checks.sh && ci_check_module_size`.

§21. Gates are never satisfied by bypassing hooks or editing
    deployed files. Fix source, validate the clean-install path,
    and install only through the reviewed flow.

## Article VII — Hook Resolution

§22. `.pre-commit-config.yaml` is declarative hook input. Protected
    hooks resolve WORKSPACE-CI at `/opt/workspace-ci`. References to
    workspace-relative CI paths are corrected to `/opt/workspace-ci`
    whenever encountered.
