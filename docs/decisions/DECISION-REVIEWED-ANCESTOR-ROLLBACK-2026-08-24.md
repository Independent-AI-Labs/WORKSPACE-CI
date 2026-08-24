# Decision: Reviewed-Ancestor Rollback Deployment

**Date:** 2026-08-24
**Status:** Accepted (operator directive 2026-08-24); implementation pending

## Context

The deployment lifecycle publishes a sealed artifact at `/opt/workspace-ci`
from exact reviewed `origin/main`. Article III §3 of AGENTS.md states that a
failed or absent install is remedied only by rerunning `make deploy-ci` from
reviewed source. On 2026-08-24 this remedy was proven insufficient: the
deployed artifact's `check-portable-shell` hook referenced a function
(`ci_check_portable_shell`) that had been dropped from
`/opt/workspace-ci/lib/checks_files.sh`, so every commit failed at that
gate. The commit carrying the fix could not land because the broken deployed
gate blocked it, and the deploy carrying the fix could not run because the
commit had not landed: a recovery-path deadlock. The artifact gates the very
commits that repair the artifact.

## Decision

`make deploy-ci` gains the ability to deploy any prior sanctioned
generation: `make deploy-ci REV=<commit>`, where `<commit>` is a committed
ancestor of `origin/main`. This enables every kind of rollback: deploy the
last-known-good reviewed generation, which restores healthy gates, through
which the fix commits normally, after which the fixed `origin/main` is
deployed in the ordinary way.

## Evidence and Justification

This is the pattern the immutable-OS industry converged on:

- rpm-ostree (Fedora CoreOS administrator handbook; Project Atomic
  documentation) retains the previous bootable deployment by default and
  supports `rpm-ostree deploy <version|commit>`, deploying an exact commit
  retrieved from the server-side reviewed history of the branch. Rollback to
  a known-good generation is a first-class routine operation, not an
  incident procedure.
- OSTree's atomic-upgrades design is built on atomic transitions between
  sealed, whole, verified generations; recovery re-points to a prior
  verified generation rather than rebuilding or hand-patching.
- CoreOS issue #811 records maintainer-endorsed generalization: deploy any
  historical reviewed commit (`rpm-ostree deploy X ... back to X`).
- Critically, none of these systems recover by reverting to untrusted,
  user-writable state. Every rollback target is a prior sealed generation
  that passed its own verification when it was current. An earlier proposal
  to execute source-tree gates when the artifact fails its self-check was
  rejected on exactly this ground: it would have been a sanctioned bypass
  executing unsealed agent-owned code as policy gates.

The reviewed-ancestor constraint preserves the trust model of Article II:
the deployable set is exactly the set of commits that passed review and
their own generation's gates. History remains forward-only (Article III
§12): rollback redeploys an immutable ancestor; it never rewrites anything.

## Binding Conditions

1. **Ancestry constraint.** `REV` must verify as an ancestor of fetched
   `origin/main` (`git merge-base --is-ancestor`). Arbitrary SHAs, dirty
   trees, and non-main commits are refused. This keeps the deployable set
   equal to the sanctioned set and prevents the feature becoming a
   sidechannel for unreviewed code into `/opt`.
2. **Working tree untouched.** The candidate is constructed by fetching the
   rev into the candidate from the source repository's objects; the working
   checkout is never moved backwards (§12 and the guard both forbid it).
   The current `HEAD == origin/main` precondition becomes
   `REV is an ancestor of origin/main`.
3. **Per-generation verification.** The candidate at `REV` runs that
   revision's own `check-push` inside the private namespace (unchanged
   behavior; `build-candidate.sh` already runs the candidate's own
   Makefile). A generation is validated by its own gates, matching OSTree's
   coherent-whole model. Policy is forward-activating (Article IV §14):
   a historical generation is not required to satisfy future policy
   baselines; operator ruling 2026-08-24.

## Consequences

- The deadlock class is closed: recovery never depends on the component
  that is broken. Last-known-good artifact restores gates; fixes land
  through restored gates; ordinary deploy supersedes the rollback.
- `/opt` publication remains root-gated, sealed, atomic; no new trust
  domain is introduced.
- The existing `$OLD` previous-generation retention during a deploy is
  subsumed conceptually; REV deploy supersedes it as the general recovery
  primitive.
- Entry-resolution integrity gates (generation-time refusal in
  `generate-hooks`, commit-time verification in
  `ci/check_required_hooks_present.py`) remain planned as prevention so a
  broken generation cannot deploy in the first place; REV rollback is the
  recovery layer beneath prevention.
