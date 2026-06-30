# SPEC-WIKI: Interactive Wiki Web UI for workspace-ci: Specification

**Date:** 2026-06-09
**Status:** DRAFT
**Type:** Specification
**Requirements:** [REQ-WIKI](../requirements/REQ-WIKI.md)

> **Implementation status:**
>
> | Component | Status |
> |-----------|--------|
> | `web/` directory | Not created |
> | Next.js 16 app scaffold | Not built |
> | Content extraction pipeline | Not built |
> | `scripts/extract-docs` | Not built |
> | Wiki shell layout | Not built |
> | Pattern library | Not built |
> | Hook reference | Not built |
> | Configuration reference | Not built |
> | Pattern playground | Not built |
> | Search | Not built |
> | Analytics store | Not built |
> | Feedback widget | Not built |
> | Theme system | Not built |
> | Test suites | Not built |

---

## 1. Overview

This specification details a multi-source content pipeline powering an interactive
wiki web UI for workspace-ci. Content is sourced from four canonical locations, establishing
a **single source of truth** model:

1. **Python docstrings** (`ci/*.py`): extracted at build-time via `scripts/extract-docs`
   into `web/src/data/api-docs.json`.
2. **Shell function comments** (`lib/*.sh`): extracted at build-time into
   `web/src/data/shell-docs.json`.
3. **YAML configs** (`config/*.yaml`): read server-side at request time via `js-yaml`.
4. **Markdown docs** (`docs/*.md`, `README.md`, module `README.md` files,
   `web/content/*.md`): long-form prose.

### 1.1 Architecture Principles

1. **Server-first rendering.** Every component is a Server Component by default.
   `'use client'` is applied ONLY to leaf-level interactive elements (buttons,
   toggles, filters, the feedback widget, the playground editor). Data fetching
   happens on the server. Content pages ship zero JavaScript for their markup.

2. **Streaming by default.** Every content page uses `Suspense` boundaries
   to stream content progressively. The shell (sidebar, header) renders at
   CDN speed. Content sections stream in as their data resolves. No page
   blocks on the slowest data source.

3. **Logic extraction via custom hooks.** Interactive behavior is extracted
   into custom hooks (`useFeedback`, `usePatternFilter`, `usePlayground`, etc.).
   Components are pure functions of props and hook return values. Hooks are
   testable in isolation via `renderHook`.

4. **Single source of truth.** Content in the wiki is derived, never duplicated.
   Docstrings → check catalog. YAML → patterns, hooks, configs. Markdown → prose.

---

## 2. Conventions

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD",
"SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be
interpreted as described in RFC 2119.

---

## 3. Product Versions

| Component | Version | Source |
|-----------|---------|--------|
| Next.js | 16.1.7 | npm |
| React | 19.2.4 | npm |
| TypeScript | 5.9.3 | npm |
| Tailwind CSS | 4.2.1 | npm (`@tailwindcss/postcss`) |
| PostCSS | 8.5.8 | npm |
| npm | 11.6.2 | system |
| Node.js | >= 24 | system |
| zustand | 5.0.12 | npm |
| clsx | 2.1.1 | npm |
| fuse.js | ^7.x | npm |
| js-yaml | ^4.x | npm |
| gray-matter | ^4.x | npm |
| marked | ^17.x | npm |
| @codemirror/view | ^6.x | npm |
| @codemirror/state | ^6.x | npm |
| @codemirror/lang-python | ^6.x | npm |
| @codemirror/lang-javascript | ^6.x | npm |
| @codemirror/commands | ^6.x | npm |
| @codemirror/language | ^6.x | npm |
| RemixIcon | 4.3.0 | npm (vendored into web/public, self-hosted) |
| Montserrat | latest | Google Fonts (next/font) |
| JetBrains Mono | latest | Google Fonts (next/font) |
| ESLint | 9.x | npm |
| Prettier | 3.8.1 | npm |
| Vitest | 4.x | npm |

---

## 4. Content Pipeline Architecture

### 4.1 Build-Time Extraction

```
┌──────────────────────────────────────────────────────────┐
│  scripts/extract-docs (Python, uses ast module)           │
│                                                          │
│  Phase 1: Python sources:                               │
│    Input:  ci/*.py                                       │
│    Method: ast.parse() → walk AST → extract docstrings   │
│    Output: web/src/data/api-docs.json                    │
│                                                          │
│  Phase 2: Shell sources:                                │
│    Input:  lib/*.sh                                      │
│    Method: regex match '# --- ci_\\w+' separators → doc │
│    Output: web/src/data/shell-docs.json                  │
└──────────────────────────────────────────────────────────┘
```

### 4.2 Request-Time Loading

```
┌──────────────────────────────────────────────────────────┐
│  Next.js Server Components (async)                       │
│                                                          │
│  Data loaded via Promise.all() for parallelism:          │
│    api-docs.json     → Python check catalog              │
│    shell-docs.json   → Shell check catalog              │
│    config/*.yaml     → Patterns, hooks, configs          │
│                        (js-yaml, cache() deduplicated)   │
│    docs/*.md         → Long-form prose (gray-matter)     │
│                                                          │
│  Streaming via Suspense boundaries:                      │
│    Static shell → sidebar + header (immediate)           │
│    Dynamic content → patterns, hooks, checks (streamed)  │
└──────────────────────────────────────────────────────────┘
```

### 4.3 Content Source Mapping

| Wiki Page | Primary Source | Secondary Source |
|-----------|---------------|-----------------|
| `/` (Home) | `README.md` | analytics store stats |
| `/patterns` | `config/banned_words.yaml` | `config/banned_words_exceptions.yaml` |
| `/patterns/[category]` | `config/banned_words.yaml` (filtered) | `web/content/patterns/` |
| `/hooks` | `config/required_hooks.yaml` | `docs/HOOKS.md` |
| `/hooks/[id]` | `config/required_hooks.yaml` (filtered) | `api-docs.json` / `shell-docs.json` |
| `/config` | directory listing of `config/*.yaml` | `config/*.schema.yaml` (field docs) |
| `/config/[name]` | single `config/<name>.yaml` | `config/<name>.schema.yaml` + `web/content/config/<name>.md` |
| `/checks` | `api-docs.json` + `shell-docs.json` | module `README.md` files |
| `/checks/[id]` | single entry from api-docs / shell-docs | source file excerpt |
| `/playground` | `config/banned_words.yaml` |: |
| `/tiers` | `config/required_hooks.yaml` (tier matrix) | `web/content/tiers.md` |
| `/tooling` | `scripts/manifest.yaml` (canonical script manifest) | `web/content/tooling/` |
| `/integration` | `docs/HOOKS.md` | `web/content/integration.md` |

### 4.4 Hook Record Shape

The wiki renders hooks from `config/required_hooks.yaml`. The TypeScript model
MUST cover every `kind` variant the manifest uses:

```typescript
// src/types/hooks.ts
export type HookKind =
  | 'shell'               // entry = bash function name; args = staged files
  | 'shell_inline'        // entry = literal bash command string
  | 'shell_with_arg'      // entry = bash function taking one arg (commit-msg file)
  | 'python_module'       // entry = dotted module path (run as module)
  | 'python_module_files' // entry = module path + pass_filenames (files as CLI args)
  | 'makefile_target'     // entry = make target name

export type HookStage = 'pre-commit' | 'commit-msg' | 'pre-push'

export interface HookRecord {
  id: string
  kind: HookKind
  entry: string
  stage: HookStage
  pass_filenames: boolean
  always_run: boolean
  files?: string
  files_types?: string[]      // present on python_module_files hooks
  mandatory: boolean
  safety: boolean             // true = runs even at POC tier
  applicable_to: string[]     // [any] | [python] | [node] | [rust]
}

export interface RequiredHooksConfig {
  version: number
  hooks: HookRecord[]
}
```

The tier/stage matrix (FR-5.5) is derived: a hook runs in tier T and stage S
when `hook.stage === S` and `(T === 'strict') || (T === 'poc' && hook.safety)`
or `(T === 'vendored' && false)`.

### 4.5 Trust Boundaries

| Zone | Contains | Receives | Mutates |
|------|----------|----------|---------|
| `scripts/extract-docs` | `ast`, file I/O | `ci/*.py`, `lib/*.sh` | `web/src/data/*.json` |
| Server (Next.js) | Server components, `js-yaml`, `gray-matter`, `cache()` | HTTP requests, fs reads | Nothing on fs |
| Client (Browser) | React, Zustand, CodeMirror, fuse.js | Serialized props, user input | DOM, localStorage |

---

## 5. Server/Client Boundary Strategy

### 5.1 The Rule

`'use client'` MUST be applied at the **deepest possible leaf** in the component
tree. A component that only displays data is a Server Component. Only components
that need `useState`, `useEffect`, event handlers, or browser APIs are Client
Components.

### 5.2 Boundary Map

```
app/layout.tsx                    ← Server (async, reads i18n if needed)
└── WikiShell                     ← Server (layout: sidebar + header + slot)
    ├── WikiSidebar               ← Server (nav links, active route)
    │   ├── NavLink               ← Server (renders <a> with active style)
    │   └── ThemeToggle           ← 'use client' (onClick, reads theme store)
    ├── WikiSearch                ← 'use client' (fuse.js, keyboard events, modal)
    ├── WikiBreadcrumbs           ← Server (derives from pathname, no state)
    ├── {children}                ← Server slot (page content)
    │   ├── PatternList            ← Server (maps patterns → PatternCard)
    │   │   ├── CategoryNav       ← 'use client' (toggle state, category filter)
    │   │   └── PatternCard       ← Server (regex, reason, category badge)
    │   │       └── FeedbackWidget ← 'use client' (vote state, comment input)
    │   ├── HookTable              ← Server (maps hooks → HookRow)
    │   │   ├── StageFilter       ← 'use client' (pill toggle state)
    │   │   ├── TierFilter        ← 'use client' (pill toggle state)
    │   │   └── HookRow           ← Server (hook metadata display)
    │   │       └── FeedbackWidget ← 'use client'
    │   └── PlaygroundShell       ← 'use client' (CodeMirror, regex engine)
    │       ├── LanguageSelector  ← 'use client' (dropdown state)
    │       ├── CodeEditor        ← 'use client' (CodeMirror via next/dynamic)
    │       └── MatchPanel        ← 'use client' (scroll-to-line on click)
    └── WikiFooter                ← Server (static links, build info)
```

