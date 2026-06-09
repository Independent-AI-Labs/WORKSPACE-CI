# SPEC-WIKI: Interactive Wiki Web UI for AMI-CI — Specification

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
> | UI primitives (Button, Toggle, Tabs) | Not built |
> | Wiki shell layout | Not built |
> | Pattern library | Not built |
> | Hook reference | Not built |
> | Configuration reference | Not built |
> | Pattern playground | Not built |
> | Search (fuse.js) | Not built |
> | Analytics store | Not built |
> | Feedback widget | Not built |
> | Theme system | Not built |
> | CSS partials | Not built |
> | Test suites | Not built |

---

## 1. Overview

This specification details the implementation of an interactive, wiki-like web UI for
AMI-CI. The UI is a Next.js 16 application in the `web/` directory that reads AMI-CI's
YAML configs at server-render time and presents every feature — hooks, patterns,
checks, configs, tiers, tooling — as structured, navigable wiki pages with full-text
search, a live regex playground, per-section user feedback, and page-level analytics.

The implementation follows AMI-PORTAL's established conventions: CSS-first Tailwind v4,
custom UI primitives (no UI libraries), `data-theme`-based light/dark theming, Zustand
for client state, and a split between thin server components (data loading) and rich
client components (interactivity).

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
| @codemirror/view | ^6.x | npm |
| @codemirror/state | ^6.x | npm |
| @codemirror/lang-python | ^6.x | npm |
| @codemirror/lang-javascript | ^6.x | npm |
| RemixIcon | 4.3.0 | CDN |
| Montserrat | latest | Google Fonts (next/font) |
| JetBrains Mono | latest | Google Fonts (next/font) |
| ESLint | 9.x | npm |
| Prettier | 3.8.1 | npm |
| Vitest | 4.x | npm |

---

## 4. Trust Boundaries

| Zone | Contains | Receives |
|------|----------|----------|
| Server (Node.js) | Server components, `js-yaml`, YAML file reads | HTTP requests from browser |
| Client (Browser) | React components, Zustand stores, CodeMirror, fuse.js, regex engine, localStorage | Serialized YAML data as props from server; user input (keyboard, mouse) |
| Filesystem | `../../config/*.yaml` (read-only) | Read requests from server components |
| localStorage | Analytics events, theme preference | Read/write from client browser |
| CDN | RemixIcon font CSS | Link tag in `<head>` |

**Boundary rules:**

- Server components MUST NOT import or execute CodeMirror, fuse.js, or any browser-only library.
- Client components MUST NOT import `js-yaml`, `fs`, `path`, or any Node.js-only library.
- The server MUST NOT write to the filesystem under any code path.
- The client MUST NOT send analytics data to any external service.
- No data flows between the wiki and the Python layer of AMI-CI.

---

## 5. Directory Layout

```
web/
├── package.json              # npm 11.6.2, next@16.1.7, react@19.2.4
├── tsconfig.json             # strict, Bundler, @/* → src/*
├── next.config.js            # reactStrictMode: true
├── postcss.config.mjs        # @tailwindcss/postcss
├── eslint.config.mjs         # flat config, core-web-vitals
├── .prettierrc               # printWidth 100, singleQuote, semi false
├── vitest.config.ts          # jsdom, globals, @ alias
│
├── app/                      # ── Next.js App Router ──
│   ├── layout.tsx            # Root layout: fonts, CDN, flash script, ErrorBoundary
│   ├── page.tsx              # Home page (server → passes data to WikiShell)
│   ├── hooks/
│   │   ├── page.tsx          # Hook index (server loads required_hooks.yaml)
│   │   └── [id]/page.tsx     # Hook detail (server loads + filters YAML)
│   ├── patterns/
│   │   ├── page.tsx          # Pattern library (server loads banned_words.yaml)
│   │   └── [category]/page.tsx # Patterns by category (server filters)
│   ├── config/
│   │   ├── page.tsx          # Config index (server lists config/ dir)
│   │   └── [name]/page.tsx   # Config detail (server loads single YAML)
│   ├── playground/
│   │   └── page.tsx          # Full client component ('use client')
│   ├── checks/
│   │   ├── page.tsx          # Check catalog (hardcoded catalog)
│   │   └── [id]/page.tsx     # Check detail
│   ├── tiers/page.tsx
│   ├── tooling/page.tsx
│   └── integration/page.tsx
│
├── src/                      # ── Client source code ──
│   ├── components/
│   │   ├── ui/               # Custom UI primitives
│   │   │   ├── Button.tsx
│   │   │   ├── Toggle.tsx
│   │   │   ├── Tabs.tsx
│   │   │   ├── ErrorBoundary.tsx
│   │   │   ├── CollapsibleSection.tsx
│   │   │   └── Icon.tsx
│   │   └── wiki/             # Wiki feature components
│   │       ├── WikiShell.tsx
│   │       ├── WikiSidebar.tsx
│   │       ├── WikiSearch.tsx
│   │       ├── WikiBreadcrumbs.tsx
│   │       ├── WikiFooter.tsx
│   │       ├── PatternList.tsx
│   │       ├── PatternCard.tsx
│   │       ├── CategoryNav.tsx
│   │       ├── HookTable.tsx
│   │       ├── HookBadge.tsx
│   │       ├── HookRow.tsx
│   │       ├── ConfigFieldTable.tsx
│   │       ├── TierComparison.tsx
│   │       ├── CheckCard.tsx
│   │       ├── StatsBar.tsx
│   │       ├── QuickLinks.tsx
│   │       ├── FeedbackWidget.tsx
│   │       └── playground/
│   │           ├── PlaygroundShell.tsx
│   │           ├── CodeEditor.tsx
│   │           ├── MatchPanel.tsx
│   │           └── PatternCategoryFilter.tsx
│   ├── stores/
│   │   ├── theme-store.ts
│   │   └── analytics-store.ts
│   ├── lib/
│   │   ├── theme.ts
│   │   ├── regex-engine.ts
│   │   ├── search.ts
│   │   ├── page-stats.ts
│   │   ├── patterns.ts       # Pattern category classification
│   │   └── hooks-data.ts     # Hook metadata for detail pages
│   ├── types/
│   │   ├── patterns.ts
│   │   ├── hooks.ts
│   │   ├── analytics.ts
│   │   └── wiki.ts
│   └── styles/
│       └── globals.css       # @import 'tailwindcss' + @theme tokens
│
├── public/
│   ├── favicon.svg
│   └── styles/
│       ├── shared.css        # Master import: @imports all partials
│       ├── _variables.css    # CSS custom properties (dark + light)
│       ├── _wiki-layout.css
│       ├── _wiki-sidebar.css
│       ├── _wiki-patterns.css
│       ├── _wiki-playground.css
│       ├── _wiki-feedback.css
│       ├── _wiki-stats.css
│       ├── _prose.css
│       ├── _buttons.css
│       ├── _tabs.css
│       ├── _search.css
│       └── _error-boundary.css
│
└── tests/                    # Vitest component tests
    └── (co-located: src/**/*.test.tsx)
```

