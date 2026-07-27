# REQ-WEB-COMPONENTS: Shared Web Component Library Extraction

**Date:** 2026-07-25
**Status:** Draft
**Type:** Requirements
**Specification:** [SPEC-WEB-COMPONENTS](../specifications/SPEC-WEB-COMPONENTS.md)

> This document defines the requirements for extracting the reusable
> UI core of `web/` (the workspace-ci wiki) into a shared npm workspace
> package, `web-components/`, so that a second Next.js application -
> `hitl/web` (REQ-HITL-WEB) - and any future app consume the same
> primitives, design tokens, theming, and content-rendering pipeline
> instead of forking them. Where components are not properly isolated
> today (fs loaders inside components, global stores reached from deep
> in the tree, hardcoded routes/storage keys, global CSS outside
> `src/`), the extraction MUST refactor them into explicit,
> prop-injected, package-safe forms rather than copying the coupling.
> The extraction is behaviour-preserving for the wiki: zero visual or
> functional regressions, verified by the existing test suite.

---

**Cross-references:**

- [SPEC-WEB-COMPONENTS](../specifications/SPEC-WEB-COMPONENTS.md): companion specification (extraction slices, packaging, refactor patterns)
- [REQ-HITL-WEB](REQ-HITL-WEB.md): first external consumer of the package
- [REQ-WIKI](REQ-WIKI.md) / [SPEC-WIKI](../specifications/SPEC-WIKI.md): the wiki app whose core is extracted
- [REQ-WIKI-RESPONSIVE](REQ-WIKI-RESPONSIVE.md): responsive/a11y behaviour the extracted components must preserve
- [REQ-PORTABILITY](REQ-PORTABILITY.md): portability contract (shell-side; unchanged)
- [shadcn/ui monorepo packaging pattern](https://ui.shadcn.com/docs/monorepo): source-exported workspace package + `exports` map precedent
- [Tailwind v4 library distribution](https://github.com/tailwindlabs/tailwindcss/discussions/18545): `@source` directive for consuming packages' class scanning

---

## 1. Purpose & Scope

### 1.1 Purpose

`web/` grew as a single app: generic primitives (`ui/*`, loading
states, markdown/mermaid rendering, theme handling) share a tree with
wiki-domain components, and several "generic-looking" components are
silently coupled to the wiki (fs reads inside `WikiShell`, analytics
store in search/feedback hooks, hardcoded `/api/*` routes and storage
keys, 35 global CSS partials living in `public/`). With a second app
(`hitl/web`) needing the same visual language and primitives, the
choices are: fork-and-drift, or extract properly. This requirement set
mandates extraction into a workspace package with explicit isolation
rules, and mandates refactoring the improperly isolated parts as part
of the move - not later.

### 1.2 Scope

**This document OWNS the requirements for:**

- Creation of the `web-components/` npm workspace package and the
  repo-root npm workspaces setup it implies.
- The extraction inventory: which components/hooks/libs/stores/CSS
  move, which stay app-side.
- Isolation rules for extracted code (no fs, no env reads, no
  hardcoded routes/storage keys, no app-domain types).
- Refactors required where isolation is violated today (prop
  injection, store extraction, route/key parameterization).
- The packaging contract: exports map, peer deps, CSS/token shipping,
  Tailwind v4 consumption pattern, TypeScript config.
- Behaviour preservation of `web/` (the wiki) and test migration.
- Consumer contract for `hitl/web` and future apps.

**This document DOES NOT:**

- Own wiki-domain components (nav, branding, domain lists/dialogs,
  landing stack, playground, feedback/grafana) - they stay in `web/`.
- Own the HITL app's own components or flows (REQ-HITL-WEB).
- Own publishing: the package is private, workspace-internal; no
  registry release.
- Own visual redesign: extraction is pixel-preserving.
- Own server-side data loaders (`search-data`, `branding`,
  `yaml-loader`, `project-registry`, `docs-loader`, `landing-posts`,
  `config-paths`) - they remain app-side.

### 1.3 Terminology

| Term | Definition |
|------|------------|
| Package | The `web-components/` workspace package, published name `@workspace-ci/web-components`. |
| App / consumer | A Next.js app in this repo that depends on the package (`web/` = the wiki, `hitl/web` = HITL UI). |
| Generic component | A component whose props, styles, and behaviour carry no wiki-domain concept (no nav maps, branding loaders, domain types). |
| Isolation violation | Any of: fs/env access, `process.cwd()` path assumptions, hardcoded `/api/*` routes, hardcoded localStorage keys, imports of app-domain modules, global-store reads not owned by the package. |
| Source-exported | The package ships TS/TSX source (no build step); consumers compile it via Next `transpilePackages`. |
| Token system | The three-tier CSS custom-property design tokens in `_variables.css` (palette → semantic → component). |

### 1.4 Approach Rationale

| Candidate | Verdict | Rationale |
|-----------|---------|-----------|
| **Source-exported workspace package (shadcn monorepo pattern)** | **Selected** | Zero build tooling to operate; Next compiles via `transpilePackages`; types always in sync; matches repo's no-publish posture. |
| Built package (tsup → dist ESM + d.ts) | Rejected | Build step, watch-mode friction, dual type/emission drift - unjustified for a private two-consumer library. |
| Copy components per app (shadcn install model) | Rejected | Fork-and-drift: fixes and a11y improvements would need N ports; contradicts the single-source goal. |
| Publish to a registry | Rejected | No registry in the workspace; versions move with the repo via lockfile + code review. |

---

## 2. Functional Requirements

### FR-1: Workspace & Package Setup

| ID | Requirement |
|----|-------------|
| FR-1.1 | An npm-workspaces root MUST be introduced for the JS packages in this repo (repo-root `package.json` with `workspaces` covering `web`, `web-components`, and later `hitl/web`), with a single root lockfile. Existing boot-node toolchain integration (Makefile `install-node`/`install-web-deps`) MUST keep working. |
| FR-1.2 | The package MUST be named `@workspace-ci/web-components`, `private: true`, `type: module`, with an `exports` map exposing at minimum: `./components/*`, `./hooks/*`, `./lib/*`, `./stores/*`, `./styles/*`, and `./types/*`. |
| FR-1.3 | The package MUST be source-exported (no build step); consumers MUST list it in `transpilePackages` and the TS configs MUST resolve it. |
| FR-1.4 | Peer dependencies MUST be exactly: `react`, `react-dom`, `next`. Runtime deps of extracted modules (e.g. `clsx`, `marked`, `isomorphic-dompurify`, `shiki`, `mermaid`, `zustand`, `fuse.js` if search ships) MUST be declared as package dependencies; each consuming app MUST NOT need to redeclare them. |
| FR-1.5 | The wiki app MUST consume the package for everything extracted; no copied remnants of extracted code may stay in `web/src/`. |

### FR-2: Extraction Inventory

| ID | Requirement |
|----|-------------|
| FR-2.1 | **Slice 1 (primitives) MUST move:** all of `src/components/ui/*` (Button, CopyButton, CollapsibleSection, ErrorBoundary, Icon, Modal, Tabs, Toggle, Tooltip), all `src/components/loading-states/*`, plus the near-generic components ThemeLogo, PillFilter, LanguageFilter, ServiceUnavailable, MatchPanel, ThemeToggle, and CardListSection/WikiCard (renamed domain-free, e.g. `Card`, `CardListSection`). |
| FR-2.2 | **Slice 1 supporting code MUST move:** generic hooks (`useNarrowViewport`, `useHorizontalSwipe`, `useScrollDepth`, `useCardFilter`), the theme store (generic; storage key parameterized), the generic parts of `lib/utils.ts` (slugify, resolvePath, formatValue, truncateMarkdown), the `CardItem` type, and the generic CSS partials + token system (`_variables.css` and the partials backing the extracted classes). |
| FR-2.3 | **Slice 2 (content pipeline) MUST move:** ContentRenderer + its lib chain (`markdown-fences`, `markdown-links`, `highlight`, `sanitize`) and MermaidRenderer + the `mermaid-*` lib modules, after the refactors in FR-3. |
| FR-2.4 | **Wiki-domain code MUST NOT move:** WikiShell/Sidebar/Breadcrumbs/HeaderBrand/Footer/MobileNavToggle, ComingSoon/ErrorShell/NotFoundShell, domain lists/filters/dialogs (PatternList, HookList, ProjectList, StageFilter, TierFilter, SchemaFieldCards, Config/Contact/EntryPoint/Makefile dialogs, MakefileTargetCards), Grafana/GatewayTabs/FeedbackWidget, the landing carousel stack, the playground, `useSearch`/WikiSearch (Slice 3 deferred, Open Question 1), all fs loaders, the analytics and sidebar stores, and `wiki-nav.ts`. |
| FR-2.5 | The inventory MUST be recorded as an explicit manifest in the SPEC; any component's move/stay decision MUST be traceable to an isolation criterion, not taste. |

### FR-3: Isolation Refactors (blocking, part of the move)

| ID | Requirement |
|----|-------------|
| FR-3.1 | Extracted components MUST NOT read the filesystem, `process.env`, or `process.cwd()`. Server data MUST arrive via props (pattern: loader stays app-side, data flows in as props - as `WikiSidebar` already receives `stats`/`branding`). |
| FR-3.2 | Extracted code MUST NOT contain hardcoded app routes. `lib/markdown-links.ts`'s `/api/project-asset` coupling MUST be inverted (asset-URL resolver injected via options/prop). |
| FR-3.3 | Extracted code MUST NOT contain hardcoded localStorage/sessionStorage keys; the theme store MUST take its storage key as a parameter/config constant supplied by the package, namespaced to the package (not `workspace-ci-wiki-*`). Consuming apps MAY override. |
| FR-3.4 | Global-store access inside extracted components MUST be limited to stores that ship inside the package (theme store); analytics/sidebar coupling in anything extracted MUST be inverted to props/callbacks or the component stays app-side. |
| FR-3.5 | The `@/*` path alias MUST NOT appear in package code: intra-package imports are relative; cross-boundary imports use the package name. |
| FR-3.6 | `lib/utils.ts` MUST be split: generic helpers move to the package; `pageTitle()`/`wiki-nav` coupling stays app-side. No app-domain import may remain in any moved module. |
| FR-3.7 | MermaidRenderer's implicit global DOM-scan contract MUST be made explicit: the markup contract (`data-mermaid`, `.mermaid-frame`) MUST be documented in the package README/types, since it spans ContentRenderer (producer) and MermaidRenderer (consumer). |
| FR-3.8 | Theme activation MUST be packaged as a reusable unit: the inline `data-theme` bootstrap script currently in `app/layout.tsx` MUST become an exported, parameterized component/script from the package so consumers get identical no-flash theming without copy-paste. |

### FR-4: Styling & Tokens

| ID | Requirement |
|----|-------------|
| FR-4.1 | The package MUST ship its CSS: the token system (`_variables.css` three-tier) and every partial backing extracted components, as importable CSS via the exports map. CSS MUST live inside the package (not `public/`). |
| FR-4.2 | Consuming apps MUST integrate via Tailwind v4 CSS-first: app CSS does `@import 'tailwindcss'` + package CSS import, and declares `@source` pointing at the package so utility classes used inside package components are generated (Tailwind v4 library pattern). |
| FR-4.3 | Remix Icon CSS MUST remain a consumer-side import (documented in package README); the package declares the `ri-*` contract but does not bundle the font CSS. |
| FR-4.4 | Font variables (`--font-montserrat`, `--font-jetbrains-mono`) referenced by tokens MUST have documented fallbacks so a consumer without `next/font` setup renders acceptably. |
| FR-4.5 | Dark/light theming MUST keep working via the `data-theme` attribute mechanism, driven by the packaged theme store + bootstrap script (FR-3.8), with no per-app duplication beyond a single import/usage. |

### FR-5: Quality & Behaviour Preservation

| ID | Requirement |
|----|-------------|
| FR-5.1 | Extraction MUST be behaviour-preserving for the wiki: no visual, routing, or functional regressions; the existing Playwright/vitest suites are the regression oracle and MUST pass unchanged in assertion content (import-path updates excepted). |
| FR-5.2 | Tests for moved code MUST move into the package (vitest co-located or package-local `tests/`), and the repo's coverage thresholds MUST be maintained or raised per moved module - no coverage dilution via relocation. |
| FR-5.3 | The custom vitest bare-import aliasing hack (forcing resolution into `web/node_modules`) MUST be eliminated for package tests; workspaces hoisting makes it unnecessary. |
| FR-5.4 | Both apps MUST pass the repo's JS gates (eslint, tsc, vitest) and the CVE scan hook after the change. |
| FR-5.5 | `next.config` `output: 'standalone'` and the wiki Containerfile MUST keep working with workspaces (lockfile + node_modules layout changes verified in CI). |

### FR-6: Consumer Contract (hitl/web)

| ID | Requirement |
|----|-------------|
| FR-6.1 | `hitl/web` MUST depend on `@workspace-ci/web-components` (workspace protocol) and MUST NOT copy any component, hook, token, or CSS partial from `web/`. |
| FR-6.2 | Components hitl/web needs that the package lacks (e.g. TierBadge, EvidencePack layout primitives) MUST be evaluated for genericity: genuinely generic ones are added to the package; HITL-domain ones live in hitl/web. The decision rule is the FR-3 isolation criteria. |

---

## 3. Non-Functional Requirements

### NFR-1: Maintainability

| ID | Requirement |
|----|-------------|
| NFR-1.1 | Every exported module MUST be reachable via the `exports` map; no deep relative imports across the package boundary. |
| NFR-1.2 | Package code MUST follow the same lint/typecheck gates as app code (strict TS, no `any` leakage in public props). |
| NFR-1.3 | Public component props MUST be documented (TSDoc) at the same standard as the existing ui/* components. |
| NFR-1.4 | The package MUST declare explicit boundaries via multiple entry points rather than one barrel, so consumers tree-shake cleanly (components/hooks/lib/stores/styles/types). |

### NFR-2: Compatibility

| ID | Requirement |
|----|-------------|
| NFR-2.1 | React Server Components compatibility MUST be preserved: components that are server-safe today (e.g. ThemeLogo, loading states, ContentRenderer) MUST NOT gain `'use client'` during extraction. |
| NFR-2.2 | The package MUST work under Next 16 / React 19 (repo pins) and declare those as peer ranges. |
| NFR-2.3 | Accessibility behaviour (focus traps in Modal/Tabs, aria labelling, keyboard paths per REQ-WIKI-RESPONSIVE) MUST be preserved bit-for-bit through the move. |

### NFR-3: Performance

| ID | Requirement |
|----|-------------|
| NFR-3.1 | Client-bundle impact MUST NOT regress: heavy deps (mermaid, shiki, CodeMirror) remain dynamically imported exactly as today. |
| NFR-3.2 | CSS shipped to any consumer MUST contain only the partials backing extracted components; wiki-domain partials stay app-side. |

---

## 4. Constraints

| ID | Constraint | Source |
|----|------------|--------|
| C-1 | No published registry: workspace-internal package only. | Repo posture |
| C-2 | Tailwind v4 CSS-first (no `tailwind.config` reintroduction). | web/ current architecture |
| C-3 | Behaviour preservation for the wiki is a hard gate (FR-5.1). | Project policy |
| C-4 | npm (not pnpm/yarn) as the workspace manager, matching the boot-node toolchain. | Makefile install-node |
| C-5 | The wiki's prebuild content-sync scripts and app-side fs loaders remain in `web/`. | App ownership |
| C-6 | Tests may move but coverage thresholds may not drop. | vitest.config.ts policy |

---

## 5. Assumptions

| ID | Assumption |
|----|------------|
| A-1 | npm workspaces hoisting is compatible with the repo's boot-node layout and CI runners (verified during implementation). |
| A-2 | Tailwind v4's `@source` directive correctly scans workspace package sources (validated pattern per upstream discussion 18545). |
| A-3 | Next 16 `transpilePackages` handles a source-exported workspace package without extra config beyond listing it. |
| A-4 | The wiki's existing test suite is a sufficient regression oracle for pixel/behaviour parity (supplemented by manual visual check of key pages). |

---

## 6. Open Questions

1. **Slice 3 (search).** WikiSearch + useSearch + search-index are generic modulo the analytics store and `useRouter`. Extract in a later slice behind an injected analytics callback + router adapter, or leave permanently app-side? Deferred - hitl/web does not need search in v1.
2. **Analytics store generalization.** If more hooks migrate later, the analytics store needs configurable storage keys + event taxonomy. Deferred with Slice 3.
3. **Storybook/catalogue.** A package-local component catalogue (Storybook or a wiki `/playground`-style page) would aid review; not required by any consumer yet. Deferred.
4. **CodeEditor extraction.** The CodeMirror wrapper is generic modulo its pattern-highlight API; extract only if a second consumer appears (hitl/web does not need it).

---

## 7. Verification Matrix

| # | Test | Maps to |
|---|------|---------|
| V1 | `npm install` at repo root produces a single lockfile; `web` builds and passes its full vitest + eslint + tsc gates. | FR-1.1, FR-5.4 |
| V2 | Import every package entry point from a scratch consumer; no deep imports required; tree-shaking verified via bundle analyzer on the wiki build. | FR-1.2, NFR-1.1, NFR-1.4 |
| V3 | grep package source for `fs`, `process.env`, `process.cwd`, `@/`, `/api/`, `localStorage '` literals: zero isolation violations. | FR-3.1-FR-3.6 |
| V4 | Wiki visual regression: key pages (landing, project detail, checks, playground) render pixel-identical before/after (manual + Playwright screenshot diff where available). | FR-5.1 |
| V5 | Coverage report: per-module thresholds for moved code ≥ pre-move values. | FR-5.2, C-6 |
| V6 | Theme: dark/light toggle + no-flash bootstrap works identically in wiki AND in a fresh hitl/web scaffold using only package imports. | FR-4.5, FR-3.8, FR-6.1 |
| V7 | Tailwind: a utility class used only inside package components renders correctly in both apps (validates `@source` setup). | FR-4.2 |
| V8 | `next build` + standalone output + Containerfile build of the wiki succeed against the workspace layout. | FR-5.5 |
| V9 | ContentRenderer + MermaidRenderer round-trip in hitl/web scaffold: markdown with a mermaid fence renders, with asset-URL resolver injected (no `/api/project-asset` reference). | FR-2.3, FR-3.2, FR-3.7 |
| V10 | RSC audit: server components in the package carry no `'use client'`; client components carry exactly one directive at the top. | NFR-2.1 |

---

## 8. Implementation Status

| Item | Status | Evidence |
|------|--------|----------|
| REQ-WEB-COMPONENTS (this document) | Draft | - |
| SPEC-WEB-COMPONENTS | Draft | `docs/specifications/SPEC-WEB-COMPONENTS.md` |
| Workspace root + package scaffold | Not started | - |
| Slice 1 extraction | Not started | - |
| Slice 2 extraction | Not started | - |
| hitl/web consumer wiring | Not started | REQ-HITL-WEB §8 |