### 5.3 What This Achieves

- **Pattern library page**: ~2KB of client JS (CategoryNav toggles + FeedbackWidget
  instances). No JS shipped for the 50+ pattern cards themselves.
- **Hook reference page**: ~1.5KB of client JS (stage/tier filter pills +
  FeedbackWidget). No JS for hook metadata rows.
- **Playground page**: CodeMirror is `next/dynamic` with `ssr: false`: the
  ~600KB editor bundle loads only when the user navigates to `/playground`,
  never on other pages.

### 5.4 Data Flow: Server → Client

```
Server Component (data owner)         Client Component (interactive leaf)
────────────────────────────          ────────────────────────────────
async function PatternPage() {
  const patterns = await loadYaml()   ──props──→  <PatternList patterns={...}>
  return (
    <PatternList patterns={patterns}>
      <CategoryNav categories={cats}   ──props──→  'use client'
        activeCategories={active} />               toggle state, emits onChange
      {patterns.map(p =>
        <PatternCard pattern={p}>      ──props──→  Server Component (no JS)
          <FeedbackWidget              ──props──→  'use client'
            targetId={p.slug} />                   vote state, emits analytics
        </PatternCard>
      )}
    </PatternList>
  )
}
```

**Rule:** The Server Component owns data fetching. Client Components receive
data as serializable props and own ONLY interaction state. Client Components
MUST NOT import `fs`, `js-yaml`, `gray-matter`, or any server-only module.

### 5.5 Violations That Must Be Caught at Review

- `'use client'` on a layout component that wraps half the app
- `'use client'` on a parent that forces all children into the client bundle
- Server-only imports (`fs`, `js-yaml`) inside a `'use client'` file
- `useEffect` with `fetch()` where a Server Component could fetch directly

---

## 6. Streaming and Suspense Architecture

### 6.1 Strategy

Every content page with async data fetching MUST use `Suspense` boundaries
to stream content progressively. The user sees the shell (sidebar + header)
immediately. Content sections stream in as their data resolves: independently,
without blocking each other.

### 6.2 Page-Level Pattern

```typescript
// app/patterns/page.tsx: Server Component
import { Suspense } from 'react'

export default function PatternsPage() {
  return (
    <WikiShell>
      <Suspense fallback={<CategoryNavSkeleton />}>
        <CategoryNavSection />        {/* Streams when YAML parsed + categories built */}
      </Suspense>
      <Suspense fallback={<PatternGridSkeleton />}>
        <PatternListSection />        {/* Streams independently: doesn't block CategoryNav */}
      </Suspense>
    </WikiShell>
  )
}

// Each section fetches its own data: parallel, not sequential
async function CategoryNavSection() {
  const patterns = await getBannedPatterns()  // Uses cache() for dedup
  const categories = buildCategories(patterns)
  return <CategoryNav categories={categories} />
}

async function PatternListSection() {
  const config = await getBannedPatterns()  // cache() returns same promise: no double fetch
  return <PatternList patterns={classifyAll(config)} />  // all three rule groups (§11)
}
```

### 6.3 Route-Level Loading States

Every route with async data MUST have a `loading.tsx`:

```
app/
├── patterns/
│   ├── page.tsx          ← async Server Component
│   └── loading.tsx       ← Suspense fallback during navigation
├── hooks/
│   ├── page.tsx
│   ├── [id]/page.tsx
│   └── loading.tsx
├── config/
│   ├── page.tsx
│   ├── [name]/page.tsx
│   └── loading.tsx
├── checks/
│   ├── page.tsx
│   ├── [id]/page.tsx
│   └── loading.tsx
└── playground/
    └── page.tsx           ← No loading.tsx needed (full client component)
```

### 6.4 Skeleton Design Principles

- Skeletons MUST match the layout dimensions of the content they replace
  (same heights, widths, spacing: prevents Cumulative Layout Shift).
- Skeletons MUST use `animate-pulse` with `motion-safe:` prefix to respect
  `prefers-reduced-motion`.
- Category nav skeleton: 16 rows of `h-6 w-40` gray bars.
- Pattern grid skeleton: 6-8 cards of `h-32` gray rectangles.
- Hook table skeleton: table rows of `h-10` gray bars.

### 6.5 Granularity Rule