---

## 6. YAML Config Reading (Server-Side)

### 6.1 Server Component Pattern

Every content-page server component MUST follow this pattern:

```typescript
// app/patterns/page.tsx
import { readFileSync } from 'fs'
import { join } from 'path'
import { load } from 'js-yaml'
import { WikiShell } from '@/components/wiki/WikiShell'
import { PatternList } from '@/components/wiki/PatternList'
import type { BannedPattern, UniversalException } from '@/types/patterns'

interface BannedWordsConfig {
  version: string
  universal_exceptions: UniversalException[]
  banned: BannedPattern[]
  directory_rules?: Record<string, { pattern: string; reason: string }[]>
  filename_rules?: { pattern: string; reason: string }[]
}

export default function PatternsPage() {
  const configPath = join(process.cwd(), '..', 'config', 'banned_words.yaml')
  const raw = readFileSync(configPath, 'utf8')
  const config = load(raw) as BannedWordsConfig

  return (
    <WikiShell>
      <PatternList patterns={config.banned} exceptions={config.universal_exceptions} />
    </WikiShell>
  )
}
```

### 6.2 Relative Path Resolution

All server components resolve YAML paths relative to `process.cwd()`, which in Next.js
is the project root. The pattern `join(process.cwd(), '..', 'config', '<file>.yaml')`
navigates from `web/` up to `AMI-CI/` then into `config/`.

No symlinks. No duplication. Single source of truth.

### 6.3 YAML Configs Read by the Wiki

| Config file | Read by route(s) | Purpose |
|-------------|-----------------|---------|
| `banned_words.yaml` | `/patterns`, `/patterns/[category]`, `/playground` | All pattern regexes, reasons, exceptions |
| `required_hooks.yaml` | `/hooks`, `/hooks/[id]` | All hook definitions with metadata |
| `sensitive_files.yaml` | `/config/sensitive_files` | Sensitive file detection rules |
| `coverage_thresholds.yaml` | `/config/coverage_thresholds` | Test coverage minimums |
| `file_length_limits.yaml` | `/config/file_length_limits` | File length caps |
| `dead_code.yaml` | `/config/dead_code` | AST analysis config |
| `blocked_commit_patterns.yaml` | `/config/blocked_commit_patterns` | Commit message bans |
| `banned_words_exceptions.yaml` | `/patterns` | Per-project pattern exceptions |
| `dependency_excludes.yaml` | `/config/dependency_excludes` | Version check exclusions |
| `markdown_docs.yaml` | `/config/markdown_docs` | Link checker config |

---

## 7. Route Design

### 7.1 Route Table

