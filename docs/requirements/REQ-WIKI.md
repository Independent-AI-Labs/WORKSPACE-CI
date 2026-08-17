# REQ-WIKI: Workspace Portal Web Application

**Date:** 2026-08-16
**Status:** Active
**Type:** Requirements
**Specification:** [SPEC-WIKI](../specifications/SPEC-WIKI.md)

## 1. Purpose

The `web/` application is the navigable public and operator-facing portal for
the workspace. It combines editorial landing content, repository documentation,
CI policy references, governance resources, live gateway observability, and
interactive tools in one source-backed interface.

Responsive behavior is owned by
[REQ-WIKI-RESPONSIVE](REQ-WIKI-RESPONSIVE.md). Shared primitives are owned by
[REQ-WEB-COMPONENTS](REQ-WEB-COMPONENTS.md).

## 2. Product Principles

| ID   | Requirement                                                                                                          |
| ---- | -------------------------------------------------------------------------------------------------------------------- |
| PR-1 | Canonical workspace sources MUST own portal content wherever a source contract exists.                               |
| PR-2 | Server Components MUST load filesystem and service data; Client Components MUST own browser interaction state.       |
| PR-3 | The portal MUST present dense source material as searchable and filterable catalogues with focused modal inspection. |
| PR-4 | Route, navigation, breadcrumb, and static search metadata MUST derive from `web/nav.yaml`.                           |
| PR-5 | Missing optional sibling repositories or runtime services MUST produce an explicit empty or unavailable state.       |
| PR-6 | Source-backed reference surfaces MUST remain read-only except for the separate feedback submission mechanism.        |

## 3. Portal Shell

| ID      | Requirement                                                                                                                                                      |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SHELL-1 | Every portal page MUST render through `WikiShell` with skip navigation, sidebar, header, main content, footer, and Mermaid support.                              |
| SHELL-2 | The sidebar MUST list the entries generated from `web/nav.yaml`, display configured catalogue counts, identify the active route, and collapse to a compact rail. |
| SHELL-3 | The header MUST provide breadcrumbs, theme selection, and a visible search trigger supporting `/` and Ctrl/Cmd+K.                                                |
| SHELL-4 | Breadcrumbs MUST follow the current URL and use route labels from the navigation manifest when available.                                                        |
| SHELL-5 | The root page MUST honor the home-landing feature flag and route to `/open-source` when the landing experience is disabled.                                      |
| SHELL-6 | Light and dark themes MUST use shared design tokens and persist the selected theme without a first-paint theme flash.                                            |

## 4. Information Architecture

### 4.1 Canonical Routes

| Route                       | Portal role                                  | Canonical sources                                                     |
| --------------------------- | -------------------------------------------- | --------------------------------------------------------------------- |
| `/`                         | Editorial landing experience                 | `landing-posts.yaml`, synchronized landing assets                     |
| `/open-source`              | Workspace project catalogue                  | project registry, repository README files, Makefiles, code statistics |
| `/<project-slug>`           | Full project README                          | registered repository README and project assets                       |
| `/system-policies`          | System-policy section                        | route manifest and section state                                      |
| `/git-hooks`                | Git hook catalogue                           | `config/required_hooks.yaml`, extracted hook source data              |
| `/anti-patterns`            | Banned and swallowed-error pattern catalogue | pattern YAMLs, classifier, extracted detector source data             |
| `/anti-patterns/<category>` | Category-filtered pattern catalogue          | the same canonical pattern sources                                    |
| `/hook-configs`             | CI configuration catalogue                   | `config/*.yaml`, co-located schemas, wiki labels                      |
| `/sandbox-configs`          | Guard and sandbox policy catalogue           | resolved WORKSPACE-GUARD config root, policy index, schemas           |
| `/tools-scripts`            | Workspace tooling catalogue                  | `scripts/manifest.yaml`, extracted script source data                 |
| `/ai-governance`            | AI standards and regulation catalogue        | standards configuration and branding                                  |
| `/llm-gateway`              | Live gateway observability                   | branding, project registry, Grafana discovery and health              |
| `/static-analysis`          | Static-analysis section                      | route manifest and section state                                      |
| `/playground`               | Client-side pattern tester                   | banned-pattern configuration and wiki labels                          |
| `/integration-guide`        | Integration runbook                          | `docs/runbooks/RUNBOOK-HOOKS.md`                                      |

