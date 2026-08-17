# workspace-ci Documentation

**Project:** workspace-ci - CI/CD quality gates, native git hook generation,
and clean installation for one Linux machine
**Date:** 2026-07-17

Purpose: hub for all project documentation. Documents are organized by
type: human decisions (DECISION-_), requirement contracts (REQ-_),
implementation specifications (SPEC-_), operational runbooks (RUNBOOK-_),
and dated audit reports.

**Status: Draft** means the document is incomplete or unapproved.

The deployment contract is `make deploy-ci`: construct and verify
`/opt/.workspace-ci.candidate`, atomically publish it at `/opt/workspace-ci`,
verify and seal the artifact, then install protected hooks as a separate step.

## Tree

### decisions/ - accepted human decisions (DECISION-*)

| Document                                                                                                                 | Scope                                        |
| ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| [`decisions/DECISION-BOOTSTRAP-AND-DEPLOYMENT-2026-08-10.md`](decisions/DECISION-BOOTSTRAP-AND-DEPLOYMENT-2026-08-10.md) | Bootstrap, deployment, and sealing decisions |

### requirements/ - requirement contracts (REQ-*)

| Document                                                                                 | Scope                                                                           |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [`requirements/REQ-BOOT-LAYOUT.md`](requirements/REQ-BOOT-LAYOUT.md)                     | Platform-aware hermetic boot directory layout (`.boot-linux/` / `.boot-macos/`) |
| [`requirements/REQ-DEPLOYMENT.md`](requirements/REQ-DEPLOYMENT.md)                       | Atomic immutable deployment at `/opt/workspace-ci`                              |
| [`requirements/REQ-WIKI.md`](requirements/REQ-WIKI.md)                                   | Interactive wiki web UI (`web/`)                                                |
| [`requirements/REQ-WIKI-RESPONSIVE.md`](requirements/REQ-WIKI-RESPONSIVE.md)             | Wiki responsive layout (breakpoints, touch targets, fluid type)                 |
| [`requirements/REQ-PORTABILITY.md`](requirements/REQ-PORTABILITY.md)                     | Shell portability contract: process-substitution ban, capture helpers           |
| [`requirements/REQ-CVE-SCAN.md`](requirements/REQ-CVE-SCAN.md)                           | Dependency vulnerability scanning via OSV-Scanner (live OSV.dev CVE DB)         |
| [`requirements/REQ-MODULE-SIZE.md`](requirements/REQ-MODULE-SIZE.md)                     | Source file and module-size guardrails                                          |
| [`requirements/REQ-DEPENDENCY-VALIDATION.md`](requirements/REQ-DEPENDENCY-VALIDATION.md) | Deterministic policy, optional catalogs, and live freshness workflow            |
| [`requirements/REQ-HITL.md`](requirements/REQ-HITL.md)                                   | Human-in-the-loop oversight and credential-brokering system                     |
| [`requirements/REQ-HITL-RELAY.md`](requirements/REQ-HITL-RELAY.md)                       | HITL websocket relay and credential-broker backend                              |
| [`requirements/REQ-HITL-WEB.md`](requirements/REQ-HITL-WEB.md)                           | HITL web backend and approver UI                                                |
| [`requirements/REQ-HITL-GUARD.md`](requirements/REQ-HITL-GUARD.md)                       | WORKSPACE-GUARD HITL elevation integration                                      |
| [`requirements/REQ-WEB-COMPONENTS.md`](requirements/REQ-WEB-COMPONENTS.md)               | Shared web-component library extraction                                         |

### specifications/ - implementation specs (SPEC-*)

| Document                                                                                       | Scope                                                                              |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [`specifications/SPEC-BOOT-LAYOUT.md`](specifications/SPEC-BOOT-LAYOUT.md)                     | Source, candidate, and deployed `.boot-*` resolution                               |
| [`specifications/SPEC-DEPLOYMENT.md`](specifications/SPEC-DEPLOYMENT.md)                       | Root-controlled candidate construction and atomic directory publication            |
| [`specifications/SPEC-WIKI.md`](specifications/SPEC-WIKI.md)                                   | Wiki implementation specification                                                  |
| [`specifications/SPEC-WIKI-RESPONSIVE.md`](specifications/SPEC-WIKI-RESPONSIVE.md)             | Wiki responsive overhaul phases and file-level changes                             |
| [`specifications/SPEC-PORTABILITY.md`](specifications/SPEC-PORTABILITY.md)                     | Capture helper API, detection patterns, enforcement mechanism                      |
| [`specifications/SPEC-CVE-SCAN.md`](specifications/SPEC-CVE-SCAN.md)                           | OSV-Scanner bootstrap, `ci_scan_vulnerabilities` wrapper, `osv-scan` pre-push hook |
| [`specifications/SPEC-MODULE-SIZE.md`](specifications/SPEC-MODULE-SIZE.md)                     | Module-size hook implementation and configuration                                  |
| [`specifications/SPEC-DEPENDENCY-VALIDATION.md`](specifications/SPEC-DEPENDENCY-VALIDATION.md) | Offline policy and live freshness components                                       |
| [`specifications/SPEC-HITL.md`](specifications/SPEC-HITL.md)                                   | HITL system architecture and implementation plan                                   |
| [`specifications/SPEC-HITL-RELAY.md`](specifications/SPEC-HITL-RELAY.md)                       | HITL relay protocol and backend implementation                                     |
| [`specifications/SPEC-HITL-WEB.md`](specifications/SPEC-HITL-WEB.md)                           | HITL approver web application implementation                                       |
| [`specifications/SPEC-HITL-GUARD.md`](specifications/SPEC-HITL-GUARD.md)                       | WORKSPACE-GUARD HITL client integration                                            |
| [`specifications/SPEC-WEB-COMPONENTS.md`](specifications/SPEC-WEB-COMPONENTS.md)               | Shared web-component package implementation                                        |

### audits/ - dated audits and disposition records

| Document                                                                                                     | Scope                                     |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| [`audits/SECURITY-AUDIT-2026-07-04.md`](audits/SECURITY-AUDIT-2026-07-04.md)                                 | Full-repo security audit (2026-07-04)     |
| [`audits/WIKI-UX-AUDIT.md`](audits/WIKI-UX-AUDIT.md)                                                         | Wiki UX audit                             |
| [`audits/AUDIT-card-unification-and-ast-extraction.md`](audits/AUDIT-card-unification-and-ast-extraction.md) | Card unification and AST extraction audit |

Historical audit reports are not part of the blank-slate installation contract.

## Reading order for newcomers

1. [`decisions/DECISION-BOOTSTRAP-AND-DEPLOYMENT-2026-08-10.md`](decisions/DECISION-BOOTSTRAP-AND-DEPLOYMENT-2026-08-10.md) - accepted human decisions.
2. [`../README.md`](../README.md) - what workspace-ci is and how to install it.
3. [`requirements/REQ-BOOT-LAYOUT.md`](requirements/REQ-BOOT-LAYOUT.md) + [`specifications/SPEC-BOOT-LAYOUT.md`](specifications/SPEC-BOOT-LAYOUT.md) - deployment boot layout.
4. [`requirements/REQ-DEPENDENCY-VALIDATION.md`](requirements/REQ-DEPENDENCY-VALIDATION.md) + [`specifications/SPEC-DEPENDENCY-VALIDATION.md`](specifications/SPEC-DEPENDENCY-VALIDATION.md) - deterministic validation.
5. [`requirements/REQ-WIKI.md`](requirements/REQ-WIKI.md) + [`specifications/SPEC-WIKI.md`](specifications/SPEC-WIKI.md) - the wiki web UI.