| Route | Component type | Data source | Key props |
|-------|---------------|-------------|-----------|
| `/` | Server wrapper → client `WikiShell` | Hardcoded overview + analytics store | — |
| `/hooks` | Server → client `HookTable` | `required_hooks.yaml` | `HookRecord[]` |
| `/hooks/[id]` | Server → client detail | `required_hooks.yaml` filtered by `id` | `HookRecord` |
| `/patterns` | Server → client `PatternList` | `banned_words.yaml` | `BannedPattern[]`, `UniversalException[]` |
| `/patterns/[category]` | Server → client `PatternList` | `banned_words.yaml` filtered by category | Same, pre-filtered |
| `/config` | Server → client list | Hardcoded config manifest | `ConfigDescriptor[]` |
| `/config/[name]` | Server → client `ConfigFieldTable` | Single YAML file | Parsed config object |
| `/playground` | Client only (`'use client'`) | `banned_words.yaml` passed as prop | `BannedPattern[]` |
| `/checks` | Server → client catalog | Hardcoded check manifest | `CheckDescriptor[]` |
| `/checks/[id]` | Server → client detail | Hardcoded check manifest | `CheckDescriptor` |
| `/tiers` | Server → client `TierComparison` | Hardcoded tier data | Tier matrices |
| `/tooling` | Server → client page | Hardcoded tool manifest | `ToolDescriptor[]` |
| `/integration` | Server → client page | Hardcoded guide content | — |

### 7.2 Server/Client Boundary

All pages at route level are server components by default. They:

1. Read YAML configs (if needed) via `js-yaml` + `fs`
2. Render a `<WikiShell>` wrapper with children

The `<WikiShell>` is a `'use client'` component that provides the layout chrome
(sidebar, header, footer, breadcrumbs). Its `children` prop is the page-specific
client component, which receives serialized data as props.

### 7.3 Static Params

Routes with dynamic segments (`[id]`, `[category]`, `[name]`) MUST export
`generateStaticParams()` to enable build-time generation of all known pages
and at request time fallback for new entries.

```typescript
// app/hooks/[id]/page.tsx
export function generateStaticParams() {
  const configPath = join(process.cwd(), '..', 'config', 'required_hooks.yaml')
  const raw = readFileSync(configPath, 'utf8')
  const config = load(raw) as RequiredHooksConfig
  return config.hooks.map((hook) => ({ id: hook.id }))
}
```

---

## 8. Component Specifications

### 8.1 WikiShell

```
WikiShell
├── WikiSidebar (left, collapsible)
│   ├── Nav items (one per wiki section)
│   └── Collapse toggle button
├── Main content area (right)
│   ├── Header bar
│   │   ├── WikiBreadcrumbs
│   │   ├── Theme toggle
│   │   └── Search trigger button
│   └── {children} (page content)
└── WikiFooter
    └── Build info, links
```

```typescript
// Props
interface WikiShellProps {
  children: React.ReactNode
}
```

State: derives from `useThemeStore` for theme toggle, manages sidebar collapsed state
in local `useState`. Does NOT manage analytics — that is handled by `page-stats.ts`
and individual page components.

### 8.2 WikiSidebar

```typescript
interface NavSection {
  label: string
  href: string
  icon: string  // RemixIcon class, e.g. 'ri-braces-line'
}

// Renders the nav sections:
const NAV_SECTIONS: NavSection[] = [
  { label: 'Home', href: '/', icon: 'ri-home-4-line' },
  { label: 'Patterns', href: '/patterns', icon: 'ri-braces-line' },
  { label: 'Hooks', href: '/hooks', icon: 'ri-git-branch-line' },
  { label: 'Checks', href: '/checks', icon: 'ri-shield-check-line' },
  { label: 'Config', href: '/config', icon: 'ri-settings-3-line' },
  { label: 'Playground', href: '/playground', icon: 'ri-terminal-box-line' },
  { label: 'Tiers', href: '/tiers', icon: 'ri-stack-line' },
  { label: 'Tooling', href: '/tooling', icon: 'ri-tools-line' },
  { label: 'Integration', href: '/integration', icon: 'ri-plug-line' },
]
```

Collapse behavior: toggle button sets `collapsed` state. When collapsed, nav items
show only icon (tooltip on hover). Transition via `width` animation on the sidebar
container. On mobile (< 768px), sidebar becomes a full overlay triggered by hamburger
button in the header.

### 8.3 WikiSearch

```typescript
interface SearchResult {
  title: string
  href: string      // Full URL including anchor
  section: string   // Parent section name (e.g., 'Patterns', 'Hooks')
  excerpt: string   // Highlighted matching text
  type: 'pattern' | 'hook' | 'config' | 'check' | 'page'
}

interface WikiSearchProps {
  searchData: SearchIndexEntry[]  // Fuse-ready data
}

// Opens as a modal overlay
// Keyboard: arrow keys navigate results, Enter opens, Escape closes
// Trigger: '/' key or Ctrl+K, or click on search button in header
// Debounce: 150ms before executing fuse search
```

The search index is built once on mount from `searchData` passed through the page
hierarchy. The `searchData` is assembled from all server-loaded YAML data plus
hardcoded page content. `fuse.js` options:

```typescript
const fuseOptions = {
  keys: ['title', 'section', 'keywords', 'content'],
  threshold: 0.3,
  includeMatches: true,
  minMatchCharLength: 2,
}
```

### 8.4 PatternCard

