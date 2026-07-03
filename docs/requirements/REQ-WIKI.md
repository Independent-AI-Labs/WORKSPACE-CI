# REQ-WIKI: Interactive Wiki Web UI for workspace-ci

**Date:** 2026-06-09
**Status:** DRAFT
**Type:** Requirements
**Specification:** [SPEC-WIKI](../specifications/SPEC-WIKI.md)

> **Implementation status:** Requirements gathering. No code. The `web/` directory does not
> exist yet. This document defines the full feature set and acceptance criteria for an
> interactive, wiki-like web UI that documents every feature of workspace-ci.

---

**Cross-references:**

- [SPEC-WIKI](../specifications/SPEC-WIKI.md): companion specification (implementation detail)
- [HOOKS.md](../HOOKS.md): hook generation and integration guide
- [`config/required_hooks.yaml`](../../config/required_hooks.yaml): canonical hook definitions
- [`config/banned_words.yaml`](../../config/banned_words.yaml): all banned content patterns
- [`config/sensitive_files.yaml`](../../config/sensitive_files.yaml): sensitive file rules
- [`config/coverage_thresholds.yaml`](../../config/coverage_thresholds.yaml): coverage minimums
- [`config/file_length_limits.yaml`](../../config/file_length_limits.yaml): file length caps
- [`config/dead_code.yaml`](../../config/dead_code.yaml): AST analysis config
- [`config/blocked_commit_patterns.yaml`](../../config/blocked_commit_patterns.yaml): commit message bans
- [`ci/*.py`](../../ci/): Python check modules (canonical docstrings for check catalog)
- [`lib/*.sh`](../../lib/): Shell check functions (canonical comments for shell check catalog)

**Sibling-repo guard policy configs (cross-repo source, §9.3 guard root):**

- [`WORKSPACE-GUARD/config/guard_subcommands.yaml`](../../../WORKSPACE-GUARD/config/guard_subcommands.yaml): blocked / partial / contract-check git subcommands
- [`WORKSPACE-GUARD/config/guard_config_keys.yaml`](../../../WORKSPACE-GUARD/config/guard_config_keys.yaml): dangerous git-config key glob patterns; sudo-gated keys
- [`WORKSPACE-GUARD/config/guard_protected_branches.yaml`](../../../WORKSPACE-GUARD/config/guard_protected_branches.yaml): protected branch names + prefixes
- [`WORKSPACE-GUARD/config/guard_environment.yaml`](../../../WORKSPACE-GUARD/config/guard_environment.yaml): allowed / sudo-gated / blocked env vars
- [`WORKSPACE-GUARD/config/guard_resource_limits.yaml`](../../../WORKSPACE-GUARD/config/guard_resource_limits.yaml): rlimit thresholds
- [`WORKSPACE-GUARD/config/guard_paths.yaml`](../../../WORKSPACE-GUARD/config/guard_paths.yaml): guard log/contract/enforcement/markers paths

---

## 1. Purpose & Scope

### 1.1 Purpose

Provide a self-documenting, interactive web interface that presents every feature,
check, pattern, and configuration of workspace-ci in a wiki-like format. The UI enables
operators and developers to browse, search, understand, and interactively test the
quality gates workspace-ci enforces.

### 1.2 Scope

**The wiki OWNS:**

- Rendering workspace-ci's feature set as structured, navigable wiki pages
- A live pattern-testing playground that runs banned-pattern regexes in-browser
- Full-text search across all hooks, patterns, checks, and configs
- Light/dark theme support
- A base-component feedback mechanism usable on any wiki section
- Page-level analytics: views, dwell time, scroll depth, search queries, playground usage
- A home page with aggregate stats, quick links, and trending content
- A content pipeline that derives documentation from source code (docstrings, comments,
  YAML configs, markdown docs): single source of truth
- A read-only **guard policy reference** that surfaces the sibling
  `workspace-guard` repo's compiled policy YAMLs (cross-repo source; the wiki
  holds no guard config of its own)

**The wiki DOES NOT:**

- Execute or spawn Python processes at request time (no `uv run`, no subprocesses)
- Modify workspace-ci configs, hooks, or source files
- Require authentication (it is a public documentation surface)
- Replace or duplicate AMI-PORTAL's shell, tab system, or iframe architecture
- Serve as a general-purpose documentation viewer for arbitrary files
- Implement i18n: English only
- Modify or re-compile the guard binary, its build-time `build.rs` embed, or
  the sibling `WORKSPACE-GUARD` policy configs (read-only cross-repo display)
- Duplicate content already present in source code: all content MUST derive
  from canonical sources (docstrings, YAML configs, markdown docs)

### 1.3 Ownership Split

