# SPEC-WEB-COMPONENTS: Shared Web Component Library Extraction

**Date:** 2026-07-25
**Status:** Draft
**Type:** Specification
**Requirements:** [REQ-WEB-COMPONENTS](../requirements/REQ-WEB-COMPONENTS.md)

> Implementation detail for extracting `web/`'s reusable core into the
> `@workspace-ci/web-components` workspace package: the npm workspaces
> setup, the exact move/stay manifest, per-module refactor instructions
> for every isolation violation found in the 2026-07-25 audit, the
> CSS/token shipping mechanism, test migration, and the consumer wiring
> for `hitl/web`. Maps every requirement ID in
> [REQ-WEB-COMPONENTS](../requirements/REQ-WEB-COMPONENTS.md) to
> concrete files and edits.

---

**Cross-references:**

- [REQ-WEB-COMPONENTS](../requirements/REQ-WEB-COMPONENTS.md): owning requirements contract
- [SPEC-HITL-WEB](SPEC-HITL-WEB.md): first external consumer
- [SPEC-WIKI](../specifications/SPEC-WIKI.md): the app being refactored
- [shadcn/ui monorepo docs](https://ui.shadcn.com/docs/monorepo): `exports`-map source-package pattern
- [Tailwind discussion #18545](https://github.com/tailwindlabs/tailwindcss/discussions/18545): `@source` consumption pattern

---

## 1. Target Layout

```
WORKSPACE-CI/
├── package.json                  # NEW: private root, workspaces, shared dev scripts
├── package-lock.json             # single root lockfile (web/package-lock.json deleted)
├── web/                          # the wiki app (consumer)
│   ├── package.json              # name stays workspace-ci-wiki; dep: @workspace-ci/web-components
│   └── src/                      # wiki-domain code only after extraction
├── web-components/               # NEW: the package
│   ├── package.json              # @workspace-ci/web-components
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   ├── src/
│   │   ├── components/           # ui primitives + near-generic set (§3.1)
│   │   ├── hooks/                # generic hooks (§3.2)
│   │   ├── lib/                  # sanitize, highlight, markdown-*, mermaid-*, utils (§3.3)
│   │   ├── stores/theme.ts       # parameterized theme store (§4.2)
│   │   ├── styles/               # tokens + partials (§5)
│   │   ├── theme-script.tsx      # no-flash bootstrap (§4.3)
│   │   └── types/                # CardItem etc.
│   └── tests/                    # moved component/hook/lib tests
└── hitl/web/                     # future consumer (SPEC-HITL-WEB)
```

## 2. Workspace Root (FR-1)

Root `package.json`:

```json
{
  "name": "workspace-ci-js",
  "private": true,
  "workspaces": ["web", "web-components", "hitl/web"],
  "scripts": {
    "build": "npm run build --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "type-check": "npm run type-check --workspaces --if-present"
  }
}
```

- npm (C-4); Node ≥ 24 as today. `hitl/web` listed only once it exists
  (npm tolerates a missing glob entry - add at scaffold time instead;
  record the choice at implementation).
- Makefile: `install-web-deps` changes from `npm --prefix web install`
  to root `npm install`; `NODE_ENV_BIN` path checks adjusted to the
  hoisted `node_modules/.bin`. The wiki's prebuild sync scripts stay in
  `web/package.json` untouched.
- `web-components/package.json`:

```json
{
  "name": "@workspace-ci/web-components",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    "./components/*": "./src/components/*.tsx",
    "./hooks/*": "./src/hooks/*.ts",
    "./lib/*": "./src/lib/*.ts",
    "./stores/*": "./src/stores/*.ts",
    "./styles/*": "./src/styles/*.css",
    "./types/*": "./src/types/*.ts",
    "./theme-script": "./src/theme-script.tsx"
  },
  "peerDependencies": { "next": "^16", "react": "^19", "react-dom": "^19" },
  "dependencies": {
    "clsx": "^2.1.1", "marked": "^17", "isomorphic-dompurify": "^2.36",
    "shiki": "^4.3.1", "mermaid": "^11.16.0", "zustand": "^5"
  }
}
```

Consumers add `"transpilePackages": ["@workspace-ci/web-components"]`
to `next.config` (FR-1.3). Package tsconfig extends the strict settings
of `web/tsconfig.json`; `moduleResolution: "bundler"`; no path aliases
inside the package (FR-3.5).

## 3. Move/Stay Manifest (FR-2)

### 3.1 Components

| Component (web/src today) | Decision | Required refactor |
|---|---|---|
| `components/ui/*` (9) | MOVE as-is | alias rewrite only |
| `components/loading-states/*` (5) | MOVE | rename internal `wiki-*` class references where used purely decoratively; classes ship via partials (§5) |
| `wiki/ThemeLogo.tsx` | MOVE | none - already prop-driven, server-safe |
| `wiki/PillFilter.tsx` | MOVE | alias rewrite |
| `wiki/LanguageFilter.tsx` | MOVE | alias rewrite |
| `wiki/ServiceUnavailable.tsx` | MOVE | none |
| `wiki/playground/MatchPanel.tsx` | MOVE | none |
| `wiki/ThemeToggle.tsx` | MOVE | consume packaged theme store (§4.2) |
| `wiki/WikiCard.tsx` → `Card.tsx` | MOVE+RENAME | drop "Wiki" naming; `CardItem` type moves to `types/card.ts` |
| `wiki/CardListSection.tsx` | MOVE | alias rewrite; uses `useCardFilter` (moves) + PillFilter (moves) |
| `wiki/ContentRenderer.tsx` | MOVE | §3.3 lib chain + FR-3.2 resolver injection |
| `wiki/MermaidRenderer.tsx` | MOVE | theme store from package; `usePathname` retained (Next peer); contract documented (FR-3.7) |
| `wiki/WikiShell/Sidebar/Breadcrumbs/HeaderBrand/Footer/MobileNavToggle` | STAY | fs loaders + `wiki-nav` + branding |
| `wiki/ComingSoon/ErrorShell/NotFoundShell` | STAY | wrap WikiShell |
| Domain lists/filters/dialogs, landing stack, playground (minus MatchPanel), Grafana/GatewayTabs/FeedbackWidget, WikiSearch/useSearch | STAY | domain types, fs, analytics, hardcoded routes (OQ-1 for search) |
| `components/StoreHydration.tsx` | STAY | hydrates app stores |

### 3.2 Hooks

| Hook | Decision | Refactor |
|---|---|---|
| `useNarrowViewport`, `useHorizontalSwipe`, `useScrollDepth` | MOVE | alias rewrite |
| `useCardFilter` | MOVE | `CardItem` from package types |
| `useGestureCanvasTransform` | STAY (landing-coupled via usage) with `lib/gesture-canvas.ts` | revisit if a consumer appears |
| `useSearch`, `useFeedback`, `usePageVisibility`, `useTrackPageView`, `usePlayground`, `use*Filter` (pattern/hook/project), `useRotatingPostsController` | STAY | analytics/domain coupling |

### 3.3 Lib

| Module | Decision | Refactor |
|---|---|---|
| `lib/sanitize.ts`, `lib/highlight.ts` | MOVE | shiki theme name becomes an exported constant with override param |
| `lib/markdown-fences.ts` | MOVE | alias rewrite |
| `lib/markdown-links.ts` | MOVE | **FR-3.2:** constructor/factory takes `resolveAssetUrl?: (slug, path) => string`; default `undefined` = no rewriting; wiki injects its `/api/project-asset` mapper app-side |
| `lib/mermaid-*.ts` (6 modules) | MOVE | alias rewrite; theme reads via packaged theme store |
| `lib/utils.ts` | SPLIT (FR-3.6) | `slugify`, `resolvePath`, `formatValue`, `formatValueHtml`, `truncateMarkdown` → package `lib/utils.ts`; `pageTitle` + `wiki-nav` import stays in `web/src/lib/utils.ts` re-exporting package helpers |
| `lib/regex-engine.ts`, `lib/gesture-canvas.ts`, `lib/landing-*`, `lib/search-*`, `lib/branding.ts`, `lib/yaml-loader.ts`, `lib/project-registry.ts`, `lib/docs-loader.ts`, `lib/feedback-loader.ts`, `lib/config-paths.ts`, `lib/feature-flags.ts`, `lib/grafana-url.ts`, `lib/wiki-nav.ts` | STAY | fs/env/domain |

## 4. Store & Theme Packaging (FR-3.3, FR-3.4, FR-3.8)

### 4.1 Store moves

- `stores/theme-store.ts` → `src/stores/theme.ts`. Refactor:
  storage key becomes `createThemeStore({ storageKey = 'wc-theme' })`
  factory, or a module-level constant exported for app override -
  pick the factory; wiki passes `'theme'` to preserve its existing
  key + inline-script contract (FR-3.3).
- `stores/sidebar-store.ts`, `stores/analytics-store.ts`: STAY
  (app-domain; analytics has hardcoded `workspace-ci-wiki-*` keys).

### 4.2 ThemeToggle

Moves; imports the packaged store. No props change.

### 4.3 No-flash bootstrap (FR-3.8)

Extract `app/layout.tsx:35-73`'s inline script into
`src/theme-script.tsx`:

```tsx
export function ThemeScript({ storageKey = 'wc-theme', defaultTheme = 'dark' }) {
  const js = `(function(){try{var t=localStorage.getItem('${storageKey}')||'${defaultTheme}';
    document.documentElement.dataset.theme=t;}catch(e){}})()`;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}
```

(The HITL CSP spec already permits a nonce-bearing inline bootstrap;
`dangerouslySetInnerHTML` here is the single documented exception,
consistent with Next's own `next/script` beforeInteractive pattern and
excluded from REQ-HITL-WEB FR-4.3 by amendment - see §7.) Wiki uses
`<ThemeScript storageKey="theme" />`; hitl/web uses defaults.

## 5. CSS & Tokens (FR-4)

Move from `web/public/styles/` into `web-components/src/styles/`:

- `_variables.css` (full three-tier token system) - moved verbatim.
- Backing partials for extracted classes: `_buttons`, `_tabs`,
  `_toggle`, `_collapsible-section`, `_error-boundary`, `_badges`,
  `_components`, `_a11y`, `_loading`, `_tooltip`, `_modal`,
  `_filters`, `_cards` (exact set confirmed at move time by grepping
  class usage of the moved components; rule: a partial moves iff every
  class it defines is used by moved components, else it is split).
- Package entry `./styles/base.css` = tokens + moved partials, plus a
  `./styles/tokens.css` for tokens-only consumers.
- Wiki keeps wiki-domain partials in `web/public/styles/`; its
  `globals.css` becomes:

```css
@import 'tailwindcss';
@source "../../web-components/src";
@import '@workspace-ci/web-components/styles/base.css';
/* ... remaining wiki partials ... */
@import 'remixicon/fonts/remixicon.css';
```

- hitl/web `globals.css` is the same minus wiki partials (FR-4.2
  `@source` pattern per upstream guidance; never point `@source` at all
  of `node_modules`).
- Font vars: tokens reference
  `var(--font-montserrat, 'Montserrat', system-ui, sans-serif)` style
  font stacks - verify each token declares a complete stack; add where
  missing (FR-4.4).
- Remix Icon: consumers import the CSS (FR-4.3); package README
  documents it.

## 6. Test Migration (FR-5.2, FR-5.3)

- Move tests mirroring moved code from `tests/web/**` into
  `web-components/tests/**`; delete the moved trees from `tests/web/`.
- `web-components/vitest.config.ts`: jsdom, Testing Library, jest-dom;
  plain relative resolution (FR-5.3 kills the bare-import alias hack).
  Coverage thresholds copied per-module from the current config and
  applied to the package; `web/vitest.config.ts` thresholds updated to
  the shrunken `web/src` tree (no dilution, C-6).
- `tests/web/tsconfig.json` and the repo's `type-check` wiring
  (`web/package.json` script compiling `../tests/web/tsconfig.json`)
  are updated to the two-package layout.
- Root `make check-push` JS stage runs both packages' gates.

## 7. Amendment to SPEC-HITL-WEB

SPEC-HITL-WEB §1 layout and §5 CSP gain:

- Dependency: `"@workspace-ci/web-components": "*"` (workspace).
- UI composition: DecisionPanel/TierBadge/EvidencePack built from
  package primitives (Button, Modal, Tabs, Toggle, Tooltip,
  CopyButton, Icon, ErrorBoundary, loading states); theming via
  packaged theme store + `<ThemeScript/>`.
- CSP: the ThemeScript inline bootstrap is the single sanctioned
  inline script, delivered with the per-request nonce (REQ-HITL-WEB
  FR-4.1's nonce-based `script-src` covers it); REQ-HITL-WEB FR-4.3's
  `dangerouslySetInnerHTML` ban is amended to exempt the packaged
  ThemeScript only.

## 8. Execution Sequence

1. Root workspaces + package scaffold; CI green with zero code moved
   (validates hoisting, Makefile, Containerfile).
2. Slice 1 move (components/hooks/store/CSS) + alias rewrites; wiki
   imports swapped to package paths; full gate suite + V4 visual check.
3. Slice 2 move (content pipeline) incl. FR-3.2 resolver injection;
   wiki injects its asset mapper; V9-style round-trip test in wiki.
4. Test migration + threshold rebalancing (can ride with 2-3).
5. hitl/web scaffold consumes the package from its first commit
   (SPEC-HITL-WEB §1 amendment).

Each step is independently mergeable; no big-bang branch.

## 9. Implementation Status

| Item | Status | Evidence |
|------|--------|----------|
| §1-§8 design | Specified | - |
| Workspace root | Implemented | `package.json` workspaces (`web`, `web-components`, `hitl/web`); `npm install` hoists; `Makefile` `install-web-deps` delegates to all packages |
| Package scaffold | Implemented | `web-components/package.json` with exports map; lint/type-check/test via `Makefile` |
| Slice 1 (components/hooks/store/CSS) | Implemented | Components/hooks/store/CSS moved; wiki imports rewritten; gates green |
| Slice 2 (content pipeline + resolver injection) | Implemented | `ContentRenderer`, `MermaidRenderer`, `markdown-fences`, `markdown-links`, `mermaid-*` moved; `resolveWikiProjectAsset` injected; tests green |
| Root `make check-push` all JS package gates | Implemented | `Makefile` runs `web`, `web-components`, and `hitl/web` lint/type-check/test |
| hitl/web consumer wiring | Implemented | `hitl/web` scaffold depends on `@workspace-ci/web-components`; uses package primitives, theme script, tokens, and typed BFF stand-ins; gates green |
| SPEC-HITL-WEB amendment (§7) | Applied | SPEC-HITL-WEB §1, §5 |
