# Specification: WORKSPACE-CI Coverage Gate

**Status:** Active blank-slate specification

## 1. Authority and Placement

Each repository's `config/coverage_thresholds.yaml` is the complete coverage
policy for that repository. It is parsed strictly; unknown top-level keys,
unknown suite fields, duplicate suite names, and malformed YAML fail closed.

The gate executes as a protected pre-push hook. It is declared in
`config/required_hooks.yaml` as:

```
- id: verify-coverage
  kind: shell
  entry: ci_verify_coverage
  stage: pre-push
  pass_filenames: false
  always_run: true
  mandatory: true
  applicable_to: [any]
```

`ci/check_required_hooks_present.py` fails any repository whose
`.pre-commit-config.yaml` does not wire the registered hook. This is the
mechanism by which every project in the federated workspace participates; there
is no cross-repository aggregate runner.

## 2. Suite Configuration

The file is a map of suite name to suite fields. A suite is admitted only when
`path` and `min_coverage` are present.

| Field         | Required | Meaning                                                        |
| ------------- | -------- | -------------------------------------------------------------- |
| `path`        | yes      | Test directory, relative to the repository root. Must exist.   |
| `source_path` | no       | Code under test, relative to the repository root. Defaults `.`. |
| `min_coverage`| yes      | Integer `0..100`. The runner must reach this or the gate fails. |
| `runner`      | no       | Test command. Defaults to `uv run python -m pytest`.            |
| `coverage`    | no       | `"true"` (default) or `"false"`. Enables measurement.           |
| `timeout`     | no       | Per-suite seconds. Defaults to `CI_COVERAGE_TIMEOUT` or `600`.  |

## 3. Runner Adapters

The adapter is selected from the `runner` string. A runner that cannot measure
coverage MUST declare `coverage: "false"`; enabling coverage on it is a
configuration error, not an unmeasured pass.

| Runner match          | `coverage: true`                                                        | `coverage: false`                     |
| --------------------- | ----------------------------------------------------------------------- | ------------------------------------- |
| `*pytest*`            | `$runner $path --cov=$source_path --cov-report=term-missing --cov-fail-under=$min_coverage --tb=short` | `$runner $path --no-cov --tb=short`   |
| `*cargo*llvm-cov*`    | `$runner --manifest-path $source_path/Cargo.toml --fail-under-lines $min_coverage` | `$runner --manifest-path $source_path/Cargo.toml` |
| `*cargo*` (bare)      | **invalid** (must be `coverage: false`)                                 | `$runner` verbatim                    |
| `*vitest*`            | `cd $source_path && $runner --coverage --coverage.thresholds.lines=$min_coverage --coverage.thresholds.functions=$min_coverage --coverage.thresholds.branches=$min_coverage --coverage.thresholds.statements=$min_coverage` | `cd $source_path && $runner`          |
| `*c8*` or `*nyc*`     | `$runner --check-coverage --lines $min_coverage`                        | `$runner` verbatim                    |
| `*go test*`           | `$runner -coverprofile=… $path` then `go tool cover -func …` threshold check | `$runner $path` verbatim              |
| `"npm test"*`, `"node --test"*`, `"npx tsx"*` | **invalid** (must be `coverage: false`)            | `$runner` verbatim                    |
| `true`                | **invalid** (must be `coverage: false`)                                 | no-op success                         |

The bare `cargo`, bare `npm test`, `node --test`, and `npx tsx` rows are the
runners whose thresholds were previously reported without measurement; they now
fail configuration validation unless explicitly declared `coverage: false`.

## 4. Validation

Before any runner executes, the gate validates every suite:

1. `path` exists and is a directory under the repository root.
2. `source_path`, when not `.`, exists.
3. `min_coverage` parses as an integer in `0..100`.
4. `coverage` is exactly `"true"` or `"false"`, or absent.
5. The runner maps to an adapter, and `coverage: true` is permitted for it.

A violation is a hard failure naming the suite and field. Validation never
skips a suite unlogged.

## 5. Execution

Suites run from the repository root with a fixed argv and a finite timeout
(`timeout --signal=TERM --kill-after=10s`). A heartbeat reports elapsed seconds
every 30 seconds. Exit 124/137 is a loud timeout failure; 139/245 is a crash
failure; any other non-zero is a test or coverage failure. There is no retry.

## 6. Missing Configuration

A repository with no `config/coverage_thresholds.yaml` emits an advisory
warning and returns success. The no-devolution guard likewise passes when the
file is absent. Coverage is never fabricated for a project that has not
declared it.

## 7. No-Devolution

`ci_check_coverage_thresholds_no_devolution` compares the staged configuration
against `HEAD` and fails when a suite's `min_coverage` decreases. A suite whose
`path` changed is reported and its threshold comparison skipped, because the
path change selects a different test set.

## 8. WORKSPACE-CI's Own Configuration

WORKSPACE-CI is polyglot: the Python `ci/` package (pytest, `--cov=ci`) and the
Node workspaces `web/`, `web-components/`, and `hitl/web` (vitest). Its
`config/coverage_thresholds.yaml` MUST declare a suite per measured surface with
the correct runner and source path, and `make check-push` MUST enforce the same
configuration rather than hardcoding `--fail-under=90`. The default
Python-only `unit`/`integration` rows are replaced by suites that match this
repository.

## 9. Scaffolding

For a consumer, `scaffold-ci` copies CI's `config/coverage_thresholds.yaml` and
substitutes `source_path: ci` with the profile's project name (see
REQ-SCAFFOLD-CI FR-SC-8.3). The copied file is a starting point; the consumer
owns the suites, runners, and thresholds that describe its own stack, and the
gate validates them as in §3-§4.

## 10. Acceptance

Tests prove: enabled suites receive threshold-bearing coverage arguments and
fail through the runner exit code; disabled suites run verbatim; non-measuring
runners with coverage enabled are rejected; missing paths, malformed YAML,
unknown keys, and out-of-range thresholds are configuration errors; a missing
configuration is an advisory success; no-devolution blocks a lowered threshold
but allows a path change; and a timed-out or crashed suite fails loudly.