```
workspace-ci/
├── config/          ← workspace-ci owns: canonical YAML rules (read-only by wiki)
├── lib/             ← workspace-ci owns: shell check functions
├── ci/              ← workspace-ci owns: Python check modules
├── scripts/         ← workspace-ci owns: CLI tools
├── docs/            ← workspace-ci owns: markdown documentation
│   ├── requirements/
│   │   └── REQ-WIKI.md    ← This document
│   └── specifications/
│       └── SPEC-WIKI.md   ← Companion specification
└── web/             ← Wiki owns: Next.js application
```

The wiki reads workspace-ci configs at server-render time via filesystem paths
resolved from a configurable config root (`WORKSPACE_CI_CONFIG_ROOT`, defaulting
to `../config` relative to `web/`). No symlinks. No duplication of YAML configs
into the `web/` tree. See SPEC §9.3 for the loader contract and deployment model.

---

## 2. Glossary

| Wiki term | Underlying system term | Notes |
|-----------|----------------------|-------|
| Pattern | Banned word regex rule | Entry in `banned_words.yaml`; has `pattern`, `reason`, and category |
| Hook | Git hook | Entry in `required_hooks.yaml`; wired into `.git/hooks/<stage>` |
| Check | Shell or Python check function | `ci_check_*` / `ci_block_*` in shell, `check_*.py` in Python |
| Stage | Git hook stage | `pre-commit`, `commit-msg`, `pre-push` |
| Tier | Enforcement level | `strict` (full), `poc` (safety subset), `vendored` (none) |
| Playground | Live pattern tester | Client-side only; no backend execution |
| Config | YAML rule file | One of the YAML files in `config/` |
| Feedback component | Inline vote + comment widget | Any wiki section can embed it |
| Analytics event | User interaction record | Page view, search, playground use, feedback submission |
| Extraction pipeline | Build-time docstring/comment parser | `scripts/extract-docs` → `web/src/data/*.json` |
| Single source of truth | Content ownership principle | Docstrings, YAML configs, markdown docs are canonical; wiki derives from them |

---

## 3. Functional Requirements

### 3.1 Wiki Shell and Navigation

#### FR-1: Wiki Shell Layout

| ID | Requirement |
|----|-------------|
| FR-1.1 | The application MUST render a persistent sidebar navigation panel. |
| FR-1.2 | The sidebar MUST be collapsible to an icon-only rail. |
| FR-1.3 | The sidebar MUST list all top-level wiki sections as navigation items. |
| FR-1.4 | The active route MUST be visually indicated in the sidebar. |
| FR-1.5 | A theme toggle (light/dark) MUST be present in the header area. |
| FR-1.6 | The header MUST display the current page title and breadcrumb path. |
| FR-1.7 | A search trigger with keyboard shortcut MUST be visible in the header. |

#### FR-2: Full-Text Search

| ID | Requirement |
|----|-------------|
| FR-2.1 | Search MUST index all patterns, hooks, checks, config fields, guard policy configs, and wiki page text. |
| FR-2.2 | Search results MUST display in a modal overlay with keyboard navigation. |
| FR-2.3 | Each result MUST link directly to the relevant page and anchor. |
| FR-2.4 | Results MUST highlight matching text and show the parent section name. |
| FR-2.5 | Search MUST be debounced and return results incrementally. |
| FR-2.6 | The search index MUST be built client-side at page load from pre-fetched data. |
| FR-2.7 | Every search query MUST emit an analytics event recording the query string and result count. |

### 3.2 Content Pages

#### FR-3: Home Page

| ID | Requirement |
|----|-------------|
| FR-3.1 | The home page MUST display a project overview summary of workspace-ci. |
| FR-3.2 | A quick-search input MUST be embedded in the hero area. |
| FR-3.3 | A "trending" section MUST show the top 4-6 most-viewed pages based on local analytics. |
| FR-3.4 | Quick-link cards MUST link to the highest-traffic sections. |
| FR-3.5 | An aggregate stats bar MUST display: total page views, total patterns, total hooks, total configs. |
| FR-3.6 | The stats bar MUST update reactively as analytics events fire. |

#### FR-4: Pattern Library

| ID | Requirement |
|----|-------------|
| FR-4.1 | The pattern library MUST list all banned patterns from `config/banned_words.yaml`, including all three rule groups: `banned` (content patterns), `directory_rules` (directory-scoped content patterns), and `filename_rules` (basename patterns). |
| FR-4.2 | Patterns MUST be grouped by category (e.g., Linter Suppression, Deferred Types, Unsafe Reflection). |
| FR-4.3 | Each pattern MUST display: the regex pattern, the reason it is banned, the match scope (content / filename / directory), and applicable file types. Filename-scope patterns MUST show a "filename match" badge. |
| FR-4.4 | A category filter MUST allow toggling individual categories on/off. |
| FR-4.5 | Each pattern MUST have a unique anchor ID for deep linking. |
| FR-4.6 | The page MUST show the total count of patterns and how many are currently visible. |
| FR-4.7 | Exemption information (universal and per-project) MUST be shown inline where applicable. |
| FR-4.8 | Each pattern MUST include the feedback component. |

