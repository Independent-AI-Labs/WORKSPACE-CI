# SPEC-WEB-COMPONENTS: Shared Web Component Library Implementation

**Date:** 2026-08-16
**Status:** Active
**Type:** Specification
**Requirements:** [REQ-WEB-COMPONENTS](../requirements/REQ-WEB-COMPONENTS.md)

## 1. Package Layout

The repository root is an npm workspace containing:

```text
WORKSPACE-CI/
├── package.json
├── package-lock.json
├── web/
├── web-components/
│   ├── package.json
│   ├── tsconfig.json
│   ├── eslint.config.mjs
│   ├── vitest.config.ts
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── lib/
│   │   ├── stores/
│   │   ├── styles/
│   │   ├── types/
│   │   └── theme-script.tsx
│   └── tests/
└── hitl/web/
```

`@workspace-ci/web-components` exports source files directly. Next.js consumers
compile that source through `transpilePackages`, so package changes require no
intermediate library build.

## 2. Export and Dependency Contract

The package exports these patterns:

| Export         | Source                 |
| -------------- | ---------------------- |
| `components/*` | `src/components/*.tsx` |
| `hooks/*`      | `src/hooks/*.ts`       |
| `lib/*`        | `src/lib/*.ts`         |
| `stores/*`     | `src/stores/*.ts`      |
| `styles/*.css` | `src/styles/*.css`     |
| `types/*`      | `src/types/*.ts`       |
| `theme-script` | `src/theme-script.tsx` |

React, React DOM, and Next.js are peers. `clsx`, `marked`,
`isomorphic-dompurify`, Shiki, Mermaid, and Zustand are package runtime
dependencies because shared implementation imports them directly.

Both consumers declare version `0.1.0` and list the package in
`next.config.mjs` `transpilePackages`. Their TypeScript path mappings point to
the source tree for editor and test resolution.

## 3. Component Inventory

### 3.1 Controls and Structure

| Component            | Contract                                                               |
| -------------------- | ---------------------------------------------------------------------- |
| `Button`             | Shared button variants and native button props                         |
| `Icon`               | RemixIcon class rendering with shared sizes                            |
| `CopyButton`         | Clipboard action and transient copied state                            |
| `Modal`              | Native modal dialog with cancel, backdrop close, and focus restoration |
| `Tabs`               | Accessible tablist, tabs, and panels                                   |
| `Toggle`             | Labeled pressed-state control                                          |
| `Tooltip`            | Accessible contextual label presentation                               |
| `CollapsibleSection` | Expandable section control and content                                 |
| `ErrorBoundary`      | Shared client error containment and recovery presentation              |
| `ServiceUnavailable` | Compact or full unavailable-state presentation                         |

### 3.2 Catalogue Components

`Card` consumes `CardItem`, a presentation-only record containing identifiers,
titles, descriptions, links, icons or logos, tags, and metadata. Applications
convert domain records with local adapters and pass local actions as children.

`CardListSection` combines `useCardFilter`, `PillFilter`, counts, cards, and an
empty state. `LanguageFilter` and `PillFilter` provide reusable filtering
controls. `MatchPanel` displays pattern matches and delegates selection through
an injected callback.

Loading components provide sidebar, category, pattern-grid, config-table, and
check-list progress states using shared visual classes.

### 3.3 Theme Components

`ThemeLogo` selects theme-specific assets. `ThemeToggle` consumes the shared
theme store. Applications may wrap or re-export the store after configuring an
application-specific storage key.

## 4. Generic Hooks

| Hook                 | Responsibility                                                        |
| -------------------- | --------------------------------------------------------------------- |
| `useCardFilter`      | Category selection, filtered records, totals, and per-category counts |
| `useNarrowViewport`  | Reactive narrow-layout media-query state                              |
| `useHorizontalSwipe` | Pointer/touch horizontal swipe recognition                            |
| `useScrollDepth`     | Maximum browser scroll-depth tracking                                 |

Hooks receive data and callbacks rather than importing application stores or
domain modules.

