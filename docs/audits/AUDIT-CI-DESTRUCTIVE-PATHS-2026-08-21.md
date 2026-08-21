# WORKSPACE-CI Destructive-Path Audit

**Date:** 2026-08-21
**Scope:** Every command in WORKSPACE-CI (tracked source at `674ed08`) that
can delete files, directories, containers, volumes, tables, databases, users,
or host state.
**Method:** Pattern scan (`rm -[a-zA-Z]*[rR]`, `rm -f`, `volume rm`,
`down -v`, `DROP TABLE`, `truncate`, `chattr`, `dpkg-divert`, `filter-branch`,
`mv -T`) across `Makefile`, `scripts/`, `lib/`, `ci/`, `res/ansible/`, tests,
and container files, followed by manual review of every hit in context.

## Inventory

### Bounded temporary or build-artifact cleanup (no persistent data)

| Location | Operation | Classification |
| --- | --- | --- |
| `Makefile:480-481` | `rm -rf build/ dist/ ./*.egg-info`, `__pycache__` sweep | Build artifacts inside the repo only |
| `web/Makefile:199,203`, `web-components/Makefile:30`, `hitl/web/Makefile:30` | `rm -rf .next node_modules coverage` | Package-local build artifacts |
| `web/Containerfile:22,69` | `rm -rf /var/lib/apt/lists/*` | Inside transient container image build |
| `scripts/bootstrap-{uv,npm,moon,osv-scanner,gitleaks,cloc,rust}` | `trap rm -rf "$tmp"` on self-created `mktemp -d` | Own temp dirs, exit-trap scoped |
| `scripts/code-stats` | `trap rm -rf "$_tmpdir"` | Own temp dir |
| `lib/guard-install.sh:408` | `rm -rf "$tmpdir"` | Self-created temp dir |
| `tests/**` and `tests/test_helpers.sh` | `rm -rf "$TEST_TMP"`, mock dirs | Self-created test temp dirs |

### Deliberate deployment lifecycle operations (root-owned, fixed paths)

| Location | Operation | Classification |
| --- | --- | --- |
| `scripts/deploy-ci:34,38` | `chattr +i/-i` over candidate/deployed trees | Immutable sealing of `/opt/workspace-ci` and `/opt/.workspace-ci.candidate` only; `+i` protects data, `-i` is a prerequisite to publish and is immediately resealed |
| `scripts/deploy-ci:166,170` | `rm -f "$inventory"` | Single self-created verification inventory temp file |
| `scripts/deploy-ci:173,179-180` | `mv -T` candidate/deployed/old rename | Atomic publication of the CI artifact; the displaced old artifact is removed only after the new one is live. No Gateway or user data is reachable |
| `scripts/bootstrap-workspace-guard` (uninstall/rollback) | `rm -f /usr/bin/git`, `dpkg-divert --remove`, restore from `git.original`/`git.distrib` | Host git-guard removal; exact fixed paths, restores stock git, preserves provision state under `/usr/lib/workspace-guard` |
| `scripts/bootstrap-workspace-guard:87-94` | `rm -f` two apt-conf sidecars; `rm -rf /usr/lib/ami-git-guard`, `/var/log/workspace-guard`, `/var/log/ami-git-guard` | Guard's own sidecar/log dirs; exact fixed paths, no workspace or Gateway data |
| `scripts/bootstrap-workspace-guard:169` | `rm -rf /usr/lib/workspace-guard` | Only on rollback of a failed install when the guard helper is unavailable; guard state only |

### Admin-gated history tooling

| Location | Operation | Classification |
| --- | --- | --- |
| `scripts/rewrite-history` | `git filter-branch` via real git, `rm -rf "$_GIT_TMPBIN"` temp PATH directory entry | Requires `WORKSPACE_GUARD_ADMIN=1`; dry-run by default; always creates a backup ref before rewriting; the temp entry is exit-trap scoped |

## Findings

1. No command in WORKSPACE-CI deletes containers, volumes, databases, tables,
   or database users. No `podman volume rm`, `compose down -v`, `DROP`, or
   `TRUNCATE` exists in executable source; remaining textual occurrences are
   documentation in this repo's TODO/audit records.
2. Every `rm -rf` is either exit-trap scoped to a self-created temp
   directory, a package-local build-artifact clean, or an exact fixed
   guard-owned path. No glob, variable-from-environment, or recursive delete
   touches anything outside the acting script's own artifacts.
3. Host-state mutation (`chattr`, `dpkg-divert`, `/usr/bin/git` replacement)
   is confined to `scripts/deploy-ci` and `scripts/bootstrap-workspace-guard`,
   both root-owned deployment-lifecycle tools with fixed path constants.
4. `scripts/rewrite-history` is the only history-mutating tool; it is
   admin-gated, dry-run by default, and creates a backup ref.
5. The displacement-removal in `deploy-ci` (`mv -T` chain plus guarded
   previous-artifact removal) targets only the previous CI artifact
   directory; a failure between the two renames is covered by the existing
   post-publication cleanup TODO (displaced artifact removal), which remains
   open in `docs/TODO-REMEDIATION.md`.

## Boundary

This audit covers WORKSPACE-CI only. WORKSPACE-GATEWAY and WORKSPACE-GUARD
inventories are tracked separately in `docs/TODO-REMEDIATION.md` and remain
open.