#### FR-5: Hook Reference

| ID | Requirement |
|----|-------------|
| FR-5.1 | The hook reference MUST list all hooks from `config/required_hooks.yaml`. |
| FR-5.2 | Hooks MUST be filterable by stage (`pre-commit`, `commit-msg`, `pre-push`). |
| FR-5.3 | Hooks MUST be filterable by tier classification (safety, strict-mandatory, strict-exemptable). |
| FR-5.4 | Each hook MUST display: ID, kind, entry, stage, mandatory flag, safety flag. |
| FR-5.5 | A comparison table MUST show which hooks run at which stage for each enforcement tier. |
| FR-5.6 | Each hook MUST include the feedback component. |

#### FR-6: Hook Detail Page

| ID | Requirement |
|----|-------------|
| FR-6.1 | Each hook MUST have a dedicated detail page at `/hooks/<id>`. |
| FR-6.2 | The detail page MUST show: full metadata, applicable file types, pass_filenames, always_run. |
| FR-6.3 | The detail page MUST show the hook's placement in the tier/stage matrix. |
| FR-6.4 | If the hook is a shell function, the detail page MUST show the function signature and description. |
| FR-6.5 | If the hook is a Python module, the detail page MUST show the module path and CLI usage. |
| FR-6.6 | The detail page MUST include the feedback component. |

#### FR-7: Configuration Reference

| ID | Requirement |
|----|-------------|
| FR-7.1 | The config reference MUST list all YAML config files from `config/`. |
| FR-7.2 | Each config MUST have a dedicated detail page at `/config/<name>`. |
| FR-7.3 | The detail page MUST render each config's fields, types, defaults, and descriptions, derived from a co-located `config/<name>.schema.yaml` file (single source of truth: no hand-maintained field prose). When no schema file exists, the page MUST render the raw YAML only and emit a build-time warning. |
| FR-7.4 | The detail page MUST show the raw YAML content in a syntax-highlighted code block. |
| FR-7.5 | Each config detail page MUST include the feedback component. |

#### FR-8: Live Pattern Playground

| ID | Requirement |
|----|-------------|
| FR-8.1 | The playground MUST provide a code editor supporting Python, Shell, JavaScript, and TypeScript. |
| FR-8.2 | All banned-pattern regexes from `banned_words.yaml` MUST be run client-side against editor content on every change. |
| FR-8.3 | Matching lines MUST receive visible decorations (underline + gutter marker). |
| FR-8.4 | A side panel MUST list each match with: line number, matched text, pattern description, and banned reason. |
| FR-8.5 | Clicking a match in the side panel MUST scroll the editor to that line. |
| FR-8.6 | A category filter MUST allow enabling/disabling pattern categories, updating matches in real-time. |
| FR-8.7 | A language selector MUST filter applicable patterns for the chosen language. |
| FR-8.8 | The playground MUST NOT execute code, spawn subprocesses, or make backend requests for matching. |
| FR-8.9 | Every playground session MUST emit analytics events: language selected, categories toggled, patterns matched. |

#### FR-9: Check Catalog

| ID | Requirement |
|----|-------------|
| FR-9.1 | A check catalog MUST list all shell check functions and Python check modules. |
| FR-9.2 | Each check MUST have a detail page with: purpose, stage, dependencies, configuration. |
| FR-9.3 | Shell and Python checks MUST be in separate sections. |
| FR-9.4 | Each check detail page MUST include the feedback component. |

#### FR-10: Tier Documentation

| ID | Requirement |
|----|-------------|
| FR-10.1 | A tier documentation page MUST explain the `strict`, `poc`, and `vendored` enforcement tiers. |
| FR-10.2 | A comparison matrix MUST show which hooks run in which tier. |
| FR-10.3 | The page MUST explain enforcement modes (`warn` vs `enforce`). |

#### FR-11: Tooling Documentation

| ID | Requirement |
|----|-------------|
| FR-11.1 | A tooling page MUST document all workspace scripts, derived from `scripts/manifest.yaml` (single source of truth: no hand-maintained script prose). Adding a script to `scripts/` MUST be paired with a manifest entry. |
| FR-11.2 | Each tool MUST have its CLI usage, arguments, and output format documented, read from its `scripts/manifest.yaml` entry. |

#### FR-12: Integration Guide

