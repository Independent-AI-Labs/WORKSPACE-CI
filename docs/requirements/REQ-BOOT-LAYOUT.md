# REQ-BOOT-LAYOUT: Platform Boot Artifacts

**Date:** 2026-08-16
**Status:** Active blank-slate requirement
**Deployment:** [REQ-DEPLOYMENT](REQ-DEPLOYMENT.md)
**Specification:** [SPEC-BOOT-LAYOUT](../specifications/SPEC-BOOT-LAYOUT.md)

## 1. Scope

This contract defines the boot-tool directories used by WORKSPACE-CI. Atomic
candidate construction, publication, sealing, and hook failure behavior belong
to REQ-DEPLOYMENT.

## 2. Requirements

1. Linux source development uses `<checkout>/.boot-linux`.
2. macOS source development uses `<checkout>/.boot-macos`.
3. The protected Linux artifact uses
   `/opt/workspace-ci/.boot-linux`. Protected commands and hooks MUST NOT use a
   boot directory from `projects/CI`, `WORKSPACE-CI`, `$HOME`, or a sibling
   project.
4. The deployment candidate builds its complete boot directory at
   `/opt/.workspace-ci.candidate/.boot-linux` before publication.
5. Installation commands MUST resolve the boot directory from the checkout or
   artifact being operated on and invoke its tools by absolute path.
6. Environment variables and Make command-line variables MUST NOT redirect a
   protected boot path.
7. Downloaded boot artifacts require a cataloged version, source URL, expected
   asset SHA-256, and executable identity.
8. Locally built boot artifacts require the reviewed source commit, locked build
   inputs, and resulting executable SHA-256.
9. Boot artifacts MUST NOT install interpreters, environments, command links, caches, or
   package state under the invoking user's HOME.
10. A missing or unverifiable protected boot directory MUST fail closed.
11. The complete deployed `.boot-linux` directory is root-owned and immutable as
    part of `/opt/workspace-ci`.
12. macOS boot support remains developer-owned and is outside the protected
    deployment contract.
13. Candidate-local interpreters and environments MUST remain hermetic and MUST
    be created through `/opt/workspace-ci` in the deployment's private mount
    namespace. Moving or rewriting an environment created through the physical
    candidate pathname is forbidden.
14. Boot-layout verification MUST inspect both symlinks and regular runtime
    metadata, including `pyvenv.cfg` and generated shebangs, for candidate-path
    coupling.
15. Acceptance MUST execute the boot interpreter and required environments
    through the final pathname during isolated construction and after the exact
    candidate-to-deployed pathname transition.

## 3. Acceptance

Tests MUST prove platform naming, checkout-local resolution, fixed protected
resolution, candidate placement, digest and executable verification, no path
override, no HOME escape, no symlink escape, ownership/mode enforcement, and
final immutable sealing through REQ-DEPLOYMENT.
The deployment acceptance also covers candidate-path injection into symlinks,
virtual-environment configuration, and generated entrypoints.
