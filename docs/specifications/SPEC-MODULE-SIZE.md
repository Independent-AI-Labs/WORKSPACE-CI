# Specification: WORKSPACE-CI Module Size

**Status:** Active blank-slate specification

## 1. Policy

`config/file_length_limits.yaml` and its schema define the complete module-size
policy for WORKSPACE-CI. The policy is strict, versioned, digest-bound, and
root-controlled after clean installation.

## 2. Enumeration

The checker walks the complete source tree with no positional narrowing. It
rejects symlinked or unreadable candidates and excludes only paths explicitly
covered by the strict policy schema.

## 3. Diagnostics

Diagnostics are stable, ordered, repository-relative, and fail closed. A file
or module that cannot be safely inspected is an error, not an omitted result.

## 4. Acceptance

Tests prove line, byte, file-count, submodule-count, and depth boundaries,
policy parsing, malformed input, symlink handling, complete enumeration, and
deterministic failure output.