| ID | Requirement |
|----|-------------|
| FR-12.1 | An integration guide MUST show step-by-step how to wire workspace-ci into a sibling repo. |
| FR-12.2 | The guide MUST cover: Makefile contract, hook generation, tier configuration, exception management. |

### 3.3 Content Sourcing

#### FR-16: Single Source of Truth: Content from Source Code

| ID | Requirement |
|----|-------------|
| FR-16.1 | Check catalog entries MUST be derived from Python docstrings in `ci/*.py`: no hardcoded check descriptions. |
| FR-16.2 | Shell check catalog entries MUST be derived from function comments in `lib/*.sh`: no hardcoded check descriptions. |
| FR-16.3 | Pattern library entries MUST be derived from `config/banned_words.yaml`: no duplication of pattern rules. |
| FR-16.4 | Hook reference entries MUST be derived from `config/required_hooks.yaml`: no duplication of hook definitions. |
| FR-16.5 | Configuration reference pages MUST read YAML configs directly from the filesystem: no copied YAML content. |
| FR-16.5a | Configuration field documentation (FR-7.3) MUST be derived from co-located `config/<name>.schema.yaml` files: no hand-maintained field prose that can drift from the configs. |
| FR-16.6 | A build-time extraction tool MUST produce structured JSON from Python docstrings and shell comments that the wiki consumes at request time. |
| FR-16.7 | Long-form prose that does not belong in source code (narrative guides, rationale, troubleshooting) MUST live in dedicated markdown files within the `web/` directory. |
| FR-16.8 | Optional `README.md` files in source directories (`ci/`, `lib/`, `config/`, `scripts/`) MUST be discoverable and rendered on relevant index pages. |

#### FR-17: Guard Policy Reference

The wiki surfaces the sibling `workspace-guard` repo's compiled policy configs
as a read-only reference section, mirroring the existing configuration
reference (FR-7) but sourced from a separately-configurable cross-repo root.

| ID | Requirement |
|----|-------------|
| FR-17.1 | The wiki MUST list all guard policy configs from the sibling `WORKSPACE-GUARD/config/` tree at a dedicated `/guard` route. |
| FR-17.2 | Each guard config MUST have a dedicated detail page at `/guard/<name>`. |
| FR-17.3 | Guard detail pages MUST render schema-derived field documentation reusing the co-located `guard_<name>.schema.yaml` convention (FR-7.3 / §21.4) and the raw YAML in a syntax-highlighted code block. |
| FR-17.4 | When the `WORKSPACE-GUARD/config/` tree is absent at the resolved root, `/guard` MUST render an empty-state ("No guard policy configs found"), never crash, and `/config` MUST remain fully functional. |
| FR-17.5 | The guard config root MUST be configurable via `WORKSPACE_GUARD_CONFIG_ROOT`, mirroring the `WORKSPACE_CI_CONFIG_ROOT` mechanism (SPEC §9.3). Default: `../../WORKSPACE-GUARD/config` relative to `web/`. |
| FR-17.6 | Each guard config detail page MUST include the feedback component (FR-15) with `targetType: 'guard'`. |
| FR-17.7 | Guard policy configs MUST be read-only through the wiki: no mutation, no write to the sibling repo (mirrors NFR-4.2 for the CI config tree). |

### 3.4 Analytics and Feedback

#### FR-13: Page Analytics and Stats Tracking

| ID | Requirement |
|----|-------------|
| FR-13.1 | Every page navigation MUST emit a page-view event recording: path, title, timestamp, referrer. |
| FR-13.2 | Time-on-page MUST be tracked via the Page Visibility API and emitted on page exit. |
| FR-13.3 | Scroll depth MUST be tracked; the maximum scroll percentage MUST be emitted on page exit. |
| FR-13.4 | All analytics events MUST be stored client-side and persisted in the browser. |
| FR-13.5 | The analytics store MUST rotate events when exceeding a configurable limit (FIFO eviction). |
| FR-13.6 | Event data MUST NOT contain personally identifiable information (PII). |
| FR-13.7 | An analytics debug mode MUST be toggleable for development. |

#### FR-14: Page-Level Stats Display

| ID | Requirement |
|----|-------------|
| FR-14.1 | Each wiki page MUST display a page-view count in its header area. |
| FR-14.2 | The home page MUST aggregate: total views, top 5 most-viewed pages, total searches, total feedback submissions. |
| FR-14.3 | Stats displayed on individual pages MUST update reactively as the analytics store changes. |

#### FR-15: Base-Component Feedback Mechanism