```typescript
interface BannedPattern {
  pattern: string     // The regex pattern
  reason: string      // Why it's banned
  category?: string   // Assigned by patterns.ts classifier
}

interface PatternCardProps {
  pattern: BannedPattern
  exemptions?: UniversalException[]  // Exemptions applicable to this pattern
}

// Renders:
// - Category badge (colored pill)
// - The regex pattern in a monospace code span
// - The reason text
// - Exemption info (if any): which paths are exempt
// - Anchor ID: slug derived from pattern (for deep linking)
// - FeedbackWidget with targetId = pattern slug, targetType = 'pattern'
```

### 8.5 CategoryNav (Pattern Library)

```typescript
interface PatternCategory {
  id: string
  label: string
  count: number       // Total patterns in this category
}

interface CategoryNavProps {
  categories: PatternCategory[]
  activeCategories: Set<string>
  onToggle: (categoryId: string) => void
}

// Renders a vertical list of category toggles
// Each toggle shows: checkbox/toggle + label + count badge
// "Select All" / "Deselect All" buttons at top
```

### 8.6 HookTable

```typescript
interface HookRecord {
  id: string
  kind: 'shell' | 'shell_inline' | 'shell_with_arg' | 'python_module' | 'python_module_files' | 'makefile_target'
  entry: string
  stage: 'pre-commit' | 'commit-msg' | 'pre-push'
  pass_filenames: boolean
  always_run: boolean
  mandatory: boolean
  safety: boolean
  applicable_to: string[]
}

interface HookTableProps {
  hooks: HookRecord[]
}

// Renders a filterable table
// Filters at top: stage (multi-select pills), tier (safety/strict-mandatory/strict-exemptable)
// Columns: ID, Kind, Entry, Stage, Tier badge, Mandatory badge
// Each row is clickable → navigates to /hooks/[id]
// Each row includes FeedbackWidget
```

### 8.7 HookBadge

```typescript
type Stage = 'pre-commit' | 'commit-msg' | 'pre-push'
type TierClass = 'safety' | 'strict-mandatory' | 'strict-exemptable'

interface HookBadgeProps {
  type: 'stage' | 'tier' | 'mandatory'
  value: Stage | TierClass | boolean
}

// Color-coded pill badges:
// - Stage: pre-commit=green, commit-msg=yellow, pre-push=red
// - Tier: safety=green, strict-mandatory=blue, strict-exemptable=orange
// - Mandatory: true=red border, false=no badge
```

### 8.8 FeedbackWidget

```typescript
type Vote = 'up' | 'down' | null

interface FeedbackEvent {
  targetId: string
  targetType: 'pattern' | 'hook' | 'config' | 'check' | 'page'
  vote: 'up' | 'down'
  comment?: string
  timestamp: number
}

interface FeedbackWidgetProps {
  targetId: string
  targetType: FeedbackEvent['targetType']
}

// State machine:
// IDLE → show thumbs-up + thumbs-down buttons
// VOTED → show filled vote icon + optional comment textarea
// SUBMITTED → show 'Thanks' state (icon + text)

// Internal state:
// - currentVote: Vote (null = unvoted)
// - comment: string
// - submitted: boolean

// On vote click:
// 1. Set currentVote
// 2. Show comment textarea
// 3. On comment submit (or skip):
//    a. Emit analytics event via useAnalyticsStore
//    b. Set submitted = true
//    c. Show 'Thanks' state for 2 seconds, then collapse to voted icon
```

The widget MUST use the `useAnalyticsStore` to emit and persist feedback:

```typescript
const addFeedback = useAnalyticsStore((s) => s.addFeedback)

function handleSubmit() {
  addFeedback({
    targetId: props.targetId,
    targetType: props.targetType,
    vote: currentVote!,
    comment: comment || undefined,
    timestamp: Date.now(),
  })
  setSubmitted(true)
}
```

### 8.9 PlaygroundShell

```typescript
interface PlaygroundShellProps {
  patterns: BannedPattern[]  // Passed from server component
}

// Layout: two-pane split
// ┌─────────────────────┬──────────────┐
// │                     │ Pattern       │
// │   CodeEditor        │ Category     │
// │   (CodeMirror 6)    │ Filter       │
// │                     │              │
// │                     │ ──────────── │
// │                     │ MatchPanel   │
// │                     │ (results)    │
// └─────────────────────┴──────────────┘

// On mobile (< 1024px): stacked vertically
```

### 8.10 CodeEditor

```typescript
interface CodeEditorProps {
  patterns: BannedPattern[]
  activeCategories: Set<string>
  language: 'python' | 'shell' | 'javascript' | 'typescript'
  onMatchesChange: (matches: PatternMatch[]) => void
}

interface PatternMatch {
  pattern: BannedPattern
  lineNumber: number
  lineText: string
  matchText: string       // The specific substring that matched
  columnStart: number
  columnEnd: number
}
```

Implementation:
1. Create a `CodeMirrorView` via `new EditorView({...})` in a `useEffect`
2. Register an `onChange` listener via `EditorView.updateListener`
3. On each change (debounced 300ms):
   a. Get full document text via `view.state.doc.toString()`
   b. For each active-category pattern, test regex against each line
   c. Build `PatternMatch[]` array
   d. Call `onMatchesChange` with results
   e. Create CodeMirror decorations:
      - `Decoration.mark({ class: 'cm-pattern-match' })` for matched ranges
      - Gutter marker via `GutterMarker` subclass for matched lines
