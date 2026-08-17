# Requirements: WORKSPACE-CI Module Size

**Status:** Active blank-slate requirement

The module-size gate applies to the WORKSPACE-CI source tree only. It does not
define policies for other projects, active policy generations, compatibility
inputs, or prior policy records.

## Limits

The strict policy defines maximum source-file bytes, total source bytes, direct
source files per module, direct submodules, and module depth. Total source bytes
accept a positive value in `B`, `KB`, or `MB` units and count actual source-file
bytes. Generated, dependency, vendored, ignored, and build paths are excluded
only when named by the strict schema.

## Enforcement

The checker enumerates the complete WORKSPACE-CI source tree. It rejects
positional narrowing, missing or unreadable candidates, symlink escapes,
malformed policy YAML, unknown fields, duplicate keys, and invalid limits.

The policy file is parsed strictly as part of candidate verification. The
checker returns stable diagnostics and never silently skips a candidate.

## Acceptance

Tests cover complete enumeration, boundary values, malformed policy, symlink
and unreadable inputs, nested module limits, deterministic diagnostics, and
failure injection. No test relies on another project or an earlier policy
activation.