| ID | Requirement |
|----|-------------|
| FR-15.1 | A reusable feedback component MUST be available for embedding in any wiki section. |
| FR-15.2 | The component MUST render an inline voting interface: thumbs-up and thumbs-down buttons. |
| FR-15.3 | After voting, an optional comment textarea MUST appear below the vote buttons. |
| FR-15.4 | The component MUST accept an identifier prop uniquely identifying the content being rated. |
| FR-15.5 | The component MUST accept a type prop categorizing the feedback source (pattern, hook, config, check, page). |
| FR-15.6 | Submitting feedback MUST emit an analytics event recording: identifier, type, vote, optional comment, timestamp. |
| FR-15.7 | The component MUST remember a user's vote on a specific target across navigations. |
| FR-15.8 | The component MUST be accessible: ARIA labels, keyboard-operable, screen-reader friendly. |
| FR-15.9 | The component MUST adapt to light and dark themes. |
| FR-15.10 | A page-level feedback aggregate (e.g., "3 of 5 patterns on this page rated helpful") MUST be available for pages embedding multiple feedback components. |

---

## 4. Non-Functional Requirements

### NFR-1: Performance

| ID | Requirement |
|----|-------------|
| NFR-1.1 | Initial page load (LCP) MUST be under 2.5 seconds on a 10 Mbps connection. |
| NFR-1.2 | Client-side navigation between wiki pages MUST complete in under 200ms. |
| NFR-1.3 | Search index building MUST NOT block the main thread perceptibly. |
| NFR-1.4 | Playground regex matching MUST be debounced to avoid jank during typing. |
| NFR-1.5 | YAML configs MUST be read and parsed server-side; raw YAML text MUST NOT be sent to the client except when explicitly displayed in a code block. |
| NFR-1.6 | Content pages MUST render progressively: the shell (sidebar, header) MUST appear before all content data resolves. No page MUST display a blank screen while waiting for data. |
| NFR-1.7 | The code editor bundle MUST NOT load on pages that do not use it. |

### NFR-2: Technology Stack

| ID | Requirement |
|----|-------------|
| NFR-2.1 | The wiki MUST be a Next.js application using the App Router. |
| NFR-2.2 | Styling MUST use CSS utility classes with CSS custom property-based theming. |
| NFR-2.3 | All UI components MUST be custom-built. No third-party UI component libraries (MUI, Chakra, shadcn, etc.). Third-party functional libraries (CodeMirror, fuse.js, zustand) are permitted where named in NFR-2.5/2.6. |
| NFR-2.4 | Client-side state management MUST use a reactive store. |
| NFR-2.5 | Full-text search MUST use a client-side fuzzy-search library. |
| NFR-2.6 | The code editor in the playground MUST use CodeMirror 6 (a third-party editor library, not a UI component library). It MUST be code-split via `next/dynamic` with `ssr: false` so it loads only on `/playground` (NFR-1.7). |
| NFR-2.7 | YAML configs MUST be parsed server-side using a YAML parsing library. |
| NFR-2.8 | No Python packages, `uv`, or Python subprocesses MUST be present in the wiki's dependency tree or runtime. |
| NFR-2.9 | Fonts MUST be loaded via `next/font/google` (self-hosted at build, no runtime CDN request). Icons MUST be self-hosted (no render-blocking CDN `<link>`); RemixIcon is vendored into `web/public/` and served locally to protect LCP (NFR-1.1). |

### NFR-3: Theme

| ID | Requirement |
|----|-------------|
| NFR-3.1 | Theming MUST use CSS custom properties and a data attribute on the root element: NOT media-query-based dark mode classes. |
| NFR-3.2 | Both dark (default) and light themes MUST be supported. |
| NFR-3.3 | Theme MUST respect OS preference on first load, then persist user choice in browser storage. |
| NFR-3.4 | A flash-of-wrong-theme prevention mechanism MUST run before first paint. |
| NFR-3.5 | Design tokens (colors, spacing, radii, z-indexes) MUST be defined as CSS custom properties. |
| NFR-3.6 | CSS utility classes MUST bridge CSS custom properties into design-token-aware utility names. |

### NFR-4: Security

| ID | Requirement |
|----|-------------|
| NFR-4.1 | The playground MUST NOT execute submitted code on the server or in a sandboxed evaluator. Regex matching only. |
| NFR-4.2 | No YAML config files MUST be modified or written through the wiki. Server reads only. |
| NFR-4.3 | No authentication or authorization system MUST be implemented. |
| NFR-4.4 | Analytics data MUST be stored only in the browser. No analytics data MUST be sent to any external service. |
| NFR-4.5 | Analytics data MUST NOT capture form inputs, clipboard contents, cookies, or URL query parameters other than the page path. |

### NFR-5: Accessibility