One `Suspense` boundary per **independently useful content section**.
A pattern library with 50 patterns: one boundary for the category nav,
one for the pattern grid: not one per pattern card (that's skeleton soup).

### 6.6 When NOT to Stream

- **Static content pages**: tiers, tooling (hardcoded data, no async fetching) -
  render synchronously.
- **Fast data**: if all data resolves in under 100ms, Suspense overhead isn't
  worth it. Profile first, then decide.
- **SEO-critical content**: content above the fold that search engines must
  index SHOULD be in the initial render, not behind a Suspense boundary
  (though modern crawlers handle streamed content well).

---

## 7. Custom Hooks Architecture

### 7.1 Principle

Interactive logic MUST be extracted into custom hooks. Components MUST be
pure functions of props and hook return values. This makes logic testable
in isolation (`renderHook`) and components reusable with different data.

### 7.2 Hook Inventory

```typescript
// src/hooks/

// ── Feedback ──
useFeedback(targetId: string, targetType: string)
  → { vote, comment, state, submit, dismiss }
  // Headless: state machine + analytics emission. No rendering.

// ── Pattern Library ──
usePatternFilter(patterns: ClassifiedPattern[])
  → { filtered, activeCategories, toggleCategory, selectAll, deselectAll, visibleCount, totalCount }

// ── Hook Reference ──
useHookFilter(hooks: HookRecord[])
  → { filtered, activeStages, activeTiers, toggleStage, toggleTier, stageCounts, tierCounts }

// ── Playground ──
usePlayground(patterns: ClassifiedPattern[], language: string)
  → { matches, setLanguage, activeCategories, toggleCategory, editorRef, isDirty }

// ── Search ──
useSearch(searchData: SearchIndexEntry[])
  → { results, query, setQuery, isOpen, open, close, selectedIndex, navigateResults }

// ── Page Stats ──
usePageStats(path: string)
  → { viewCount, dwellTime }

// ── Analytics (store consumers) ──
useTrackPageView(path: string, title: string)
  // Calls analyticsStore.track() on mount, cleanup on unmount
usePageVisibility(path: string)
  // Tracks dwell time via visibilitychange
useScrollDepth(path: string)
  // Tracks max scroll percent, emits on exit
```

### 7.3 Hook Composition

Hooks compose: a page component combines multiple hooks:

```typescript
// app/patterns/page.tsx (Server Component)
export default function PatternsPage() {
  return (
    <WikiShell>
      <Suspense fallback={<CategoryNavSkeleton />}>
        <CategoryNavSection />
      </Suspense>
      <Suspense fallback={<PatternGridSkeleton />}>
        <PatternListSection />
      </Suspense>
    </WikiShell>
  )
}
```

```typescript
// Client Component: only the interactive parts
'use client'
function PatternListClient({ patterns }: { patterns: ClassifiedPattern[] }) {
  const { filtered, activeCategories, toggleCategory, visibleCount, totalCount } = usePatternFilter(patterns)
  useTrackPageView('/patterns', 'Pattern Library')  // Side effect: analytics

  return (
    <div>
      <div className="pattern-count">{visibleCount} of {totalCount} patterns</div>
      {filtered.map(p => (
        <PatternCard key={p.pattern} pattern={p}>
          <FeedbackWidget targetId={slugify(p.pattern)} targetType="pattern" />
        </PatternCard>
      ))}
    </div>
  )
}
```

---

## 8. Directory Layout

```
workspace-ci/
├── config/                         ← Canonical YAML rules + schema docs
│   ├── banned_words.yaml
│   ├── banned_words.schema.yaml    ← Field docs for banned_words.yaml (FR-7.3)
│   └── ...                         ← one *.schema.yaml per config
├── scripts/
│   ├── manifest.yaml             ← Canonical script manifest (FR-11, single source for /tooling)
│   └── extract-docs              ← Build-time doc extraction (Python, uses ast)
│
├── web/
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.js
│   ├── postcss.config.mjs
│   ├── eslint.config.mjs
│   ├── .prettierrc
│   ├── vitest.config.ts
│   │
│   ├── app/                      ← Next.js App Router
│   │   ├── layout.tsx            ← Server: fonts, self-hosted icons, flash script, data-theme
│   │   ├── page.tsx              ← Home (Server)
│   │   ├── loading.tsx           ← Root loading fallback
│   │   ├── error.tsx             ← Root error boundary
│   │   ├── not-found.tsx         ← 404 page
│   │   ├── hooks/
│   │   │   ├── page.tsx
│   │   │   ├── loading.tsx
│   │   │   ├── error.tsx
│   │   │   ├── not-found.tsx
│   │   │   └── [id]/
│   │   │       ├── page.tsx
│   │   │       └── not-found.tsx
│   │   ├── patterns/
│   │   │   ├── page.tsx
│   │   │   ├── loading.tsx
│   │   │   ├── error.tsx
│   │   │   └── [category]/
│   │   │       ├── page.tsx
│   │   │       └── not-found.tsx
│   │   ├── config/
│   │   │   ├── page.tsx
│   │   │   ├── loading.tsx
│   │   │   ├── error.tsx
│   │   │   └── [name]/
│   │   │       ├── page.tsx
│   │   │       └── not-found.tsx
│   │   ├── playground/
│   │   │   └── page.tsx          ← 'use client' (full client, no loading.tsx)
│   │   ├── checks/
│   │   │   ├── page.tsx
│   │   │   ├── loading.tsx
│   │   │   ├── error.tsx
│   │   │   └── [id]/
│   │   │       ├── page.tsx
│   │   │       └── not-found.tsx
│   │   ├── tiers/page.tsx
│   │   ├── tooling/page.tsx
│   │   └── integration/page.tsx
│   │
│   ├── src/
│   │   ├── data/                 ← Generated, committed JSON
│   │   │   ├── api-docs.json
│   │   │   └── shell-docs.json
│   │   │
│   │   ├── content/              ← Wiki-authored markdown
│   │   │   ├── patterns/
│   │   │   ├── hooks/
│   │   │   ├── config/
│   │   │   ├── tiers.md
│   │   │   ├── integration.md
│   │   │   └── troubleshooting.md
│   │   │
│   │   ├── components/
│   │   │   ├── ui/               ← Custom UI primitives (Server, except interactive ones)
│   │   │   │   ├── Button.tsx          ← 'use client'
│   │   │   │   ├── Button.test.tsx
│   │   │   │   ├── Toggle.tsx          ← 'use client'
│   │   │   │   ├── Toggle.test.tsx
│   │   │   │   ├── Tabs.tsx            ← 'use client' (context + click handlers)
│   │   │   │   ├── Tabs.test.tsx
│   │   │   │   ├── ErrorBoundary.tsx   ← 'use client' (class component)
│   │   │   │   ├── CollapsibleSection.tsx ← 'use client'
│   │   │   │   └── Icon.tsx            ← Server (just renders <i>)
│   │   │   │
│   │   │   ├── wiki/             ← Wiki feature components
│   │   │   │   ├── WikiShell.tsx        ← Server (layout composition)
│   │   │   │   ├── WikiSidebar.tsx      ← Server (nav links)
│   │   │   │   ├── WikiSearch.tsx       ← 'use client' (fuse.js, keyboard)
│   │   │   │   ├── WikiBreadcrumbs.tsx  ← Server
│   │   │   │   ├── WikiFooter.tsx       ← Server
│   │   │   │   ├── PatternList.tsx      ← Server (maps patterns → cards)
│   │   │   │   ├── PatternCard.tsx      ← Server (regex, reason text)
│   │   │   │   ├── CategoryNav.tsx      ← 'use client' (toggle state)
│   │   │   │   ├── HookTable.tsx        ← Server (maps hooks → rows)
│   │   │   │   ├── HookBadge.tsx        ← Server (colored pill based on props)
│   │   │   │   ├── StageFilter.tsx      ← 'use client'
│   │   │   │   ├── TierFilter.tsx       ← 'use client'
│   │   │   │   ├── ConfigFieldTable.tsx ← Server
│   │   │   │   ├── TierComparison.tsx   ← Server (static table)
│   │   │   │   ├── CheckCard.tsx        ← Server
│   │   │   │   ├── StatsBar.tsx         ← 'use client' (subscribes to analytics store, §10.9)
│   │   │   │   ├── QuickLinks.tsx       ← Server (§10.10)
│   │   │   │   ├── TrendingSection.tsx  ← 'use client' (§10.11, useTopPages selector)
│   │   │   │   ├── FeedbackWidget.tsx   ← 'use client' (vote state)
│   │   │   │   ├── FeedbackWidget.test.tsx
│   │   │   │   ├── ContentRenderer.tsx  ← Server (marked rendering)
│   │   │   │   ├── FeedbackAggregate.tsx ← 'use client' (computes from store)
│   │   │   │   │
│   │   │   │   └── playground/
│   │   │   │       ├── PlaygroundShell.tsx    ← 'use client'
│   │   │   │       ├── CodeEditor.tsx          ← 'use client' (CodeMirror)
│   │   │   │       ├── MatchPanel.tsx          ← 'use client'
│   │   │   │       ├── LanguageSelector.tsx    ← 'use client'
│   │   │   │       └── PatternCategoryFilter.tsx ← 'use client'
│   │   │   │
│   │   │   └── skeletons/        ← Skeleton components for Suspense fallbacks
│   │   │       ├── SidebarSkeleton.tsx
│   │   │       ├── CategoryNavSkeleton.tsx
│   │   │       ├── PatternGridSkeleton.tsx
│   │   │       ├── HookTableSkeleton.tsx
│   │   │       ├── ConfigTableSkeleton.tsx
│   │   │       └── CheckListSkeleton.tsx
│   │   │
│   │   ├── hooks/                ← Custom hooks (logic extraction)
│   │   │   ├── useFeedback.ts
│   │   │   ├── useFeedback.test.ts
│   │   │   ├── usePatternFilter.ts
│   │   │   ├── usePatternFilter.test.ts
│   │   │   ├── useHookFilter.ts
│   │   │   ├── useHookFilter.test.ts
│   │   │   ├── usePlayground.ts
│   │   │   ├── usePlayground.test.ts
│   │   │   ├── useSearch.ts
│   │   │   ├── useSearch.test.ts
│   │   │   ├── usePageStats.ts
│   │   │   ├── usePageStats.test.ts
│   │   │   ├── useTrackPageView.ts
│   │   │   ├── usePageVisibility.ts
│   │   │   └── useScrollDepth.ts
│   │   │
│   │   ├── stores/
│   │   │   ├── theme-store.ts
│   │   │   ├── theme-store.test.ts
│   │   │   ├── analytics-store.ts
│   │   │   └── analytics-store.test.ts
│   │   │
│   │   ├── lib/
│   │   │   ├── theme.ts
│   │   │   ├── yaml-loader.ts         ← cached YAML loading (js-yaml + cache())
│   │   │   ├── content-loader.ts      ← Markdown loading (gray-matter + marked)
│   │   │   ├── content-loader.test.ts
│   │   │   ├── regex-engine.ts
│   │   │   ├── regex-engine.test.ts
│   │   │   ├── search-index.ts        ← Fuse.js index builder
│   │   │   ├── search-index.test.ts
│   │   │   ├── patterns.ts            ← Pattern classifier
│   │   │   ├── patterns.test.ts
│   │   │   ├── sanitize.ts            ← DOMPurify wrapper (server-only, §10.7)
│   │   │   ├── sanitize.test.ts
│   │   │   └── page-stats.ts          ← Visibility + scroll tracker
│   │   │
│   │   ├── types/
│   │   │   ├── patterns.ts
│   │   │   ├── hooks.ts
│   │   │   ├── analytics.ts
│   │   │   ├── wiki.ts
│   │   │   └── content.ts
│   │   │
│   │   ├── test/
│   │   │   └── setup.ts               ← Vitest setup (localStorage mock, matchMedia)
│   │   │
│   │   └── styles/
│   │       └── globals.css
│   │
│   └── public/
│       ├── favicon.svg
│       └── styles/
│           ├── shared.css
│           ├── _variables.css
│           ├── _wiki-layout.css
│           ├── _wiki-sidebar.css
│           ├── _wiki-patterns.css
│           ├── _wiki-playground.css
│           ├── _wiki-feedback.css
│           ├── _wiki-stats.css
│           ├── _wiki-skeletons.css
│           ├── _prose.css
│           ├── _buttons.css
│           ├── _tabs.css
│           ├── _search.css
│           ├── _error-boundary.css
│           └── _a11y.css              ← Focus rings, skip-link, screen-reader
```

---

## 9. Route Design

### 9.1 Route Table

| Route | Page Type | Loading | Error | Not Found |
|-------|----------|---------|-------|-----------|
| `/` | Server → client shell | `loading.tsx` | `error.tsx` |: |
| `/hooks` | Server → client `HookTable` | `loading.tsx` | `error.tsx` |: |
| `/hooks/[id]` | Server → client detail | `loading.tsx` | `error.tsx` | `not-found.tsx` |
| `/patterns` | Server → client `PatternList` | `loading.tsx` | `error.tsx` |: |
| `/patterns/[category]` | Server → client filtered | `loading.tsx` | `error.tsx` | `not-found.tsx` |
| `/config` | Server → client list | `loading.tsx` | `error.tsx` |: |
| `/config/[name]` | Server → client detail | `loading.tsx` | `error.tsx` | `not-found.tsx` |
| `/playground` | Client only |: |: |: |
| `/checks` | Server → client catalog | `loading.tsx` | `error.tsx` |: |
| `/checks/[id]` | Server → client detail | `loading.tsx` | `error.tsx` | `not-found.tsx` |
| `/tiers` | Server → client static |: |: |: |
| `/tooling` | Server → client static |: |: |: |
| `/integration` | Server → client static |: |: |: |

### 9.2 Server Component Data Fetching Pattern

Every page that loads YAML MUST use parallel fetching with `Promise.all()`:

```typescript
// app/hooks/page.tsx
import { Suspense } from 'react'
import { getRequiredHooks } from '@/lib/yaml-loader'

export default function HooksPage() {
  return (
    <WikiShell>
      <Suspense fallback={<HookTableSkeleton />}>
        <HookTableSection />
      </Suspense>
    </WikiShell>
  )
}

async function HookTableSection() {
  const hooksManifest = await getRequiredHooks()
  return <HookTableClient hooks={hooksManifest.hooks} />
}
```

### 9.3 YAML Loader with Request Deduplication

```typescript
// src/lib/yaml-loader.ts
import { cache } from 'react'
import { readFileSync } from 'fs'
import { join } from 'path'
import { load } from 'js-yaml'

// Config root is configurable so the wiki can be pointed at an alternate
// config tree (e.g. a vendored copy, a CI artifact) without code changes.
// Default: the parent repo's config/ dir, assuming the wiki is served from
// a checkout of workspace-ci (web/ lives inside the repo).
// Override via WORKSPACE_CI_CONFIG_ROOT (absolute path or relative to web/).
const CONFIG_ROOT = process.env.WORKSPACE_CI_CONFIG_ROOT
  ?? join(process.cwd(), '..', 'config')

const DOCS_ROOT = process.env.WORKSPACE_CI_DOCS_ROOT
  ?? join(process.cwd(), '..', 'docs')

// cache() deduplicates calls within a single request.
// If PatternListSection and CategoryNavSection both call getBannedPatterns(),
// only one filesystem read occurs.
export const getBannedPatterns = cache(async (): Promise<BannedWordsConfig> => {
  const raw = readFileSync(join(CONFIG_ROOT, 'banned_words.yaml'), 'utf8')
  return load(raw) as BannedWordsConfig
})

export const getRequiredHooks = cache(async (): Promise<RequiredHooksConfig> => {
  const raw = readFileSync(join(CONFIG_ROOT, 'required_hooks.yaml'), 'utf8')
  return load(raw) as RequiredHooksConfig
})

// Schema loader (§21.4): returns null when no schema file exists so the
// config detail page can fall back to raw-YAML-only rendering.
export const getConfigSchema = cache(async (name: string): Promise<ConfigSchema | null> => {
  const p = join(CONFIG_ROOT, `${name}.schema.yaml`)
  try {
    return load(readFileSync(p, 'utf8')) as ConfigSchema
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw e
  }
})

// ... one cached loader per YAML config
```

#### Deployment Model

The wiki is a self-contained Next.js app but has a runtime data dependency on
the workspace-ci `config/` and `docs/` trees. The supported deployment shapes:

1. **In-tree (default):** `web/` lives inside a workspace-ci checkout;
   `CONFIG_ROOT` defaults to `../config`. This is the primary mode.
2. **External config tree:** Set `WORKSPACE_CI_CONFIG_ROOT` to an absolute
   path (or a path relative to `web/`) pointing at a config tree. Use this
   to document a forked or vendored config set, or to run the wiki in CI
   against an artifact.

Missing files at the resolved root MUST surface as a server-render error on
the affected page (caught by the route's `error.tsx`), not a crash. The
`/config` index page MUST list only the YAML files actually present at
`CONFIG_ROOT` (directory listing), so a partial config tree degrades
gracefully.

### 9.4 Revalidation

Markdown content pages MAY declare revalidation for ISR:

```typescript
// app/integration/page.tsx
export const revalidate = 3600  // Revalidate every hour
```

YAML-loaded pages SHOULD use `cache('no-store')` or no explicit revalidation
(reads from filesystem are fast enough for a documentation wiki).

### 9.5 Error Handling for YAML Parse Failures

```typescript
// app/patterns/error.tsx
'use client'

export default function PatternsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="error-state" role="alert">
      <h2>Failed to load pattern library</h2>
      <p className="text-muted">{error.message}</p>
      <button onClick={reset} className="btn btn--primary">
        Try again
      </button>
    </div>
  )
}
```

### 9.6 Not Found Handling

```typescript
// app/hooks/[id]/not-found.tsx
export default function HookNotFound() {
  return (
    <div className="not-found-state">
      <h2>Hook not found</h2>
      <p>The requested hook does not exist in the manifest.</p>
      <a href="/hooks" className="btn btn--secondary">
        View all hooks
      </a>
    </div>
  )
}
```

---

## 10. Component Specifications

### 10.1 WikiShell

```typescript
// Server Component: layout composition only, no interactivity
interface WikiShellProps {
  children: React.ReactNode
}

// Renders:
// <div className="wiki-shell">
//   <WikiSidebar />
//   <div className="wiki-main">
//     <header>
//       <WikiBreadcrumbs />
//       <ThemeToggle />        ← 'use client' leaf
//       <SearchTrigger />      ← 'use client' leaf (opens WikiSearch)
//     </header>
//     <main>{children}</main>
//     <WikiFooter />
//   </div>
//   <WikiSearch />             ← 'use client' (modal, rendered at root)
// </div>
```

### 10.2 PatternCard

```typescript
// Server Component: pure data display, zero JS
interface PatternCardProps {
  pattern: ClassifiedPattern
  categoryLabel: string
  exemptions?: UniversalException[]
  rationaleContent?: string
  feedbackSlot?: React.ReactNode   // Client Component injected by parent
}

// Renders:
// <article className="pattern-card" id={slug}>
//   <CategoryBadge label={categoryLabel} />
//   <code className="pattern-card__regex">{pattern.pattern}</code>
//   <p className="pattern-card__reason">{pattern.reason}</p>
//   {exemptions && <ExemptionInfo exemptions={exemptions} />}
//   {rationaleContent && <ContentRenderer content={rationaleContent} />}
//   {feedbackSlot}  ← FeedbackWidget slotted in from parent
// </article>
```

### 10.3 ConfigFieldTable

```typescript
// Server Component: renders field/type/default/description for a config.
// Reads the schema file (§21.4) as the canonical source of field docs.
// Pure data display, zero client JS.

interface ConfigField {
  path: string
  type: string
  required: boolean
  default?: unknown
  description: string
}

interface ConfigSchema {
  config: string
  description: string
  fields: ConfigField[]
}

interface ConfigFieldTableProps {
  schema: ConfigSchema        // parsed from config/<name>.schema.yaml
  values: Record<string, unknown>  // parsed from config/<name>.yaml (for default-vs-actual display)
}

// Renders:
// <section className="config-fields" aria-label="Configuration fields">
//   <p className="config-fields__desc">{schema.description}</p>
//   <table className="config-field-table">
//     <thead>
//       <tr><th>Path</th><th>Type</th><th>Required</th><th>Default</th><th>Description</th></tr>
//     </thead>
//     <tbody>
//       {schema.fields.map(f => <ConfigFieldRow field={f} value={resolve(values, f.path)} />)}
//     </tbody>
//   </table>
// </section>
//
// ConfigFieldRow renders the path as <code>, a RequiredBadge for required:true,
// the default value (or '-' if none), and the description as prose.
// Nested paths (foo[].bar) render with indentation reflecting depth.
```

When `schema` is `null` (no `*.schema.yaml` for this config), the config
detail page MUST omit the field table and render only the raw YAML block
(§10.x ContentRenderer / code block). A build-time warning is emitted so
missing schemas are visible without blocking deploys.

### 10.4 FeedbackWidget

```typescript
// 'use client': interactive leaf
// Uses headless useFeedback hook for state machine logic

interface FeedbackWidgetProps {
  targetId: string
  targetType: 'pattern' | 'hook' | 'config' | 'check' | 'page'
}

export function FeedbackWidget({ targetId, targetType }: FeedbackWidgetProps) {
  const { state, vote, comment, submit, dismiss } = useFeedback(targetId, targetType)

  if (state === 'submitted') {
    return <span className="feedback-thanks">Thanks for your feedback</span>
  }

  return (
    <div className="feedback-widget" role="group" aria-label="Rate this content">
      <button
        className={clsx('feedback-btn', vote === 'up' && 'is-active')}
        onClick={() => submit('up')}
        aria-label="Thumbs up"
        aria-pressed={vote === 'up'}
      >
        <i className="ri-thumb-up-line" />
      </button>
      <button
        className={clsx('feedback-btn', vote === 'down' && 'is-active')}
        onClick={() => submit('down')}
        aria-label="Thumbs down"
        aria-pressed={vote === 'down'}
      >
        <i className="ri-thumb-down-line" />
      </button>
      {vote && !state.includes('submitted') && (
        <div className="feedback-comment">
          <textarea
            placeholder="Optional: tell us more..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            aria-label="Additional feedback"
          />
          <button onClick={() => submit(vote)} className="btn btn--sm btn--primary">
            Send
          </button>
        </div>
      )}
    </div>
  )
}
```

### 10.5 useFeedback Hook (Headless)

```typescript
// src/hooks/useFeedback.ts
type FeedbackState = 'idle' | 'voting_up' | 'voting_down' | 'submitted_up' | 'submitted_down'

interface UseFeedbackReturn {
  state: FeedbackState
  vote: 'up' | 'down' | null
  comment: string
  setComment: (c: string) => void
  submit: (vote: 'up' | 'down') => void
  dismiss: () => void
}

export function useFeedback(
  targetId: string,
  targetType: FeedbackEvent['targetType'],
): UseFeedbackReturn {
  const addFeedback = useAnalyticsStore((s) => s.addFeedback)
  const savedVote = useAnalyticsStore((s) => s.getUserVote(targetId))

  const [vote, setVote] = useState<'up' | 'down' | null>(savedVote)
  const [comment, setComment] = useState('')
  const [submitted, setSubmitted] = useState(savedVote !== null)

  const state = deriveState(vote, submitted)

  const submit = useCallback((v: 'up' | 'down') => {
    setVote(v)
    setSubmitted(true)
    addFeedback({ targetId, targetType, vote: v, comment: comment || undefined, timestamp: Date.now() })
  }, [targetId, targetType, comment, addFeedback])

  return { state, vote, comment, setComment, submit, dismiss: () => {} }
}

// Testable in isolation:
// const { result } = renderHook(() => useFeedback('test-id', 'pattern'))
// expect(result.current.state).toBe('idle')
// act(() => result.current.submit('up'))
// expect(result.current.state).toBe('submitted_up')
```

### 10.6 Playground Components

```typescript
// app/playground/page.tsx: Server Component
// Loads patterns, classifies all three groups, then filters to content/directory
// scope (filename rules don't match editor text: see §11.1).
export default async function PlaygroundPage() {
  const config = await getBannedPatterns()
  const all = classifyAll(config)
  const playable = all.filter(p => p.scope !== 'filename')
  return <PlaygroundShell patterns={playable} />
}
```

```typescript
// 'use client': CodeMirror loaded via next/dynamic
'use client'
import dynamic from 'next/dynamic'

const CodeEditor = dynamic(
  () => import('@/components/wiki/playground/CodeEditor'),
  {
    ssr: false,
    loading: () => (
      <div className="playground-editor-skeleton" aria-busy="true">
        <div className="skeleton-line" />
        <div className="skeleton-line w-3/4" />
        <div className="skeleton-line w-1/2" />
      </div>
    ),
  },
)

export function PlaygroundShell({ patterns }: { patterns: ClassifiedPattern[] }) {
  const {
    matches,
    language,
    setLanguage,
    activeCategories,
    toggleCategory,
    editorRef,
  } = usePlayground(patterns)

  return (
    <div className="playground-shell">
      <div className="playground-toolbar">
        <LanguageSelector value={language} onChange={setLanguage} />
        <PatternCategoryFilter
          categories={PATTERN_CATEGORIES}
          active={activeCategories}
          onToggle={toggleCategory}
        />
      </div>
      <div className="playground-panes">
        <CodeEditor
          ref={editorRef}
          patterns={patterns}
          activeCategories={activeCategories}
          language={language}
          onMatchesChange={setMatches}
        />
        <MatchPanel matches={matches} onMatchClick={(line) => editorRef.current?.scrollToLine(line)} />
      </div>
    </div>
  )
}
```

### 10.7 ContentRenderer

```typescript
// Server Component: renders markdown from any source
// marked output is sanitized with DOMPurify before insertion to prevent
// XSS even though content is repo-authored/trusted (defense in depth).
import { marked } from 'marked'
import DOMPurify from 'dompurify'

// Server-side DOMPurify requires a DOM shim. Use the isomorphic wrapper:
// `dompurify` with `jsdom`-provided window in Node (configured in
// src/lib/sanitize.ts), or `isomorphic-dompurify`. Either way, the
// sanitize step runs at render time on the server, never in the client
// bundle (DOMPurify is a server-only import).
import { sanitizeHtml } from '@/lib/sanitize'

interface ContentRendererProps {
  content: string
  className?: string
}

export function ContentRenderer({ content, className }: ContentRendererProps) {
  const raw = marked(content, {
    gfm: true,
    breaks: false,
  })
  const html = sanitizeHtml(raw)  // strips scripts, event handlers, unsafe URLs

  return (
    <div
      className={clsx('prose', className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
```

Marked configuration: GFM tables enabled, fenced code blocks with language
labels. Code blocks styled via `_prose.css` with class-based syntax highlighting
(no shiki/highlight.js needed: the wiki displays pattern regexes and shell
commands, not complex code).

Sanitization (`src/lib/sanitize.ts`) wraps DOMPurify with a allowlist:
permitted tags are the GFM subset (headings, p, ul/ol/li, table, pre/code,
blockquote, a, strong/em, hr, br). `<script>`, inline event handlers
(`on*`), `javascript:` URLs, and `style` attributes are stripped. The
allowlist is centralized so all markdown rendering goes through one
sanitizer. DOMPurify is a server-only import: it MUST NOT appear in a
client component bundle.

### 10.8 HomePage

```typescript
// app/page.tsx: Server Component (orchestrator). Fetches overview data
// in parallel and composes the home sections. The shell renders
// immediately; sections stream via Suspense (§6).
import { Suspense } from 'react'

export default async function HomePage() {
  return (
    <WikiShell>
      <Suspense fallback={<HeroSkeleton />}>
        <HeroSection />          {/* overview + QuickSearch trigger */}
      </Suspense>
      <Suspense fallback={<StatsBarSkeleton />}>
        <StatsBarSection />      {/* aggregate stats (FR-3.5) */}
      </Suspense>
      <Suspense fallback={<QuickLinksSkeleton />}>
        <QuickLinksSection />    {/* highest-traffic section cards (FR-3.4) */}
      </Suspense>
      <Suspense fallback={<TrendingSkeleton />}>
        <TrendingSection />      {/* top 4-6 most-viewed (FR-3.3) */}
      </Suspense>
    </WikiShell>
  )
}
```

`HeroSection` reads the project overview from `README.md` (via
`content-loader`) and renders a QuickSearch trigger that opens the global
`WikiSearch` modal. `QuickLinksSection` and `TrendingSection` consume the
analytics store (client) for traffic data but receive their link targets
as server-fetched props (the set of navigable sections).

### 10.9 StatsBar

```typescript
// 'use client': subscribes to the analytics store; updates reactively.
// Pure presentational read of aggregate selectors (§12.2a).

interface StatsBarProps {
  counts: { patterns: number; hooks: number; configs: number }  // server-fetched
}

export function StatsBar({ counts }: StatsBarProps) {
  const totalViews = useAnalyticsStore((s) => s.totalViews)
  // totalViews is maintained incrementally (§12.2a): O(1) selector.
  return (
    <section className="stats-bar" aria-label="Workspace stats">
      <Stat label="Page views" value={totalViews} />
      <Stat label="Patterns" value={counts.patterns} />
      <Stat label="Hooks" value={counts.hooks} />
      <Stat label="Configs" value={counts.configs} />
    </section>
  )
}
```

`Stat` is a Server-compatible presentational atom (label + value) with no
client JS. Only `StatsBar` itself is `'use client'` because it subscribes
to the store. The `counts` prop (pattern/hook/config totals) is computed
server-side from the YAML manifests so the bar shows accurate content
counts even before any analytics accumulate.

### 10.10 QuickLinks

```typescript
// Server Component: static cards linking to highest-traffic sections.
// Link targets are fixed (the wiki's top-level sections); ordering MAY be
// informed by analytics but the card set is server-determined.

interface QuickLinkCard { href: string; label: string; description: string; icon: string }

export function QuickLinks({ links }: { links: QuickLinkCard[] }) {
  return (
    <nav className="quick-links" aria-label="Quick links">
      {links.map(l => (
        <a key={l.href} href={l.href} className="quick-link-card">
          <i className={l.icon} aria-hidden="true" />
          <span className="quick-link-card__label">{l.label}</span>
          <span className="quick-link-card__desc">{l.description}</span>
        </a>
      ))}
    </nav>
  )
}
```

The default link set: `/patterns` (Pattern Library), `/hooks` (Hook
Reference), `/playground` (Playground), `/config` (Configuration
Reference), `/checks` (Check Catalog), `/tiers` (Enforcement Tiers).
Zero client JS: these are plain anchor tags.

### 10.11 TrendingSection

```typescript
// 'use client': reads top pages from the analytics store via the
// memoized useTopPages selector (§12.2a) so it only recomputes when
// pageViews mutates. Falls back to a server-provided default list when
// the store has insufficient data (cold start).

interface TrendingSectionProps {
  fallback: { path: string; title: string }[]  // server-provided default
}

export function TrendingSection({ fallback }: TrendingSectionProps) {
  const top = useTopPages(6)
  const items = top.length >= 4
    ? top.map(t => ({ path: t.path, title: pageTitle(t.path) }))
    : fallback
  return (
    <section className="trending" aria-label="Trending pages">
      <h2>Trending</h2>
      <ol className="trending-list">
        {items.slice(0, 6).map((it, i) => (
          <li key={it.path}>
            <a href={it.path}><span className="trending-rank">{i + 1}</span>{it.title}</a>
          </li>
        ))}
      </ol>
    </section>
  )
}
```

Cold-start behavior: when fewer than 4 pages have been viewed, the section
shows the server-provided `fallback` (a curated default set) so the home
page is never empty. Once the store has enough data, it switches to
real analytics-derived trending (simple all-time view counts per REQ Q3).

---

## 11. Pattern Classifier

`src/lib/patterns.ts` MUST classify each pattern from `config/banned_words.yaml`
into a category. The classifier consumes **all three rule groups** in the config:
`banned` (content patterns), `directory_rules` (directory-scoped content patterns),
and `filename_rules` (patterns matched against file basenames). Each group has the
same `{pattern, reason}` shape but different match semantics, so `ClassifiedPattern`
carries a `scope` discriminator:

```typescript
// Match semantics: determines where the pattern is applied.
export type PatternScope = 'content' | 'filename' | 'directory'

export type PatternCategory =
  | 'linter-suppression'
  | 'lazy-types'
  | 'silent-errors'
  | 'legacy-fallback'
  | 'suppression'
  | 'unsafe-reflection'
  | 'data-classes'
  | 'test-quality'
  | 'path-safety'
  | 'uuid'
  | 'container-versions'
  | 'deprecated-python'
  | 'self-methods'
  | 'special-chars'
  | 'filename-rules'
  | 'directory-rules'

export interface ClassifiedPattern {
  pattern: string
  reason: string
  category: PatternCategory
  categoryLabel: string
  scope: PatternScope      // 'content' (banned:), 'directory' (directory_rules:), 'filename' (filename_rules:)
  directory?: string       // present only when scope === 'directory' (the directory_rules key)
}

export function classifyPattern(
  entry: { pattern: string; reason: string },
  scope: PatternScope,
  directory?: string,
): ClassifiedPattern

// Convenience: classify all three groups from a parsed BannedWordsConfig.
export function classifyAll(config: BannedWordsConfig): ClassifiedPattern[]
```

Category assignment rules:
- Entries under `banned:` map to one of the content categories
  (`linter-suppression`, `lazy-types`, `silent-errors`, `legacy-fallback`,
  `suppression`, `unsafe-reflection`, `data-classes`, `test-quality`,
  `path-safety`, `uuid`, `container-versions`, `deprecated-python`,
  `self-methods`, `special-chars`) with `scope: 'content'`.
- Entries under `directory_rules:` map to `directory-rules` with
  `scope: 'directory'` and `directory` set to the map key.
- Entries under `filename_rules:` map to `filename-rules` with
  `scope: 'filename'`.

The classifier MUST have 100% coverage: every pattern across all three
groups in `banned_words.yaml` MUST map to exactly one category. The test
MUST enumerate all real patterns from all three groups.

### 11.1 Playground Scope

The live pattern playground (FR-8) matches patterns against editor **content**.
Only `scope: 'content'` and `scope: 'directory'` patterns are eligible (a
directory-scoped pattern is still a content match, just with a path guard).
`scope: 'filename'` patterns MUST be excluded from the playground's match
engine: they match basenames, not code, and have no meaning against editor
text. The pattern library page (FR-4) lists all three scopes; filename-rule
cards MUST display a "filename match" badge so the distinction is visible.

---

## 12. Analytics Store

### 12.1 Event Types

```typescript
// src/types/analytics.ts
export interface PageViewEvent {
  type: 'page_view'
  path: string; title: string; timestamp: number; referrer: string; sessionId: string
}
export interface PageExitEvent {
  type: 'page_exit'
  path: string; dwellMs: number; maxScrollPercent: number; timestamp: number; sessionId: string
}
export interface SearchEvent {
  type: 'search'
  query: string; resultCount: number; timestamp: number; sessionId: string
}
export interface FeedbackEvent {
  type: 'feedback'
  targetId: string; targetType: 'pattern' | 'hook' | 'config' | 'check' | 'page'
  vote: 'up' | 'down'; comment?: string; timestamp: number; sessionId: string
}
export interface PlaygroundEvent {
  type: 'playground'
  action: 'language_change' | 'category_toggle' | 'match_found'
  details: Record<string, unknown>; timestamp: number; sessionId: string
}

export type AnalyticsEvent = PageViewEvent | PageExitEvent | SearchEvent | FeedbackEvent | PlaygroundEvent
```

### 12.2 Store Shape

```typescript
interface AnalyticsState {
  events: AnalyticsEvent[]           // FIFO, max 2000
  pageViews: Record<string, number>  // path → count
  feedback: Record<string, FeedbackEvent[]>
  searchQueries: { query: string; count: number }[]
  totalViews: number
  totalFeedback: number
  totalSearches: number
  sessionId: string

  track: (event: AnalyticsEvent) => void
  addFeedback: (event: FeedbackEvent) => void
  getPageViews: (path: string) => number
  getTopPages: (limit: number) => { path: string; views: number }[]
  getUserVote: (targetId: string) => 'up' | 'down' | null
}
```

Persistence: localStorage key `workspace-ci-wiki-analytics`. Rotation: shift oldest 500
when exceeding 2000. Session ID: `crypto.randomUUID()` on first store creation.

### 12.2a Derived Selectors (Memoization)

`getTopPages` and aggregates scan up to 2000 events on every store access.
To avoid recomputing on every render, the store maintains **derived state**
updated in the `track`/`addFeedback` actions, not recomputed on read:

```typescript
// Derived (maintained incrementally, not recomputed on read):
//   pageViews:      incremented on page_view track
//   totalViews:     incremented on page_view track
//   totalFeedback:  incremented on addFeedback
//   totalSearches:  incremented on search track
//   topPagesCache:  recomputed lazily only when pageViews mutates,
//                   memoized by a dirty flag cleared on read.
```

`getTopPages(limit)` returns a cached sorted slice, recomputed only when
`pageViews` has changed since the last call (dirty-flag memoization).
`getPageViews(path)` is an O(1) lookup into `pageViews`. Components consume
these via `useAnalyticsStore` selectors, which re-render only when the
selected slice changes (Zustand shallow equality). A `useMemo`-based
selector hook (`useTopPages(limit)`) is provided so the home page
trending section does not recompute on unrelated store mutations.

### 12.3 Page Stats Tracking Hooks

```typescript
// src/hooks/useTrackPageView.ts
export function useTrackPageView(path: string, title: string) {
  const track = useAnalyticsStore((s) => s.track)
  const ref = useRef(false)

  useEffect(() => {
    if (ref.current) return  // React StrictMode double-mount guard
    ref.current = true
    track({
      type: 'page_view',
      path, title,
      timestamp: Date.now(),
      referrer: document.referrer,
      sessionId: useAnalyticsStore.getState().sessionId,
    })
  }, [path, title, track])
}

// src/hooks/usePageVisibility.ts
export function usePageVisibility(path: string) {
  const track = useAnalyticsStore((s) => s.track)
  const startRef = useRef(Date.now())

  useEffect(() => {
    startRef.current = Date.now()
    const handleVisibility = () => {
      if (document.hidden) {
        track({
          type: 'page_exit',
          path,
          dwellMs: Date.now() - startRef.current,
          maxScrollPercent: 0,  // Filled by useScrollDepth
          timestamp: Date.now(),
          sessionId: useAnalyticsStore.getState().sessionId,
        })
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [path, track])
}

// src/hooks/useScrollDepth.ts
export function useScrollDepth(path: string) {
  const maxScrollRef = useRef(0)

  useEffect(() => {
    const handleScroll = () => {
      const percent = Math.round(
        (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100
      )
      if (percent > maxScrollRef.current) maxScrollRef.current = percent
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [path])

  return maxScrollRef
}
```

---

## 13. Regex Engine

### 13.1 Algorithm

```
Input: sourceCode (string), patterns (ClassifiedPattern[]), activeCategories (Set<string>)
Output: PatternMatch[]

For each pattern where pattern.category ∈ activeCategories:
  1. Get or create cached RegExp from pattern.pattern
  2. Reset lastIndex to 0
  3. While (match = regex.exec(sourceCode)):
     a. Calculate lineNumber from text before match.index
     b. Extract full line text
     c. Push PatternMatch
  4. On regex error: console.warn, skip pattern

Sort by lineNumber ascending
Deduplicate: (lineNumber, pattern.pattern) pairs
```

### 13.2 Performance

- Patterns compiled once, cached in `Map<string, RegExp>`.
- Debounced at 300ms via `usePlayground` hook.
- For inputs >10,000 chars: batch across `requestIdleCallback`.
- Catastrophic backtracking: `banned_words.yaml` patterns are simple enough
  that this is low risk, but `try/catch` around each `regex.exec`.

### 13.3 CodeMirror Integration

CodeMirror is loaded via `next/dynamic` with `ssr: false`. Decoration layer
uses `StateField` + `Decoration.mark` for matched ranges, and a `GutterMarker`
subclass for line-level warning indicators in the gutter.

```typescript
// Decoration state field
const matchDecoration = StateEffect.define<DecorationSet>()
const matchField = StateField.define<DecorationSet>({
  create() { return Decoration.none },
  update(decorations, tr) {
    for (const effect of tr.effects) {
      if (effect.is(matchDecoration)) return effect.value
    }
    return decorations.map(tr.changes)
  },
  provide: (f) => EditorView.decorations.from(f),
})
```

---

## 14. Search

### 14.1 Index Schema

```typescript
interface SearchIndexEntry {
  id: string
  title: string
  section: string
  content: string
  href: string
  type: 'pattern' | 'hook' | 'config' | 'check' | 'page'
  keywords: string[]
}
```

### 14.2 Fuse.js Configuration

```typescript
const fuseOptions = {
  keys: ['title', 'section', 'keywords', 'content'],
  threshold: 0.3,
  includeMatches: true,
  minMatchCharLength: 2,
}
```

### 14.3 Search UI (useSearch Hook)

```typescript
export function useSearch(searchData: SearchIndexEntry[]) {
  const track = useAnalyticsStore((s) => s.track)
  const fuseRef = useRef<Fuse<SearchIndexEntry> | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Build index once
  useEffect(() => {
    fuseRef.current = new Fuse(searchData, fuseOptions)
  }, [searchData])

  const results = useMemo(() => {
    if (!query.trim() || !fuseRef.current) return []
    return fuseRef.current.search(query).slice(0, 20)
  }, [query])

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => { setIsOpen(false); setQuery('') }, [])

  // Track search analytics
  useEffect(() => {
    if (query.trim() && results.length > 0) {
      track({ type: 'search', query, resultCount: results.length, timestamp: Date.now() })
    }
  }, [query, results.length])

  useKeyboardShortcut('/', open)  // Opens on '/' keypress

  return { results, query, setQuery, isOpen, open, close, selectedIndex, setSelectedIndex }
}
```

Keyboard navigation:
- `/` or `Ctrl+K` → open modal
- `↑` / `↓` → navigate results
- `Enter` → open selected result
- `Escape` → close modal
- Click outside → close modal
- Focus trapped inside modal when open

---

## 15. Theme System

### 15.1 CSS Custom Properties

Dark (default) and light themes via `data-theme` attribute on `<html>`.

```css
:root {
  --bg: #0b0c0f; --panel: #111319; --text: #e6e9ef; --muted: #9aa3b2;
  --accent: #7aa2f7; --ok: #10b981; --warn: #f97316; --error: #ef4444;
  --link: #7dcfff; --border: #242832; --code-bg: #0d1117;
  --surface-1: color-mix(in oklab, var(--bg) 95%, var(--text) 5%);
  --surface-2: color-mix(in oklab, var(--panel) 90%, var(--text) 10%);
  --btn-radius: 8px; --duration-fast: 120ms; --duration-medium: 200ms;
  --z-sidebar: 100; --z-header: 200; --z-modal: 500; --z-search: 1000;
}

[data-theme='light'] {
  --bg: #ffffff; --panel: #f7f7f9; --text: #1f2937; --muted: #6b7280;
  --accent: #1d4ed8; --ok: #16a34a; --warn: #ea580c; --error: #dc2626;
  --link: #2563eb; --border: #e5e7eb; --code-bg: #f3f4f6;
}
```

### 15.2 Tailwind Bridge

```css
@import 'tailwindcss';
@theme {
  --color-bg: var(--bg); --color-panel: var(--panel); --color-text: var(--text);
  --color-muted: var(--muted); --color-accent: var(--accent); --color-ok: var(--ok);
  --color-warn: var(--warn); --color-error: var(--error); --color-link: var(--link);
  --color-border: var(--border); --color-code-bg: var(--code-bg);
}
```

### 15.3 Flash Prevention

Inline script in `<head>` reads `localStorage.theme` and sets `data-theme` before
first paint. Theme store (Zustand) syncs to `localStorage` and `data-theme`.

### 15.4 Typography

Montserrat (body, 0.875rem, line-height 1.6). JetBrains Mono (code, 0.8125rem).
Both loaded via `next/font/google` with `display: 'swap'` and CSS variable export.

### 15.5 Icons

RemixIcon 4.3.0 is **self-hosted**: the icon font CSS and webfont files are
vendored into `web/public/icons/remixicon/` and loaded via a local `<link>`
in `<head>` (no render-blocking external CDN request: protects LCP per
NFR-1.1). Usage: `<i className="ri-home-4-line" />`. The `Icon` component
wraps this with size variants (`sm`/`md`/`lg`) and `aria-hidden="true"`.

A build-time script (or manual step documented in `web/README.md`) copies
the pinned RemixIcon release into `web/public/icons/remixicon/`. The
version is pinned in `web/package.json` via a `remixicon` devDependency so
the vendored set is reproducible.

---

## 16. CSS Architecture

| File | Purpose |
|------|---------|
| `shared.css` | Master import |
| `_variables.css` | Design tokens, dark/light, base body, scrollbars, `prefers-reduced-motion` |
| `_wiki-layout.css` | Shell grid, header, content area |
| `_wiki-sidebar.css` | Nav tree, collapse states, mobile overlay |
| `_wiki-patterns.css` | Pattern cards, category badges, filter toggles |
| `_wiki-playground.css` | Two-pane layout, editor container, match panel |
| `_wiki-feedback.css` | Vote buttons, comment, thanks state |
| `_wiki-stats.css` | Stats bar, view counts, trending |
| `_wiki-skeletons.css` | Skeleton shimmer animations (`motion-safe:` prefixed) |
| `_prose.css` | Content typography, tables, lists, code blocks |
| `_buttons.css` | `.btn`, variants (`--primary`, `--secondary`, `--danger`, `--ghost`), sizes |
| `_tabs.css` | Tab compound component |
| `_search.css` | Search modal, results, highlighting |
| `_error-boundary.css` | Error fallback UI |
| `_a11y.css` | Focus rings (`:focus-visible`), skip-to-content link, screen-reader-only |

Class naming: BEM-like, following AMI-PORTAL conventions.
`--modifier` for variants, `.is-state` for state classes.

---

## 17. Accessibility

### 17.1 Roles and Landmarks

| Element | Role | Notes |
|---------|------|-------|
| Sidebar `<nav>` | `role="navigation"` | `aria-label="Wiki navigation"` |
| Main `<main>` | implicit |: |
| Header `<header>` | `role="banner"` |: |
| Search modal | `role="dialog"` | `aria-label="Search wiki"`, `aria-modal="true"` |
| Feedback widget | `role="group"` | `aria-label="Rate this content"` |
| Vote buttons |: | `aria-label="Thumbs up"`, `aria-pressed={voted}` |
| Tabs container | `role="tablist"` | `aria-label="Check type"` |
| Tab button | `role="tab"` | `aria-selected={isActive}` |
| Pattern cards list | `role="list"` |: |
| Pattern card | `role="listitem"` |: |

### 17.2 Keyboard Navigation

| Shortcut | Action | Context |
|----------|--------|---------|
| `/` or `Ctrl+K` | Open search | Global |
| `↑` / `↓` | Navigate results | Search modal |
| `Enter` | Open selected result | Search modal |
| `Escape` | Close modal | Search modal, any dialog |
| `Tab` | Move focus forward | Global |
| `Shift+Tab` | Move focus backward | Global |

### 17.3 Additional Requirements

- **Skip link**: First focusable element on page: "Skip to content" → jumps to `<main>`.
- **Focus rings**: `:focus-visible` with 2px accent outline, 2px offset. No `:focus`
  styling (avoids visible rings on mouse clicks).
- **Reduced motion**: Skeleton shimmer animations wrapped in `@media (prefers-reduced-motion: no-preference)`.
  All transitions/animations use `prefers-reduced-motion` media query via
  `motion-safe:` Tailwind prefix.
- **Screen reader announcements**: Route changes announce page title via
  `aria-live="polite"` region in the shell.
- **Color contrast**: WCAG 2.1 AA verified for both themes (4.5:1 normal text,
  3:1 large text).

---

## 18. Performance Budget and Bundle Strategy

### 18.1 Per-Route Budget

| Route | Max JS (compressed) | Strategy |
|-------|:---:|----------|
| `/`, `/patterns`, `/hooks`, `/config`, `/checks`, `/tiers`, `/tooling`, `/integration` | <30KB | Server Components for content; only leaf-level interactive widgets ship JS |
| `/patterns/[category]`, `/hooks/[id]`, `/config/[name]`, `/checks/[id]` | <30KB | Same as above |
| `/playground` | <200KB | CodeMirror is the bulk; acceptable because it's the playground's purpose |

### 18.2 Bundle Optimization

- **CodeMirror**: `next/dynamic(() => import(...), { ssr: false })`: the ~600KB
  editor bundle loads only when the user navigates to `/playground`.
- **fuse.js**: ~15KB, loaded only in `WikiSearch` (used on every page: acceptable).
- **marked**: Server-only. Renders markdown to HTML in Server Components. Zero
  client bundle impact.
- **js-yaml**: Server-only. YAML parsing happens in Server Components. Zero
  client bundle impact.
- **gray-matter**: Server-only. Frontmatter parsing for markdown content.
- **zustand**: ~2KB, used for theme + analytics stores. Acceptable.

### 18.3 Bundle Analysis

```javascript
// next.config.js
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

module.exports = withBundleAnalyzer({
  reactStrictMode: true,
})
```

Run `ANALYZE=true npm run build` to generate bundle visualization. CI MUST
fail if any non-playground route exceeds 50KB compressed JS.

---

## 19. Build Configuration

### 19.1 next.config.js

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { formats: ['image/avif', 'image/webp'] },
}

module.exports = nextConfig
```

### 19.2 package.json

```json
{
  "name": "workspace-ci-wiki",
  "private": true,
  "version": "0.1.0",
  "packageManager": "npm@11.6.2",
  "engines": { "node": ">=24", "npm": ">=11" },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "format": "prettier --check .",
    "type-check": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "analyze": "ANALYZE=true next build"
  },
  "dependencies": {
    "next": "16.1.7",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "zustand": "5.0.12",
    "clsx": "2.1.1",
    "fuse.js": "^7.1.0",
    "js-yaml": "^4.1.0",
    "gray-matter": "^4.0.3",
    "marked": "^17.0.6",
    "@codemirror/view": "^6.41.0",
    "@codemirror/state": "^6.6.0",
    "@codemirror/lang-python": "^6.2.1",
    "@codemirror/lang-javascript": "^6.2.5",
    "@codemirror/commands": "^6.10.3",
    "@codemirror/language": "^6.12.3",
    "dompurify": "^3.2.0"
  },
  "devDependencies": {
    "@eslint/eslintrc": "3.3.5",
    "@tailwindcss/postcss": "4.2.1",
    "@testing-library/react": "^16.3.2",
    "@testing-library/jest-dom": "^6.9.1",
    "@next/bundle-analyzer": "^16.1.7",
    "@types/js-yaml": "^4.0.9",
    "@types/node": "25.5.0",
    "@types/react": "19.2.14",
    "@types/react-dom": "19.2.3",
    "eslint": "9.39.4",
    "eslint-config-next": "16.1.7",
    "postcss": "8.5.8",
    "prettier": "3.8.1",
    "tailwindcss": "4.2.1",
    "typescript": "5.9.3",
    "vitest": "^4.1.7",
    "@vitest/coverage-v8": "^4.1.7",
    "jsdom": "^29.0.0",
    "remixicon": "4.3.0",
    "@types/dompurify": "^3.0.5"
  }
}
```

### 19.3 Wiki Self-Compliance (Banned-Words Exemptions)

The wiki lives inside the strict-tier workspace-ci repo, so its files are
scanned by the repo's own `ci_check_banned_words` hook. The wiki's purpose
is to document and display the banned patterns, so its prose and rendered
data legitimately contain the very words and regexes the hooks ban
(`fallback`, `legacy`, `silent`, ` -- `, `python3`, `dict[str, Any]`,
`# type: ignore`, etc.).