4. Dispatch decorations via `view.dispatch({ effects: setDecorations.of(...) })`

```typescript
// Decoration field
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

### 8.11 MatchPanel

```typescript
interface MatchPanelProps {
  matches: PatternMatch[]
  onMatchClick: (lineNumber: number) => void  // Scrolls editor to line
}

// Renders a scrollable list of matches
// Each match row shows:
// - Line number (clickable → scrolls editor)
// - Matched text excerpt (truncated to 60 chars)
// - Pattern reason text
// - Category badge
// - "No matches" empty state when matches is []
```

---

## 9. Pattern Classifier

The `src/lib/patterns.ts` module MUST classify each `BannedPattern` into a category.
Since `banned_words.yaml` has no category field, classification is based on the
pattern's reason text and regex characteristics:

```typescript
// src/lib/patterns.ts
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

export interface ClassifiedPattern extends BannedPattern {
  category: PatternCategory
  categoryLabel: string
}

export const CATEGORY_LABELS: Record<PatternCategory, string> = {
  'linter-suppression': 'Linter Suppression',
  'lazy-types': 'Lazy Type Annotations',
  'silent-errors': 'Silent Error Swallowing',
  'legacy-fallback': 'Legacy & Fallback Code',
  'suppression': 'Suppression Patterns',
  'unsafe-reflection': 'Unsafe Reflection',
  'data-classes': 'Data Classes',
  'test-quality': 'Test Quality',
  'path-safety': 'Path Safety',
  'uuid': 'UUID',
  'container-versions': 'Container Versions',
  'deprecated-python': 'Deprecated Python',
  'self-methods': 'Self Method Patterns',
  'special-chars': 'Special Characters',
  'filename-rules': 'Filename Rules',
  'directory-rules': 'Directory Rules',
}

// Classification is heuristic: match on reason text and pattern characteristics
export function classifyPattern(pattern: BannedPattern): ClassifiedPattern {
  // Classification logic based on reason text keywords and pattern regex
  // ...
}
```

The classifier MUST be kept in sync with `banned_words.yaml` — if new patterns are
added, the classifier map MUST be updated.

---

## 10. Analytics Store Schema

### 10.1 Event Types

```typescript
// src/types/analytics.ts

export interface PageViewEvent {
  type: 'page_view'
  path: string
  title: string
  timestamp: number
  referrer: string
  sessionId: string
}

export interface PageExitEvent {
  type: 'page_exit'
  path: string
  dwellMs: number
  maxScrollPercent: number
  timestamp: number
  sessionId: string
}

export interface SearchEvent {
  type: 'search'
  query: string
  resultCount: number
  timestamp: number
  sessionId: string
}

export interface FeedbackEvent {
  type: 'feedback'
  targetId: string
  targetType: 'pattern' | 'hook' | 'config' | 'check' | 'page'
  vote: 'up' | 'down'
  comment?: string
  timestamp: number
  sessionId: string
}

export interface PlaygroundEvent {
  type: 'playground'
  action: 'language_change' | 'category_toggle' | 'match_found'
  details: Record<string, unknown>
  timestamp: number
  sessionId: string
}

export type AnalyticsEvent =
  | PageViewEvent
  | PageExitEvent
  | SearchEvent
  | FeedbackEvent
  | PlaygroundEvent
```

### 10.2 Store Shape

```typescript
// src/stores/analytics-store.ts
import { create } from 'zustand'
import type { AnalyticsEvent, FeedbackEvent } from '@/types/analytics'

interface AnalyticsState {
  // Event storage (FIFO, max 2000)
  events: AnalyticsEvent[]

  // Derived aggregates (computed from events)
  pageViews: Record<string, number>           // path → count
  feedback: Record<string, FeedbackEvent[]>   // targetId → feedback list
  searchQueries: { query: string; count: number }[]
  totalViews: number
  totalFeedback: number
  totalSearches: number
  sessionId: string

  // Actions
  track: (event: AnalyticsEvent) => void
  addFeedback: (event: FeedbackEvent) => void
  getPageViews: (path: string) => number
  getTopPages: (limit: number) => { path: string; views: number }[]
  getFeedbackForTarget: (targetId: string) => FeedbackEvent[]
  getFeedbackStats: () => { total: number; up: number; down: number }
  hasUserVoted: (targetId: string) => boolean
  getUserVote: (targetId: string) => 'up' | 'down' | null
}