| ID | Requirement |
|----|-------------|
| NFR-5.1 | All interactive elements MUST have ARIA labels and roles. |
| NFR-5.2 | The wiki MUST be fully keyboard-navigable. |
| NFR-5.3 | Color contrast ratios MUST meet WCAG 2.1 AA: 4.5:1 for normal text, 3:1 for large text. |
| NFR-5.4 | Focus indicators MUST be visible on all interactive elements. |
| NFR-5.5 | The search modal MUST trap focus and close on Escape. |

### NFR-6: Responsive Design

| ID | Requirement |
|----|-------------|
| NFR-6.1 | The layout MUST adapt to viewports >= 320px width. |
| NFR-6.2 | On viewports below 768px, the sidebar MUST collapse to an overlay. |
| NFR-6.3 | The playground's two-pane layout MUST stack vertically on narrow viewports. |

### NFR-7: Code Quality

| ID | Requirement |
|----|-------------|
| NFR-7.1 | TypeScript strict mode MUST be enabled. |
| NFR-7.2 | Linting MUST extend the framework's core web vitals rules. |
| NFR-7.3 | Formatting MUST use a consistent, automated code formatter. |
| NFR-7.4 | Component tests MUST be co-located with their source files. |
| NFR-7.5 | A browser-environment test runner MUST be used for component tests. |

### NFR-8: Test Coverage

| ID | Requirement |
|----|-------------|
| NFR-8.1 | Unit test coverage MUST be at least 90% for `src/lib/`, `src/stores/`, and `src/components/ui/` (lines, functions, statements). |
| NFR-8.2 | Custom hook test coverage MUST be at least 95%: hooks are pure logic, trivially testable in isolation. |
| NFR-8.3 | Branch coverage MUST be at least 85% for lib, stores, and ui modules. |
| NFR-8.4 | Wiki feature components MUST have at least 85% coverage. |
| NFR-8.5 | Playground components MAY have 80% coverage due to CodeMirror DOM interaction complexity in jsdom. |
| NFR-8.6 | All coverage thresholds MUST be enforced in CI via the test runner. |
| NFR-8.7 | The pattern classifier MUST be tested against all real patterns from `banned_words.yaml`: full enumeration of all three rule groups (`banned`, `directory_rules`, `filename_rules`), not sampling. |

---

## 5. Architecture

### 5.1 Subsystems

The wiki consists of three subsystems:

```
┌─────────────────────────────────────────┐
│  Content Subsystem (server)             │
│                                         │
│  • Reads YAML configs from filesystem   │
│  • Parses markdown content              │
│  • Renders server components            │
│  • Streams HTML progressively           │
│                                         │
│  Reads: ../../config/*.yaml, docs/*.md  │
│  Mutates: nothing                       │
└──────────────┬──────────────────────────┘
               │ serialized data (props + streamed HTML)
               ▼
┌─────────────────────────────────────────┐
│  Presentation Subsystem (browser)       │
│                                         │
│  • Renders wiki shell (sidebar,         │
│    header, content area)                │
│  • Renders content pages (patterns,     │
│    hooks, configs, checks, tiers,       │
│    tooling, integration)                │
│  • Manages theme (light/dark)           │
│  • Embeds feedback components           │
│  • Runs pattern playground              │
│                                         │
│  Interactive elements only:             │
│  search, filters, toggles, feedback,    │
│  playground editor                      │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  Analytics Subsystem (browser)          │
│                                         │
│  • Tracks page views, dwell time,       │
│    scroll depth                         │
│  • Captures search queries              │
│  • Records feedback submissions         │
│  • Records playground usage             │
│  • Persists to browser storage          │
│  • Provides aggregate stats             │
│                                         │
│  Reads: browser storage (persisted)     │
│  Mutates: browser storage               │
│  Transmits: nothing externally          │
└─────────────────────────────────────────┘
```

### 5.2 Data Flow

1. **Server render time**: The content subsystem reads workspace-ci YAML configs from
   `../../config/` relative to the `web/` directory. YAML is parsed into typed
   objects. These objects are serialized as props to client components.

2. **Client render time**: The presentation subsystem receives serialized data
   and renders it in the wiki shell. Interactive features (search, playground,
   feedback) operate entirely in the browser.

3. **Analytics**: All user interactions fire events into the analytics subsystem.
   Events are aggregated into stats and persisted to browser storage. No data
   leaves the browser.

### 5.3 Integration Points

| Boundary | Direction | What flows |
|----------|-----------|------------|
| Filesystem → Content | Read only | YAML config file contents |
| Content → Presentation | Props (serialized) | Parsed pattern objects, hook records, config fields |
| Presentation → Analytics | Internal events | Page views, searches, feedback, playground usage |
| Analytics → Presentation | Store selectors | Aggregate stats, view counts, vote state |
| Presentation → Browser Storage | Write | Theme preference, analytics events |
| Browser Storage → Presentation | Read | Persisted theme, persisted analytics |

