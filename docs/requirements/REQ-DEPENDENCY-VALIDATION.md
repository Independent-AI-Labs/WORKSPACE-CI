# Requirements: WORKSPACE-CI Dependency Validation

**Status:** Approved blank-slate contract; implementation pending

## Scope

This contract validates dependency declarations, lockfiles, container images,
exclusions, and the bootstrap catalog for this WORKSPACE-CI repository. It does
not define other projects, external consumers, migration, compatibility, or
source-tree upgrade workflows.

## Modes

| Mode | Network | Mutation | Use |
| --- | --- | --- | --- |
| `validate` | Forbidden | Forbidden | Hooks and ordinary CI |
| `freshness` | Explicitly permitted | Forbidden | Named manual/scheduled report |

Mode selection is explicit and fail closed. `validate` never imports or calls
freshness code. There is no upgrade mode in the validator.

## Deterministic Requirements

- The deterministic import graph excludes sockets, DNS, HTTP, registries,
  Docker clients, package managers, and subprocesses.
- Results depend only on committed bytes, explicit arguments, and the pinned
  validator release.
- Python declarations in project dependencies, optional groups, and build
  requirements use typed PEP 508 parsing and strict bounded versions.
- Duplicate normalized names are reported at every declaration location.
- npm dependencies in all supported manifest sections use typed semver and
  strict exact or bounded versions.
- Workspace members are resolved only beneath this repository root; escaping,
  absolute, duplicate, symlinked, or unresolved members fail closed.
- Dockerfile and Compose image references use an offline grammar. Moving tags,
  malformed digests, unresolved variables, and parser uncertainty fail closed.
- Exclusions use a strict versioned schema with duplicate and unknown-field
  rejection.

## Lockfiles

npm and `uv.lock` validation is structural and offline. It does not run npm, uv,
or another package manager. Manifest declarations, workspace metadata, sources,
and lock entries must agree in stable diagnostic order.

## Bootstrap Catalog

One duplicate-aware typed parser owns `res/dependency-pins.yaml`. The closed
schema requires reviewed source coordinates, platform assets, versions, and
catalog-owned SHA-256 checksums for every downloadable bootstrap artifact.
Runtime-fetched checksums and mutable aliases cannot authorize bytes.

## Inputs and Paths

The hook derives the repository root with `git rev-parse --show-toplevel`,
changes to that directory, and passes the resulting absolute path explicitly.
Explicit paths must remain beneath it, be regular files, and pass no-follow and
replacement checks.

## Freshness

Freshness is read-only and physically separate from validation. It emits one
versioned structured result per declaration with input identity, source,
timestamp, status, candidate value, and error category. Registry failure is
`unknown`, never `current`.

## Acceptance

Tests must deny sockets, DNS, subprocesses, and package-manager execution while
exercising every parser. Adversarial cases cover malformed ranges, duplicates,
workspace escapes, Docker options, unresolved variables, catalog checksums,
unknown fields, lock drift, and repeated invocation state. No acceptance test
may depend on another project or an earlier deployment.
