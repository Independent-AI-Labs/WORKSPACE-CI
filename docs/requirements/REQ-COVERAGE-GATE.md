# Requirements: WORKSPACE-CI Coverage Gate

**Status:** Active blank-slate requirement

## Scope

The coverage gate is per-repository. Each repository that carries a test suite
owns `config/coverage_thresholds.yaml` and enforces it at pre-push. The gate
never reads another repository's configuration, never aggregates across
repositories, and never substitutes a shared workspace threshold. A repository
with no test suite and no configuration is advisory, never left unchecked
without a warning.

## Requirements

1. The repository's own `config/coverage_thresholds.yaml` is the single source
   of truth for suites, runners, source paths, and minimum coverage. The gate
   reads only the configuration of the repository being pushed.

2. The gate is a protected, mandatory pre-push hook registered in
   `config/required_hooks.yaml`. Because `check-required-hooks-present` verifies
   every required hook is wired, every consumer repository carries the coverage
   hook; the "every project" guarantee is the registry plus that self-check,
   not a cross-repository aggregate run.

3. Measurement is real. A suite that declares coverage enabled MUST run through
   a coverage-capable runner adapter that receives the suite's threshold and
   fails the gate through the runner's own exit code. A suite that declares
   coverage disabled runs its runner verbatim and enforces pass/fail only. No
   threshold is ever reported as satisfied without the runner having measured
   it.

4. A runner that cannot measure coverage MUST be declared `coverage: false`.
   A configuration that enables coverage on a non-measuring runner is invalid
   and fails the gate rather than passing unmeasured.

5. Suite configuration is validated before any runner executes: the test
   `path` and `source_path` MUST resolve relative to the repository root,
   `min_coverage` MUST be an integer in `0..100`, and unknown top-level keys,
   unknown suite fields, or duplicate suite names are configuration errors.

6. A repository that has no `config/coverage_thresholds.yaml` produces an
   advisory warning and does not fail the push. Coverage is not invented where
   a project has not declared it.

7. Thresholds are earned and never lowered. The existing no-devolution guard is
   retained: a suite's `min_coverage` may only stay the same or rise, except
   when its `path` changes because the test set changed.

8. Execution is deterministic and bounded: runners run from the repository
   root with fixed argv, a finite per-suite timeout with a heartbeat, and a
   loud failure on timeout or crash. No retry and no unlogged skip.

9. The gate is never satisfied by bypassing hooks or editing deployed files.
   Fix source, validate the clean-install path, and install only through the
   reviewed flow.

## Non-Goals

- A workspace-level aggregate or recursive coverage runner.
- Cross-repository or shared thresholds.
- Coverage for languages or runners that cannot measure it; those declare
  `coverage: false` and are pass/fail only.

## Acceptance

Tests prove: enabled suites receive threshold-bearing coverage arguments and
fail through the runner exit code; disabled suites run verbatim; non-measuring
runners with coverage enabled are rejected; missing paths, malformed YAML, and
out-of-range thresholds are configuration errors; a missing configuration is an
advisory success; no-devolution blocks a lowered threshold but allows a path
change; and a timed-out or crashed suite fails loudly. No test depends on
another repository or an earlier deployment.