Exemptions are declared in `config/banned_words_exceptions.yaml` under the
`web/` paths, with two tiers:

1. **Blanket (`pattern: '.*'`)** for `web/src/data/` and `web/content/` -
   generated JSON and markdown that render patterns and example violations
   as data, mirroring the existing blanket exemption for
   `config/banned_words.yaml` itself.
2. **Prose-term exemptions** for all of `web/` covering documentary words
   (`silent`, `fallback`, `legacy`, ` -- `, `python3`, `lazy`, `mock`,
   `stubs`, `compatibility`, `backwards`, `degradation`, `suppress`, etc.)
   that appear in string literals, category labels, and UI text.

Code-quality patterns (`# type: ignore`, `dict[str, Any]`, `noqa`,
`eslint-disable`, `getattr`, etc.) remain **enforced** on `web/src/**`
TS/TSX so the wiki's own source stays clean: only the data/content
directories are blanket-exempt. This split lets the wiki document the
patterns without fighting its own gates, while keeping its source code
held to the same quality bar as the rest of the repo.

---

## 20. Test Requirements: 90% Coverage

### 20.1 Coverage Targets

| Module | Lines | Branches | Functions | Statements |
|--------|:-----:|:--------:|:---------:|:----------:|
| `src/hooks/` | 95% | 90% | 95% | 95% |
| `src/lib/` | 90% | 85% | 90% | 90% |
| `src/stores/` | 90% | 85% | 90% | 90% |
| `src/components/ui/` | 90% | 85% | 90% | 90% |
| `src/components/wiki/` (non-playground) | 85% | 80% | 85% | 85% |
| `src/components/wiki/playground/` | 80% | 75% | 80% | 80% |

