# SPEC-WIKI: Workspace Portal Implementation

**Date:** 2026-08-16
**Status:** Active
**Type:** Specification
**Requirements:** [REQ-WIKI](../requirements/REQ-WIKI.md)

## 1. Architecture

`web/` is a Next.js App Router application. It is server-first: route modules
load workspace files and runtime service state, while client leaves implement
search, filters, dialogs, navigation controls, feedback, landing motion, and the
playground. Shared primitives and styles are imported from
`@workspace-ci/web-components`.

The portal has four cooperating layers:

| Layer               | Responsibility                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Canonical sources   | Workspace YAML, Markdown, source files, repository metadata, external editorial content, and Grafana configuration |
| Synchronization     | Build-time scripts normalize cross-repository data and assets into `web/src/data`, `web/content`, and `web/public` |
| Server presentation | App Router pages load, classify, highlight, sanitize, and compose source data                                      |
| Client interaction  | Zustand state, Fuse search, modal inspection, filters, feedback, carousel behavior, and CodeMirror matching        |

## 2. Routes

Parenthesized directories are App Router organization groups and do not alter
URLs.

| Source module                                     | URL                         | Implementation                |
| ------------------------------------------------- | --------------------------- | ----------------------------- |
| `app/page.tsx`                                    | `/`                         | Feature-flagged landing page  |
| `app/(content)/open-source/page.tsx`              | `/open-source`              | Project catalogue             |
| `app/[slug]/page.tsx`                             | `/<project-slug>`           | Registered project README     |
| `app/(content)/anti-patterns/page.tsx`            | `/anti-patterns`            | Pattern catalogue             |
| `app/(content)/anti-patterns/[category]/page.tsx` | `/anti-patterns/<category>` | Category catalogue            |
| `app/(developer)/git-hooks/page.tsx`              | `/git-hooks`                | Hook catalogue                |
| `app/(developer)/hook-configs/page.tsx`           | `/hook-configs`             | CI config catalogue           |
| `app/(runtime)/sandbox-configs/page.tsx`          | `/sandbox-configs`          | Guard config catalogue        |
| `app/(developer)/tools-scripts/page.tsx`          | `/tools-scripts`            | Script catalogue              |
| `app/(content)/ai-governance/page.tsx`            | `/ai-governance`            | Standards catalogue           |
| `app/(runtime)/llm-gateway/page.tsx`              | `/llm-gateway`              | Grafana dashboard surface     |
| `app/(guides)/playground/page.tsx`                | `/playground`               | Pattern playground            |
| `app/(guides)/integration-guide/page.tsx`         | `/integration-guide`        | Canonical integration runbook |
| `app/(quality)/static-analysis/page.tsx`          | `/static-analysis`          | Static-analysis section state |
| `app/(quality)/system-policies/page.tsx`          | `/system-policies`          | System-policy section state   |

API and proxy routes live under `(api)` and `(observability)` while preserving
`/api/*` and `/grafana/*` URLs.

## 3. Shell Composition

`WikiShell` loads search data, catalogue counts, branding, and the landing flag
on the server. It composes:

1. skip link and main-content target;
2. `MobileNavToggle` and `WikiSidebar`;
3. `WikiHeaderBrand`, `WikiBreadcrumbs`, `ThemeToggle`, and `WikiSearch`;
4. optional dynamic hero content;
5. route content, footer, and Mermaid rendering.

`web/nav.yaml` is the route metadata authority. `sync-wiki-nav.mjs` writes the
sidebar projection to `src/data/wiki-nav.json`. `search-data.ts` consumes the
full manifest for static page entries, preventing a second route list.

## 4. Source Resolution

### 4.1 CI and Guard Configuration

`config-paths.ts` resolves:

- CI root from `CI_CONFIG_DIR` or `WORKSPACE_CI_CONFIG_ROOT`;
- guard root from `CI_GUARD_CONFIG_DIR` or `WORKSPACE_GUARD_CONFIG_ROOT`;
- per-file environment paths;
- override manifests;
- generated web data and feedback directories.

`yaml-loader.ts` parses resolved files with `js-yaml` and React `cache()`. CI
config enumeration merges directory entries with configured overrides. Guard
enumeration prefers `policies.index.yaml`, falls back to `guard_*.yaml`, merges
overrides, and returns an empty list when its root is absent.

### 4.2 Projects

`project-registry.ts` consumes generated `projects-registry.json` when present
and otherwise reads the project config source. Each project resolves its repository directory,
README, Makefile, origin URL, default branch, logo, language, and optional
Grafana metadata.

README summaries are extracted from initial prose while skipping headings,
embeds, comments, code blocks, and structural boundaries. Full README pages use
`ContentRenderer`; repository-relative assets route through
`/api/project-asset`, which performs registered-project lookup and path-boundary
validation before reading.

### 4.3 Generated Source Data

`docs-loader.ts` loads generated JSON for hook sources, script sources,
manifest records with source excerpts and measured workspace data.

### 4.4 Editorial Content

`landing-posts.ts` resolves synchronized `content/landing-posts.yaml` or the
configured `WORKSPACE_WEB_CONTENT_ROOT`. Parsing validates UI labels, mission,
timings, post IDs, slide types, assets, copy, and source URLs.

`sync-web-content.mjs` copies the YAML and active post asset directories,
removes stale post assets, refuses destructive post drops, and invokes PDF
preview generation.

## 5. Catalogue Pattern

The primary portal reference interaction is catalogue plus modal inspection.

