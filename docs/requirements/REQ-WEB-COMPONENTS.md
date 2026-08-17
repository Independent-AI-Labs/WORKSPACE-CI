# REQ-WEB-COMPONENTS: Shared Web Component Library

**Date:** 2026-08-16
**Status:** Active
**Type:** Requirements
**Specification:** [SPEC-WEB-COMPONENTS](../specifications/SPEC-WEB-COMPONENTS.md)

## 1. Purpose

`web-components/` is the private, source-exported UI library shared by the
workspace portal and HITL web application. It owns reusable presentation,
interaction, content-rendering, theming, and style contracts while each
application retains its domain data and workflows.

## 2. Workspace Contract

| ID    | Requirement                                                                                                                        |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------- |
| PKG-1 | The repository root MUST define npm workspaces for `web`, `web-components`, and `hitl/web` with one root lockfile.                 |
| PKG-2 | The package MUST be named `@workspace-ci/web-components`, private, ESM, and source-exported without a separate distribution build. |
| PKG-3 | The exports map MUST expose components, hooks, libraries, stores, CSS styles, types, and the theme bootstrap script.               |
| PKG-4 | Consumers MUST declare the workspace package dependency and configure Next.js `transpilePackages`.                                 |
| PKG-5 | React, React DOM, and Next.js MUST remain peer dependencies with versions compatible with both consumers.                          |
| PKG-6 | Runtime dependencies used by shared implementation MUST be declared by `web-components`.                                           |

## 3. Ownership Boundary

### 3.1 Shared Library Owns

| ID    | Requirement                                                                                                                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OWN-1 | Generic controls MUST include button, icon, modal, tabs, toggle, tooltip, copy, collapsible, and error-boundary primitives.                                               |
| OWN-2 | Generic catalogue components MUST include cards, card lists, category and language filters, match panels, and loading states.                                             |
| OWN-3 | Content infrastructure MUST include sanitized Markdown rendering, syntax highlighting, Markdown link and fence handling, and Mermaid rendering/export/fullscreen support. |
| OWN-4 | Theme infrastructure MUST include CSS tokens, reusable theme styles, a parameterized reactive theme store, toggle, logo, and first-paint script.                          |
| OWN-5 | Generic hooks MUST include card filtering, horizontal swipe, narrow-viewport detection, and scroll-depth tracking.                                                        |
| OWN-6 | Shared types MUST remain domain-neutral and include the card presentation contract.                                                                                       |

### 3.2 Applications Own

| ID    | Requirement                                                                                                                                           |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| APP-1 | Applications MUST own routes, navigation manifests, branding, authentication, analytics, feedback transport, runtime API clients, and domain records. |
| APP-2 | Applications MUST adapt domain records into shared prop and type contracts before rendering shared components.                                        |
| APP-3 | Shared modules MUST NOT import from `web/` or `hitl/web`.                                                                                             |
| APP-4 | Shared modules MUST NOT read application filesystem roots, environment variables, or hard-coded application endpoints.                                |

## 4. Component Requirements

| ID   | Requirement                                                                                                                                                     |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI-1 | Shared Client Components MUST declare `'use client'`; server-compatible components and libraries MUST remain free of browser-only imports.                      |
| UI-2 | `Modal` MUST use the native dialog element, support title or explicit accessible labeling, close on cancel and backdrop interaction, and restore prior focus.   |
| UI-3 | Buttons, tabs, toggles, filters, and tooltips MUST expose keyboard and ARIA state appropriate to their control semantics.                                       |
| UI-4 | `Card` MUST render a domain-neutral `CardItem` and accept application-owned child actions.                                                                      |
| UI-5 | `CardListSection` MUST filter by category, show visible and total counts, render an explicit empty state, and inject application-owned card content by item ID. |
| UI-6 | Loading states MUST use shared visual tokens and expose busy state to assistive technology.                                                                     |
| UI-7 | `ServiceUnavailable` MUST provide reusable compact and full unavailable-state presentation.                                                                     |

## 5. Content Requirements

| ID        | Requirement                                                                                                                        |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| CONTENT-1 | `ContentRenderer` MUST render GFM-compatible prose and repository README content on the server.                                    |
| CONTENT-2 | Markdown HTML and highlighted code MUST be sanitized before insertion.                                                             |
| CONTENT-3 | Fenced code MUST use syntax highlighting when a language is present and escaped plain code otherwise.                              |
| CONTENT-4 | README links and assets MUST support injected repository, branch, project, and asset-resolution context.                           |
| CONTENT-5 | Mermaid fences MUST render as isolated diagram frames and be activated by `MermaidRenderer`.                                       |
| CONTENT-6 | Mermaid support MUST provide theme synchronization, serialized render execution, legends, fullscreen viewing, and export controls. |

## 6. Theme and Style Requirements

| ID      | Requirement                                                                                                                                                             |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| THEME-1 | Theme values MUST be `light` or `dark` and apply through the root `data-theme` attribute.                                                                               |
| THEME-2 | The shared theme store MUST support a configurable storage key, cached stores per key, toggle, explicit set, and browser hydration.                                     |
| THEME-3 | `ThemeScript` MUST apply a persisted or configured default theme before application content paints.                                                                     |
| THEME-4 | Shared design tokens MUST use CSS custom properties and provide semantic colors, spacing, typography, radii, elevation, and component variables.                        |
| THEME-5 | `base.css` MUST provide the complete shared base-style entrypoint; individual style partials MUST remain importable by applications requiring explicit cascade control. |
| THEME-6 | Shared accessibility styles MUST provide visible focus behavior, screen-reader utilities, reduced-motion handling, and coarse-pointer target sizing.                    |
| THEME-7 | Consumers MUST include shared source in Tailwind scanning when shared utility classes require it.                                                                       |

## 7. Consumer Requirements

| ID         | Requirement                                                                                                                                              |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CONSUMER-1 | `web/` MUST compose selected shared style partials with portal-owned styles in its declared cascade order.                                               |
| CONSUMER-2 | `web/` MUST use shared cards, dialogs, content rendering, highlighting, theme, loading, filters, and utility components for implemented portal surfaces. |
| CONSUMER-3 | `hitl/web` MUST import `base.css`, use the shared theme script, and use shared controls where their contracts fit the approval UI.                       |
| CONSUMER-4 | Consumer TypeScript and test resolution MUST resolve package source consistently with npm workspace resolution.                                          |

## 8. Quality Requirements

| ID   | Requirement                                                                                                            |
| ---- | ---------------------------------------------------------------------------------------------------------------------- |
| QA-1 | Shared source and tests MUST compile under strict TypeScript with no emission.                                         |
| QA-2 | ESLint MUST extend Next.js core web vitals and TypeScript rules and reject explicit `any` and unused variables.        |
| QA-3 | Vitest MUST run shared component, hook, store, and library tests in jsdom.                                             |
| QA-4 | Coverage MUST include shared TypeScript and TSX source except type-only modules and enforce the configured thresholds. |
| QA-5 | Changes to exported behavior MUST include focused tests in `web-components/tests`.                                     |
| QA-6 | Package lint, type-check, test, and coverage commands MUST remain independently runnable.                              |

## 9. Acceptance

1. `npm run lint --workspace=web-components` passes.
2. `npm run type-check --workspace=web-components` passes.
3. `npm test --workspace=web-components` passes.
4. `npm run test:coverage --workspace=web-components` satisfies configured thresholds.
5. Both Next.js consumers resolve and transpile package source.
6. Shared source contains no imports from either consumer application.
7. Theme, modal, content rendering, card filtering, and Mermaid tests pass.