---

## 6. Phased Implementation

### Phase 1: Shell, Home Page, and Extraction Pipeline

**Capabilities delivered:**
- [ ] Wiki shell layout with sidebar, header, and content area
- [ ] Collapsible sidebar navigation
- [ ] Light/dark theme toggle with persistence
- [ ] Home page with project overview, quick-search input, stats bar, quick-link cards
- [ ] Analytics: page view tracking, dwell time, scroll depth
- [ ] `scripts/extract-docs`: Python AST + regex shell parser → `web/src/data/*.json`
- [ ] Extraction integrated into `make sync`

### Phase 2: Content Pages

**Capabilities delivered:**
- [ ] Pattern library: all banned patterns listed, grouped by category, filterable
- [ ] Hook reference: all hooks listed, filterable by stage and tier, comparison matrix
- [ ] Hook detail pages: per-hook metadata, stage/tier placement, function signatures
- [ ] Configuration reference: all configs listed with field documentation and raw YAML
- [ ] Guard policy reference: all sibling `WORKSPACE-GUARD` policy configs listed at `/guard` with field docs and raw YAML (soft-dependency empty-state when the guard tree is absent)
- [ ] Check catalog: shell and Python checks with detail pages
- [ ] Tier documentation with comparison matrix
- [ ] Tooling documentation page
- [ ] Integration guide page
- [ ] Server-side YAML config reading and parsing
- [ ] Feedback component on all pattern, hook, config, and check cards

### Phase 3: Search and Playground

**Capabilities delivered:**
- [ ] Full-text search with modal overlay and keyboard navigation
- [ ] Search analytics tracking
- [ ] Live pattern playground with code editor
- [ ] Client-side regex matching against all banned patterns
- [ ] Match highlighting in editor with decoration layer
- [ ] Match results side panel with click-to-navigate
- [ ] Category filtering in playground
- [ ] Language-aware pattern filtering
- [ ] Playground usage analytics

### Phase 4: Polish and Test Coverage

**Capabilities delivered:**
- [ ] Responsive layout (mobile sidebar overlay, playground stacking)
- [ ] Accessibility: ARIA labels, keyboard navigation, focus management
- [ ] Analytics debug mode
- [ ] Home page trending wired to analytics store
- [ ] Lint, format, and type-check clean
- [ ] Component test suite at 90% coverage (lib/stores/ui), 85% (wiki components), 80% (playground)
- [ ] Pattern classifier full-enumeration test against `banned_words.yaml`
- [ ] Analytics store persistence round-trip test

---

## 7. Open Questions

1. Should the wiki include an embedded code editor on each pattern card for live
   mini-examples? (Current plan: no; the playground handles interactive testing.)

2. Should the analytics store support JSON export/download for debugging? Useful
   but adds scope.

3. Should the home page trending section use a time-decay algorithm or simple
   all-time view counts? Simple all-time is lower scope and sufficient.

4. Should pattern categories be derived from the YAML config's structure or defined
   as a wiki-layer taxonomy? The YAML config has no category field: categories
   SHOULD be a wiki-layer classification. Must stay in sync with the YAML.

5. Should the feedback widget support emoji reactions in addition to thumbs-up/down?
   Thumbs + optional comment is the minimum viable feedback. Expandable later.

6. Should the wiki be a standalone project or a monorepo workspace package?
   Self-contained Next.js app (own `package.json`, own `node_modules`, not a
   monorepo workspace package), BUT with a runtime data dependency on the
   parent repo's `config/` and `docs/` trees. Deployment model: the wiki is
   served from a checkout of the workspace-ci repo (or a checkout that
   contains the `config/` and `docs/` directories). The config root is
   configurable via `WORKSPACE_CI_CONFIG_ROOT` (see SPEC §9.3) so the wiki
   can be pointed at an alternate config tree without code changes. The
   `web/` directory does not duplicate YAML configs.

7. Should analytics events include a session ID for correlating events across pages?
   Yes: a session identifier generated on first page load and persisted.

---

## 8. Verification

