# Specification: WORKSPACE-CI Dependency Validation

**Status:** Approved blank-slate implementation target

## 1. Execution Boundary

The installed release invokes one deterministic validator against the
WORKSPACE-CI tree. The validator receives explicit repository-relative inputs,
has no network or subprocess capability, and cannot import freshness or
mutation code.

The command surface is:

```text
workspace-ci-dependencies validate [explicit inputs]
workspace-ci-dependencies freshness [explicit inputs]
```

`validate` is the only hook/ordinary-CI mode. `freshness` is read-only and
explicitly invoked. There is no upgrade command.

## 2. Validation Pipeline

```text
strict input envelope
  -> typed declaration parsers
  -> structural lock parsers
  -> image and exclusion parsers
  -> typed catalog parser
  -> stable result envelope
```

Every stage rejects unknown fields, duplicate keys, malformed values, path
escapes, symlinks, unsupported versions, and trailing data. A failure in one
independent readable input does not suppress diagnostics from another.

## 3. Declaration Parsers

Python parsing covers project, optional, and build requirements with PEP 508
normalization and bounded version policy. npm parsing covers every supported
manifest section and declared workspace member. Dockerfile parsing handles
`FROM` options, continuations, aliases, and controlled `ARG` substitution.
Compose parsing validates every image. Any unresolved parser state fails.

## 4. Lock and Catalog Parsers

npm and `uv.lock` are parsed structurally without package-manager execution. The
catalog parser is the sole owner of `res/dependency-pins.yaml`; bootstrap code
consumes its canonical output rather than reparsing YAML.

Each downloadable artifact has a reviewed exact checksum and platform asset.
Digest mismatch prevents installation and release sealing.

## 5. Result Envelope

Every invocation emits versioned JSON containing mode, WORKSPACE-CI root
identity, input identities, ordered diagnostics, and an overall result. Each
diagnostic contains a stable rule ID, severity, repository-relative path,
location when available, and remediation code. No output exposes paths outside
the repository root.

## 6. Freshness

Freshness runs in a separate module and process boundary. It queries only
explicitly configured sources, produces invocation-scoped timestamps and status,
and never edits declarations, locks, catalogs, hooks, or releases.

## 7. Acceptance

The test suite proves import isolation, offline behavior, parser adversarial
cases, lock consistency, catalog completeness, path containment, stable
diagnostics, and repeated-invocation state isolation. The installed validator
must be the exact digest verified in the deployment candidate.