Next.js parenthesized route groups MAY organize these routes without changing

### 4.2 Navigation Manifest

| ID    | Requirement                                                                                                                  |
| ----- | ---------------------------------------------------------------------------------------------------------------------------- |
| NAV-1 | `web/nav.yaml` MUST define route identifiers, titles, descriptions, URLs, search keywords, and optional navigation metadata. |
| NAV-2 | `web/scripts/sync-wiki-nav.mjs` MUST generate `web/src/data/wiki-nav.json` deterministically.                                |
| NAV-3 | `npm run check:generated` MUST detect stale generated navigation data.                                                       |

## 5. Landing Experience

| ID     | Requirement                                                                                                                                                     |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LAND-1 | The landing page MUST render the mission headline and summary from synchronized landing content.                                                                |
| LAND-2 | Landing posts MUST support image, iframe, and document slides with required title, subtitle, body content, and asset source.                                    |
| LAND-3 | The landing experience MUST provide selectable post tabs, previous/next controls, slide indicators, timed progression, and direct slide selection.              |
| LAND-4 | The presentation MUST support the configured stacked and carousel variants and respect reduced-motion preferences.                                              |
| LAND-5 | Document slides MUST expose downloads; slides with source URLs MUST expose labeled internal or external links.                                                  |
| LAND-6 | Landing copy and assets MUST synchronize from `WORKSPACE-WEB-CONTENT` through `sync-web-content.mjs`, including stale-asset removal and PDF preview generation. |

## 6. Project Catalogue

| ID        | Requirement                                                                                                                         |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| PROJECT-1 | `/open-source` MUST list every configured workspace project.                                                                        |
| PROJECT-2 | Project cards MUST derive their summary from the repository README, with configured descriptions available when a README is absent. |
| PROJECT-3 | Project cards MUST display language composition from generated code statistics when available.                                      |
| PROJECT-4 | A registered project with a Makefile MUST expose parsed targets and highlighted source in a dialog.                                 |
| PROJECT-5 | Selecting a project MUST open `/<project-slug>` and render its full README with repository-relative asset resolution.               |
| PROJECT-6 | The project asset endpoint MUST restrict reads to the selected registered repository and serve only registered MIME types.          |

## 7. Source-Backed Catalogues

| ID     | Requirement                                                                                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| CAT-1  | Hooks MUST be filterable by stage and enforcement tier and MUST display stage, kind, tier, applicability, and canonical description.             |
| CAT-2  | Hook source dialogs MUST display highlighted source, source path, extracted documentation, and manifest metadata.                                |
| CAT-3  | The anti-pattern catalogue MUST combine classified banned patterns and swallowed-error detectors.                                                |
| CAT-4  | Patterns MUST be filterable by category and display reason, category, scope, language or extension metadata, and detector source when available. |
| CAT-5  | Hook and sandbox configuration catalogues MUST enumerate the resolved YAML sources and require display labels and descriptions.                  |
| CAT-6  | Configuration dialogs MUST provide schema and raw-file tabs, resolved values, highlighted YAML, source path, and copy controls.                  |
| CAT-7  | The sandbox catalogue MUST render an empty state when the guard configuration root is absent.                                                    |
| CAT-8  | The tooling catalogue MUST derive entries, usage, arguments, output, category, and Make target from `scripts/manifest.yaml`.                     |
| CAT-9  | Tool source dialogs MUST display extracted and highlighted script source when available.                                                         |
| CAT-10 | Catalogue cards MUST support per-item feedback counts and submission for their declared target type.                                             |

## 8. Governance and Observability

| ID    | Requirement                                                                                                                     |
| ----- | ------------------------------------------------------------------------------------------------------------------------------- |
| GOV-1 | `/ai-governance` MUST list configured standards with issuer, jurisdiction, type, status, date, access model, tags, and summary. |
| GOV-2 | Free resources MUST expose a download or source link; paid resources MUST expose the configured contact or purchase workflow.   |
| OBS-1 | `/llm-gateway` MUST resolve the Grafana base URL and probe service health on the server.                                        |
| OBS-2 | A healthy gateway MUST render configured dashboards as accessible tabs with embedded Grafana panels.                            |
| OBS-3 | An unavailable gateway MUST render a compact service-unavailable state with the configured start hint when available.           |
| OBS-4 | Grafana proxy and health routes MUST keep internal service addressing on the server side.                                       |