## 5. Content Pipeline

`ContentRenderer` is an async Server Component. Its processing order is:

1. split Mermaid fences from Markdown;
2. select prose or repository-README link behavior;
3. parse ordinary fenced code;
4. highlight language-tagged code with Shiki or escape untagged code;
5. sanitize each generated HTML fragment;
6. emit Mermaid frames with escaped diagram source;
7. render the combined sanitized HTML in a `.prose` container.

README rendering accepts repository URL, branch, project slug, and an injected
asset resolver. This keeps repository addressing in the consuming application.

`MermaidRenderer` discovers diagram frames after render and coordinates the
support modules:

- `mermaid-run-queue` serializes Mermaid operations;
- `mermaid-theme` maps portal tokens to Mermaid themes;
- `mermaid-diagram` renders and updates diagrams;
- `mermaid-legend` derives legend content;
- `mermaid-fullscreen` manages expanded viewing;
- `mermaid-export` produces downloadable output.

## 6. Theme Runtime

`stores/theme.ts` owns a map of Zustand stores keyed by storage key. A store
starts with light theme state and supports `toggle`, `setTheme`, and `hydrate`.
Applying a theme writes the root `data-theme` attribute and browser storage.
Hydration accepts an existing root attribute, then stored preference, then the
system preference. System changes apply while no explicit stored choice exists.

`configureThemeStorageKey` configures the default exported store for an
application. `createThemeStore` supplies an explicitly keyed store.

`ThemeScript` is a Server Component that emits a small inline bootstrap. Before
paint it reads the configured key, validates `light` or `dark`, and applies the
configured default when storage is unavailable or invalid.

## 7. Style Distribution

`src/styles/_variables.css` defines shared custom-property tokens.
`src/styles/base.css` is the consolidated entrypoint used by HITL. Individual
partials remain exported for the portal, whose `globals.css` interleaves shared
and portal styles to preserve its cascade.

Shared partials cover primitives, buttons, tabs, toggles, theme controls, cards,
filters, badges, loading states, match panels, collapsible sections, error
boundaries, logos, and accessibility behavior.

The portal declares `@source '../../../web-components/src'` so Tailwind scans
shared source. HITL imports `base.css` and adds approval-flow styles locally.

## 8. Consumer Boundary

### 8.1 Workspace Portal

The portal uses shared components for its shell controls, catalogue cards,
dialogs, content rendering, loading states, playground results, theme, service
states, sanitization, and syntax highlighting. Portal modules retain route
metadata, source loaders, card adapters, feedback, analytics, project data,
landing behavior, and Grafana integration.

### 8.2 HITL Web

HITL imports shared `base.css`, installs `ThemeScript` in its root layout, and
uses shared controls such as `Button`. HITL retains approval state, relay API
contracts, authentication behavior, and decision workflows.

## 9. Accessibility

Shared interactive components expose native semantics where possible. `Modal`
uses `<dialog>`, restores prior focus on close, maps browser cancel to the
consumer callback, and supports title-derived or explicit labeling. Tabs,
toggles, filters, and buttons expose their selected or pressed state.

`_a11y.css` centralizes focus visibility, screen-reader helpers, reduced-motion
rules, and coarse-pointer target expansion. Applications remain responsible for
meaningful labels and page-level navigation structure.

## 10. Testing and Tooling

`tsconfig.json` compiles package source and tests under strict, no-emit,
bundler-resolution TypeScript. ESLint extends Next.js core web vitals and
TypeScript rules.

Vitest uses jsdom and `tests/setup.ts`. Tests are organized by components,
hooks, stores, and libraries. Coverage includes all source TS/TSX except types
and enforces the thresholds declared in `vitest.config.ts`.

Validation commands:

```bash
npm run lint --workspace=web-components
npm run type-check --workspace=web-components
npm test --workspace=web-components
npm run test:coverage --workspace=web-components
```

Root workspace commands may run corresponding scripts across all applications
and the shared package.