Hooks get the highest threshold because they are pure logic, trivially testable
via `renderHook`, and are the backbone of component behavior.

### 20.2 Test Inventory

#### Hook Tests (renderHook)

| Test file | Coverage |
|-----------|----------|
| `useFeedback.test.ts` | IDLE → vote → SUBMITTED state machine, persisted vote on re-render, analytics emission, comment setter |
| `usePatternFilter.test.ts` | Single category toggle, all categories toggle, select all / deselect all, visible count, total count |
| `useHookFilter.test.ts` | Stage filter toggle, tier filter toggle, combined filter behavior, counts |
| `usePlayground.test.ts` | Language change resets matches, category toggle updates matches, editor ref stability |
| `useSearch.test.ts` | Query returns results, empty query returns empty, debounce behavior, keyboard navigation index |
| `usePageStats.test.ts` | Track page view on mount (StrictMode guard), track exit on unmount |

#### Unit Tests (Vitest + jsdom)

| Test file | Coverage |
|-----------|----------|
| `regex-engine.test.ts` | Pattern matching, empty input, invalid regex skip, dedup, line calc, language filtering |
| `patterns.test.ts` | `classifyPattern()` / `classifyAll()`: full enumeration of all real patterns from all three groups in `banned_words.yaml` (`banned`, `directory_rules`, `filename_rules`), every pattern → exactly one category, all 16 categories have >=1 pattern, scope discriminator correct per group |
| `search-index.test.ts` | Index building from mock data, search returns correct results, fuzzy tolerance, empty query |
| `analytics-store.test.ts` | Event recording, aggregates (`getTopPages`, `getPageViews`, `getUserVote`), FIFO rotation at 2000, localStorage persistence round-trip, sessionId stability |
| `theme-store.test.ts` | Initial detection, toggle behavior, localStorage persistence, `data-theme` attribute |
| `content-loader.test.ts` | Frontmatter parsing, section filtering, file discovery, missing file |
| `yaml-loader.test.ts` | YAML parsing, cache deduplication (two parallel calls → one fs read) |