## 9. Search and Playground

| ID       | Requirement                                                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| SEARCH-1 | Search data MUST combine patterns, hooks, CI configs, guard configs, standards, scripts, route metadata, and registered projects.              |
| SEARCH-2 | Search MUST use client-side fuzzy matching and present results in an accessible modal listbox.                                                 |
| SEARCH-3 | Search MUST support arrow, Home, End, Enter, and Escape keys and route through Next.js navigation.                                             |
| SEARCH-4 | Search queries with results MUST emit browser analytics after the query settles.                                                               |
| PLAY-1   | `/playground` MUST load non-filename banned patterns and execute matching entirely in the browser.                                             |
| PLAY-2   | The playground MUST provide configured language selection, category filters, a CodeMirror editor, match results, and click-to-line navigation. |
| PLAY-3   | Playground language and category changes MUST emit browser analytics events.                                                                   |
| PLAY-4   | Playground input MUST never be executed as source code or sent to a matching backend.                                                          |

## 10. Feedback and Browser State

| ID         | Requirement                                                                                                                                  |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| STATE-1    | Theme, sidebar, and analytics state MUST use reactive client stores.                                                                         |
| STATE-2    | Browser analytics MUST persist page, search, feedback, and playground event aggregates locally with bounded event retention.                 |
| FEEDBACK-1 | Feedback controls MUST provide up/down voting and an optional comment dialog.                                                                |
| FEEDBACK-2 | Feedback submissions MUST be posted to the same-origin `/api/feedback` endpoint and optimistically reflected in the UI.                      |
| FEEDBACK-3 | The feedback endpoint MUST validate target type, target identifier, vote, comment length, session identifier, origin, and request rate.      |
| FEEDBACK-4 | Server feedback storage MUST sanitize identifiers and comments, cap retained entries, and aggregate one current vote per session and target. |

## 11. Content and Build Pipeline

| ID     | Requirement                                                                                                                                                                                                          |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PIPE-1 | Development and production builds MUST synchronize project registry, logos, Grafana dashboards, navigation, remote web documents, and landing content before serving or building.                                    |
| PIPE-2 | Generated JSON under `web/src/data/` MUST be consumed as build inputs and regenerated from canonical workspace sources.                                                                                              |
| PIPE-3 | YAML and Markdown filesystem reads MUST occur in server modules.                                                                                                                                                     |
| PIPE-4 | Syntax highlighting and Markdown rendering MUST sanitize generated HTML before insertion.                                                                                                                            |
| PIPE-5 | `WORKSPACE_CI_CONFIG_ROOT`, `WORKSPACE_GUARD_CONFIG_ROOT`, per-file overrides, project root, docs root, scripts root, and web-content root MUST remain configurable through their implemented environment contracts. |

## 12. Quality Attributes

| ID   | Requirement                                                                                                            |
| ---- | ---------------------------------------------------------------------------------------------------------------------- |
| QA-1 | The application MUST use Next.js App Router, React, strict TypeScript, and server-first rendering.                     |
| QA-2 | Shared UI primitives MUST come from `@workspace-ci/web-components`; portal-specific composition MUST remain in `web/`. |
| QA-3 | Interactive controls MUST be keyboard operable, labeled, visibly focused, and compatible with light and dark themes.   |
| QA-4 | Routes that load source or service data MUST provide loading and error states appropriate to the section.              |
| QA-5 | The portal MUST remain usable at 320px and wider under REQ-WIKI-RESPONSIVE.                                            |
| QA-6 | `npm run lint`, `npm run type-check`, `npm test`, and `npm run build` MUST be the web validation gates.                |

## 13. Acceptance

1. `npm run check:generated` confirms generated navigation and registry inputs are current.
2. `/` renders synchronized landing content or redirects according to the feature flag.
3. `/open-source` renders registered repositories and project README routes.
4. Hook, anti-pattern, configuration, sandbox, tooling, and governance catalogues render from their canonical sources and open their inspection dialogs.
5. Search opens from the header and keyboard shortcuts and routes to indexed content.
6. Playground matching remains browser-local and supports category and language controls.
7. `/llm-gateway` renders either live dashboard tabs or its unavailable state.
8. Feedback validation and persistence tests pass.
9. The web lint, type-check, test, and build gates pass.