// localStorage key: 'ami-ci-wiki-analytics'
// Rotation: when events.length > 2000, shift oldest 500 events
// Session ID: crypto.randomUUID() on first store creation, stored in localStorage
```

### 10.3 Analytics Integration Points

| Event type | Triggered by | Integration point |
|-----------|-------------|-------------------|
| `page_view` | Route change | `useEffect` in `WikiShell` or per-page component, fires on mount |
| `page_exit` | Navigation away / tab close | `page-stats.ts` visibility change listener |
| `search` | Search submit | `WikiSearch` component on debounced query |
| `feedback` | Vote + optional comment submit | `FeedbackWidget` on submit |
| `playground` | Language change, category toggle, match found | `PlaygroundShell` / `CodeEditor` |

### 10.4 Debug Mode

When `?debug=true` is in the URL, the analytics store MUST log every event to
`console.debug` with a `[analytics]` prefix. Detection via:

```typescript
const isDebug = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('debug') === 'true'
```

---

## 11. Page Stats Tracker

`src/lib/page-stats.ts` MUST provide:

```typescript
export interface PageStatsTracker {
  start: () => void
  stop: () => PageExitEvent
}

export function createPageStatsTracker(
  path: string,
  sessionId: string,
): PageStatsTracker
```

Implementation:

1. `start()`:
   - Record `performance.now()` as start time
   - Add `visibilitychange` listener: on hidden → call `stop()`
   - Add scroll listener (passive, throttled 100ms): track `scrollY / (scrollHeight - clientHeight)` as percentage

2. `stop()`:
   - Calculate `dwellMs = performance.now() - startTime`
   - Remove listeners
   - Return `PageExitEvent` with dwell time and max scroll percent

The tracker is instantiated in `useEffect` in `WikiShell` or per-page components:

```typescript
useEffect(() => {
  const tracker = createPageStatsTracker(pathname, sessionId)
  tracker.start()
  return () => {
    const exitEvent = tracker.stop()
    track(exitEvent)
  }
}, [pathname])
```

---

## 12. Regex Engine

### 12.1 Algorithm

```
Input: sourceCode (string), patterns (BannedPattern[]), activeCategories (Set<string>)
Output: PatternMatch[]

For each pattern in patterns where pattern.category ∈ activeCategories:
  1. Compile pattern.pattern as RegExp (with 'gm' flags)
  2. Reset lastIndex to 0
  3. While (match = regex.exec(sourceCode)) is not null:
     a. Calculate lineNumber from sourceCode.slice(0, match.index)
     b. Extract lineText from the full line
     c. Push PatternMatch to results
  4. Handle regex errors: if pattern compilation fails, log warning to console, skip

Sort results by lineNumber ascending
Deduplicate: same line + same pattern → keep first
```

### 12.2 Performance Considerations

- Patterns are compiled once and cached in a `Map<string, RegExp>`
- The regex execution MUST be debounced at 300ms
- For large inputs (> 10,000 chars), the engine MAY batch execution across
  `requestIdleCallback` to avoid blocking the main thread
- Regex catastrophic backtracking protection: patterns from `banned_words.yaml`
  are simple enough that this is low risk, but the engine MUST wrap `regex.exec`
  in a try/catch and skip patterns that throw

### 12.3 Language Filtering

```typescript
const LANGUAGE_PATTERN_FILTERS: Record<string, (pattern: BannedPattern) => boolean> = {
  python: () => true,  // All patterns apply to Python
  shell: (p) => !['data-classes', 'self-methods', 'lazy-types'].includes(p.category || ''),
  javascript: (p) => p.category !== 'data-classes' && p.category !== 'deprecated-python',
  typescript: (p) => p.category !== 'data-classes' && p.category !== 'deprecated-python',
}
```

---

## 13. Theme System

### 13.1 CSS Custom Properties

Following AMI-PORTAL's `_variables.css` pattern exactly:

```css
/* public/styles/_variables.css */

:root {  /* Dark theme (default) */
  --bg: #0b0c0f;
  --panel: #111319;
  --text: #e6e9ef;
  --muted: #9aa3b2;
  --accent: #7aa2f7;
  --ok: #10b981;
  --warn: #f97316;
  --error: #ef4444;
  --link: #7dcfff;
  --border: #242832;
  --code-bg: #0d1117;

  /* Surface elevation */
  --surface-1: color-mix(in oklab, var(--bg) 95%, var(--text) 5%);
  --surface-2: color-mix(in oklab, var(--panel) 90%, var(--text) 10%);

  /* Shared tokens */
  --btn-radius: 8px;
  --btn-padding-x: 1rem;
  --btn-padding-y: 0.5rem;
  --input-radius: 8px;
  --duration-fast: 120ms;
  --duration-medium: 200ms;

  /* Z-index scale */
  --z-sidebar: 100;
  --z-header: 200;
  --z-modal: 500;
  --z-search: 1000;
}

[data-theme='light'] {
  --bg: #ffffff;
  --panel: #f7f7f9;
  --text: #1f2937;
  --muted: #6b7280;
  --accent: #1d4ed8;
  --ok: #16a34a;
  --warn: #ea580c;
  --error: #dc2626;
  --link: #2563eb;
  --border: #e5e7eb;
  --code-bg: #f3f4f6;
}
```

### 13.2 Tailwind Bridge

```css
/* src/styles/globals.css */
@import 'tailwindcss';