#### Component Tests

| Test file | Coverage |
|-----------|----------|
| `Button.test.tsx` | Renders, variants, loading state, click handler, ref forwarding, `aria-disabled` |
| `Toggle.test.tsx` | Renders, toggle state, onChange fires, disabled state, ARIA attributes |
| `Tabs.test.tsx` | Renders tabs, active tab, onChange, keyboard nav, context error outside Tabs |
| `ErrorBoundary.test.tsx` | Catches render error, renders fallback, does NOT catch outside render |
| `FeedbackWidget.test.tsx` | IDLE → VOTING → SUBMITTED states, analytics emission, ARIA labels, remembered vote |
| `WikiSidebar.test.tsx` | Nav links rendered, active route highlighted, collapse toggle |

#### Integration Tests

| Test file | Coverage |
|-----------|----------|
| `WikiShell.test.tsx` | Sidebar + header + content slot render, theme toggle dispatches |
| `PatternList.test.tsx` | Patterns rendered, category filter, feedback widgets present |
| `HookTable.test.tsx` | Hooks rendered, stage/tier filter, detail links correct |

### 20.3 Vitest Configuration

```typescript
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/types/**', 'src/data/**', 'src/content/**'],
      thresholds: {
        lines: 90, branches: 85, functions: 90, statements: 90,
        'src/hooks/': { lines: 95, branches: 90, functions: 95, statements: 95 },
        'src/components/wiki/playground/': { lines: 80, branches: 75, functions: 80, statements: 80 },
      },
    },
  },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
})
```