1. A Server Component loads canonical records and optional generated source.
2. An adapter converts records to shared `CardItem` values.
3. A client list hook applies category, stage, or tier filtering.
4. Shared cards render compact metadata and portal-owned action slots.
5. `EntryPointDialog`, `ConfigDialog`, or `MakefileDialog` exposes detailed
   source without introducing one route per record.

`card-adapters.ts` is the mapping boundary for projects, configs, guard configs,
patterns, scripts, hooks, and standards. Required labels and descriptions fail
closed when absent.

### 5.1 Hooks

The hook page loads `required_hooks.yaml`, joins generated source by hook ID,
highlights source with Shiki, and passes records to `HookList`. `useHookFilter`
derives stage and strict/POC filters and counts. The source dialog includes
manifest fields such as stage, kind, mandatory, safety, filename behavior, and
applicability.

### 5.2 Patterns

The anti-pattern page joins `classifyAll(banned_words)` with
`classifySwallowPatterns(silent_swallow_patterns, detectorData)`. Pattern cards
show category, reason, scope, language, extension, and detection metadata.
Detector-backed entries expose highlighted function source. Category routes
validate against `PATTERN_CATEGORIES` and return Next.js not-found for unknown
categories.

### 5.3 Configurations

CI and guard pages enumerate config records, load schemas, raw YAML, parsed
values, and highlighted YAML. `ConfigDialog` provides `Schema` and `File` tabs.
`SchemaFieldCards` resolves actual values against schema paths. Missing schemas
produce an explicit warning while preserving raw-file inspection.

### 5.4 Tooling and Standards

Tool cards derive from `scripts/manifest.yaml`; generated source enriches their
dialogs. Standards derive from standards YAML and wiki labels. Resource actions
select local download, external free source, or contact/purchase flow from each
record.

## 6. Landing Runtime

`RotatingPosts` owns one `useRotatingPostsController` and renders the configured
responsive variant through `LandingStageVariant`. The controller owns active and
leaving slides, timing, direction, post selection, reduced motion, and per-slide
pan state.

The carousel renders all media layers for stable crossfades, separates text
transitions from background transitions, measures text to avoid layout jumps,
supports pointer parallax, and exposes tab, arrow, and indicator controls. The
stacked variant presents the same canonical posts for its responsive mode.

## 7. Search

`buildSearchData()` joins:

- classified patterns;
- hook records and extracted descriptions;
- CI and guard config indexes;
- standards;
- script manifest entries;
- `nav.yaml` pages;
- registered projects.

`useSearch` constructs a Fuse index in the browser, defers the query with
`useDeferredValue`, limits results, maintains keyboard selection, and records
settled successful searches in the analytics store. `WikiSearch` implements the
combobox/listbox semantics and delegates focus trapping and Escape handling to
the shared `Modal`.

## 8. Playground

The server route loads classified banned patterns and removes filename-only
rules. `PlaygroundShell` combines `usePlayground`, configured language labels,
category controls, `CodeEditor`, and shared `MatchPanel`.

`CodeEditor` creates a CodeMirror 6 editor, selects a language extension, and
runs `regex-engine.ts` after document changes. `runPatterns` caches valid regular
expressions, de-duplicates a pattern per line, records line/column/reason/category,
and sorts matches by line. Match selection calls the editor's imperative
`scrollToLine` API. No server matching endpoint exists.

## 9. Feedback and Analytics

`useFeedback` combines local UI state, the analytics store, optimistic counts,
and same-origin POST submission. `/api/feedback` validates origin, client rate,
target type, identifier, vote, session, and comment length. `feedback-loader.ts`
sanitizes storage keys and control characters and maintains bounded JSON records
with one effective vote per session.

`analytics-store.ts` uses Zustand and local storage for bounded event history,
page counts, dwell maxima, feedback, search aggregates, and sessions. Session
storage rotates the session after inactivity. Persistence is deferred to idle
time and flushed when the document is hidden or unloaded.

## 10. Gateway Observability

The LLM gateway route obtains request-aware branding, resolves the public
Grafana base, derives a server probe URL, and checks health. Healthy state renders
configured dashboard tabs and embedded panels. Unhealthy state renders
`ServiceUnavailable` and uses project registry startup metadata when available.

The Grafana catch-all route proxies the configured service while keeping
internal addressing outside browser configuration. Dashboard metadata is
synchronized into generated JSON before build.

## 11. Build and Validation

`package.json` runs source synchronization before development and build:

1. project registry;
2. logos;
3. Grafana dashboards;
4. wiki navigation;
5. web documents;
6. editorial landing content.

Validation commands are:

```bash
npm run check:generated
npm run lint
npm run format
npm run type-check
npm test
npm run build
```

Vitest runs browser-facing tests in jsdom from `tests/web`. Route loading and
error modules cover data-bearing sections. Responsive verification follows
SPEC-WIKI-RESPONSIVE.

## 12. Security Boundaries

| Boundary                  | Enforcement                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------ |
| Project assets            | Registered project lookup, resolved-path containment, MIME allowlist                                   |
| Feedback                  | Same-origin checks, target validation, rate limiting, length caps, identifier and comment sanitization |
| Markdown and highlighting | Sanitized rendered HTML before insertion                                                               |
| Playground                | Browser-only regex matching with no source execution                                                   |
| Config catalogues         | Filesystem reads only                                                                                  |
| Grafana                   | Server-side discovery, health probing, and proxy configuration                                         |
