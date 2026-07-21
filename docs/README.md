# workspace-ci Documentation

**Project:** workspace-ci  -  shared CI/CD quality gates, native git hook
generation, and consumer-project scaffolding for the workspace monorepo
**Date:** 2026-07-17

Purpose: hub for all project documentation. Documents are organized by
type: requirement contracts (REQ-*), implementation specifications
(SPEC-*), operational runbooks (RUNBOOK-*), and dated audit reports.

Documents with **Status: Draft** describe features that are not yet
implemented; their Implementation Status sections mark every component
as not implemented.

## Tree

### requirements/  -  requirement contracts (REQ-*)

| Document | Scope |
|----------|-------|
| [`requirements/REQ-BOOT-LAYOUT.md`](requirements/REQ-BOOT-LAYOUT.md) | Platform-aware hermetic boot directory layout (`.boot-linux/` / `.boot-macos/`) |
| [`requirements/REQ-SCAFFOLD-CI.md`](requirements/REQ-SCAFFOLD-CI.md) | scaffold-ci profile-driven consumer bootstrapper |
| [`requirements/REQ-WIKI.md`](requirements/REQ-WIKI.md) | Interactive wiki web UI (`web/`) |
| [`requirements/REQ-WIKI-RESPONSIVE.md`](requirements/REQ-WIKI-RESPONSIVE.md) | Wiki responsive layout (breakpoints, touch targets, fluid type) |
| [`requirements/REQ-PORTABILITY.md`](requirements/REQ-PORTABILITY.md) | Shell portability contract: process-substitution ban, capture helpers |
| [`requirements/REQ-CVE-SCAN.md`](requirements/REQ-CVE-SCAN.md) | Dependency vulnerability scanning via OSV-Scanner (live OSV.dev CVE DB) |

### specifications/  -  implementation specs (SPEC-*)

| Document | Scope |
|----------|-------|
| [`specifications/SPEC-BOOT-LAYOUT.md`](specifications/SPEC-BOOT-LAYOUT.md) | Boot layout implementation: walk-up PATH resolution, config schema, compliance check |
| [`specifications/SPEC-SCAFFOLD-CI.md`](specifications/SPEC-SCAFFOLD-CI.md) | scaffold-ci implementation: validation, generation pipeline, awk parser |
| [`specifications/SPEC-WIKI.md`](specifications/SPEC-WIKI.md) | Wiki implementation specification |
| [`specifications/SPEC-WIKI-RESPONSIVE.md`](specifications/SPEC-WIKI-RESPONSIVE.md) | Wiki responsive overhaul phases and file-level changes |
| [`specifications/SPEC-PORTABILITY.md`](specifications/SPEC-PORTABILITY.md) | Capture helper API, detection patterns, enforcement mechanism |
| [`specifications/SPEC-CVE-SCAN.md`](specifications/SPEC-CVE-SCAN.md) | OSV-Scanner bootstrap, `ci_scan_vulnerabilities` wrapper, `osv-scan` pre-push hook |

### runbooks/  -  operations

| Document | Scope |
|----------|-------|
| [`runbooks/RUNBOOK-HOOKS.md`](runbooks/RUNBOOK-HOOKS.md) | Hook generation, configuration format, migration from pre-commit, scaffold-ci quick start |

### audits/  -  dated audit reports (historical, not current truth)

| Document | Scope |
|----------|-------|
| [`audits/SECURITY-AUDIT-2026-07-04.md`](audits/SECURITY-AUDIT-2026-07-04.md) | Full-repo security audit (2026-07-04) |
| [`audits/WIKI-UX-AUDIT.md`](audits/WIKI-UX-AUDIT.md) | Wiki UX audit |
| [`audits/AUDIT-card-unification-and-ast-extraction.md`](audits/AUDIT-card-unification-and-ast-extraction.md) | Card unification and AST extraction audit |

## Reading order for newcomers

1. [`../README.md`](../README.md)  -  what workspace-ci is and how to install it.
2. [`requirements/REQ-BOOT-LAYOUT.md`](requirements/REQ-BOOT-LAYOUT.md) + [`specifications/SPEC-BOOT-LAYOUT.md`](specifications/SPEC-BOOT-LAYOUT.md)  -  the hermetic toolchain layout everything else builds on.
3. [`runbooks/RUNBOOK-HOOKS.md`](runbooks/RUNBOOK-HOOKS.md)  -  generate and operate native git hooks.
4. [`requirements/REQ-PORTABILITY.md`](requirements/REQ-PORTABILITY.md) + [`specifications/SPEC-PORTABILITY.md`](specifications/SPEC-PORTABILITY.md)  -  shell-layer portability contract.
5. [`requirements/REQ-SCAFFOLD-CI.md`](requirements/REQ-SCAFFOLD-CI.md) + [`specifications/SPEC-SCAFFOLD-CI.md`](specifications/SPEC-SCAFFOLD-CI.md)  -  bootstrap CI into a new consumer project.
6. [`requirements/REQ-WIKI.md`](requirements/REQ-WIKI.md) + [`specifications/SPEC-WIKI.md`](specifications/SPEC-WIKI.md)  -  the wiki web UI.