---

## 21. Content Extraction Specifications

### 21.1 Python Docstring Extraction

Output: `web/src/data/api-docs.json`

```typescript
interface ApiDocsOutput {
  generated_at: string
  source_version: string
  modules: ExtractedModule[]
}

interface ExtractedModule {
  name: string; path: string; docstring: string | null
  functions: ExtractedFunction[]; classes: ExtractedClass[]
}

interface ExtractedFunction {
  name: string; docstring: string | null; signature: string
  decorators: string[]; line: number; is_async: boolean; is_public: boolean
}

interface ExtractedClass {
  name: string; docstring: string | null; bases: string[]
  methods: ExtractedFunction[]; line: number
}
```

### 21.2 Shell Comment Extraction

Output: `web/src/data/shell-docs.json`

```typescript
interface ShellDocsOutput {
  generated_at: string; source_version: string
  modules: ExtractedShellModule[]
}

interface ExtractedShellModule {
  name: string; path: string; description: string | null
  functions: ExtractedShellFunction[]
}

interface ExtractedShellFunction {
  name: string; description: string | null; line: number; is_public: boolean
}
```

### 21.3 Docstring Authoring Conventions

Python docstrings SHOULD follow:

```python
"""module_name: one-line summary.

Detailed description of purpose, behavior, checks performed.

Exit codes:
  0 - Success
  1 - Violation found
  2 - Infrastructure error

Config:
  config_file.yaml: what this check reads
"""
```

