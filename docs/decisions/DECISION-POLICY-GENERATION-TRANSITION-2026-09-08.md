# Decision: Policy Generation Transitions Use Expand-Contract

**Date:** 2026-09-08
**Status:** Accepted
**Authority:** Operator ruling during the v4→v5 policy migration.

## Context

The deployment lifecycle guarantees that the enforcement artifact at
`/opt/workspace-ci` is always built from exact reviewed `origin/main`
content, and protected hooks always execute that artifact. Within one
policy generation this is self-consistent: every commit carries its own
in-repo exemptions in the format the deployed engine reads, so the
deployed gate always passes additive change.

A **breaking policy-model cut** (a schema or semantics change the
currently deployed engine cannot process) breaks that consistency in a
specific, narrow way: the deployed engine reads *rules* from its sealed
config but *project exemptions* from the repo's own
`config/banned_words_exceptions.yaml`. Replacing that file with a new
schema makes the deployed engine read zero exemptions, and every
policy-quoting file fails the gate. The migration commit then cannot
pass the very hooks it exists to replace, and the deploy cannot run
before the commit. This is the commit-direction instance of the repair
cycle audited in AUDIT-DEPLOYMENT-DEADLOCK-2026-08-19.

Rejected resolutions, with the operator's reasons:

- deploy from an operator-attested worktree: violates the absolute
  `artifact == origin/main` guarantee;
- dual-engine or version-dispatching artifact: compat code in the
  enforcement artifact;
- dual-format policy data as a permanent model: ruled out by the
  single-cut ruling;
- standing down or bypassing hooks for the migration commit: forbidden
  without exception, including for root.

## Decision

Breaking policy-generation cuts use the **expand-contract** migration
pattern:

1. **Expand commit (passes the old deployed gates).** The new
   generation's project exceptions live in a version-named file
   (`config/banned_words_exceptions_v5.yaml`). The unversioned file
   (`config/banned_words_exceptions.yaml`) remains in the **old schema**
   as a *bridge*: the entries the deployed gate already had, plus
   exact-path entries for every new policy-quoting file introduced by
   the cut. The deployed engine reads the bridge and passes. Hooks are
   never stood down; the artifact is never touched out of band.
2. **Deploy.** Push, then the normal unmodified `make deploy-ci` builds
   and publishes the new generation from `origin/main`.
3. **Contract commit (passes the new deployed gates).** Delete the
   bridge file. The end state is the single new format only: the
   single-cut ruling applies to the end state, with the bridge existing
   for exactly one commit window.

Sibling repos need no bridge when the CI repo deploys first: their
conversions commit directly under the new deployed gates.

## Consequences

- The v5 project-exceptions filename is permanently
  `banned_words_exceptions_v5.yaml`; the unversioned name carries no
  content after the contract commit.
- Every future breaking cut follows the same three steps and names its
  bridge section with a comment referencing this decision.
- The bridge is migration data, never engine compat: no code reads both
  formats at any point in time.
- Schema-compatible evolution still needs no bridge: additive changes
  carry their own exemptions in-repo as before.