@theme {
  --color-bg: var(--bg);
  --color-panel: var(--panel);
  --color-text: var(--text);
  --color-muted: var(--muted);
  --color-accent: var(--accent);
  --color-ok: var(--ok);
  --color-warn: var(--warn);
  --color-error: var(--error);
  --color-link: var(--link);
  --color-border: var(--border);
  --color-code-bg: var(--code-bg);
}
```

### 13.3 Theme Store

Direct copy of AMI-PORTAL's `src/stores/theme-store.ts`, minus the Mermaid
re-render dispatch (the wiki has no Mermaid diagrams):

```typescript
// src/stores/theme-store.ts
import { create } from 'zustand'

type Theme = 'dark' | 'light'

interface ThemeState {
  theme: Theme
  toggle: () => void
  set: (_theme: Theme) => void
}

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  try {
    const stored = localStorage.getItem('theme')
    if (stored === 'light' || stored === 'dark') return stored
  } catch { /* localStorage blocked */ }
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: getInitialTheme(),
  toggle: () =>
    set((s) => {
      const next: Theme = s.theme === 'dark' ? 'light' : 'dark'
      try { localStorage.setItem('theme', next) } catch { /* noop */ }
      document.documentElement.setAttribute('data-theme', next)
      return { theme: next }
    }),
  set: (theme) => {
    try { localStorage.setItem('theme', theme) } catch { /* noop */ }
    document.documentElement.setAttribute('data-theme', theme)
    set({ theme })
  },
}))
```

### 13.4 Flash Prevention

Inline script in `<head>` (same pattern as AMI-PORTAL):

```html
<script>
  try {
    var t = localStorage.getItem('theme')
    if (t) document.documentElement.setAttribute('data-theme', t)
  } catch(e) {}
</script>
```

---

## 14. Text Styles

### 14.1 Typography

Fonts loaded via `next/font/google` in `app/layout.tsx`:

```typescript
const montserrat = Montserrat({
  subsets: ['latin', 'latin-ext', 'cyrillic'],
  weight: ['200', '400', '500', '600', '700', '900'],
  display: 'swap',
  variable: '--font-montserrat',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin', 'latin-ext', 'cyrillic'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
})
```

Body: Montserrat, 0.875rem, line-height 1.6. Code: JetBrains Mono, 0.8125rem.

### 14.2 Icons

RemixIcon 4.3.0 via CDN:

```html
<link rel="stylesheet"
  href="https://cdn.jsdelivr.net/npm/remixicon@4.3.0/fonts/remixicon.css" />
```

Usage: `<i className="ri-home-4-line" />`

### 14.3 Icon Component

```typescript
// src/components/ui/Icon.tsx
interface IconProps {
  name: string        // RemixIcon name, e.g. 'home-4-line'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function Icon({ name, size = 'md', className }: IconProps) {
  return <i className={clsx(`ri-${name}`, `icon--${size}`, className)} aria-hidden="true" />
}
```

---

## 15. CSS Architecture

### 15.1 File Inventory

| File | Purpose |
|------|---------|
| `shared.css` | Master import: `@import`s all partials in order |
| `_variables.css` | Design tokens, `data-theme` dark/light blocks, base body styles, scrollbar styling |
| `_wiki-layout.css` | `.wiki-shell`, `.wiki-main`, header bar, content area |
| `_wiki-sidebar.css` | Sidebar nav tree, collapse states, mobile overlay |
| `_wiki-patterns.css` | Pattern cards, category badges, filter toggles |
| `_wiki-playground.css` | Two-pane layout, editor container, match panel |
| `_wiki-feedback.css` | Vote buttons, comment textarea, thanks state |
| `_wiki-stats.css` | Stats bar, view counts, trending list |
| `_prose.css` | Markdown/content typography, tables, lists |
| `_buttons.css` | `.btn`, variants (primary/secondary/danger/ghost), sizes |
| `_tabs.css` | Tab compound component styles |
| `_search.css` | Search modal overlay, result list, highlighting |
| `_error-boundary.css` | Error boundary fallback UI |

### 15.2 Class Naming Convention

Following AMI-PORTAL's BEM-like convention:

- Block: `.wiki-shell`, `.pattern-card`, `.hook-table`
- Element: `.pattern-card__regex`, `.pattern-card__reason`
- Modifier: `.pattern-card--hidden`, `.btn--primary`, `.hook-badge--safety`
- State: `.is-active`, `.is-collapsed`, `.is-voted`

---

## 16. Build Configuration

### 16.1 next.config.js

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Read YAML configs from ../config/ at render time
  serverExternalPackages: ['js-yaml'],
}

module.exports = nextConfig
```

### 16.2 package.json (Key Fields)