Shell function comments SHOULD follow:

```bash
# --- ci_check_name [args...] ---
#
# One-line summary.
# Detailed description.
#
# Exit: 0 if pass, 1 if violation.
ci_check_name() {
```

### 21.4 Config Schema Files (Field Documentation Source)

FR-7.3 requires each configuration reference page to render "fields, types,
defaults, and descriptions." The YAML config files themselves carry no
field-level schema: they are pure data. To preserve the single-source-of-truth
principle without hand-maintaining prose that drifts from the configs, the
wiki derives field documentation from **schema files** co-located with the
configs.

#### Convention

One `config/<name>.schema.yaml` per `config/<name>.yaml`. The schema file is
the canonical source for field descriptions; the wiki reads it at request
time and renders it via `ConfigFieldTable` (§10.7). The data config and the
schema are independent files: the schema describes shape and intent, the
config holds values.

#### Schema File Shape

```yaml
config: <name>            # config file name without .yaml
description: "<one-line summary>"
fields:
  - path: <dotpath>        # [] suffix = list; [].<sub> = item field; <name> = map key placeholder
    type: <yaml|string|integer|boolean|list|list<T>|map|object>
    required: <true|false> # defaults to false
    default: <value>       # omit if none
    description: "<human-readable field description>"
```

A reference implementation exists at `config/banned_words.schema.yaml`.
Implementation MUST add one schema file per config before the corresponding
`/config/[name]` page can render field docs. A missing schema file MUST cause
the config detail page to render the raw YAML only (no field table) and emit
a build-time warning: never a hard failure, so partial schema coverage is
deployable.

#### Validation

`scripts/extract-docs` (Phase 1) MUST validate that every `*.schema.yaml`
parses and that every `path` in `fields` resolves against the corresponding
config's top-level keys. Drift between schema paths and config keys is a
build warning, not an error.

### 21.5 Scripts Manifest (Tooling Page Source)

FR-11 requires the tooling page to document every workspace script. Scripts
have no docstrings (they are bash), so the canonical source is
`scripts/manifest.yaml`: a hand-maintained but structured manifest the wiki
reads at request time. This mirrors the `required_hooks.yaml` pattern: a
manifest that is the single source for a documentation surface, validated
against the actual files it describes.

A reference implementation exists at `scripts/manifest.yaml`. Field shape:
`id`, `path`, `summary`, `usage`, `category`, optional `args` (list of
`{name, description}`), `output`, optional `make_target`.

#### Validation

`ci/check_required_hooks_present.py` (or a sibling check) MUST verify that
every executable file directly under `scripts/` has a manifest entry and
that every manifest `path` resolves to an existing file. Unregistered scripts
fail the check; stale manifest entries fail the check. This closes the
dogfood loop so the wiki tooling page cannot drift from the scripts on disk.

---

## 22. Requirement Traceability

| Requirement | Spec Section | Status |
|------------|-------------|--------|
| FR-1: Wiki Shell Layout | 10.1 | Specified |
| FR-2: Full-Text Search | 14 | Specified |
| FR-3: Home Page | 9.1, 10.8-10.11 | Specified |
| FR-4: Pattern Library | 9.2, 10.2, 11, 11.1 | Specified |
| FR-5: Hook Reference | 9.2, 10.1 | Specified |
| FR-6: Hook Detail Page | 9.1 | Specified |
| FR-7: Configuration Reference | 9.1, 10.3, 21.4 | Specified |
| FR-8: Live Pattern Playground | 10.5, 13 | Specified |
| FR-9: Check Catalog | 9.1, 21 | Specified |
| FR-10-12: Tiers, Tooling, Integration | 9.1, 21.5 | Specified |
| FR-13: Page Analytics | 12 | Specified |
| FR-14: Page-Level Stats | 12.2 | Specified |
| FR-15: Feedback Mechanism | 10.3, 10.4 | Specified |
| FR-16: Content from Source | 4, 5, 21 | Specified |
| NFR-1: Performance | 18, 19 | Specified |
| NFR-2: Technology Stack | 3, 19 | Specified |
| NFR-3: Theme | 15 | Specified |
| NFR-4: Security | 4.4 | Specified |
| NFR-5: Accessibility | 17 | Specified |
| NFR-6: Responsive Design | 10.1 | Specified |
| NFR-7: Code Quality | 19.2, 20 | Specified |
| NFR-8: 90% Test Coverage | 20.1-20.3 | Specified |

---

## 23. Open Implementation Questions

1. **PPR adoption:** Should the wiki use Partial Prerendering for the static
   shell (sidebar + header) served from CDN with dynamic content streaming?
   RECOMMENDED: Not for Phase 1. PPR adds deployment complexity (requires
   CDN + edge runtime). Standard streaming SSR is sufficient.

2. **`use cache` directive:** Should YAML-loaded data use `'use cache'` for
   cross-request caching? RECOMMENDED: Not initially. Filesystem reads of
   YAML configs are sub-millisecond. Add if profiling shows it's needed.

3. **Extraction as pre-commit hook:** `scripts/extract-docs` produces committed
   JSON. Should it also run as a pre-commit hook to fail if docs are stale?
   RECOMMENDED: Yes: add to `.pre-commit-config.yaml` as a `language: system`
   hook.

4. **Shell doc extraction enforcement:** Should the CI enforce the `# ---`
   separator convention? RECOMMENDED: Add a check to `checks_silent.sh` or
   `checks_files.sh` that verifies every `ci_*` function has a separator.

5. **CodeMirror theme:** Should CodeMirror follow `data-theme` (dark/light)
   or use a fixed theme? RECOMMENDED: Follow `data-theme`: use
   `@codemirror/theme-one-dark` for dark, default theme for light.

6. **Content watch mode:** Should `next dev` watch `../../config/*.yaml` for
   changes? Next.js watches `web/` by default but not parent directories.
   RECOMMENDED: Configure `next.config.js` `serverExternalPackages` or add
   a `chokidar` watcher in the dev script.

7. **Large YAML files:** `banned_words.yaml` is 290 lines: acceptable for
   request-time loading. If YAML files grow significantly, consider file-mtime
   based cache invalidation.

8. **Markdown rendering in FeedbackWidget comments:** Users can submit comments.
   Should these be rendered as markdown? RECOMMENDED: No: comments are plain
   text. Sanitize via `textContent` assignment to prevent XSS.