| # | Test | Maps to |
|---|------|---------|
| 1 | Navigate to `/`: shell layout renders with sidebar, header, theme toggle visible | FR-1.1-1.7 |
| 2 | Press `/` key: search modal opens, type query: results appear with highlighted matches | FR-2.1-2.4 |
| 3 | Navigate to `/patterns`: all patterns from `banned`, `directory_rules`, and `filename_rules` listed, grouped by category, filterable; filename-scope patterns show a "filename match" badge | FR-4.1-4.6 |
| 4 | Click a pattern card: feedback component visible, vote up/down works, comment field appears | FR-15.1-15.9 |
| 5 | Navigate to `/hooks`: table shows all hooks, filter by stage shows only matching hooks | FR-5.1-5.5 |
| 6 | Navigate to `/hooks/check-banned-words`: detail page shows full metadata | FR-6.1-6.6 |
| 7 | Navigate to `/config/banned_words`: fields documented, raw YAML shown | FR-7.1-7.5 |
| 8 | Navigate to `/playground`: type Python code with `dict[str, Any]`: line highlighted, match in side panel | FR-8.1-8.5 |
| 9 | Toggle a category off in playground: that category's matches disappear | FR-8.6 |
| 10 | Switch language to Shell: Python-only patterns stop matching | FR-8.7 |
| 11 | Navigate to `/tiers`: comparison matrix shows hook coverage per tier | FR-10.1-10.3 |
| 12 | Home page stats bar shows view count: navigate to another page, return: count incremented | FR-13.1, FR-14.1-14.3 |
| 13 | Toggle light/dark theme: all surfaces update without flash, choice persists on reload | NFR-3.1-3.4 |
| 14 | Resize viewport to 400px: sidebar becomes overlay, playground stacks vertically | NFR-6.1-6.3 |
| 15 | Tab through all interactive elements: focus ring visible on each | NFR-5.1-5.5 |
| 16 | Enable debug mode: analytics events logged to console | FR-13.7 |
| 17 | Run type-check in `web/`: zero errors | NFR-7.1 |
| 18 | Run lint in `web/`: zero warnings | NFR-7.2 |
| 19 | Run `scripts/extract-docs`: `web/src/data/api-docs.json` and `shell-docs.json` are generated with valid content | FR-16.1-16.6 |
| 20 | Modify a Python docstring in `ci/`, re-run extraction, rebuild wiki: check detail page reflects new docstring | FR-16.1 |
| 21 | Modify a YAML config, rebuild wiki: pattern/hook/config page reflects change without manual wiki edits | FR-16.3-16.5 |
| 22 | Add `ci/README.md`: check catalog index page shows its content | FR-16.8 |
| 23 | Run `npm run test:coverage` in `web/`: coverage >= 90% for lib, stores, ui; >= 85% for wiki components; >= 80% for playground | NFR-8.1-8.5 |
| 24 | Pattern classifier test passes against all real patterns from all three groups in `banned_words.yaml` (`banned`, `directory_rules`, `filename_rules`): every pattern maps to exactly one category | NFR-8.7 |
| 25 | Navigate to `/patterns` over a slow (10 Mbps) profile: shell (sidebar + header) paints before content sections resolve; no blank screen while YAML loads | NFR-1.6 |
| 26 | Navigate from `/` to `/hooks` and back: verify the CodeMirror bundle is NOT requested on non-playground routes (check the network tab; no `codemirror` chunks loaded) | NFR-1.7 |
| 27 | Run `ANALYZE=true npm run build` in `web/`: verify every non-playground route ships < 50KB compressed JS; CI bundle-size gate passes (SPEC §18.3) | NFR-1.7, SPEC §18.3 |
| 28 | Run `scripts/extract-docs`: verify every `config/*.schema.yaml` parses and each `path` resolves against the corresponding config's top-level keys (build warning, not error) | FR-7.3, FR-16.5a |
| 29 | Add a script to `scripts/` without a `scripts/manifest.yaml` entry: verify the manifest-completeness check fails | FR-11.1 |
| 30 | Navigate to `/guard`: all six guard policy configs (`guard_subcommands`, `guard_config_keys`, `guard_protected_branches`, `guard_environment`, `guard_resource_limits`, `guard_paths`) are listed and link to `/guard/<name>` | FR-17.1 |
| 31 | Navigate to `/guard/guard_subcommands`: schema-derived field table (blocked / partial / contract_check) renders from `guard_subcommands.schema.yaml`, and the raw YAML is shown in a code block; feedback widget is present with `targetType: 'guard'` | FR-17.2, FR-17.3, FR-17.6 |
| 32 | Set `WORKSPACE_GUARD_CONFIG_ROOT` to a non-existent absolute path, restart the wiki, navigate to `/guard`: an empty-state renders ("No guard policy configs found"), no crash, and `/config` still lists all CI configs normally | FR-17.4, FR-17.5 |
| 33 | Set `WORKSPACE_GUARD_CONFIG_ROOT` to a vendored copy of the guard config tree (e.g. a CI artifact dir); confirm `/guard` lists its configs without code changes | FR-17.5 |
| 34 | From `/guard/guard_config_keys`, verify the page is read-only: no edit/submit controls for the YAML or schema beyond the feedback widget | FR-17.7, NFR-4.2 |