```json
{
  "name": "ami-ci-wiki",
  "private": true,
  "version": "0.1.0",
  "packageManager": "npm@11.6.2",
  "engines": {
    "node": ">=24",
    "npm": ">=11"
  },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "format": "prettier --check .",
    "type-check": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "next": "16.1.7",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "zustand": "5.0.12",
    "clsx": "2.1.1",
    "fuse.js": "^7.1.0",
    "js-yaml": "^4.1.0",
    "@codemirror/view": "^6.41.0",
    "@codemirror/state": "^6.6.0",
    "@codemirror/lang-python": "^6.2.1",
    "@codemirror/lang-javascript": "^6.2.5",
    "@codemirror/commands": "^6.10.3",
    "@codemirror/language": "^6.12.3"
  },
  "devDependencies": {
    "@eslint/eslintrc": "3.3.5",
    "@tailwindcss/postcss": "4.2.1",
    "@testing-library/react": "^16.3.2",
    "@testing-library/jest-dom": "^6.9.1",
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
    "jsdom": "^29.0.0"
  }
}
```

---

## 17. Check Catalog (Hardcoded Manifest)

Shell checks and Python checks are documented through a hardcoded manifest in
`src/lib/hooks-data.ts` since there is no machine-readable catalog of check functions.

```typescript
// src/lib/hooks-data.ts
export interface CheckDescriptor {
  id: string
  name: string
  kind: 'shell' | 'python'
  stage: 'pre-commit' | 'commit-msg' | 'pre-push'
  source: string         // File path + line number
  description: string
  dependencies: string[]
  configFiles: string[]
  functionSignature?: string
}

export const SHELL_CHECKS: CheckDescriptor[] = [
  {
    id: 'ci-check-unstaged',
    name: 'ci_check_unstaged',
    kind: 'shell',
    stage: 'pre-commit',
    source: 'lib/checks_core.sh',
    description: 'Blocks commits with unstaged changes. Auto-stages instead of stashing.',
    dependencies: ['git'],
    configFiles: [],
    functionSignature: 'ci_check_unstaged()',
  },
  // ... all other shell checks
]

export const PYTHON_CHECKS: CheckDescriptor[] = [
  {
    id: 'ci-check-dependency-versions',
    name: 'check_dependency_versions',
    kind: 'python',
    stage: 'pre-push',
    source: 'ci/check_dependency_versions.py',
    description: 'Validates dependency version freshness against PyPI, npm, and Docker Hub.',
    dependencies: ['httpx'],
    configFiles: ['dependency_excludes.yaml'],
  },
  // ... all other Python checks
]
```

---

## 18. Requirement Traceability

| Requirement | Section | Status |
|------------|---------|--------|
| FR-1: Wiki Shell Layout | 8.1 | Specified |
| FR-2: Full-Text Search | 8.3 | Specified |
| FR-3: Home Page | 7.1 | Specified |
| FR-4: Pattern Library | 8.4, 8.5, 9 | Specified |
| FR-5: Hook Reference | 8.6, 8.7 | Specified |
| FR-6: Hook Detail Page | 7.1 | Specified |
| FR-7: Configuration Reference | 6.3, 7.1 | Specified |
| FR-8: Live Pattern Playground | 8.9—8.11, 12 | Specified |
| FR-9: Check Catalog | 17 | Specified |
| FR-10: Tier Documentation | 7.1 | Specified |
| FR-11: Tooling Documentation | 7.1 | Specified |
| FR-12: Integration Guide | 7.1 | Specified |
| FR-13: Page Analytics | 10, 11 | Specified |
| FR-14: Page-Level Stats | 10.2 | Specified |
| FR-15: Feedback Mechanism | 8.8, 10.2 | Specified |
| NFR-1: Performance | 12.2 | Specified |
| NFR-2: Technology Stack | 3, 16 | Specified |
| NFR-3: Theme | 13 | Specified |
| NFR-4: Security | 4 | Specified |
| NFR-5: Accessibility | 8.3, 8.8 | Specified |
| NFR-6: Responsive Design | 8.2, 8.9 | Specified |
| NFR-7: TypeScript & Code Quality | 5, 16.1 | Specified |

---

## 19. Open Implementation Questions

1. **YAML loading strategy:** Should YAMLs be read at request time (per-request `readFileSync`)
   or cached in a module-level variable? Request-time reads keep content fresh without
   restart. If performance becomes an issue, a file-watch + cache invalidation pattern
   can be added later. RECOMMENDED: request-time reads for Phase 1.

2. **Pattern category classification:** The `classifyPattern()` function uses heuristic
   matching on reason text. If the YAML format changes, the classifier must be updated.
   A test suite SHOULD assert that every pattern in `banned_words.yaml` maps to exactly
   one category.

3. **CodeMirror theme:** Should the CodeMirror instance follow the wiki's `data-theme`
   (dark/light) or use a fixed dark theme? RECOMMENDED: follow `data-theme` — dark uses
   `@codemirror/theme-one-dark`, light uses default theme.

4. **Search index scope:** Currently all content pages + YAML data. Should the HOOKS.md
   document text also be indexed? Yes — it adds useful content. The markdown can be
   loaded server-side and passed as searchable text.

5. **Feedback persistence across sessions:** Currently the analytics store persists
   feedback in localStorage. If the browser clears localStorage, feedback history is
   lost. This is acceptable for a documentation wiki; there is no backend to persist to.

6. **Page stats on the home page:** The "trending" section should be simple all-time
   page view counts. Time-decay ranking adds complexity without proportional value for
   a documentation surface.
