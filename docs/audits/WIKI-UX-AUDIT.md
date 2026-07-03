# WIKI-UX-AUDIT: Comprehensive UX & Implementation Audit of the Wiki Web UI

**Date:** 2026-07-03 
**Auditor:** opencode agent 
**Scope:** All files under `web/` - pages (`app/`), components (`src/components/`), hooks (`src/hooks/`), stores (`src/stores/`), lib (`src/lib/`), types (`src/types/`), styles (`public/styles/`, `src/styles/`), config (`package.json`, `tsconfig.json`, `next.config.mjs`, `eslint.config.mjs`, `vitest.config.ts`, `.prettierrc`). 
**Reference Spec:** `docs/specifications/SPEC-WIKI.md` 
**Total files audited:** 118 TS/TSX files, 16 CSS files, 6 config files, 1 spec document.

---

## Table of Contents

1. [Design Language - No Token System, Rampant Duplication](#1-design-language-no-token-system-rampant-duplication)
2. [Layout & Information Architecture - Broken and Inconsistent](#2-layout-information-architecture-broken-and-inconsistent)
3. [Missing Descriptive Text, Tooltips, and Modals](#3-missing-descriptive-text-tooltips-and-modals)
4. [Component Hierarchy & Interaction Defects](#4-component-hierarchy-interaction-defects)
5. [Critical Data & Logic Bugs](#5-critical-data-logic-bugs)
6. [Accessibility Defects](#6-accessibility-defects)
7. [Security & Information Disclosure](#7-security-information-disclosure)
8. [Test Coverage Gaps](#8-test-coverage-gaps)
9. [Remediation Priority Matrix](#9-remediation-priority-matrix)

---

## 1. Design Language - No Token System, Rampant Duplication

### 1.1 No spacing scale

`public/styles/_variables.css` defines color tokens, duration tokens, z-index tokens, and font-family tokens, but **zero spacing tokens**. Every CSS file hardcodes raw rem values ad hoc:

| Value | Occurrences (approx) | Example files |
|-------|----------------------|---------------|
| `0.25rem` | 8+ | `_buttons.css`, `_wiki-sidebar.css`, `_wiki-playground.css` |
| `0.5rem` | 15+ | `_buttons.css`, `_wiki-sidebar.css`, `_wiki-patterns.css`, `_search.css` |
| `0.75rem` | 6+ | `_wiki-layout.css`, `_buttons.css`, `_search.css` |
| `1rem` | 12+ | `_wiki-layout.css`, `_buttons.css`, `_wiki-stats.css`, `_wiki-patterns.css` |
| `1.5rem` | 5+ | `_variables.css`, `_prose.css`, `_wiki-stats.css` |
| `2rem` | 3+ | `_wiki-stats.css`, `_error-boundary.css` |
| `3rem` | 2+ | `_error-boundary.css` |

There is no `--space-xs`, `--space-sm`, `--space-md`, `--space-lg`, `--space-xl` scale. Consistent spacing across components is impossible without hunting every literal.

### 1.2 No typography scale

Approximately 14 distinct font-size literals are scattered across the stylesheet with no `--text-*` token scale:

```
0.7rem, 0.75rem, 0.8rem, 0.825rem, 0.85rem, 0.85em,
0.875rem, 0.9rem, 0.95rem, 1rem, 1.1rem, 1.125rem,
1.25rem, 1.5rem, 3rem
```

The body font-size is `0.875rem` (14px) - unusually small as a base. Code/pre is `0.8125rem` (13px), making code noticeably tinier than body text. No `--font-display`/heading font token exists; headings use the body font with no separate family.

### 1.3 No border-radius scale

Only `--btn-radius` (8px) exists. The following radius literals are repeated across files:

- `3px` - `.search-trigger__kbd`, `.search-modal__kbd`, `.prose code`
- `4px` - `.hook-badge`, `.pattern-card__badge`, `.pattern-card__regex`, `.config-field-table` (via shared), `.loading-line`
- `10px` - `.toggle__track`
- `16px` - `.filter-pill`, `.category-nav__pill`
- `50%` - `.theme-toggle`, `.feedback-btn`

No `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-full` tokens.

### 1.4 No shadow tokens

`box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3)` is hardcoded in `_search.css`. No `--shadow-sm`, `--shadow-md`, `--shadow-lg` tokens exist. The hardcoded shadow does not adapt to light theme.

#### Best-Practice Fix (P1-10: Design token system)

A complete token system uses a **three-layer architecture**: primitive tokens (raw scale values on `:root`) → semantic tokens (named purposes mapping to primitives) → component tokens (component-specific overrides). Components consume semantic tokens, never primitives directly, so a redesign only requires updating Tier 1 primitives.

Key principles from design-token best practice:
1. **Spacing on a 4px grid**: `--space-1` (0.25rem) … `--space-24` (6rem). Every raw rem literal in the codebase should resolve to a `--space-*` token (Xerobit, Alex Mayhew).
2. **Typography scale with line-height + letter-spacing**: `--text-xs` … `--text-4xl` paired with `--leading-*` and `--tracking-*` tokens. Negative tracking at display sizes, positive at small (Lucky Graphics).
3. **Radius scale**: `--radius-sm/md/lg/xl/full` replacing `--btn-radius` and the scattered 3px/4px/10px/16px/50% literals.
4. **Shadow scale**: `--shadow-sm/md/lg` using `rgb()` with alpha, with semantic `--elevation-raised/overlay/modal` aliases (Alex Mayhew).
5. **Dark mode overrides colors only**: typography scale, spacing, radius, shadows remain unchanged across themes (modern-ai-web-design).
6. **Adaptive shadows/overlays for light theme**: the hardcoded `rgba(0,0,0,0.3)` shadow and `rgba(0,0,0,0.6)` overlay must be redefined under `[data-theme='light']` (currently bleed through as a black veil).


### 1.5 Inverted z-index hierarchy

```
--z-sidebar: 100
--z-header: 200
--z-modal: 500 ← BELOW search
--z-search: 1000 ← ABOVE modal
```

**`--z-modal` (500) is below `--z-search` (1000).** A generic modal would render *under* the search overlay. The skip link reuses `--z-search` (1000), which is semantically wrong.

Missing z-index tokens: `--z-overlay`, `--z-dropdown`, `--z-tooltip`, `--z-toast`, `--z-skip-link`.

#### Best-Practice Fix (P1-11: Z-index hierarchy)

Tokenize z-index into a small, stable set of **interface strata** (not component names), ordered so each layer sits above the one it must cover. The current inverted order (`--z-modal: 500` below `--z-search: 1000`) must be corrected so blocking overlays (modal) sit above non-blocking overlays (search/dropdown), with transient UI (tooltip/toast) on top.

Recommended token order:
```
--z-base: 0          /* normal document flow */
--z-sticky: 100      /* sticky header/sidebar */
--z-dropdown: 1000   /* menus, popovers, floating panels */
--z-skip-link: 1100  /* skip link (above sticky, below overlay) */
--z-overlay: 1100    /* backdrop */
--z-modal: 2000      /* dialogs, search modal, blocking overlays */
--z-tooltip: 2200    /* tooltips */
--z-toast: 3000      /* toast notifications */
```

Key principles from z-index best practice:
1. **Strata, not components**: tokens name interface layers (`--z-modal`), not specific widgets : the search modal IS a modal and should use `--z-modal` (ttoss, 7onic).
2. **Blocking > non-blocking**: a modal (blocking) must sit above a dropdown (non-blocking); a tooltip (transient) above a modal (CSS-Tricks, Nitesh Seram).
3. **`isolation: isolate` for local contexts**: components needing internal layering create their own stacking context plus local `0`/`1`/`-1` values, so internals don't leak into global layers (Nitesh Seram, CSS-Tricks).
4. **Modals/tooltips via portal or top-layer**: render through a portal at the document root to escape ancestor stacking contexts instead of fighting them with ever-higher numbers (7onic, Nitesh Seram).
5. **Dedicated `--z-skip-link`**: the skip link reusing `--z-search` is semantically wrong; it needs its own token below the overlay but above sticky content.
6. **Ban magic numbers**: every `z-index` should come from a token; a lint rule allowing only `var(--z-*)`, `auto`, and `0`/`1`/`-1` prevents regression (Nitesh Seram).


### 1.6 No reusable component primitives

#### 1.6.1 No `.modal`/`.overlay` utility
The search modal in `_search.css` is the **only** modal/overlay in the entire codebase. There is no reusable `.modal`/`.overlay`/`.backdrop` utility. Any future dialog (confirm, settings, detail viewer) must copy the search-specific markup and CSS.

#### 1.6.2 No `.card` base
Four independent card definitions repeat the same "panel + 1px border + btn-radius + 1rem padding" pattern:
- `.pattern-card` (`_wiki-patterns.css`)
- `.tooling-card` (`_buttons.css`)
- `.check-card` (`_buttons.css`)
- `.quick-link-card` (`_wiki-stats.css`)

#### 1.6.3 No `.table` base
Three independent table definitions repeat the same `border-collapse + 1px border + 0.5rem 0.75rem padding + th background surface-1` pattern:
- `.hook-table__table` (`_buttons.css`)
- `.config-field-table` (`_buttons.css`)
- `.prose table` (`_prose.css`)

#### 1.6.4 No `.badge` base
Four independent badge definitions:
- `badge--green/blue/orange/teal/purple/gray` (`_wiki-patterns.css`) - modifiers with no `.badge` base block
- `.hook-badge` (`_buttons.css`)
- `.pattern-card__badge` (`_wiki-patterns.css`)
- `.required-badge` / `.optional-badge` (`_buttons.css`)

Additionally, `.badge--teal` (`#2dd4bf`) and `.badge--purple` (`#a855f7`) use raw hex colors while `--green/--blue/--orange/--gray` use tokens - inconsistent.

#### 1.6.5 No `.input`/`.select`/`.textarea` base
Four independent form-control styles:
- `.search-modal__field` (`_search.css`) - removes `outline` with no replacement
- `.language-selector` (`_wiki-playground.css`)
- `.feedback-comment textarea` (`_wiki-feedback.css`)
- `.search-trigger` (`_buttons.css`)

#### 1.6.6 No `.icon-btn` base
`.theme-toggle` (`_buttons.css`) and `.feedback-btn` (`_wiki-feedback.css`) are verbatim duplicates: 32×32, `border-radius: 50%`, same `muted`→`accent` hover. Two copies of the "icon circle button" pattern.

#### 1.6.7 No `.pill` base
`.filter-pill` (`_buttons.css`) and `.category-nav__pill` (`_wiki-patterns.css`) are near-verbatim duplicates: same padding `0.25rem 0.75rem`, same `16px` radius, same `muted`→`accent` active state, same `__count` `0.7rem opacity 0.7`.

#### 1.6.8 No `.kbd` base
`.search-trigger__kbd` (`_buttons.css`) and `.search-modal__kbd` (`_search.css`) are duplicates: same `font-mono`, `0.7rem`, `surface-2` background, `0.1rem 0.3rem` padding, `3px` radius, `1px` border.

#### Best-Practice Fix (P1-12: Reusable component primitives)

Introduce base classes for each repeated pattern (`.card`, `.table`, `.badge`, `.input`, `.modal`/`.overlay`, `.pill`, `.icon-btn`, `.kbd`) and consume them via `@layer components` so cascade precedence is explicit and the ~15 duplicated definitions collapse to one each.

Key principles from CSS architecture best practice:
1. **`@layer` for cascade control**: declare `@layer base, components, utilities;` so layered styles create cascade "planes" : a later layer always beats an earlier one regardless of specificity, eliminating the Tailwind/BEM source-order competition (Chrome for Developers, MDN).
2. **BEM base + modifiers**: each primitive is a block (`.card`) with elements (`.card__title`) and modifiers (`.card--elevated`); modifiers are always applied with the base class, never in isolation (CSS-Tricks BEM 101, Scalable CSS).
3. **Single source of truth per pattern**: the four card defs, three table defs, four badge defs, four form-control defs, two icon-btn defs, two pill defs, two kbd defs each collapse to one base block + modifiers (horde-design-system).
4. **`.badge` base block**: the `badge--green/blue/orange/gray` modifiers currently have no base block; add `.badge { padding, radius, font-size, font-weight }` and convert `.badge--teal`/`.badge--purple` raw hex to tokens for consistency.
5. **`.modal`/`.overlay` base**: extract the search-modal overlay/backdrop into a reusable `.modal` + `.modal__backdrop` so future dialogs compose rather than copy.
6. **Split `_buttons.css`**: the 383-line dumping ground must be split into per-component files matching the per-file convention used elsewhere.


### 1.7 `_buttons.css` is a dumping ground

Despite the name `_buttons.css`, this 383-line file contains 15+ unrelated components:
- `.btn` variants (correct)
- `.wiki-footer`
- `.wiki-breadcrumbs`
- `.theme-toggle`
- `.search-trigger`
- `.filter-pill`
- `.hook-table`
- `.config-index`
- `.config-field-table`
- `.required-badge` / `.optional-badge`
- `.tooling-grid` / `.tooling-card`
- `.check-card`
- `.toggle`
- `.collapsible-section`

This breaks the per-file convention used elsewhere (`_tabs.css`, `_search.css`, `_wiki-sidebar.css`, etc.).

#### Best-Practice Fix (P2-25: Split `_buttons.css` into per-component files)

Split the 383-line dumping ground into per-component partials matching the existing convention (`_tabs.css`, `_search.css`, `_wiki-sidebar.css`, etc.). Each partial owns one component's styles; the main `shared.css`/`globals.css` import chain aggregates them.

Key principles from CSS architecture best practice:
1. **One component per file**: MDN recommends breaking large stylesheets into smaller ones so "multiple people working on the CSS will have fewer situations where two people need to work on the same stylesheet at once, leading to conflicts in source control." Each component's styles live next to (or are named after) that component.
2. **Co-locate styles with components**: OpenReplay recommends "co-locate styles with the component they belong to" using CSS Modules or per-component partials; "global stylesheets handle base styles; components handle everything else."
3. **Declare `@layer` order early**: OpenReplay: "declare `@layer` order early (reset → tokens → base → components → utilities) to control style order and eliminate specificity battles."
4. **Separate vendor CSS with long cache lifetimes**: Alex Pierierodov recommends keeping library CSS in its own bundle so updates don't force re-downloads of application CSS.
5. **Map `_buttons.css` contents to new files**: `.btn` variants → `_buttons.css` (keep); `.wiki-footer` → `_wiki-footer.css`; `.wiki-breadcrumbs` → `_wiki-breadcrumbs.css`; `.theme-toggle` → `_theme-toggle.css`; `.search-trigger` → `_search.css` (merge with existing); `.filter-pill` → `_filter-pill.css`; `.hook-table` → `_hook-table.css`; `.config-field-table` → `_config-table.css`; `.tooling-card`/`.check-card` → `_cards.css`; `.toggle` → `_toggle.css`; `.collapsible-section` → `_collapsible-section.css`.


### 1.8 Dead duplicate import manifest

`public/styles/shared.css` is a second copy of the same 14 partials already imported by `src/styles/globals.css`. `globals.css` does not import `shared.css`, so it is dead - a parallel source of truth that can diverge silently.

#### Best-Practice Fix (P2-26: Remove dead `shared.css` or consolidate)

A single import chain must be the authoritative source of truth. Either delete `shared.css` (if `globals.css` is the entry point) or make `globals.css` import `shared.css` and delete the duplicate `@import` lines from `globals.css`. Never maintain two parallel import manifests that can diverge silently.

Key principle: **One entry point, one import chain.** MDN: "break large stylesheets into multiple smaller ones" but they must be aggregated through a single entry point, not duplicated across multiple entry points. OpenReplay: "adopt a clear file structure that separates global styles from component styles with no unintentional bleed."


### 1.9 Tailwind v4 collision

`_wiki-loading-states.css` hand-defines `.h-6`, `.h-4`, `.h-10`, `.h-24`, `.h-32`, `.w-32`, `.w-40`, `.w-full`, `.w-1-2`, `.w-3-4`. These collide with Tailwind v4's own utilities (imported via `@import 'tailwindcss'` in `globals.css`). The non-standard `w-1-2`/`w-3-4` naming conflicts with Tailwind's `w-1/2`/`w-3/4` convention.

No `@layer` usage anywhere - Tailwind utilities and custom BEM classes compete on source-order specificity with no guarantees.

#### Best-Practice Fix (P2-27: Resolve Tailwind v4 utility collisions and use `@layer`)

The `_wiki-loading-states.css` file hand-defines `.h-6`, `.h-4`, `.h-10`, `.h-24`, `.h-32`, `.w-32`, `.w-40`, `.w-full`, `.w-1-2`, `.w-3-4` that collide with Tailwind v4's own utilities. The non-standard `w-1-2`/`w-3-4` naming conflicts with Tailwind's `w-1/2`/`w-3/4` convention. Replace custom utilities with Tailwind's built-in utilities (or `@utility` for custom ones), and wrap all custom component styles in `@layer components` so Tailwind utilities always win.

Key principles from Tailwind v4 best practice:
1. **Use `@layer components` for custom classes**: Tailwind docs: "Use the `components` layer for any more complicated classes you want to add to your project that you'd still like to be able to override with utility classes." This ensures utilities (in the `utilities` layer) always override component classes.
2. **Use `@utility` for custom utilities**: Tailwind v4 no longer "hijacks" the `@layer` at-rule for `@apply` : custom utilities must be registered with `@utility` so Tailwind knows about them and they can be used with `@apply` and variants.
3. **Replace hand-defined utilities with Tailwind built-ins**: `.h-6` → `h-6`, `.w-full` → `w-full`, `.w-1-2` → `w-1/2`, `.w-3-4` → `w-3/4`. These already exist in Tailwind; defining them again creates collision and confusion.
4. **Declare layer order**: `@layer base, components, utilities;` at the top of the stylesheet establishes cascade precedence : later layers always win regardless of specificity.
5. **Variants don't work in `@layer` in v4**: Tailwind v4 no longer does anything "special" for CSS inside `@layer` blocks : use `@utility` with nested `@layer` if you need variants on custom classes.


### 1.10 Incomplete motion policy

Reduced-motion handling is split across two files:
- `_variables.css`: `@media (prefers-reduced-motion: reduce) { * { animation-duration: 0.01ms !important; } }`
- `_wiki-loading-states.css`: `@keyframes shimmer` nested inside `@media (prefers-reduced-motion: no-preference)`

Under reduced-motion, `animation: shimmer 1.5s infinite` references a keyframe that doesn't exist (it's only defined inside the `no-preference` media query). Fragile and non-obvious.

### 1.11 Inconsistent transition style

`.btn`, `.theme-toggle`, `.search-trigger`, `.filter-pill`, `.tab` all use `transition: all` (performance smell). `.wiki-sidebar__link` uses targeted `transition: color, background`. `.toggle__track` uses `transition: background`. No convention.

### 1.12 WebKit-only scrollbar

`_variables.css` styles `::-webkit-scrollbar` only. Firefox (`scrollbar-width`/`scrollbar-color`) is unsupported.

### 1.13 Light theme incomplete

`[data-theme='light']` in `_variables.css` only redefines colors. It relies on `:root` for `--surface-1/2`, durations, z-index, fonts, radius - brittle and undocumented. The overlay `rgba(0,0,0,0.6)` and shadow `rgba(0,0,0,0.3)` do not adapt to light theme (jarring black veil in light mode).

### 1.14 No `prefers-color-scheme` detection

Neither `theme-store.ts` nor the inline theme script in `app/layout.tsx` checks `prefers-color-scheme`. Users with a light OS preference get dark mode on first visit.

#### Best-Practice Fix (P2-43: `prefers-color-scheme` detection)

On first visit (no saved preference in `localStorage`), detect the user's OS theme preference via `window.matchMedia('(prefers-color-scheme: dark)')` and apply it. Subscribe to `change` events so the theme updates if the user changes their OS preference while the app is open.

Key principles from color-scheme detection best practice:
1. **`window.matchMedia('(prefers-color-scheme: dark)')`**: MDN: "The `prefers-color-scheme` CSS media feature is used to detect if the user has requested a light or dark color theme." Stack Overflow: "To detect dark mode in JavaScript, query the user's preferred color scheme via the CSS media feature `prefers-color-scheme`, and access it from JS using `window.matchMedia()`."
2. **Subscribe to changes**: SO: "If the user changes their OS/browser theme while your app is running, you can subscribe to changes by listening to the `change` event: `window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', ...)`."
3. **User preference overrides system preference**: web.dev: "A great pattern is to initially adhere to the signal the browser sends through `prefers-color-scheme`, but to then optionally allow users to override their system-level setting." Once the user explicitly chooses a theme, save it to `localStorage` and stop following the system preference.
4. **In the inline theme script**: The inline `<script>` in `layout.tsx` runs before React hydrates. Check `localStorage` first (user's explicit choice); if absent, fall back to `matchMedia('(prefers-color-scheme: dark)')`; if unavailable, default to `'dark'`.
5. **Smashing Magazine's three-option model**: Offer "light", "dark", and "system" options. "System" follows `prefers-color-scheme`; the other two are explicit overrides.


---

## 2. Layout & Information Architecture - Broken and Inconsistent

### 2.1 Loading states cause layout shift (CLS)

None of the 6 per-route `loading.tsx` files wrap content in `WikiShell`:

| File | Content | Issue |
|------|---------|-------|
| `app/loading.tsx` | `<PatternGridLoadingState />` | No shell; pattern-grid skeleton for ALL routes |
| `app/config/loading.tsx` | `<ConfigTableLoadingState />` | No shell |
| `app/checks/loading.tsx` | `<CheckListLoadingState />` | No shell |
| `app/guard/loading.tsx` | `<ConfigTableLoadingState />` | No shell |
| `app/hooks/loading.tsx` | `<HookTableLoadingState />` | No shell |
| `app/patterns/loading.tsx` | `<PatternGridLoadingState />` | No shell |

The skeleton renders without sidebar/nav, then the real page appears with `WikiShell` - visible layout jump on every first navigation.

### 2.2 Root loading.tsx is pattern-specific

`app/loading.tsx` renders `<PatternGridLoadingState />`. Navigating to `/hooks` or `/config` for the first time flashes a pattern-grid skeleton - visually mismatched to the content about to appear. The root loading state should be a generic shell skeleton.

#### Best-Practice Fix (P1-13: Loading-state CLS & shell consistency)

`loading.tsx` is automatically nested inside `layout.tsx` and wraps `page.tsx` in a `<Suspense>` boundary : meaning the **layout (sidebar, header, nav) renders immediately and persists** while only the content area shows the fallback. The current loading files render bare skeletons with no `WikiShell`, so the whole shell flashes in later, causing a visible layout jump.

Key principles from Next.js + Core Web Vitals best practice:
1. **Wrap loading content in the persistent shell**: each `loading.tsx` must render `<WikiShell>…<SkeletonMatchingThisRoute/></WikiShell>` so the sidebar/header are present during load, matching the resolved page (Next.js docs: "shared layouts remain interactive while new route segments load").
2. **Skeleton dimensions must match resolved content**: a fallback that's 200px replacing 600px content is a guaranteed CLS hit; reserve height with `min-height` and explicit grid rows (72Technologies, Next.js Launchpad, dev.to CLS case study).
3. **Route-specific skeletons, not one-size**: `app/loading.tsx` rendering `<PatternGridLoadingState />` for ALL routes is wrong; the root loading state should be a **generic shell skeleton**, and each route a skeleton matching its own layout shape (Juliano Alves).
4. **Pair with segment-level `error.tsx`**: a failing widget should not blank the entire route; place `error.tsx` at the segment where failures should be contained (Juliano Alves).


### 2.3 Missing route boundaries

`tiers`, `integration`, `tooling`, and `playground` have **no** `loading.tsx`, `error.tsx`, or `not-found.tsx`. They inherit the root generic states:
- Loading: pattern-grid skeleton (wrong shape)
- Error: "Something went wrong" (generic)
- Not found: "404 / Page not found" (generic)

#### Best-Practice Fix (P1-20: Missing route boundaries)

Every route segment that fetches data or renders dynamic content should have its own `loading.tsx`, `error.tsx`, and `not-found.tsx` so failures are contained at the segment level and loading/error states match the route's shape.

Key principles from Next.js file-convention best practice:
1. **`error.tsx` catches child-route errors, not siblings**: errors bubble up to the nearest parent boundary; a nested `error.tsx` prevents a single failing route from blanking the whole app (Vercel Academy, Next.js docs).
2. **`error.tsx` requires `'use client'`**: React error boundaries use client-side `componentDidCatch`; without the directive the build fails (Vercel Academy).
3. **`not-found.tsx` for `notFound()` calls**: route-level 404 UI renders between `loading.tsx` and `page.tsx`; the root `app/not-found.tsx` catches unmatched URLs app-wide (Next.js not-found docs).
4. **`global-error.tsx` for root-layout errors**: `app/error.tsx` does NOT catch errors in the root layout itself (same level); use `app/global-error.tsx` which replaces the root layout and must include its own `<html>`/`<body>` (Vercel Academy, Next.js error docs).
5. **Boundary hierarchy**: `loading.js` wraps `not-found.js`, `page.js`, and nested `layout.js`; `error.js` wraps `loading.js` + `not-found.js` + `page.js` : it does NOT wrap the same-segment `layout.js` (Next.js error docs).
6. **Add boundaries to `tiers`, `integration`, `tooling`, `playground`**: these four routes currently inherit the root generic states; each needs its own trio matching its content shape.


### 2.4 Playground drops the shell

`app/playground/page.tsx` is the only page not wrapped in `<WikiShell>`. Users lose the sidebar, header, breadcrumbs, theme toggle, and search trigger. No "back to wiki" affordance.

#### Best-Practice Fix (P1-18: Playground must use the shared shell)

The root `layout.tsx` (and the `WikiShell` it renders) is the **persistent application shell** : it persists across navigations, preserves client state, and stays mounted while only the `{children}` page segment swaps. The playground bypassing `WikiShell` breaks this model: users lose sidebar, header, breadcrumbs, theme toggle, and search with no way back.

Key principles from Next.js layout best practice:
1. **The root layout wraps ALL pages**: any UI in the root layout is shared across every route; the playground must render inside it, not beside it (Next.js docs, Stanza).
2. **Layouts persist and preserve state**: on navigation the layout doesn't unmount/remount : state, effects, scroll position, and open/closed toggles survive; dropping the shell discards this (jsmanifest, inksh.in).
3. **Route groups for chrome variation, not shell-removal**: if the playground needs different chrome, use a route group `(playground)/` with its own nested `layout.tsx`, but never remove navigation entirely : always provide a "back to wiki" affordance (Spell UI, Stanza).
4. **Keep the root layout a Server Component**: don't `'use client'` the whole shell; extract interactive bits (theme toggle, mobile menu) into small Client Components (inksh.in).


### 2.5 Skip link misplaced

In `WikiShell.tsx`, the skip link is placed **after** the sidebar and header:

```tsx
<WikiSidebar />
<div className="wiki-main">
 <header className="wiki-header" role="banner">
 <WikiBreadcrumbs />
 <div className="wiki-header__actions">
 <ThemeToggle />
 <SearchTrigger />
 </div>
 </header>
 <a href="#main-content" className="skip-link"> {/* ← too late */}
 Skip to content
 </a>
 <main id="main-content" className="wiki-content">
```

The skip link must be the **first focusable element** in the document. Keyboard users tab through the entire sidebar and header before reaching it.

#### Best-Practice Fix (P1-19: Skip link placement)

The skip link must be the **first focusable element** in the document, placed before the sidebar and header, hidden off-screen until it receives keyboard focus, with a target that is programmatically focusable via `tabindex="-1"`.

Key principles from WCAG 2.4.1 best practice:
1. **First focusable element, before everything**: the skip link must be the very first `<a>` in `<body>` : before the logo, nav, and header. If it appears after the nav, the user has already tabbed through everything they wanted to skip (WebAIM, A11yPath, WebAbility).
2. **Positional hiding, not `display:none`**: `display: none` / `visibility: hidden` remove the link from the accessibility tree entirely; use `position: absolute; left: -999px` and reveal on `:focus` (Deque axe, WebAIM, A11yPath).
3. **Target needs `tabindex="-1"`**: `<main id="main-content">` is not natively focusable; `tabindex="-1"` lets the anchor move focus there so the next Tab continues into main content, not back to the header (A11yPath, WebAbility, Orange).
4. **Move it in `WikiShell`**: currently placed after sidebar/header; move it to the very top of the `WikiShell` fragment, before `<WikiSidebar />`.
5. **Dedicated z-index token**: use `--z-skip-link` (see P1-11), not `--z-search`.


### 2.6 No breadcrumbs on detail pages

`/hooks/[id]`, `/config/[name]`, `/guard/[name]`, `/checks/[id]`, `/patterns/[category]` - none have breadcrumbs back to their index page. The `WikiBreadcrumbs` component renders in the shell header but shows path segments, not contextual "back to hooks" links.

### 2.7 Heading-level chaos

| Page | Heading | Issue |
|------|---------|-------|
| Root not-found | `<h1>404</h1>` | Bad for screen readers/SEO; "404" is not descriptive |
| Config not-found | `<h2>Configuration not found</h2>` | Inconsistent with root `<h1>` |
| Hooks not-found | `<h2>Not found</h2>` | No descriptive text at all |
| Hook not-found | `<h2>Hook not found</h2>` | `<h2>` vs `<h1>` |
| Guard not-found | `<h2>Guard config not found</h2>` | `<h2>` vs `<h1>` |
| Pattern category not-found | `<h2>Category not found</h2>` | `<h2>` vs `<h1>` |
| Check not-found | `<h2>Check not found</h2>` | `<h2>` vs `<h1>` |
| All error boundaries | `<h2>` | Inconsistent with not-found pages |
| `/patterns` | **none** | No `<h1>` at all |
| `/playground` | **none** | No `<h1>` (delegated to PlaygroundShell) |
| `/patterns/[category]` | **none** | No heading identifying which category |

#### Best-Practice Fix (P2-28: Heading-level consistency)

Every page must have exactly one `<h1>` that describes the page content (matching the page's `<title>`). Subsequent sections use `<h2>`-`<h6>` in hierarchical order without skipping levels. Error and not-found pages must consistently use `<h1>` (not `<h2>`).

Key principles from WCAG heading best practice:
1. **One `<h1>` per page**: MDN: "A page should generally have a single `<h1>` element that describes the content of the page (similar to the document's `<title>`)." WebAIM: "A page should typically have only one first-level heading that describes the page's overall content."
2. **Don't skip heading levels**: MDN: "Do not skip heading levels: always start from `<h1>`, followed by `<h2>` and so on." W3C WAI: "Skipping heading ranks can be confusing and should be avoided where possible."
3. **Headings create an outline**: WebAIM: "Headings create an outline for the page, similar to a term paper outline or table of contents. Screen reader users rely on the page's underlying semantic structure for navigation."
4. **Heading content must be descriptive**: W3C H42: "Check that heading markup is used when content is a heading and the heading markup indicates the appropriate heading level for the content." Not-found pages should use `<h1>` with descriptive text like "Page Not Found", not bare "404".
5. **Pages missing `<h1>`**: `/patterns`, `/playground`, and `/patterns/[category]` have no `<h1>` at all : screen reader users "have to rely on other context clues to determine the content of the page" (WebAIM).
6. **Consistent error/not-found heading levels**: All 6 error boundaries use `<h2>`; all not-found pages use a mix of `<h1>` and `<h2>`. Standardize on `<h1>` for all error/not-found pages since they are standalone page-level UI.


### 2.8 Heading content is raw identifiers

Detail pages use the raw kebab-case `name`/`id` param as `<h1>`:
- `banned_words_exceptions` instead of "Banned Words Exceptions"
- `check_unstaged` instead of "Check: Unstaged"
- `guard_repo_policy` instead of "Guard: Repo Policy"

No humanization.

### 2.9 Near-duplicate error/not-found files

12 files (6 error + 7 not-found) differ only by a heading string. No shared `<ErrorShell title=... link=... />` or `<NotFoundShell title=... link=... />` component. Prime refactoring target.

#### Best-Practice Fix (P2-33: Shared error/not-found shell component)

Extract a reusable `<ErrorShell>` and `<NotFoundShell>` component that accepts `title`, `description`, `linkHref`, and `linkText` props. The 12 near-duplicate files collapse to one-line wrappers. This follows the ProductReady pattern of a shared `NotFoundView` component used across both Next.js `not-found.tsx` and SPA route fallbacks.

Key principles from DRY error UI best practice:
1. **Shared view component with props**: ProductReady: "Reusable 404 component for both Next.js pages and SPA routes" : `NotFoundView({ title, description, homeUrl, homeText, fullScreen })`. Section-specific variants are one-line wrappers: `export function DashboardNotFound() { return <NotFoundView homeUrl="/dashboard" /> }`.
2. **`error.tsx` requires `'use client'`**: Next.js Launchpad: "The `error.tsx` file must be a Client Component : that's a hard requirement because error boundaries rely on React's class-based `componentDidCatch` lifecycle under the hood."
3. **`not-found.tsx` is a Server Component by default**: Next.js docs: "By default, `not-found` is a Server Component. You can mark it as `async` to fetch and display data." It "does not accept any props" : derive context via `usePathname()` in a client subcomponent.
4. **Segment-level boundaries**: TheLinuxCode: "`not-found.js` is not a single global '404 page.' It's a segment-scoped boundary that you can trigger explicitly with `notFound()`." Place segment-level files where section-specific recovery links differ.
5. **`global-not-found.tsx` for unmatched URLs**: Next.js 16 introduced `global-not-found.tsx` for URLs that don't match any route at all, bypassing normal rendering.


### 2.10 No empty states on most list pages

| Page | Has empty state? | Notes |
|------|-----------------|-------|
| `/config` | No | Renders empty `<ul>` |
| `/hooks` | No | Renders empty table |
| `/tiers` | No | Renders header-only table |
| `/tooling` | No | Renders empty grid |
| `/guard` | Yes | But leaks implementation details |
| `/patterns` | No | Renders empty list |
| `/checks` | Yes | But references "extraction pipeline" (dev detail) |

#### Best-Practice Fix (P2-29: Empty states on all list pages)

Every list page must render a purposeful empty state when the collection is empty : not a bare `<ul>` or empty table. The empty state should explain why it's empty, provide context, and offer a direct pathway to populate it.

Key principles from empty-state design best practice:
1. **Never default to totally empty**: NN/g: "Do not default to totally empty states. This approach creates confusion for users, who may be left wondering if the system is still loading information or if errors have occurred."
2. **Communicate system status**: NN/g: "Empty states that are intentionally designed can be used to communicate system status to the user, help users discover unused features, and provide direct pathways for getting started."
3. **Provide direct pathways**: NN/g: "A better approach is to provide brief yet explicit instructions or, better yet, link directly to the steps that need to be taken." Pixxen: "A headline that explains why it's empty, a line of supporting context, a clear next action."
4. **Replace the element, not append to it**: Carbon Design System: "Empty States should replace the element that would ordinarily show. For example, an empty state for a table would replace the table and the column headers and footer should not be present."
5. **Tone matches context**: Northbase: "Search empty states: 100% neutral tone, 0% encouragement across all 10 systems." First-use states can be encouraging; search/filter no-results must be neutral.
6. **Don't leak implementation details**: The current `/checks` empty state references "extraction pipeline", "api-docs.json", "shell-docs.json" : dev details. The `/guard` empty state references `WORKSPACE_GUARD_CONFIG_ROOT`. Replace with user-facing language.


### 2.11 Sync I/O in async pages

**Home page** (`app/page.tsx`):
```tsx
const overview = readFileSync(join(process.cwd(), '..', 'README.md'), 'utf8')
```
- Synchronous inside an `async` function that uses `Promise.all` for other loads - blocks the event loop, defeats parallelism.
- No `try/catch` - crashes the entire home page if README is missing.
- `overview.slice(0, 2000)` truncates mid-token - broken code fences, broken links, garbled output.

**Integration page** (`app/integration/page.tsx`):
```tsx
const filePath = join(process.cwd(), '..', 'docs', 'HOOKS.md')
content = readFileSync(filePath, 'utf8')
```
- Not `async` despite doing synchronous file I/O during render.
- On ENOENT, throws `new Error(...)` with the **full absolute filesystem path** leaked to the user.
- `revalidate = 3600` means a missing file stays cached for an hour.

#### Best-Practice Fix (P2-30/31: Async file I/O, try/catch, and safe markdown truncation)

Replace `readFileSync` with `fs.promises.readFile` (async) inside async Server Components. Wrap in `try/catch` for ENOENT. Never leak filesystem paths in error messages. Truncate markdown at paragraph/heading boundaries, not mid-token : or parse to an AST and truncate the tree.

Key principles from Next.js + Node.js best practice:
1. **Use `fs.promises.readFile` in async Server Components**: Vercel KB: "use the `readFile` function from the `fs` library" with `await` in Server Components. Node.js docs: "use the promise-based `fsPromises.readFile()` method offered by the `fs/promises` module" with `try/catch`.
2. **Always `try/catch` file reads**: SO: "create a `myReadFileSafe` function that catches errors and returns `null` on exception." Never let a missing file crash the entire page.
3. **Never leak filesystem paths in error messages**: Use generic user-facing messages; log the full path via `console.error` for debugging (see P0-6/§7.2 fix). `revalidate = 0` for error paths so a missing file doesn't stay cached.
4. **Truncate at structural boundaries, not mid-token**: `overview.slice(0, 2000)` breaks code fences, links, and HTML tags mid-token. Renovate bot's `closeUnclosedStructures()` repairs broken markdown after slicing. `mdast-util-slice-markdown` truncates the AST tree, not raw text, with configurable handling for partial nodes (`truncate`/`include-full`/`exclude-full`).
5. **Use a markdown-aware truncation approach**: Parse to an AST (mdast), walk the tree counting visible text characters, and truncate at the nearest complete node boundary. This preserves code fences, links, and HTML structure. Alternatively, truncate at the nearest paragraph or heading boundary using a simple regex: `content.slice(0, 2000).replace(/\n---\n.*$/s, '').replace(/```[^`]*$/, '')`.


### 2.12 Fragile relative paths

`join(process.cwd(), '..', 'README.md')` and `join(process.cwd(), '..', 'docs', 'HOOKS.md')` depend on the runtime working directory. If `cwd()` differs (Docker, monorepo), these silently break or throw.

### 2.13 Config index page uses `<a href>` not `<Link>`

`app/config/page.tsx` uses raw `<a href={config.link}>` for every config entry - full page reload on every navigation, loses SPA benefit.

### 2.14 Mobile sidebar has no toggle

`WikiShell` renders `<WikiSidebar />` unconditionally. The CSS (`_wiki-layout.css`) defines a mobile off-canvas pattern (`.wiki-sidebar.is-open`) but no component sets the `is-open` class. There is no hamburger button or drawer toggle. On mobile, the sidebar is either always visible (overlapping content) or always hidden (inaccessible).

#### Best-Practice Fix (P2-46: Mobile sidebar toggle/drawer)

Implement an accessible mobile navigation drawer: a hamburger button in the header toggles the sidebar's `is-open` class, with `aria-expanded` on the button, `aria-controls` linking to the sidebar's `id`, and a backdrop overlay that closes the drawer on click. On desktop (above a breakpoint), the sidebar is always visible and the toggle is hidden.

Key principles from accessible drawer best practice:
1. **`aria-expanded` on the toggle button**: Make Things Accessible: "Use `aria-expanded` on the trigger to indicate whether the drawer is open or closed. Screen readers announce 'expanded' or 'collapsed' along with the button text."
2. **`aria-controls` links toggle to drawer**: W3C disclosure pattern: "The element that shows and hides the content has `aria-controls` that refers to the element that contains all the content."
3. **Backdrop overlay closes on click**: Christian Baum: "A label button is a UX trick to dismiss the modal by clicking outside of the menu." daisyUI: "`drawer-overlay` is a label that covers the page when drawer is open."
4. **Responsive: hidden on desktop, toggle on mobile**: daisyUI: "Drawer sidebar is hidden by default. You can make it visible on larger screens using `lg:drawer-open`." Accessible Toggle: "Set a `mediaQuery` option to enable/disable the toggle based on screen size."
5. **Focus management**: MDC Drawer: "It is recommended to shift focus to the first focusable element in the main content when drawer is closed or one of the destination items is activated."
6. **Escape to close**: The drawer should close on Escape key, returning focus to the toggle button.
7. **CSS `transition` with `allow-discrete` for display**: Make Things Accessible uses `transition: display 500ms allow-discrete, width 500ms ease-in` for smooth show/hide without `display: none` blocking transitions.


### 2.15 No `generateMetadata` on any dynamic route

Every detail page (`/hooks/[id]`, `/config/[name]`, `/guard/[name]`, `/checks/[id]`, `/patterns/[category]`) shares the site-wide title "workspace-ci Wiki". No per-page titles for SEO or bookmark clarity.

#### Best-Practice Fix (P2-32: `generateMetadata` on dynamic routes)

Export a `generateMetadata` function from each dynamic route's `page.tsx` to produce per-page `<title>` and `<meta>` tags. The function receives `params` (a Promise in Next.js 16) and can fetch data or derive metadata from the route parameter.

Key principles from Next.js Metadata API best practice:
1. **`generateMetadata` for dynamic routes**: Stanza: "Use `generateMetadata` for dynamic routes (product pages, blog posts) : it receives route params, can fetch data, and supports streaming metadata after initial HTML is sent."
2. **`params` is a Promise in Next.js 16**: Ali Rehan Haider: "In Next.js 16, accessing parameter keys directly without awaiting them throws a runtime warning or compile error." Use `const { slug } = await params`.
3. **Server Component only**: Next.js docs: "The `metadata` object and `generateMetadata` function exports are only supported in Server Components."
4. **Use React `cache()` to deduplicate**: Stanza: "`generateMetadata` and the page component run independently : if both call the same fetcher, that's two database queries. Fix it with React's `cache()`."
5. **Return `notFound()` for missing items**: Next.js docs: "`redirect()` and `notFound()` can also be used inside `generateMetadata`."
6. **Title template in root layout**: Set `title: { template: '%s | Digital Guardrails' }` in `app/layout.tsx` so detail page titles automatically get the suffix.


### 2.16 `VALID_CATEGORIES` duplicated from type system

`app/patterns/[category]/page.tsx` hardcodes a `VALID_CATEGORIES` array that duplicates the `PatternCategory` type. If a new category is added to the type but not this array, it silently 404s.

### 2.17 `getGuardConfigEntries` not awaited

`app/guard/page.tsx`:
```tsx
const entries = getGuardConfigEntries(names)
```
This is a sync function called without `await` in an `async` page. While functionally correct (it's sync), the inconsistency with the `await`-based loaders elsewhere is suspicious and confusing.

### 2.18 Tooling page ordering

`app/tooling/page.tsx` renders the category badge **after** the usage `<pre>` block. Badges usually lead as metadata. The template literal `` `tooling-card__category badge--blue` `` uses backticks with no interpolation - pointless.

---

## 3. Missing Descriptive Text, Tooltips, and Modals

### 3.1 No tooltips anywhere

Not a single `title` attribute or tooltip component on any interactive element:

- Tier headers ("strict", "poc", "vendored") - no explanation of what each tier means
- Category pills - no descriptions
- HookBadge values - no context
- Filter pills - no help text
- PatternCard scope badge - no tooltip
- ThemeToggle - has `title` (one of the only exceptions)
- FeedbackWidget thumbs - only bare `aria-label`, no tooltip

#### Best-Practice Fix (P1-16: Accessible tooltips)

Build a single `<Tooltip>` component implementing the WAI-ARIA tooltip pattern: `role="tooltip"` on the popup, `aria-describedby` on the trigger, shown on both hover AND focus, dismissible with Escape, and hoverable (cursor can traverse onto the tooltip without it dismissing). Do NOT use the `title` attribute.

Key principles from WCAG 1.4.13 best practice:
1. **`role="tooltip"` + `aria-describedby`**: the tooltip container has `role="tooltip"` and a unique `id`; the trigger references it via `aria-describedby` (W3C APG, MDN, A11yPath).
2. **Trigger on focus AND hover**: WCAG SC 1.4.13 requires hover-triggered content to also appear on keyboard focus; use CSS `:focus-within`/`:focus` so keyboard users see it (A11yPath, CSS-Tricks).
3. **Dismissible without moving focus**: Escape must close the tooltip while focus stays on the trigger (WCAG 1.4.13, A11yPath).
4. **Hoverable + persistent**: the pointer can move onto the tooltip without it dismissing; it remains until focus/pointer leaves the trigger or info is no longer valid (A11yPath, mgifford).
5. **Don't use `title`**: the native `title` tooltip can't be triggered by keyboard focus, can't be dismissed, can't be styled, and is ignored by many screen readers (CSS-Tricks, A11yPath, MDN).
6. **No interactive content**: if the popup needs buttons/links, use a `dialog`/toggletip, not a tooltip (CSS-Tricks, Heydon Pickering). For icon-only buttons, prefer a visible `aria-label` over a tooltip.
7. **Don't hide essential info in tooltips**: some screen readers skip `aria-describedby`; critical labels belong in visible text (CSS-Tricks).


### 3.2 No modals for information-dense content

The search modal is the **only** modal in the entire application. Missing:
- No detail/dialog modals for pattern explanations
- No confirmation dialogs for feedback submission
- No "view full reason" expanders
- No config diff viewers
- No source-code viewers with line numbers
- No YAML preview modals

Everything is either inline (cramped) or doesn't exist.

#### Best-Practice Fix (P1-17: Accessible modals/dialogs)

Prefer the native `<dialog>` element with `dialog.showModal()` for new modals : it provides focus trapping, Escape dismissal, an inert background, focus restoration to the trigger, a `::backdrop` pseudo-element, and `role="dialog"` automatically, eliminating ~50 lines of error-prone focus-management JS. Extract a reusable `<Modal>` primitive (base for the search modal and all future dialogs).

Key principles from WAI-ARIA dialog best practice:
1. **Native `<dialog>` + `showModal()`**: built-in focus trap, Escape, inert background, focus restoration, `::backdrop`; supported in all modern browsers since early 2022 (W3C H102, A11yPath, UXPin).
2. **`aria-modal="true"` + `aria-labelledby`**: gives the dialog an accessible name from its heading; optionally `aria-describedby` for descriptive text (W3C APG, MDN, UXPin).
3. **Focus management on open/close**: focus moves to the first focusable element (or a `tabindex="-1"` heading for large content) on open, and returns to the triggering element on close (W3C APG, H102).
4. **Background inert**: mark content behind the modal `inert` (or rely on native `<dialog>` which does this automatically) so the virtual cursor and Tab can't reach it (MDN aria-modal, UXPin).
5. **Backdrop click to close**: native `<dialog>` doesn't do this automatically; add a click listener checking `e.target === dialog` (A11yPath).
6. **Reusable `.modal` primitive + z-index**: pair with the `--z-modal` token (P1-11) so dialogs always render above non-blocking overlays.


### 3.3 No intro/explanatory text

| Page | Has intro text? | Issue |
|------|----------------|-------|
| `/hooks` | No | Bare table, no "what is a hook?" context |
| `/patterns` | No | Bare list, no "what are banned patterns?" context |
| `/patterns/[category]` | No | No heading at all |
| `/guard` | No | Bare list, no "what is guard policy?" context |
| `/config` | No | Bare list, no context |
| `/checks` | No | Empty state references "run the extraction pipeline" (dev detail) |
| `/tiers` | Yes | Minimal paragraph, but doesn't explain tier meanings |
| `/tooling` | Yes | One sentence |

#### Best-Practice Fix (P2-42: Intro/explanatory text on all list pages)

Every list page should have an introductory paragraph explaining what the content is and why it matters. This provides context for new users, improves SEO (search engines use visible text), and sets expectations.

Key principles:
1. **Context before content**: Users arriving at `/hooks` need to know "what is a hook?" before scanning a table. A brief intro paragraph (2-3 sentences) provides this context without overwhelming.
2. **SEO benefit**: Search engines use visible text to understand page content. An intro paragraph with relevant keywords improves discoverability.
3. **Consistent placement**: Place the intro paragraph between the page `<h1>` and the main content area, styled as muted secondary text.
4. **Don't reference implementation details**: The `/checks` empty state references "extraction pipeline" : intro text should be user-facing, not dev-facing.

### 3.4 No copy-to-clipboard

Zero copy buttons on any `<pre><code>` block:
- Config detail: raw YAML dump - no copy
- Guard detail: raw YAML dump - no copy
- Hook detail: `entry` command - no copy
- Tooling: `usage` command - no copy
- Check detail: `signature` - no copy
- PatternCard: regex pattern - no copy

A reference wiki without copy-to-clipboard is a major friction point.

#### Best-Practice Fix (P1-15: Copy-to-clipboard)

Build a reusable `<CopyButton>` (or `useCopy` hook) implementing a state machine: **idle → copying → copied/failed**. Use `navigator.clipboard.writeText()` (async Promise), always provide a `document.execCommand('copy')` fallback for iOS Safari / sandboxed iframes / HTTP contexts, announce success/failure via an `aria-live` region, and never claim "Copied" before the Promise resolves.

Key principles from clipboard best practice:
1. **State machine, not a one-shot**: idle (tooltip "Copy", clipboard icon) → copying (disabled, "Copying…") → copied (checkmark, "Copied", auto-reset after TTL) → failed (alert icon, "Copy failed", manual fallback hint) (cr0x.net, Primer).
2. **`navigator.clipboard.writeText()` is the modern API**: returns a Promise that resolves only once the clipboard is updated; available since March 2020 but requires a secure (HTTPS) context (MDN, web.dev).
3. **Always implement the `execCommand('copy')` fallback**: deprecated but the safety net for iOS Safari gesture-context invalidation, sandboxed iframes, HTTP, and embedded WebViews where the async API is rejected (juanchi.dev, web.dev).
4. **Announce via `aria-live`**: a visual icon swap is invisible to screen readers; pair it with a visually-hidden `aria-live="polite"` region announcing "Copied" / "Copy failed" (Primer, PatternFly, cr0x.net).
5. **Keyboard accessible + stable focus**: the button must be Tab-reachable, Enter/Space activated, and focus must remain on the button (don't steal focus) (cr0x.net, PatternFly).
6. **Call `writeText` directly in the handler**: any async intermediary (fetch, setTimeout) can break Safari's user-gesture context and reject the operation (juanchi.dev).


### 3.5 Empty search placeholder

`SearchTrigger.tsx`:
```tsx
<input type="text" ... placeholder="" ... />
```
Should provide helpful hint text like "Search patterns, hooks, configs…".

### 3.6 No "no results" guidance beyond bare text

Search shows "No results found" with no suggestions, no alternative search terms, no category links.

### 3.7 Check detail page doesn't render docstrings as markdown

`app/checks/[id]/page.tsx` wraps the docstring in `<pre><code>` inside a `.prose` div - but docstrings are **not markdown-rendered**. Inconsistent with home/integration pages which use `ContentRenderer` for markdown. The class name `prose` is misleading since it's not actually prose-styled.

### 3.8 Check detail page captures `line` but never displays it

```tsx
interface FoundCheck {
 line: number // ← captured
 // ...
}
```
`found.line` is set but never rendered. Users can't jump to the source line.

---

## 4. Component Hierarchy & Interaction Defects

### 4.1 Double search system

`WikiShell.tsx` mounts **both**:
- `<SearchTrigger />` - which renders its own `<SearchModal>` when open
- `<WikiSearch />` - another independent modal

Two separate search systems with duplicated, drift-prone modal markup. Both use module-level mutable `searchData` singletons. Both call `useSearch(searchData)` independently.

Additionally, `SearchTrigger`'s `SearchModal` has a broken `useEffect`:
```tsx
useEffect(() => {
 const handleClick = (e: MouseEvent) => {
 if (e.target === e.currentTarget) { // ← e.currentTarget is `document` here
 close()
 }
 document.addEventListener('click', handleClick)
 // ...
}, [close])
```
`e.target === e.currentTarget` on a document-level listener almost never matches. The overlay `onClick` already handles backdrop clicks. This effect is dead code and a memory leak risk.

#### Best-Practice Fix (P1-14: Unify the double search system)

Collapse `SearchTrigger`'s `SearchModal` and the standalone `WikiSearch` into a **single search modal** with one trigger, one data source, and one `useSearch` instance. The command-palette pattern (one app-level modal mounted once, triggered via ⌘K, with decentralized command registration) is the canonical architecture.

Key principles from command-palette best practice:
1. **One modal, mounted once at the app root**: a single provider renders the modal; trigger components anywhere call `open()` imperatively : no duplicated modal markup that can drift (global-search, kbar, spotlight-omni-search).
2. **Single source of truth for search data**: one `searchData` singleton, one `useSearch` instance; the current two-module-level-mutable-singleton setup is drift-prone.
3. **`aria-activedescendant`, not per-item DOM focus**: keep focus on the input and use `aria-activedescendant` to announce the active option : preserves typing and screen-reader context (ClaudeCodeLab, spotlight-omni-search).
4. **Keyboard model**: Arrow keys move the active option, Enter selects, Escape closes, Home/End jump; IME-safe Enter handling (ClaudeCodeLab).
5. **Remove the dead document-level click listener**: `SearchModal`'s `useEffect` with `e.target === e.currentTarget` on `document` almost never matches and is a memory leak; the overlay `onClick` already handles backdrop dismissal.
6. **`useDeferredValue` + `useMemo`** for responsive filtering that doesn't freeze typing (ClaudeCodeLab).


### 4.2 HookBadge has dead `variant` prop

```tsx
interface HookBadgeProps {
 variant: 'stage' | 'kind' | 'tier' // ← declared
 value: string
}

export function HookBadge({ value }: HookBadgeProps) { // ← variant NOT destructured
```

Callers pass `variant="stage"` etc. (as seen in `HookTable.tsx` and `hooks/[id]/page.tsx`) but it has zero effect. Color is determined purely by `value`. The `variant` prop is dead API surface.

#### Best-Practice Fix (P2-34: Remove dead `variant` prop or wire it up)

Either remove the `variant` prop from `HookBadgeProps` (and update all callers) or destructure it and use it to influence color/styling. Dead API surface erodes trust in the type system and confuses maintainers.

Key principle: **Every declared prop must be consumed.** Dead props are technical debt : they signal intent that the implementation doesn't honor. If `variant` is meant to influence appearance (e.g., stage badges use one color palette, kind badges another), wire it up; if not, delete it and its call sites.

### 4.3 PatternCard uses numeric index as DOM id

```tsx
<article className="pattern-card" id={String(index)} role="listitem">
```

- Non-descriptive
- Collides if the card is rendered in multiple lists on the same page (duplicate IDs = invalid HTML)
- Breaks anchor links
- `role="listitem"` on `<article>` is semantically contradictory

#### Best-Practice Fix (P2-35: Use descriptive stable DOM ids, remove `role="listitem"`)

Replace `id={String(index)}` with a descriptive, stable id derived from the pattern's content (e.g., `id={\`pattern-${pattern.category}-${index}\`}`). Remove `role="listitem"` from `<article>` : the implicit role of `<article>` is `article`, and adding `listitem` is semantically contradictory.

Key principles:
1. **Descriptive ids**: Numeric index ids are non-descriptive, collide across multiple lists on the same page (duplicate IDs = invalid HTML), and break anchor links. Use content-derived ids that are unique and meaningful.
2. **Don't override implicit roles**: `<article>` has an implicit ARIA role of `article`. Adding `role="listitem"` contradicts this and confuses assistive technologies. If a list semantic is needed, wrap cards in a `<ul>` with `role="list"` and let each `<li>` carry `role="listitem"` implicitly.
3. **Stable ids for anchor links**: If users need to deep-link to a specific pattern, the id must be stable across renders and navigations, not based on array position.

### 4.4 ErrorBoundary swallows errors

```tsx
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
 // No componentDidCatch
 // No onError prop
 // No fallback prop / render-prop
```

- No `componentDidCatch` / `onError` callback - errors are silently swallowed (no logging/reporting to telemetry).
- No `fallback` prop - callers cannot customize the error UI.
- "Try again" only resets state (`this.setState({ hasError: false })`) - does **not remount children**, so child components may retain stale/corrupted state and immediately re-throw.
- Raw `error.message` shown to end users.
- No "Reload page" or "Go home" secondary action.
- No error code/reference for support.

#### Best-Practice Fix (P2-36: ErrorBoundary with `componentDidCatch`, `fallback`, and `resetKeys`)

Add `componentDidCatch(error, info)` for logging, accept a `fallback`/`fallbackRender` prop for customizable error UI, use `resetKeys` for route-based auto-reset, and never display raw `error.message` to users.

Key principles from React error boundary best practice:
1. **`componentDidCatch` for logging**: React docs: "Use `componentDidCatch()` to log error information." `getDerivedStateFromError` is for state updates only, not side effects.
2. **`fallback`/`fallbackRender` prop**: react-error-boundary: "The component provides several ways to render a fallback: `fallback`, `fallbackRender`, and `FallbackComponent`." Callers should be able to customize the error UI.
3. **`resetKeys` for auto-reset**: react-error-boundary: "When changed, these keys will reset a triggered error boundary." Tie `resetKeys` to the current route so navigation away from the failed page auto-resets.
4. **`onError` callback**: react-error-boundary: "Optional callback to enable e.g. logging error information to a server." Connect to monitoring/telemetry.
5. **`onReset` callback**: react-error-boundary: "Optional callback to be notified when an error boundary is 'reset' so React can retry the failed render." Use to clear any state that may have caused the error.
6. **Never show raw `error.message`**: Stanza: "Don't show the stack trace to the user. Log it; don't render it." Nazar Boyko: "Be specific about what failed: 'We couldn't load this chart' beats 'Something went wrong'."
7. **Consider `react-error-boundary` library**: Kent C. Dodds: "react-error-boundary gives all tools needed" : production-ready with `fallbackRender`, `onError`, `onReset`, and `resetKeys`.


### 4.5 Tabs missing keyboard navigation

WAI-ARIA tab pattern violations in `src/components/ui/Tabs.tsx`:
- **No arrow-key navigation** - requires Left/Right arrows to move between tabs
- **No roving `tabIndex`** - every tab button is in the tab order; only the active tab should be `tabIndex={0}`
- **No `aria-controls`** on Tab / `id` on TabPanel - tab-to-panel relationship not exposed
- **No `aria-labelledby`** on TabPanel
- `TabPanel` returns `null` when inactive - unmounts content, losing internal state
- `Tab` accepts a `children` prop that is never used (dead API surface)
- No `orientation` prop (always horizontal)

#### Best-Practice Fix (P1-23: WAI-ARIA Tabs)

Implement the WAI-ARIA Tabs pattern: `role="tablist"`/`tab`/`tabpanel`, **roving tabindex** (active tab `tabindex={0}`, others `tabindex={-1}`), arrow-key navigation, `aria-controls`/`aria-labelledby` bidirectional links, `aria-selected`, and `aria-orientation`. Inactive panels should be `hidden`, not unmounted, so internal state survives.

Key principles from WAI-ARIA tabs best practice:
1. **Roving tabindex**: only the active tab is in the tab order (`tabindex={0}`); all others are `tabindex={-1}`. Tab moves focus into the tablist (landing on active tab), then Tab again moves into the panel : without roving tabindex the user must tab through every tab (W3C APG, A11yPath, MDN).
2. **Arrow-key navigation**: Left/Right move focus (and optionally activate) between tabs; wrap from last→first; Up/Down when `aria-orientation="vertical"` (W3C APG).
3. **Home/End**: jump to first/last tab (W3C APG, optional).
4. **`aria-controls` ↔ `id` + `aria-labelledby` ↔ `id`**: each tab `aria-controls` its panel's `id`; each panel `aria-labelledby` its tab's `id` : bidirectional association (W3C APG, A11yPath).
5. **`aria-selected`**: only the active tab has `aria-selected="true"`; does not change on focus-move, only on activation (W3C APG).
6. **`hidden`, not unmount**: `TabPanel` returning `null` when inactive loses inner state/scroll; use the `hidden` attribute so the DOM persists (A11yPath).
7. **Automatic vs manual activation**: automatic (panel shows on focus) only when all content is present in the DOM; otherwise manual (Space/Enter activates) (W3C APG).
8. **Remove the dead `children` prop** on `Tab` and add an `orientation` prop.


### 4.6 CollapsibleSection missing aria wiring

```tsx
<button aria-expanded={isOpen} onClick={...}>
 {/* no aria-controls */}
```
- No `aria-controls` linking the header button to the content region
- Content `<div>` has no `id`, no `role="region"`, no `aria-labelledby`
- Collapsed content is **unmounted** (`{isOpen && ...}`) - loses inner state, resets scroll
- No controlled mode (no `open`/`onOpenChange` props)

#### Best-Practice Fix (P2-37: CollapsibleSection WAI-ARIA disclosure wiring)

Wire `aria-controls` on the button to the content region's `id`, add `role="region"` + `aria-labelledby` on the content div, and use `hidden` attribute (not unmount) so collapsed content preserves internal state.

Key principles from WAI-ARIA disclosure best practice:
1. **`aria-controls` on the button**: W3C APG: "The element that shows and hides the content has `aria-controls` that refers to the element that contains all the content that is shown or hidden."
2. **`aria-expanded` already present (keep it)**: W3C APG: "When the content is visible, the element with role `button` has `aria-expanded` set to `true`. When the content area is hidden, it is set to `false`."
3. **`role="region"` + `aria-labelledby` on content**: W3C accordion APG: "Optionally, each element that serves as a container for panel content has `role region` and `aria-labelledby` with a value that refers to the button that controls display of the panel." Avoid region proliferation if more than ~6 panels can be expanded simultaneously.
4. **`hidden` attribute, not unmount**: WebAIM: "When the content area is collapsed, the contents should not be accessible, including elements that otherwise could receive keyboard focus. Using CSS `display:none` or the `hidden` attribute will visually and programmatically hide the contents." Unmounting (`{isOpen && ...}`) loses inner state and scroll position.
5. **CSS attribute selectors for visual state**: W3C FAQ example: "CSS attribute selectors (e.g., `[aria-expanded="false"]`) are used to synchronize the visual states with the value of the `aria-expanded` attribute."
6. **Controlled mode**: Add `open`/`onOpenChange` props for parent-controlled usage (e.g., accordion where opening one closes others).


### 4.7 Icon always aria-hidden

```tsx
export function Icon({ name, size = 'md', className }: IconProps) {
 return <i className={clsx(name, sizeMap[size], className)} aria-hidden="true" />
}
```

No way to render a semantic/meaningful icon. When an icon is the sole content of a button (common case), this creates an accessibility gap. No `title` or `aria-label` prop exists. No fallback if the icon name is invalid (renders empty `<i>`).

Missing `'use client'` directive - inconsistent with other `ui/` components.

#### Best-Practice Fix (P2-38: Icon component with semantic option and `'use client'`)

Add an optional `title`/`label` prop. When provided, render `role="img"` with `aria-label` instead of `aria-hidden="true"`. When absent (decorative icon), keep `aria-hidden="true"`. Add `'use client'` directive for consistency with other `ui/` components.

Key principles:
1. **Decorative vs. meaningful icons**: An icon that is the sole content of a button needs an accessible name. An icon that decorates adjacent text should be `aria-hidden`. The component must support both modes.
2. **`role="img"` + `aria-label` for meaningful icons**: MDN: "If an image is meaningful (conveys information), use `role="img"` with `aria-label`." For icon fonts, this means `<i role="img" aria-label="Settings">` instead of `<i aria-hidden="true">`.
3. **`aria-hidden="true"` for decorative icons**: When the icon is purely decorative and adjacent text provides the label, hide the icon from assistive technology.
4. **`'use client'` consistency**: Other `ui/` components have `'use client'`; `Icon` should too, especially if it uses hooks or interactive behavior.
5. **Invalid icon names**: If the icon name doesn't match a Remix Icon class, the `<i>` renders empty. Consider a fallback or a development-mode warning.

### 4.8 WikiSidebar missing aria-current and has loose active matching

```tsx
const isActive = item.href === '/'
 ? pathname === '/'
 : pathname.startsWith(item.href)
```

- No `aria-current="page"` on the active link - only a CSS class
- `pathname.startsWith(item.href)` is too loose: `/hooks` would be "active" on `/hooks-archive`
- No mobile collapse/toggle (hamburger/drawer)
- No tooltips explaining ambiguous labels ("Tiers", "Guard", "Tooling")
- No grouping/sectioning of nav items (all 10 in a flat list)
- No badges/counts next to items

#### Best-Practice Fix (P2-39: WikiSidebar `aria-current`, strict active matching, grouping)

Add `aria-current="page"` on the active link, fix the loose `pathname.startsWith(item.href)` matching, add nav grouping/sectioning, and use CSS attribute selectors `[aria-current="page"]` for active styling.

Key principles from `aria-current` best practice:
1. **`aria-current="page"` on the active link**: MDN: "In a navigation bar, `aria-current="page"` should be set on the link to the current document." W3C ARIA26: "The purpose of this technique is to programmatically indicate the current item in a user interface component that contains a set of related items."
2. **Only one current item per group**: A11Y Collective: "Only mark ONE item as current within each group : Multiple 'current' items confuse screen reader users."
3. **Use the most specific value**: A11Y Collective: "Choose `page`, `step`, etc. rather than generic `true`." For navigation, always `aria-current="page"`.
4. **CSS attribute selectors**: A11Y Collective: "Combine with visual styling using CSS attribute selectors : `[aria-current="page"] { font-weight: bold; }`." Heydon Works: "The presence of the `aria-current` attribute can do all the work" for styling, removing the need for JS-set classes.
5. **Strict active matching**: `pathname.startsWith(item.href)` is too loose : `/hooks` matches `/hooks-archive`. Use exact match for root, and for other routes match `pathname === item.href || pathname.startsWith(item.href + '/')`.
6. **Update dynamically on navigation**: A11Y Collective: "Don't forget to update it dynamically : Single-page apps need JavaScript to manage state changes." In Next.js, `usePathname()` re-renders on navigation.
7. **Don't use `aria-current` on tabs/options**: MDN: "Don't use `aria-current` as a substitute for `aria-selected` in gridcell, option, row or tab."


### 4.9 WikiBreadcrumbs uses `<a>` not `<Link>`

```tsx
<a href={crumb.href} className="wiki-breadcrumbs__link">
```

Full page reloads on breadcrumb navigation. Inconsistent with `WikiSidebar` which uses `<Link>`. No `<ol>` semantics. No `aria-current="page"` on the last crumb. No JSON-LD `BreadcrumbList` structured data.

#### Best-Practice Fix (P2-40: WikiBreadcrumbs with `<Link>`, `<ol>`, `aria-current`, JSON-LD)

Replace `<a>` with Next.js `<Link>` for client-side navigation. Use `<nav aria-label="breadcrumbs">` with `<ol>`/`<li>` semantics. Add `aria-current="page"` on the last crumb. Optionally add JSON-LD `BreadcrumbList` structured data for SEO.

Key principles from breadcrumbs best practice:
1. **`<Link>` not `<a>`**: Next.js `<Link>` performs client-side navigation without full page reload, preserving SPA state and shared layouts. WikiSidebar already uses `<Link>` : breadcrumbs should be consistent.
2. **`<nav>` + `<ol>` semantics**: The breadcrumb trail should be in a `<nav>` landmark with `aria-label="breadcrumbs"` and use an ordered list `<ol>` since the hierarchy is sequential.
3. **`aria-current="page"` on the last crumb**: MDN: "In a breadcrumb list, when a link within a set of pagination links is styled to indicate the user is currently on that page, `aria-current="page"` should be set on that link." Aditus recommends `aria-current="location"` for breadcrumbs specifically.
4. **JSON-LD `BreadcrumbList`**: Stanza: "Add JSON-LD for rich results" : search engines can display breadcrumb trails in SERP snippets.
5. **Remove `aria-current` from non-current crumbs**: Only the last crumb (current page) should have `aria-current`.


### 4.10 TrendingSection and GuardConfigList use `<a>` not `<Link>`

Both use plain `<a href>` - full page reloads, inconsistent with `WikiSidebar`.

#### Best-Practice Fix (P2-41: Replace all `<a>` with `<Link>` for internal navigation)

All internal navigation links in the application must use Next.js `<Link>` instead of raw `<a href>`. This includes `WikiBreadcrumbs` (§4.9), `TrendingSection`, `GuardConfigList`, and the config index page (§2.13).

Key principle: **`<Link>` for internal, `<a>` for external.** Next.js docs: "`<Link>` enables fast navigations between routes using prefetching and client-side navigation." Using `<a href>` for internal links causes full page reloads, destroying SPA state (Zustand stores, React Query caches, component state) and causing visible flashes. Every component that renders internal links should import `Link` from `next/link`.

### 4.11 FeedbackWidget double-submits

```tsx
<button onClick={() => submit('up')} ...> {/* ← first submit */}
 <i className="ri-thumb-up-line" />
</button>
{/* ... */}
{vote && !state.includes('submitted') && (
 <div className="feedback-comment">
 {/* ... */}
 <button onClick={() => submit(vote)} ...> {/* ← second submit */}
 Send
 </button>
 </div>
)}
```

Clicking thumbs-up calls `submit('up')` immediately (sets `vote='up'`, `submitted=true`, appends to store). Then the comment box appears. The "Send" button calls `submit(vote)` again - appends a **second** feedback event to the store. Single upvote + comment = two `addFeedback` calls.

Also: thumb icons inside buttons lack `aria-hidden="true"` (inconsistent with other components). No loading state on the "Send" button. No character count/limit on textarea. No way to retract/clear feedback after voting.

#### Best-Practice Fix

The feedback widget conflates two distinct actions: **voting** (selecting up/down) and **submitting a comment** (optional follow-up). The double-submit bug occurs because both the thumb click and the "Send" button call `submit()`, which calls `addFeedback()` each time.

Key principles from idempotent UI best practice:
1. **Separate vote from comment submission**: The thumb click should record the vote (one `addFeedback` call). The "Send" button should **update** the existing feedback record (not create a new one). The store's `addFeedback` already filters out same-vote entries, so re-submitting with the same vote is idempotent for the vote itself, but each call still increments `totalFeedback` and appends to `events[]`.
2. **Use explicit state-setting, not toggles**: "SET_FAVORITE(true) is idempotent - calling it twice is the same as calling it once. Prefer explicit state-setting actions over toggles in any context where duplication is possible" (Unpacked: Idempotent UI Actions).
3. **Disable the submit button after first click**: "Disable-on-submit: Disable the submit button after the first click and re-enable it when the response arrives" (OpenReplay). The "Send" button should be `disabled` while `state === 'submitted_up' || state === 'submitted_down'`.
4. **Update vs. insert**: The comment should be an update to the existing feedback record, not a new `addFeedback` call. Add an `updateFeedback(targetId, comment)` method to the store that patches the last feedback entry for that target, rather than appending a new event.
5. **Visual feedback during submission**: "Disable the submit button and show a loading indicator. Change button text to 'Submitting...' or display a spinner" (OpenReplay). Use `aria-busy` on the button.


### 4.12 FeedbackAggregate has no accessible labels

```tsx
<span className="feedback-aggregate__up">
 <i className="ri-thumb-up-line" aria-hidden="true" />
 {upCount}
</span>
```

Screen readers hear only "5 2" with no context. Needs `aria-label` like "5 upvotes, 2 downvotes". No `title`/tooltip. No zero-state handling (shows "0 0").

### 4.13 TierComparison has context-less aria-labels

```tsx
<i className="ri-check-line text-ok" aria-label="Runs" />
<i className="ri-close-line text-muted" aria-label="Does not run" />
```

The `<i>` elements inside `<td>`s have labels with no row/column context. A screen reader says "Runs, Does not run" without knowing *which hook/tier*. No `<caption>`. No descriptive text explaining tier meanings. Hook ID column is plain text, not a link (inconsistent with `HookTable`).

### 4.14 ContentRenderer has no error handling or syntax highlighting

```tsx
const rawHtml = marked(content, { gfm: true, breaks: false }) as string
```

- `marked()` return cast to `string` with `as` - `marked` v5+ can return `Promise<string>` if `async: true`; cast hides a potential runtime bug
- No `try/catch` - if markdown parsing throws, the component crashes
- No syntax highlighting for code blocks
- No table-of-contents / heading anchors
- No memoization - re-parses markdown on every render

### 4.15 StatsBar SSR/hydration mismatch

```tsx
const totalViews = useAnalyticsStore((s) => s.totalViews)
```

`totalViews` comes from a client-side analytics store backed by `localStorage`. It will be `0` on the server and a real number on the client → React hydration warning + visible number flicker.

### 4.16 CategoryNav missing aria-live

```tsx
<span className="category-nav__count">
 {visibleCount} of {totalCount} patterns
</span>
```

Should be `aria-live="polite"` so screen readers announce filter changes. "Select all" / "Deselect all" are always enabled - even when all are already selected/deselected (no disabled state, no feedback).

### 4.17 StageFilter and TierFilter missing reset and tooltips

No "Clear filters" / "Reset" control. No tooltips explaining what "Strict", "POC (safety)", "Vendored" mean. No `aria-label` on the filter container. No disabled state when a tier has 0 hooks.

### 4.18 PlaygroundShell not wrapped in WikiShell

See §2.4. Users lose all navigation when entering the playground.

### 4.19 CodeEditor init pattern

`CodeEditor.tsx` initializes CodeMirror in a `useEffect` with `[language]` dependency. When language changes, the editor is destroyed and recreated - losing cursor position, scroll position, and undo history. No graceful language swap.

### 4.20 MatchPanel line number coloring inconsistent

`.match-panel__line` uses `--warn` (orange) for line numbers, while `.check-card__line` uses `--muted` (gray) for the same concept.

---

## 5. Critical Data & Logic Bugs

### 5.1 `useTrackPageView` only tracks the first page view ever

```tsx
export function useTrackPageView(path: string, title: string): void {
 const ref = useRef(false)
 useEffect(() => {
 if (ref.current) return // ← after first run, always returns
 ref.current = true
 track({ type: 'page_view', ... })
 }, [path, title, track])
}
```

`ref.current` is set to `true` on the first run and never reset. When `path` changes (SPA navigation), the effect re-runs but returns early. **Only the first page view is ever tracked.** Analytics for "page views" drastically undercount, making `pageViews[path]` and `totalViews` unreliable for any UX feature that consumes them.

#### Best-Practice Fix

In SPA analytics, the page-view tracking effect must fire on **every route change**, not just the first mount. The canonical pattern (used by GA4, Segment, TaggingDocs, Konektor) is:

```tsx
useEffect(() => {
  track({ type: 'page_view', path, title, ... })
}, [pathname])  // re-fires on every path change
```

Key principles from industry best practice:
1. **No ref guard**: The `useEffect` dependency array `[path]` already ensures the effect fires on mount AND on every SPA navigation. A `useRef(false)` guard that returns early after the first run defeats the entire purpose.
2. **Fire after mount**: `useEffect` runs after the new page has committed, so `document.title` and the current path are accurate (TaggingDocs: "push page_view after the new page has mounted, not on route change start").
3. **Include initial load**: The effect fires on mount (first render), so the initial page view is captured automatically (Konektor: "ensure your tracking code fires on component mount, not just on navigation").
4. **Cleanup for page_exit**: The effect cleanup should emit a `page_exit` event for the previous path before the new `page_view` fires (see section 5.5).


### 5.2 `usePageStats.dwellTime` hardcoded to 0

```tsx
export function usePageStats(path: string): { viewCount: number; dwellTime: number } {
 const viewCount = useAnalyticsStore((s) => s.pageViews[path] ?? 0)
 return { viewCount, dwellTime: 0 } // ← always 0
}
```

The signature promises dwell time but the implementation always returns `0`. Any UI displaying "average time on page" will always show zero.

#### Best-Practice Fix (P1-24: Dwell-time tracking)

Implement genuine foreground dwell-time measurement using the **Page Visibility API**: start a timer when the page becomes `visible`, pause on `hidden`, and emit the accumulated foreground duration on `page_exit` (visibilitychange→hidden, SPA navigation, or unload). GA4 models this as `user_engagement` time sent before the next `page_view`.

Key principles from dwell-time best practice:
1. **Page Visibility API, not time-between-events**: GA4's time-on-page is notoriously inaccurate because it measures time between events, not actual engagement; a background tab still counts as engaged time. `document.visibilityState` + `visibilitychange` captures genuine foreground time (TaggingDocs, webeyez).
2. **Pause on hidden, resume on visible**: on `visibilitychange` to `hidden`, accumulate `Date.now() - visibleStart` into `totalVisibleTime` and null the start; on `visible`, set `visibleStart = Date.now()` (TaggingDocs, MDN).
3. **Emit on `page_exit`**: the accumulated dwell time is emitted with the `page_exit` event (already wired in P0-8's `usePageVisibility`/`useScrollDepth` reset); the store records `dwellTime` per path and `usePageStats` reads it.
4. **`beforeunload` is unreliable**: browsers (especially mobile) can cancel it; prefer `visibilitychange`→`hidden` (which fires reliably) and/or `navigator.sendBeacon()` for the exit event (TaggingDocs, MDN).
5. **Guard `prerender`**: `document.visibilityState === 'prerender'` should not start the timer (TaggingDocs).
6. **`performance.getEntriesByType('visibility-state')`** for precise initial-background detection if accuracy is critical (GoogleChrome modern-web-guidance).


### 5.3 `useFeedback.submit` omits `type: 'feedback'`

```tsx
const submit = useCallback((v: 'up' | 'down') => {
 setVote(v)
 setSubmitted(true)
 addFeedback({
 targetId,
 targetType,
 vote: v,
 comment: comment || undefined,
 timestamp: Date.now(),
 sessionId: useAnalyticsStore.getState().sessionId,
 } as FeedbackEvent) // ← cast silences missing `type` field
}, [...])
```

The object passed to `addFeedback` has no `type` field. The `as FeedbackEvent` cast silences the TypeScript error. At runtime, the event is stored in `state.events` without a discriminator. Any consumer that switches on `event.type` will fail to recognize feedback events. **The discriminated union contract is broken.**

#### Best-Practice Fix

Discriminated unions require the discriminator field on **every** variant. The `type` field is the discriminant in `AnalyticsEvent`; omitting it breaks the union contract and makes `switch (event.type)` exhaustiveness checking useless.

Key principles from TypeScript best practice:
1. **Never cast away missing fields**: `as FeedbackEvent` suppresses the compiler error but does not add the field at runtime. The `satisfies` operator (TS 4.9+) is preferred over `as` because it catches mismatches at the construction site rather than deferring them (Stanza: "Use the `satisfies` operator when constructing union values to catch typos in the discriminant at the construction site").
2. **Every variant must include the discriminant**: `{ type: 'feedback', ... }` must be present in the object literal. The discriminant "must be a string literal, number literal, or boolean literal type. If it's typed as `string`, TypeScript can't narrow the union" (Stanza, TypeScript Handbook).
3. **Use `assertNever` for exhaustiveness**: In any `switch (event.type)` consumer, add a `default: assertNever(event)` case so TypeScript flags missing handlers at compile time (Better Stack, TypeScript Handbook).
4. **Remove the `as` cast entirely**: Once `type: 'feedback'` is added to the object literal, the cast is unnecessary and should be deleted.


### 5.4 `usePageVisibility` never emits page_exit on SPA navigation

The `page_exit` event fires only on `visibilitychange` (tab hidden). When the user navigates to another route (path changes) without hiding the tab, the previous page's dwell time is silently discarded. Makes dwell-time analytics fragmentary.

### 5.5 `useScrollDepth` / `usePageVisibility` don't reset on path change

`maxScrollRef` carries over the previous page's max scroll. If the user scrolled 80% on page A then navigated to page B, the first `page_exit` for B will report `maxScrollPercent: 80` even if they never scrolled. **Cross-page scroll-depth data is contaminated.**

#### Best-Practice Fix

The `useEffect` dependency array includes `[path]`, so React **does** re-run the effect on path change. The problem is that the effect setup does not reset `maxScrollRef.current = 0` and `startRef.current = Date.now()` at the top of the effect body. Additionally, the effect cleanup (which runs before the next setup) does not emit a `page_exit` for the old path.

Key principles from React best practice:
1. **Reset refs in the effect setup**: When the effect re-runs due to `[path]` changing, the first thing setup should do is reset `maxScrollRef.current = 0` and `startRef.current = Date.now()` (React docs: "After every commit with changed dependencies, React will first run the cleanup function with the old values, and then run the setup function with the new values").
2. **Emit page_exit in cleanup**: The effect cleanup function should fire `page_exit` for the **old** path (using the captured `path` from the previous render closure). This captures dwell time and scroll depth for the page the user is leaving, on every SPA navigation, not just on tab hide.
3. **Cleanup mirrors setup**: "The cleanup function should stop or undo whatever the setup function did" (React docs). Setup adds listeners and sets `startRef`; cleanup should emit the exit event and remove listeners.
4. **Consolidate scroll tracking**: `useScrollDepth.ts` and `usePageVisibility.ts` both implement identical scroll logic independently (section 5.23). They should be merged into a single hook that owns `maxScrollRef` and emits `page_exit` on cleanup.


### 5.6 Analytics store `getTopPages` cache bug

```tsx
getTopPages: (limit: number) => {
 const state = get()
 if (state._topPagesDirty || state._topPagesCache.length === 0) {
 const sorted = Object.entries(state.pageViews)
 .map(([path, views]) => ({ path, views }))
 .sort((a, b) => b.views - a.views)
 .slice(0, limit)
 set({ _topPagesCache: sorted, _topPagesDirty: false })
 return sorted
 }
 return state._topPagesCache.slice(0, limit) // ← cache may be shorter than limit
}
```

The cache is sliced to the **first requested** `limit`. If first called with `limit=2`, the cache holds 2 entries. A later call with `limit=5` hits the non-dirty branch and returns `cache.slice(0, 5)` - which is still only 2 entries. **Top-pages results shrink to the smallest limit ever requested.**

#### Best-Practice Fix

The cache should store the **full sorted result** (all pages), and callers should slice from the cached full result. The cache must never be shorter than the maximum possible limit.

```ts
getTopPages: (limit: number) => {
  const state = get()
  if (state._topPagesDirty) {
    const sorted = Object.entries(state.pageViews)
      .map(([path, views]) => ({ path, views }))
      .sort((a, b) => b.views - a.views)  // no .slice() here
    set({ _topPagesCache: sorted, _topPagesDirty: false })
    return sorted.slice(0, limit)  // slice on read, not on write
  }
  return state._topPagesCache.slice(0, limit)
}
```

Key principle: **Cache the full computation, slice on read.** Storing a sliced result in the cache means any subsequent request for a larger limit gets incomplete data. The dirty flag invalidates the cache; the slice is applied at the call site, not at the cache population site.

### 5.7 `sessionId` persisted forever

```tsx
sessionId: saved?.sessionId ?? generateSessionId(),
```

The session ID is saved to `localStorage` and reused across browser sessions indefinitely. All events over days/weeks are attributed to one "session". Makes session-scoped analytics (unique users per session, session duration, etc.) meaningless.

#### Best-Practice Fix (P1-22: Session ID expiration)

A session is a continuous block of activity within an **inactivity window** (30 min by default). The session ID must be regenerated per browser session and expire after an idle timeout : it must NOT be persisted to `localStorage` and reused across days/weeks. Session activity (any `track`/`addFeedback` event) resets the idle timeout.

Key principles from session-management best practice:
1. **Idle timeout (30 min)**: a session ends after 30 minutes of inactivity (GA4 default, OWASP "15-30 minutes for low risk applications"); any interaction resets the timer (GA4, OWASP, freedatalytics).
2. **Regenerate on new browser session**: `sessionId` belongs in `sessionStorage` (cleared when the tab/browser closes) or is regenerated on each top-level page load, NOT `localStorage` : persisting it forever collapses all visits into one session (NIST 800-63b).
3. **Session activity resets the idle timeout**: every `track`/`addFeedback` event updates `lastActivityAt`; on the next event, if `Date.now() - lastActivityAt > 30min`, generate a new `sessionId` before recording (GA4, OWASP).
4. **Absolute timeout (optional)**: NIST 800-63b permits an overall timeout limiting total session duration regardless of activity; for an analytics-only (non-auth) context, the idle timeout alone suffices (NIST, OWASP ASVS V3.3.2).
5. **Server-side enforcement is for auth sessions**: this is analytics-only (no auth), so client-side idle-timeout management is acceptable; OWASP's "enforce server-side" caveat applies to authenticated sessions, not anonymous analytics (OWASP).


### 5.8 `useSearch` navigates via `window.location.href`

```tsx
if (e.key === 'Enter' && results[selectedIndex]) {
 e.preventDefault()
 const href = results[selectedIndex].item.href
 close()
 window.location.href = href // ← full page reload
}
```

Full page reload on every search-result selection. Destroys SPA state, loses in-memory analytics store, visible flash. Should use Next.js `router.push()`.

#### Best-Practice Fix

In Next.js App Router, programmatic navigation must use `useRouter()` from `next/navigation` and `router.push(href)`. This performs client-side navigation without a full page reload, preserving SPA state, shared layouts, and in-memory stores.

```tsx
import { useRouter } from 'next/navigation'

const router = useRouter()
// In the Enter handler:
router.push(results[selectedIndex].item.href)
```

Key principles from Next.js best practice:
1. **Import from `next/navigation`, not `next/router`**: The App Router's `useRouter` is in `next/navigation`. The `next/router` module is for the Pages Router and will not work (Tevpro, JS Guide, Next.js docs).
2. **Never use `window.location.href` for internal navigation**: It triggers a full page reload, destroying all client state (Zustand stores, React Query caches, component state). `router.push()` fetches only the changed segments while preserving shared layouts (JS Guide: "Shared layouts don't re-render during navigation - only the changed page segments update").
3. **Prefetch for performance**: The `<Link>` component automatically prefetches routes as they become visible in the viewport. For programmatic navigation, `router.prefetch(href)` can be called proactively (Next.js docs).
4. **Security**: "You must not send untrusted or unsanitized URLs to `router.push`" (Next.js docs). Search result hrefs come from a controlled `SearchIndexEntry[]`, so this is safe.


### 5.9 `useHookFilter` "vendored" tier permanently broken

`hookRunsInTier(h, 'vendored')` always returns `false` in `types/hooks.ts`. `HookRecord` has no field that identifies a hook as vendored. The "Vendored (0)" filter chip is a dead control - toggling it produces zero results no matter what.

#### Best-Practice Fix (P1-21: Vendored tier : back the filter with data, or remove it)

A UI control that can never produce a result is dead surface area. The fix is to make tier membership **data-driven** from a typed manifest rather than a hardcoded predicate, so the compiler flags missing handlers and the filter reflects reality. If vendored hooks don't exist in the data, remove the chip entirely rather than ship a permanently-empty filter.

Key principles from type-safe data modeling best practice:
1. **Typed manifest as single source of truth**: define tier membership as a typed registry/manifest (`as const`), not scattered predicates; the `HookTier` union is the canonical set and tier checks must derive from it, not duplicate it (typescript.page, Unleash).
2. **No dynamic/constructed keys at runtime**: deriving tier names by string concatenation prevents static analysis and makes dead controls invisible; use literal-union keys so the compiler finds all references (Unleash).
3. **`assertNever` for exhaustiveness**: any `switch (tier)` consumer gets a `default: assertNever(tier)` so adding a new tier is a compile error until every consumer handles it (cf. P0-2 discriminated unions).
4. **Add a `tier`/`vendored` field to `HookRecord`**: `hookRunsInTier(h, 'vendored')` returns `false` because `HookRecord` has no field identifying a hook as vendored; either add the field to the data model and populate it from the source YAML, or remove the vendored chip.
5. **Fail loud on dead controls**: if a filter's predicate can never match, the filter should either be removed or backed by data : a permanently-zero chip erodes trust and clutters the UI.


### 5.10 SSR/hydration mismatches

**`theme-store.ts`:**
```tsx
function getInitialTheme(): Theme {
 if (typeof document !== 'undefined') {
 const attr = document.documentElement.getAttribute('data-theme')
 // ...
 }
 return 'dark' // ← server default
}
export const useThemeStore = create<ThemeStore>((set, get) => ({
 theme: getInitialTheme(), // ← runs at module-eval time
```
On the server, returns `'dark'`. On the client, may return `'light'` from `localStorage`. Server-rendered HTML has `theme='dark'` while client hydrates with `'light'` → FOUC + hydration warning.

**`analytics-store.ts`:**
```tsx
const saved = loadFromStorage() // ← runs at module-eval time
```
On the server, returns `null` (empty state). On the client, returns persisted data. Any component displaying `totalViews`, `pageViews`, etc. will mismatch between server and client render.

#### Best-Practice Fix

Zustand stores that read from `localStorage` at module-eval time will always cause SSR hydration mismatches because the server has no `localStorage`. The canonical fix is the **`skipHydration` + `hasHydrated` gate** pattern.

For **theme-store.ts**:
```ts
// Server renders with default 'dark'. The inline <script> in layout.tsx
// sets data-theme before React hydrates, so suppressHydrationWarning on <html>
// handles the attribute mismatch. But the Zustand store's `theme` state
// must also start as 'dark' on both server and client, then update in a
// useEffect after mount:
export const useThemeStore = create<ThemeStore>((set) => ({
  theme: 'dark',  // server and client both start with 'dark'
  // ...
}))
// Then in a client component:
useEffect(() => {
  const saved = localStorage.getItem('theme')
  if (saved === 'light' || saved === 'dark') {
    useThemeStore.getState().setTheme(saved)
  }
}, [])
```

For **analytics-store.ts**:
```ts
// Use skipHydration pattern: start with empty defaults on both server and
// client, then rehydrate from localStorage in a useEffect after mount.
const saved = null  // always null at module-eval time
export const useAnalyticsStore = create<InternalState>((set, get) => ({
  events: [],
  pageViews: {},
  // ... all defaults empty
  // Add a hasHydrated flag:
  _hasHydrated: false,
  _hydrate: () => {
    const data = loadFromStorage()
    if (data) set({ ...data, _hasHydrated: true })
    else set({ _hasHydrated: true })
  },
}))
// In a client-only provider component:
useEffect(() => {
  useAnalyticsStore.getState()._hydrate()
}, [])
```

Key principles from Zustand + Next.js best practice:
1. **Server and client first render must be identical**: "The server renders the component with the store's default. If the visible output depends on the persisted value, return `null` during SSR and the first client render. Stable HTML on both sides" (Maryan Mats).
2. **`skipHydration: true` + manual `rehydrate()`**: "Skip `zustand` re-hydration until `next.js` hydrates by setting `skipHydration: true` and calling `.persist.rehydrate()` inside a `useEffect` callback" (Zustand GitHub issue #938).
3. **`hasHydrated` flag**: Gate components that display persisted data behind `if (!hasHydrated) return null` or a loading state, so they don't render stale zeros on the server (Zustand issue #324, Maryan Mats).
4. **Don't use `persist` for request-scoped data**: "Persist is for browser memory, not for request initialization. It is not a substitute for fetching data on the server" (Maryan Mats).
5. **Avoid global stores for SSR**: "Avoid stuff that could change on client and server like: document or window, read/write stores on server, global stores (sharing data across requests)" (Zustand discussions).


### 5.11 Synchronous `localStorage.setItem` on every event

```tsx
track: (event: AnalyticsEvent) => {
 set((state) => { ... })
 saveToStorage(get()) // ← JSON.stringify of up to 2000 events, every call
}
```

`saveToStorage` runs `JSON.stringify` of up to 2000 events on every `track()` and `addFeedback()`. No batching, debouncing, or `requestIdleCallback`. Rapid events (playground category toggles) cause main-thread jank.

#### Best-Practice Fix (P2-47: Debounce `localStorage` writes with idle-until-urgent strategy)

Debounce storage writes so rapid events (playground toggles, scroll tracking) batch into a single `JSON.stringify` + `setItem` call. Use `requestIdleCallback` (with `setTimeout` fallback) to schedule the write during browser idle time, and flush on `beforeunload`/`visibilitychange` to guarantee no data loss.

Key principles from storage write performance best practice:
1. **Idle-until-urgent strategy**: Philip Walton: "It's much better to schedule the localStorage write for an idle time" using `requestIdleCallback` rather than debounce, because "this strategy guarantees the state gets saved even if the user is navigating away from the page."
2. **Debounce + flush on unload**: redux-storage-middleware: "Debounced/throttled writes, idle callback support" with `debounceMs: 300`. t3code PR #497: "Debounce Zustand store persistence (500ms); both flush pending writes on `beforeunload`."
3. **`requestIdleCallback` with `setTimeout` fallback**: Philip Walton: "only Chrome and Firefox support `requestIdleCallback()`. It's quite easy to write a fallback to `setTimeout`."
4. **Clear pending tasks on new write**: Philip Walton: "Clear pending writes since there are new changes to save. Schedule the save to run when idle." Only the most recent state is persisted : intermediate states are discarded.
5. **`ensureTasksRun: true` for unload safety**: Philip Walton's `IdleQueue({ ensureTasksRun: true })` ensures pending tasks execute even on navigation/unload.
6. **Zustand debounced storage**: `zustand-debounce` library: "By delaying and grouping write operations to storage, you can significantly reduce the number of write operations." `createDebouncedJSONStorage('localStorage', { debounceTime: 1000 })`.


### 5.12 Inconsistent event rotation

- `track`: `events.slice(ROTATE_COUNT)` - drops the oldest 500 when exceeding 2000, leaving ~1500
- `addFeedback`: `events.slice(-MAX_EVENTS)` - hard cap at 2000, dropping one at a time

Two different strategies in the same store. The `track` path can drop 500 events at once, losing feedback/playground events near the head.

#### Best-Practice Fix (P2-48: Consistent ring-buffer event rotation)

Unify both `track` and `addFeedback` to use the same rotation strategy: when `events.length > MAX_EVENTS`, drop the oldest single event (`events.slice(1)`) or use a proper ring buffer. Never drop 500 events at once.

Key principles from event log rotation best practice:
1. **Consistent strategy**: Both code paths must use the same rotation logic. The current `track` path drops 500 at once (`slice(ROTATE_COUNT)`) while `addFeedback` drops one at a time (`slice(-MAX_EVENTS)`) : this asymmetry is a bug factory.
2. **Ring buffer pattern**: OpenAlice's `EventLog`: "Push to ring buffer, truncate if over limit: `buffer.push(entry); if (buffer.length > bufferSize) { buffer = buffer.slice(buffer.length - bufferSize); }`." This drops one at a time, never a batch.
3. **Circular queue with `head`/`tail` pointers**: Reintech: "A circular queue connects the end back to the beginning, creating a continuous loop of available slots." Uses `(this.tail + 1) % this.capacity` for wraparound. "If full, oldest log is automatically discarded."
4. **`slice(-MAX_EVENTS)` is the simplest fix**: Always keep the last `MAX_EVENTS` entries. `events.slice(-MAX_EVENTS)` drops from the front, one at a time, in both `track` and `addFeedback`. No batch drops.
5. **Don't lose feedback events**: The current `track` path's `slice(ROTATE_COUNT)` can drop 500 events at once, potentially losing recent feedback events near the head of the array. One-at-a-time rotation preserves the most recent events.


### 5.13 `selectedIndex` not clamped on results change

When the user types more characters, `results` shrinks, but `selectedIndex` is only reset on `close()`. The index can point beyond the new result list. While the `Enter` guard (`results[selectedIndex]`) prevents a crash, the UI can highlight a stale/non-existent row.

#### Best-Practice Fix (P2-49: Clamp `selectedIndex` when results change)

Reset `selectedIndex` to `0` (or clamp to `Math.min(selectedIndex, results.length - 1)`) whenever the filtered results array changes. This is the standard combobox/autocomplete pattern.

Key principles from combobox best practice:
1. **Reset active index on input change**: ASOasis: "Reset `activeIndex` when items change" and "Flickering selection index: reset activeIndex when items change." On every `onInputChange`, set `setActiveIndex(0)`.
2. **Clamp on ArrowDown/ArrowUp**: ASOasis: `setActiveIndex(i => (i == null ? 0 : Math.min(last, i + 1)))` and `setActiveIndex(i => (i == null ? last : Math.max(0, i - 1)))`. The `Math.min`/`Math.max` clamps prevent out-of-bounds.
3. **Use `useEffect` or render-time reset**: When `deferredQuery` changes and `results` shrinks, reset `selectedIndex` to `0`. The P1-14 fix already uses a `prevDeferredQuery` render-time reset pattern; extend it to also clamp `selectedIndex`.
4. **`aria-activedescendant` must point to a valid option**: If `selectedIndex` points beyond the results array, `aria-activedescendant` references a non-existent option id, breaking the screen-reader association.


### 5.14 `useTopPages` bypasses store cache

```tsx
export function useTopPages(limit: number): { path: string; views: number }[] {
 const pageViews = useAnalyticsStore(useShallow((s) => s.pageViews))
 const entries = Object.entries(pageViews)
 .map(([path, views]) => ({ path, views }))
 .sort((a, b) => b.views - a.views)
 .slice(0, limit)
 return entries // ← no useMemo, recomputes every render
}
```

Re-sorts on the client, ignoring the store's `getTopPages` cache. No `useMemo` - every parent render produces a new `entries` array reference, causing unnecessary re-renders. Two code paths for the same computation; risk of divergence.

#### Best-Practice Fix (P2-50: Use store cache + `useMemo` for `useTopPages`)

Call `useAnalyticsStore.getState().getTopPages(limit)` inside a `useMemo` keyed on `pageViews` (selected via `useShallow`) and `limit`. This uses the store's cached sorted result instead of re-sorting on every render, and the `useMemo` prevents unnecessary re-renders from new array references.

Key principles from Zustand selector best practice:
1. **Move expensive computations out of selectors into `useMemo`**: Zustand docs: "Move expensive computations out of selectors and into your own `useMemo()`s." The sort in `useTopPages` is expensive; wrap it in `useMemo([pageViews, limit])`.
2. **Use the store's cached computation**: The store already has `getTopPages(limit)` with a dirty-flag cache (fixed in P0-3). `useTopPages` should call `getTopPages(limit)` instead of re-sorting independently : two code paths for the same computation risk divergence.
3. **`useShallow` for object/array selectors**: `const pageViews = useAnalyticsStore(useShallow((s) => s.pageViews))` prevents re-renders when the reference is stable. Then `useMemo(() => getTopPages(limit), [pageViews, limit])` memoizes the derived sorted result.
4. **Stable selector functions**: Zustand #971: "Defining selectors outside component will be most preferable. In the future version (v4), this style will be more performant than inline selectors." For shared expensive selectors across components, consider `proxy-memoize` (Zustand #758).
5. **Inline selectors are fine for simple cases**: Zustand #971: "inline selectors are just fine and recommended" for simple property access. But for derived/computed values, `useMemo` is the canonical pattern.


### 5.15 FeedbackWidget double-submits (see §4.11)

Single upvote + comment = two `addFeedback` calls. The store keeps growing with vote history per target.

### 5.16 `usePlayground.isDirty` semantics unclear

`toggleCategory` sets `isDirty=true` but it is only cleared on language change. Toggling a category off and back on leaves `isDirty=true`. If the UI uses this to warn about "unsaved changes", users see a false warning with no way to clear it short of switching languages.

### 5.17 `usePlayground.language` typed as plain `string`

No union of supported languages. Typos like `'javscript'` are accepted; downstream matchers may silently produce no matches.

### 5.18 `usePlayground` references `React.MutableRefObject` without importing React

```tsx
editorRef: React.MutableRefObject<EditorApi | null>
```

The file imports only named hooks (`useState`, etc.) and never imports the `React` namespace. Fragile and inconsistent. Same issue in `useScrollDepth.ts`.

### 5.19 `addFeedback` does not set `_topPagesDirty`

Technically fine (feedback doesn't touch `pageViews`), but the asymmetry (only `track` manages the dirty flag) is fragile. A future change that lets feedback affect page stats would silently break the cache.

### 5.20 `addFeedback` keeps history of differing votes

```tsx
const filtered = existing.filter((f) => f.vote !== event.vote)
return {
 feedback: { ...state.feedback, [event.targetId]: [...filtered, event] },
 // ...
}
```

`filtered` only removes same-vote entries, so an up-then-down sequence keeps both. `getUserVote` returns the last. The stored array grows with vote flips and is never pruned.

### 5.21 `dismiss` does not reset store state

`useFeedback.dismiss()` clears local UI state but leaves the persisted vote in the store. On next mount, `savedVote` re-hydrates the old vote, making "dismiss" feel non-persistent.

### 5.22 `usePageVisibility` has no `beforeunload`/`pagehide` handling

Closing the tab does not reliably fire `visibilitychange` on all browsers, so the final exit event is often lost.

### 5.23 Duplicated scroll tracking

`useScrollDepth.ts` and `usePageVisibility.ts` both implement the same scroll-depth logic independently. Two independent listeners doing the same work; risk of drift.

---

## 6. Accessibility Defects

### 6.1 Tabs (see §4.5)
No arrow-key navigation, no roving tabIndex, no aria-controls/aria-labelledby, unmounts inactive panels.

### 6.2 CollapsibleSection (see §4.6)
No aria-controls, no region role, unmounts content.

### 6.3 Icon (see §4.7)
Always aria-hidden, no semantic option, no title/aria-label prop.

### 6.4 WikiSidebar (see §4.8)
No aria-current, loose active matching, no mobile toggle.

### 6.5 WikiBreadcrumbs (see §4.9)
No aria-current, no `<ol>`, uses `<a>` not `<Link>`.

### 6.6 FeedbackAggregate (see §4.12)
No aria-labels, screen readers hear "5 2".

### 6.7 TierComparison (see §4.13)
aria-labels lack row/column context, no caption.

### 6.8 SearchModal
No focus trap - Tab can escape into background content. No body scroll lock. No Escape handler in the component (only in the hook). Empty `placeholder=""`.

### 6.9 `.search-modal__field` removes outline
```css
.search-modal__field {
 outline: none; /* ← no replacement focus ring */
}
```
Conflicts with the global `*:focus-visible` policy in `_a11y.css`. A11y regression for keyboard users.

#### Best-Practice Fix (P2-44: Replace `outline: none` with `focus-visible` ring)

Never remove an input's `outline` without providing a replacement focus indicator. Use `:focus-visible` to show a focus ring only for keyboard users (not mouse clicks), preserving the global a11y policy.

Key principle: **Every interactive element must have a visible focus indicator.** CSS-Tricks: "Removing `outline` without a replacement is an accessibility regression : keyboard users lose the ability to see where focus is." Use `outline: 2px solid var(--color-focus-ring)` on `:focus-visible`, or `box-shadow` as an alternative focus ring.

### 6.10 `.sr-only` uses deprecated `clip`
```css
.sr-only {
 clip: rect(0, 0, 0, 0); /* ← deprecated */
}
```
Modern best practice is `clip-path: inset(50%)`.

#### Best-Practice Fix (P2-45: Replace deprecated `clip` with `clip-path: inset(50%)`)

Replace `clip: rect(0, 0, 0, 0)` with `clip-path: inset(50%)` in the `.sr-only` class. The `clip` property is deprecated per MDN and causes linting errors in modern toolchains.

Key principles from visually-hidden CSS best practice:
1. **`clip-path: inset(50%)` replaces deprecated `clip`**: A11Y Collective: "Today's preferred method uses clipping instead of positioning: `clip-path: inset(50%)`." Tailwind GitHub #18768: "Replace the use of deprecated `clip` in `sr-only` with `clip-path: inset(50%)`, which preserves the intended visually-hidden behavior without using deprecated properties."
2. **Full modern `.sr-only` recipe**: `border: 0; clip-path: inset(50%); height: 1px; margin: 0; overflow: hidden; position: absolute; white-space: nowrap; width: 1px;` (A11Y Collective, Scott O'Hara).
3. **`white-space: nowrap`**: Prevents text wrapping that might expose hidden content (CSS-Tricks, A11Y Collective).
4. **`position: absolute`**: Removes from document flow but keeps accessible to screen readers.
5. **Consider `:not(:focus):not(:active)` variant**: For skip links and focusable hidden elements, use `.visually-hidden-focusable:not(:focus):not(:active)` so they become visible on keyboard focus (CSS-Tricks, A11Y Collective).
6. **Scott O'Hara's caveat**: "Visually hidden content is a hack that needs to be resolved, not enshrined" : use it judiciously for genuinely necessary AT-only content, not as a blanket solution.


### 6.11 Skip link
Misplaced (not first focusable - see §2.5). Wrong z-index token (`--z-search` instead of a dedicated `--z-skip-link`). Asymmetric border-radius assumes top-left placement.

### 6.12 `scroll-behavior: smooth` on `*`
Overly broad (should be on `html`). Overlaps with the reduced-motion policy without referencing it.

### 6.13 No `prefers-contrast`/`forced-colors` adjustments

### 6.14 No `aria-current` attribute selectors in CSS
All a11y state styling is coupled to JS-set classes (`.is-active`) rather than semantic ARIA attributes.

### 6.15 CategoryNav count not aria-live
Filter result count changes are not announced to screen readers.

### 6.16 Button loading state
No `aria-busy` attribute when `loading`. Spinner has `aria-hidden="true"` with no visually-hidden text alternative.

### 6.17 Toggle
`label` is simultaneously used as visible text AND `aria-label` - when a visible label is present, `aria-labelledby`/native text is preferred over a duplicate `aria-label`. No keyboard-interaction test (Space/Enter to toggle).

---

## 7. Security & Information Disclosure

### 7.1 Error boundaries show raw `error.message`

All 6 error boundary files display `error.message` directly to the user. This can leak internal paths, stack details, or implementation specifics.

#### Best-Practice Fix

Error boundaries should **never** render `error.message` or `error.stack` to the user. Internal details should be logged server-side; users should see a generic, context-specific message with a recovery path.

Key principles from OWASP and React best practice:
1. **Never pass `error.message` to the response body**: "Centralize all error handling so internal details are logged server-side and a safe, generic message is returned to the client. Never pass `error.message` or `error.stack` directly to the response body" (AuditBuffet pattern ab-000395, CWE-209, CWE-200).
2. **Log internally, display generically**: "When errors occur, the site should respond with a specifically designed result that is helpful to the user without revealing unnecessary internal details" (OWASP: Improper Error Handling).
3. **Use `componentDidCatch` for logging**: The React error boundary API provides `componentDidCatch(error, info)` specifically for side effects like logging to an error reporting service. `getDerivedStateFromError` is for state updates only, not side effects (React docs, Stanza, js-error.com).
4. **Be specific about what failed**: "Don't show the stack trace to the user. Log it; don't render it" and "Be specific about what failed: 'We couldn't load this chart' beats 'Something went wrong'" (Nazar Boyko).
5. **Provide a recovery path**: "Always provide a recovery path: a retry button that resets the boundary state, a link to navigate away, or automatic reset via `resetKeys` tied to the current route" (Stanza).
6. **Use `error.digest`**: Next.js provides `error.digest` (a hash of the error) that can be displayed to users as a reference code for support, without leaking internals.
7. **Consider `react-error-boundary` library**: Provides `fallbackRender`, `onError`, `onReset`, and `resetKeys` props for production-ready error handling without writing a custom class component (Kent C. Dodds, Stanza, js-error.com).


### 7.2 Integration page leaks absolute filesystem path

```tsx
throw new Error(`Integration documentation file not found: ${filePath}`)
// -> "Integration documentation file not found: <absolute filesystem path leaked>"
```

The full absolute filesystem path is displayed to the user in the error boundary.

#### Best-Practice Fix

Filesystem paths must never appear in user-facing error messages. This is CWE-209 (Generation of Error Message Containing Sensitive Information) and CWE-200 (Exposure of Sensitive Information to Unauthorized Actors).

Key principles from OWASP best practice:
1. **Log the path server-side, show a generic message**: "Centralize all error handling so internal details are logged server-side and a safe, generic message is returned to the client" (AuditBuffet, OWASP Cheat Sheet).
2. **Do not interpolate `filePath` into the error message**: Instead of `throw new Error('file not found: ${filePath}')`, use `throw new Error('Integration documentation is currently unavailable')` and log the full path via `console.error` for debugging.
3. **Revealing directory structure is a reconnaissance gift**: "A stack trace reveals internal library versions (useful for finding known CVEs), file system paths (useful for traversal attacks), database query structure (useful for injection), and internal service names" (AuditBuffet).
4. **Inconsistency reveals information**: "When a user tries to access a file that does not exist, the error message typically indicates 'file not found'. When accessing a file that the user is not authorized for, it indicates 'access denied'. The user is not supposed to know the file even exists, but such inconsistencies will readily reveal the presence or absence of inaccessible files or the site's directory structure" (OWASP: Improper Error Handling).
5. **Use `revalidate = 0` or no caching for error paths**: Currently `revalidate = 3600` means a missing file stays cached for an hour. A missing-file error should not be cached at all, or should use a very short revalidation window.


### 7.3 Checks empty state leaks developer tooling

```tsx
<p className="empty-state">
 No check documentation available. Run the extraction pipeline
 to generate api-docs.json and shell-docs.json.
</p>
```

References "extraction pipeline", "api-docs.json", "shell-docs.json" - implementation details not relevant to end users.

### 7.4 Guard empty state leaks environment variables

```tsx
<p className="guard-empty-state">
 No guard policy configs found at WORKSPACE_GUARD_CONFIG_ROOT.
 The guard tree is a soft dependency; check that the sibling
 WORKSPACE-GUARD repo is checked out.
</p>
```

References `WORKSPACE_GUARD_CONFIG_ROOT`, "soft dependency", "WORKSPACE-GUARD repo", "checked out" - developer/ops concepts.

### 7.5 `dangerouslySetInnerHTML` usage

`ContentRenderer.tsx` uses `dangerouslySetInnerHTML` (mitigated by `sanitizeHtml` / DOMPurify, but still a risk surface if sanitization is misconfigured). The `sanitize.ts` allowlist is reasonable but `FORBID_ATTR` includes `style` while `ALLOWED_ATTR` does not - the `style` attribute is both forbidden and not in the allowlist, which is correct but the dual specification is confusing.

### 7.6 `name` param not URL-decoded/validated

`/config/[name]`, `/guard/[name]`, `/hooks/[id]`, `/checks/[id]` - the param is used directly as a filesystem key downstream. While the loaders use `join()` (which normalizes path separators), there's no explicit validation against path traversal at the page level.

---

## 8. Test Coverage Gaps

### 8.1 Zero test coverage for defective hooks

The most defective hooks have **no tests**:
- `useTrackPageView` - the first-page-view-only bug (§5.1) is untested
- `usePageVisibility` - the no-exit-on-navigation bug (§5.4) is untested
- `useScrollDepth` - the no-reset-on-path-change bug (§5.5) is untested
- `usePageStats` - the hardcoded-zero dwellTime bug (§5.2) is untested

### 8.2 `useFeedback` test doesn't assert `type` field

The "emits analytics event" test checks `vote` and `totalFeedback` but never validates that `type: 'feedback'` is present. This is why the missing-`type` bug (§5.3) ships uncaught.

### 8.3 `useHookFilter` test never tests the `vendored` tier

Tests `strict` and `poc` counts but asserts nothing about `vendored`. The permanently-broken vendored tier (§5.9) is invisible.

### 8.4 `useSearch` test doesn't cover keyboard navigation

No tests for:
- `Enter` selection / `window.location.href` navigation
- `selectedIndex` clamping on results change
- `Escape` close
- `/` and `Ctrl+K` triggers

### 8.5 `usePlayground` test uses invalid `PatternCategory`

```tsx
{ line: 1, column: 0, lineText: 'test', pattern: 'test', reason: 'test', category: 'test' }
```

`category: 'test'` is not a valid `PatternCategory` - only works because `PatternMatch.category` is typed `string` (loose) rather than `PatternCategory`.

### 8.6 No tests for stores

- `analytics-store.test.ts` doesn't test the `getTopPages` cache bug (§5.6)
- `analytics-store.test.ts` doesn't test the `sessionId` persistence bug (§5.7)
- `theme-store.test.ts` doesn't test SSR initialization or hydration

### 8.7 No tests for UI components beyond basic rendering

- `Button.test.tsx`: no test for loading spinner, `aria-busy`, disabled-not-firing-onClick, ref forwarding
- `Toggle.test.tsx`: no keyboard-interaction test (Space/Enter)
- `Tabs.test.tsx`: no keyboard-navigation test
- `ErrorBoundary.test.tsx`: no test that "Try again" recovers, no test for custom fallback

### 8.8 Coverage thresholds not met for untested hooks

`vitest.config.ts` sets hooks coverage threshold at 95% lines, but 4 of 9 hooks have zero tests. The coverage gate would fail if it were actually enforced in CI.

---

## 9. Remediation Priority Matrix

### P0 - Critical (broken functionality, data loss, security)

| # | Issue | Section |
|---|-------|---------|
| 1 | `useTrackPageView` only tracks first page view | §5.1 |
| 2 | `useFeedback.submit` omits `type: 'feedback'` | §5.3 |
| 3 | Analytics `getTopPages` cache shrinks to smallest limit | §5.6 |
| 4 | `useSearch` navigates via `window.location.href` (full reload) | §5.8 |
| 5 | SSR/hydration mismatches in theme-store and analytics-store | §5.10 |
| 6 | Integration page leaks absolute filesystem path | §7.2 |
| 7 | Error boundaries show raw `error.message` | §7.1 |
| 8 | `usePageVisibility` / `useScrollDepth` don't reset on path change | §5.5 |
| 9 | FeedbackWidget double-submits | §5.15 |

### P1 - High (major UX defects, missing core features)

| # | Issue | Section |
|---|-------|---------|
| 10 | No design token system (spacing, typography, radius, shadow) | §1.1-1.4 |
| 11 | Inverted z-index hierarchy (modal below search) | §1.5 |
| 12 | No reusable component primitives (card, table, badge, input, modal, pill, icon-btn, kbd) | §1.6 |
| 13 | Loading states cause layout shift (no WikiShell wrapper) | §2.1 |
| 14 | Double search system (SearchTrigger + WikiSearch) | §4.1 |
| 15 | No copy-to-clipboard on any code block | §3.4 |
| 16 | No tooltips anywhere | §3.1 |
| 17 | No modals for information-dense content | §3.2 |
| 18 | Playground drops WikiShell | §2.4 |
| 19 | Skip link misplaced | §2.5 |
| 20 | Missing route boundaries (tiers, integration, tooling, playground) | §2.3 |
| 21 | `useHookFilter` "vendored" tier permanently broken | §5.9 |
| 22 | `sessionId` persisted forever | §5.7 |
| 23 | Tabs missing keyboard navigation (WAI-ARIA) | §4.5 |
| 24 | `usePageStats.dwellTime` hardcoded to 0 | §5.2 |

### P2 - Medium (consistency, polish, accessibility)

| # | Issue | Section |
|---|-------|---------|
| 25 | `_buttons.css` is a 383-line dumping ground | §1.7 |
| 26 | Dead duplicate import manifest (`shared.css`) | §1.8 |
| 27 | Tailwind v4 utility collision | §1.9 |
| 28 | Heading-level chaos across pages | §2.7 |
| 29 | No empty states on most list pages | §2.10 |
| 30 | Sync I/O in async pages | §2.11 |
| 31 | Home page truncates README mid-token | §2.11 |
| 32 | No `generateMetadata` on dynamic routes | §2.15 |
| 33 | Near-duplicate error/not-found files (no shared shell) | §2.9 |
| 34 | HookBadge dead `variant` prop | §4.2 |
| 35 | PatternCard numeric index as DOM id | §4.3 |
| 36 | ErrorBoundary swallows errors (no componentDidCatch, no fallback) | §4.4 |
| 37 | CollapsibleSection missing aria wiring | §4.6 |
| 38 | Icon always aria-hidden | §4.7 |
| 39 | WikiSidebar missing aria-current, loose active matching | §4.8 |
| 40 | WikiBreadcrumbs uses `<a>` not `<Link>`, no `<ol>`, no aria-current | §4.9 |
| 41 | Multiple components use `<a>` not `<Link>` | §4.9-4.10, §2.13 |
| 42 | No intro/explanatory text on list pages | §3.3 |
| 43 | No `prefers-color-scheme` detection | §1.14 |
| 44 | `.search-modal__field` removes outline | §6.9 |
| 45 | `.sr-only` uses deprecated `clip` | §6.10 |
| 46 | No mobile sidebar toggle | §2.14 |
| 47 | Synchronous `localStorage.setItem` on every event | §5.11 |
| 48 | Inconsistent event rotation strategies | §5.12 |
| 49 | `selectedIndex` not clamped on results change | §5.13 |
| 50 | `useTopPages` bypasses store cache, no useMemo | §5.14 |

### P3 - Low (code quality, minor polish)

| # | Issue | Section |
|---|-------|---------|
| 51 | Incomplete light theme variables | §1.13 |
| 52 | WebKit-only scrollbar | §1.12 |
| 53 | Incomplete motion policy (split across files) | §1.10 |
| 54 | Inconsistent transition style (`all` vs targeted) | §1.11 |
| 55 | Heading content is raw identifiers (no humanization) | §2.8 |
| 56 | `VALID_CATEGORIES` duplicated from type system | §2.16 |
| 57 | `getGuardConfigEntries` not awaited (inconsistency) | §2.17 |
| 58 | Tooling page badge ordering, pointless template literal | §2.18 |
| 59 | Empty search placeholder | §3.5 |
| 60 | Check detail doesn't render docstrings as markdown | §3.7 |
| 61 | Check detail captures `line` but never displays it | §3.8 |
| 62 | ContentRenderer no error handling, no syntax highlighting | §4.14 |
| 63 | StatsBar hydration mismatch risk | §4.15 |
| 64 | CategoryNav missing aria-live, no disabled state on select-all/deselect-all | §4.16 |
| 65 | StageFilter/TierFilter missing reset and tooltips | §4.17 |
| 66 | CodeEditor destroys/recreates on language change | §4.19 |
| 67 | MatchPanel line number coloring inconsistent | §4.20 |
| 68 | `usePlayground.isDirty` semantics unclear | §5.16 |
| 69 | `usePlayground.language` typed as plain string | §5.17 |
| 70 | `React.MutableRefObject` without importing React | §5.18 |
| 71 | `addFeedback` doesn't set `_topPagesDirty` | §5.19 |
| 72 | `addFeedback` keeps history of differing votes | §5.20 |
| 73 | `dismiss` doesn't reset store state | §5.21 |
| 74 | No `beforeunload`/`pagehide` handling | §5.22 |
| 75 | Duplicated scroll tracking | §5.23 |
| 76 | Test coverage gaps (see §8) | §8 |
| 77 | Empty-state text leaks implementation details | §7.3-7.4 |
| 78 | `name` param not URL-decoded/validated | §7.6 |

---

## Summary

The wiki web UI was scaffolded with all routes, components, hooks, stores, lib functions, CSS, and tests present and passing (tsc, eslint, 97 vitest tests, banned-words gate). However, the implementation suffers from:

1. **No design language** - zero token system for spacing, typography, radius, shadow; rampant component CSS duplication; inverted z-index; no reusable primitives.
2. **Broken layouts** - loading states cause CLS; playground drops the shell; skip link misplaced; heading-level chaos; missing route boundaries.
3. **Zero descriptive text/tooltips/modals** - no tooltips, no modals beyond search, no intro text, no copy-to-clipboard, empty search placeholder.
4. **Component defects** - double search system; dead props; numeric index IDs; ErrorBoundary swallows errors; Tabs/CollapsibleSection missing aria wiring.
5. **Critical data bugs** - page view tracking broken; feedback `type` field missing; cache shrinks; full-reload search navigation; vendored tier dead; SSR mismatches; sessionId persisted forever.
6. **Accessibility gaps** - 17 distinct a11y defects across components and CSS.
7. **Security disclosure** - raw error messages, absolute paths, dev tooling references leaked to users.
8. **Test coverage gaps** - the most defective hooks have zero tests; existing tests don't cover the bug paths.

**Total defects identified: 78** (9 P0 critical, 15 P1 high, 26 P2 medium, 28 P3 low).

---

## 10. Best-Practice References

The following authoritative sources were consulted to validate the fix recommendations in this audit. Each P0 issue section (§5.1, §5.3, §5.5, §5.6, §5.8, §5.10, §7.1, §7.2, §4.11) and each P1 issue section (§1.1-1.4, §1.5, §1.6, §2.1, §2.3, §2.4, §2.5, §3.1, §3.2, §3.4, §4.1, §4.5, §5.2, §5.7, §5.9) and each P2 issue section (§1.7, §1.8, §1.9, §1.14, §2.7, §2.9, §2.10, §2.11, §2.14, §2.15, §3.3, §4.2, §4.3, §4.4, §4.6, §4.7, §4.8, §4.9, §4.10, §5.11, §5.12, §5.13, §5.14, §6.9, §6.10) now includes an inline "Best-Practice Fix" subsection citing these sources.

### 10.1 SPA Page-View Tracking

| Source | URL | Key Insight |
|--------|-----|-------------|
| TaggingDocs: SPA Setup | https://taggingdocs.com/client-side/setup/spa-setup/ | Push page_view after the new page has mounted, not on route change start. Fire on initial load, not just navigation. |
| Konektor: SPA Tracking | https://konektor.id/en/docs/spa | Route changes are tracked via useEffect + pathname dependency. Initial load is captured by mount. |
| dev.to: Tracking Page Views in React SPA | https://dev.to/highcenburg/tracking-page-views-in-a-react-spa-with-google-analytics-4-1bd7 | useEffect with [location] dependency re-fires on every route change. No ref guard needed. |
| React: useEffect Reference | https://react.dev/reference/react/useEffect | Cleanup runs with old values before setup runs with new values. Effect fires on mount and on dependency change. |

### 10.2 TypeScript Discriminated Unions

| Source | URL | Key Insight |
|--------|-----|-------------|
| TypeScript Handbook: Unions and Intersection Types | https://www.typescriptlang.org/docs/handbook/unions-and-intersections.html | The discriminant must be a literal type. Switch on it to narrow. Use `never` for exhaustiveness. |
| Stanza: TypeScript Discriminated Unions | https://www.stanza.dev/concepts/typescript-discriminated-unions | Use `satisfies` operator (TS 4.9+) to catch discriminant typos at construction site. Pick one discriminant name per codebase. |
| Better Stack: Discriminated Unions | https://betterstack.com/community/guides/scaling-nodejs/discriminated-unions/ | Use `assertNever` helper for compile-time exhaustiveness checking. Every variant must include the discriminant. |
| Growth OS: Typed Event Tracking | https://www.growthos.fyi/guides/typed-event-tracking | Define event schema as TypeScript types with base context. Type-safe tracking function with autocomplete and compile-time validation. |

### 10.3 React Error Boundaries

| Source | URL | Key Insight |
|--------|-----|-------------|
| React: Error Boundaries | https://legacy.reactjs.org/docs/error-boundaries.html | `getDerivedStateFromError` for state, `componentDidCatch` for logging. Class components only. |
| react-error-boundary (npm) | https://www.npmjs.com/package/react-error-boundary | Production-ready: `fallbackRender`, `onError`, `onReset`, `resetKeys` props. `resetKeys` auto-resets on route change. |
| Nazar Boyko: Error Boundaries in Real Applications | https://www.nazarboyko.com/articles/react-error-boundaries-in-real-applications | Don't show stack trace to user. Log it, don't render it. Be specific about what failed. Provide recovery path. |
| Stanza: React Error Boundaries | https://www.stanza.dev/concepts/react-error-boundaries | Use `react-error-boundary` library. Place boundaries at multiple levels. Connect `onError` to monitoring. Always pair with retry/navigation. |
| js-error.com: Implementing for Production | https://js-error.com/core-javascript-error-handling-boundaries/implementing-react-error-boundaries-for-production/ | `resetKeys` for route-based recovery. `componentDidCatch` for observability. Fallback must preserve layout stability. |
| Kent C. Dodds: Use React Error Boundary | https://kentcdodds.com/blog/use-react-error-boundary-to-handle-errors-in-react | `react-error-boundary` gives all tools needed. `resetKeys` for automatic reset. `useErrorBoundary` hook for event handler errors. |

### 10.4 SSR / Hydration (Zustand + Next.js)

| Source | URL | Key Insight |
|--------|-----|-------------|
| Zustand: SSR and Hydration | https://zustand.docs.pmnd.rs/learn/guides/ssr-and-hydration | Official guide for SSR-safe Zustand stores. |
| Zustand: Setup with Next.js | https://zustand.docs.pmnd.rs/learn/guides/nextjs | App Router integration with context provider pattern. |
| Zustand GitHub #938: Wait for Next.js rehydration | https://github.com/pmndrs/zustand/issues/938 | Use `skipHydration: true` and call `.persist.rehydrate()` in `useEffect`. |
| Zustand GitHub #1377: localStorage persist hydration errors | https://github.com/pmndrs/zustand/issues/1377 | Server and client first render must be identical. Use `useHasHydrated` hook to conditionally render. |
| Zustand GitHub #324: SSR issues with persisting data | https://github.com/pmndrs/zustand/issues/324 | Don't set persisted values in DOM during SSR. Use `useHasHydrated` hook. |
| Maryan Mats: Why Zustand Breaks in Next.js | https://maryanmats.com/blog/why-zustand-breaks-in-nextjs/ | `skipHydration` + `hasHydrated` flag. Return null during SSR and first client render. Don't use `persist` for request-scoped data. Avoid `ssr: false` as first fix. |

### 10.5 Next.js App Router Navigation

| Source | URL | Key Insight |
|--------|-----|-------------|
| Next.js: useRouter | https://nextjs.org/docs/app/api-reference/functions/use-router | `router.push()` for client-side navigation. Import from `next/navigation`, not `next/router`. Don't send untrusted URLs. |
| Tevpro: Next.js useRouter Best Practices | https://tevpro.com/next-js-app-router-userouter-guide-client-side-navigation-refreshing-data-and-best-practices/ | `router.push()` performs client-side navigation without full page reload. Never use `window.location.href`. |
| JS Guide: Navigation & Linking | https://www.jsguide.dev/topic/nextjs-navigation-linking | Shared layouts don't re-render during navigation. Only changed page segments update. Use `usePathname()` for active link styling. |
| Osama Qarem: next/router to next/navigation migration | https://osamaqarem.com/blog/userouter-from-the-pages-router-to-the-app-router | `usePathname`, `useSearchParams`, `useParams` replace `router` object properties. `router.events` has no direct replacement. |

### 10.6 Security / Error Information Disclosure

| Source | URL | Key Insight |
|--------|-----|-------------|
| OWASP: Improper Error Handling | https://owasp.org/www-community/Improper_Error_Handling | Detailed internal error messages (stack traces, database dumps, error codes) should never be displayed to users. Inconsistencies reveal site structure. |
| OWASP Cheat Sheet: Error Handling | https://cheatsheetseries.owasp.org/cheatsheets/Error_Handling_Cheat_Sheet.html | Centralize error handling. Log details server-side. Return generic response to client. Use RFC 7807 Problem Details. |
| OWASP Top 10 2025 A10: Mishandling of Exceptional Conditions | https://owasp.org/Top10/2025/A10_2025-Mishandling_of_Exceptional_Conditions/ | Catch every system error. Throw user-understandable errors. Log the event. Global exception handler. Monitoring/observability. |
| AuditBuffet: Error responses do not leak stack traces | https://auditbuffet.com/patterns/ab-000395 | CWE-209, CWE-200. Never pass `error.message` or `error.stack` to response body. Log server-side, return generic message. |
| OWASP WSTG: Testing for Error Handling | https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/08-Testing_for_Error_Handling/ | Test for improper error handling and stack traces. |

### 10.7 Idempotent UI / Double-Submit Prevention

| Source | URL | Key Insight |
|--------|-----|-------------|
| Unpacked: Idempotent UI Actions | https://unpacked.danielhowells.com/concurrent-ui/idempotent-ui-actions | Disable-on-submit prevents accidental double-clicks. `SET_FAVORITE(true)` is idempotent; `TOGGLE_FAVORITE` is not. Prefer explicit state-setting over toggles. |
| OpenReplay: How to Prevent Double Form Submissions | https://blog.openreplay.com/prevent-double-form-submissions/ | Disable button + loading indicator. Re-enable on error. Track submission state with data attributes. Debounce rapid submissions. |
| how2: Idempotency Keys in React | https://how2.sh/posts/how-to-prevent-double-form-submission-in-react-with-idempotency-keys/ | UI guards reduce accidental double-clicks; server-side idempotency keys prevent duplicate writes. `useRef` for key, not recomputed on each render. |
| FeedValue: Reaction Buttons | https://docs.feedvalue.com/guide/reaction-buttons | Disable buttons during submission (`isSubmitting`). Show success state after. Follow-up trigger only on negative reactions (default). |

### 10.8 Scroll Restoration / Analytics Reset on Route Change

| Source | URL | Key Insight |
|--------|-----|-------------|
| dev.to: Scroll Restoration in React Router | https://dev.to/tene/scroll-restoration-in-react-router-4gnm | `useLayoutEffect` with `[pathname]` dependency resets scroll on route change. Fires only on route change, not query/hash/re-render. |
| Frontend Routing: Scroll Restoration Strategies | https://www.frontend-routing.com/history-api-state-management/scroll-restoration-strategies/ | `useEffect` with `[pathname]` for scroll state. `requestAnimationFrame` or `ResizeObserver` to wait for layout. Coordinate with `popstate`. |
| react.wiki: useEffect Cleanup Function | https://react.wiki/hooks/use-effect-cleanup/ | Cleanup runs before next effect setup and on unmount. Ensures no dangling listeners/timers/subscriptions. Mirror setup in cleanup. |

### 10.9 Design Token Systems (P1-10)

| Source | URL | Key Insight |
|--------|-----|-------------|
| Xerobit: CSS Design Tokens | https://xerobit.dev/blog/design-tokens-css/ | rem-based 4px spacing grid (`--space-1`…`--space-24`), type scale, shadow + radius tokens as CSS custom properties. |
| Alex Mayhew: Design Tokens Beyond Color | https://alexmayhew.dev/blog/design-tokens-comprehensive | Three layers: primitive → semantic → component. Contextual spacing semantics (`--space-inset-*`, `--space-stack-*`). DTCG format. |
| Lucky Graphics: Typography Scale System | https://lucky.graphics/learn/typography-scale-system-guide/ | Modular scale steps (`--font-size--2`…`--font-size-6`); semantic aliases (`--text-heading-1`); line-height + letter-spacing tokens. |
| modern-ai-web-design: CSS Type System | https://modern-ai-web-design.hashnode.dev/implementing-a-css-type-system-with-custom-properties-a-production-pattern | Dark mode overrides color values only; type scale/family/spacing unchanged. Component tokens override semantic layer locally. |
| FrontendTools: CSS Variables Guide | https://www.frontendtools.tech/blog/css-variables-guide-design-tokens-theming-2025 | Separate primitive from semantic tokens. Organize by category. Keep variables close to usage. |

### 10.10 Z-Index & Stacking Context (P1-11)

| Source | URL | Key Insight |
|--------|-----|-------------|
| CSS-Tricks: The Value of z-index | https://css-tricks.com/the-value-of-z-index/ | Tokenize z-index into layers. Use `calc()` to bind related elements (overlay + background). Local tokens for internal positioning. |
| Nitesh Seram: The z-index problem | https://niteshseram.in/writing/z-index-problem | Six layers as tokens. `isolation: isolate` for local contexts. Modals/tooltips via portals/top-layer. Lint rule bans magic numbers. |
| ttoss: Z-Index Tokens | https://ttoss.dev/docs/design/design-system/design-tokens/families/z-index | Strata not components. Core numeric levels + semantic roles (`base`/`sticky`/`overlay`/`blocking`/`transient`). Don't create component-specific tokens. |
| 7onic: Z-Index Tokens | https://7onic.design/design-tokens/z-index | `z-sticky` < `z-dropdown` < `z-overlay` < `z-modal` < `z-popover` < `z-tooltip` < `z-toast`. Portal modals to body. |
| MDN: Stacking context | https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Positioned_layout/Stacking_context | Stacking contexts are atomic; child z-indexes only matter within parent. opacity/transform/filter/isolation create contexts. |

### 10.11 CSS Component Primitives & Cascade Layers (P1-12)

| Source | URL | Key Insight |
|--------|-----|-------------|
| MDN: @layer | https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@layer | Cascade layers create precedence planes; later layer beats earlier regardless of specificity. Unlayered styles always win over layered. |
| Chrome for Developers: Cascade layers | https://developer.chrome.com/blog/cascade-layers | `@layer base, components, utilities;` replaces BEM-specificity hacks. Import with `layer()` function. |
| CSS-Tricks: BEM 101 | https://css-tricks.com/bem-101/ | Block/Element/Modifier (`block`, `block__element`, `block--modifier`). Flat specificity. Modifiers always with base class. |
| Scalable CSS: BEM Quickstart | https://www.scalablecss.com/bem-quickstart-guide/ | Name by purpose not state. Elements depend on parent block. Modifiers on both blocks and elements. Never use modifier in isolation. |
| horde-design-system | https://github.com/Haidra-Org/horde-design-system | Primitives: `.badge`, `.card`, `.table-*` micro-primitives. Local `@layer components` extends shared system. |
| DEV: @layer in Tailwind | https://dev.to/werliton/youve-been-using-layer-in-tailwind-css-wrong-this-whole-time-1ke5 | `@layer base` (resets) → `components` (`.btn`/`.card`) → `utilities` (overrides, highest priority). |

### 10.12 Next.js Loading, Suspense & CLS (P1-13)

| Source | URL | Key Insight |
|--------|-----|-------------|
| Next.js: loading.js | https://nextjs.org/docs/app/api-reference/file-conventions/loading | Nested inside layout; wraps page+children in Suspense. Shared layouts remain interactive. Navigation is interruptible. |
| Juliano Alves: Streaming and Suspense | https://julianoalves.me/blog/nextjs-streaming-suspense | `loading.tsx` for route-level fallback; inline Suspense for granular. Poor fallbacks hurt CLS : match dimensions. Pair with `error.tsx`. |
| dev.to: loading.tsx CLS issues | https://dev.to/homielab/how-loadingtsx-in-nextjs-caused-massive-cls-issues-and-hurt-my-seo-4n0c | Minimal loading.tsx + tall dynamic pages = massive CLS. Skeletons must mimic final layout height/structure. |
| Next.js Launchpad: Streaming & Suspense | https://nextjslaunchpad.com/article/nextjs-streaming-suspense-complete-guide-loading-ui-skeleton-states-progressive-rendering | Skeleton must occupy same dimensions as final content. Grid with explicit rows prevents shifts. CLS < 0.1. |
| 72Technologies: Streaming Suspense | https://www.72technologies.com/blog/streaming-suspense-boundaries-nextjs-ttfb | Don't wrap LCP element. Below-the-fold rarely benefits. Fallback must be dimensionally accurate, not "close enough". |
| dev.to: Optimizing App Router for Core Web Vitals | https://dev.to/aon_infotech_3a1b6ff525fc/optimizing-nextjs-app-router-for-core-web-vitals-a-practical-guide-11if | Every Suspense fallback must be dimensionally identical to what it replaces. `next/font` eliminates FOUT CLS. |

### 10.13 Copy-to-Clipboard (P1-15)

| Source | URL | Key Insight |
|--------|-----|-------------|
| cr0x.net: Copy to Clipboard Button States | https://cr0x.net/en/copy-to-clipboard-button-states/ | State machine idle/copying/copied/failed. `aria-live` for announcements. Don't say "Copied" before Promise resolves. |
| MDN: Clipboard.writeText() | https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText | Async Promise; secure context only; `NotAllowedError` if not allowed. |
| web.dev: How to copy text | https://web.dev/patterns/clipboard/copy-text | `navigator.clipboard.writeText` new way; `document.execCommand('copy')` legacy fallback with hidden textarea. |
| juanchi.dev: clipboard TypeScript fails | https://juanchi.dev/en/blog/clipboard-api-typescript-fails-undocumented-cases-copytext | Always implement execCommand fallback (iOS Safari, iframes, HTTP). Call writeText directly in handler : async intermediaries break gesture context. |
| Primer: Copy | https://primer-docs-preview.github.com/product/scenario-patterns/copy/ | Shared CopyToClipboardButton wraps write/confirmation/tooltip/announcement. Icon swap + visually-hidden live region. |
| PatternFly: Clipboard copy accessibility | https://www.patternfly.org/components/clipboard-copy/accessibility/ | Tooltip updates after copy. Tab/Shift+Tab navigation. Space+Enter activate. `aria-label` names the content. |

### 10.14 Accessible Tooltips (P1-16)

| Source | URL | Key Insight |
|--------|-----|-------------|
| W3C WAI: Tooltip Pattern | https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/ | `role="tooltip"` + `aria-describedby`. Focus stays on trigger. Escape dismisses. Appears on focus and hover. |
| MDN: tooltip role | https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/tooltip_role | 1-5s delay. Opens on hover/focus, closes on blur/mouseout. Stays open when hovering tooltip itself. Supplement to native `title`. |
| CSS-Tricks: Tooltip Best Practices | https://css-tricks.com/tooltip-best-practices/ | Non-modal, text-only, no interactive content. `aria-labelledby` to label, `aria-describedby` to describe. Don't use `title` or `aria-haspopup`. |
| A11yPath: Tooltip Pattern | https://a11ypath.com/patterns/tooltip/ | WCAG 1.4.13: dismissible, hoverable, persistent. `:focus-within` for keyboard parity. `title` fails every WCAG requirement. |
| mgifford: Tooltip Accessibility | https://mgifford.github.io/ACCESSIBILITY.md/examples/TOOLTIP_ACCESSIBILITY_BEST_PRACTICES.html | Unique `id` per tooltip. `hidden`/`display:none` to conceal until triggered (not `aria-hidden` on active). 4.5:1 contrast. |
| Deque: Tooltip | https://dequeuniversity.com/library/aria/tooltip | `showOnFocus` + `keepTooltipOnMouseOver` defaults true. Triggered by both focus and hover. |

### 10.15 Modal Dialogs (P1-17)

| Source | URL | Key Insight |
|--------|-----|-------------|
| W3C WAI: Dialog (Modal) Pattern | https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ | Background inert. Focus trapped inside. Focus to first element on open, back to trigger on close. `aria-modal="true"`. |
| W3C WAI: H102 HTML dialog element | https://www.w3.org/WAI/WCAG21/Techniques/html/H102 | Native `<dialog>`: browser handles focus move/return, focus limit, inert background, Escape, `::backdrop`. |
| W3C WAI: Modal Dialog Example | https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/dialog/ | Initial focus placement depends on content. `aria-describedby` for static descriptive text. Focus restoration maintains point of regard. |
| MDN: aria-modal | https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-modal | Tells AT background is inert; doesn't make it so : developer must implement focus trap + `inert`. |
| A11yPath: Modal Dialog | https://a11ypath.com/patterns/modal/ | Native `<dialog>` + `showModal()` gives focus trap, Escape, inert bg, focus restoration, `role="dialog"`. Backdrop-click needs JS. |
| UXPin: Accessible Modals with Focus Traps | https://www.uxpin.com/studio/blog/how-to-build-accessible-modals-with-focus-traps/ | `role="dialog"` + `aria-modal` + `aria-labelledby`. `inert` attribute for background. Native `<dialog>` recommended for new projects. |

### 10.16 WAI-ARIA Tabs Pattern (P1-23)

| Source | URL | Key Insight |
|--------|-----|-------------|
| W3C WAI: Tabs Pattern | https://www.w3.org/WAI/ARIA/apg/patterns/tabs/ | `tablist`/`tab`/`tabpanel`. Arrow keys move focus (wrap). Home/End optional. `aria-controls`/`aria-labelledby` bidirectional. `aria-selected`. |
| W3C WAI: Tabs Manual Activation | https://www.w3.org/WAI/ARIA/apg/patterns/tabs/examples/tabs-manual/ | Manual activation recommended unless all panel content present. Space/Enter activates. Roving `tabindex`. |
| W3C WAI: Tabs Automatic Activation | https://www.w3.org/WAI/ARIA/apg/patterns/tabs/examples/tabs-automatic/ | Auto-activate only when panels display instantly. Right/Left activates newly focused tab. |
| MDN: tab role | https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/tab_role | Active tab `tabindex="0"`+`aria-selected="true"`; others `tabindex="-1"`+`aria-selected="false"`. Coordinate on selection. |
| A11yPath: Tabs Pattern | https://a11ypath.com/patterns/tabs/ | Roving tabindex: Tab enters tablist on active tab, Tab again enters panel. `aria-controls` lets JAWS jump tab→panel. `hidden` not unmount. |
| W3C WAI: Keyboard Interface | https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/ | Roving `tabindex` strategy: active=0, others=-1, move focus with arrows. Alternative: `aria-activedescendant`. |

### 10.17 Session Management & Expiration (P1-22)

| Source | URL | Key Insight |
|--------|-----|-------------|
| OWASP: Session Management Cheat Sheet | https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html | Idle timeout 2-5 min (high-value) / 15-30 min (low risk). Invalidate both sides on expiry. Server-side enforcement for auth. |
| NIST 800-63b: Session Management | https://pages.nist.gov/800-63-4/sp800-63b/session/ | Overall + inactivity timeouts. Activity resets inactivity timeout; reauth resets both. Cookies HttpOnly, Secure, `__Host-` prefix. |
| OWASP ASVS V3: Session Management | https://asvs.dev/v4.0.3/V3-Session-management/ | V3.3.2: re-auth periodically when actively used or after idle. NIST permits longer timeouts; shorter = lower bound. |
| Google Analytics: About sessions | https://support.google.com/analytics/answer/9191807 | Session starts on first pageview/screen, ends after 30 min inactivity. `session_start` event generates `ga_session_id`. No length limit. |
| freedatalytics: Session in Web Analytics | https://freedatalytics.com/wiki/session/ | `session_duration = last_interaction − first_interaction`. Idle tail doesn't count. One user, multiple sessions per day. |
| Google: UA session definition | https://support.google.com/analytics/answer/2731565 | 30-min inactivity timeout reset by each interaction. Midnight cutoff. Campaign source change opens new session. |

### 10.18 Dwell Time & Page Visibility API (P1-24)

| Source | URL | Key Insight |
|--------|-----|-------------|
| MDN: Page Visibility API | https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API | `visibilitychange` event + `document.visibilityState` (visible/hidden/prerender). Hidden→visible transition for analytics. |
| MDN: Using the Page Visibility API | https://developer.mozilla.org/en-US/blog/using-the-page-visibility-api/ | Page hidden = last observable event; treat as session end. Store state on hide, restore on show. |
| TaggingDocs: Track Tab Visibility | https://taggingdocs.com/recipes/interaction-tracking/track-tab-visibility/ | `visible_seconds` more accurate than GA4 engagement time. `beforeunload` unreliable : use `sendBeacon`. Debounce rapid switches. Guard `prerender`. |
| webeyez: GA4 Time on Page guide | https://webeyez.com/insights/guides/google-analytics-time-on-page-ga4-guide | GA4 has no native time-on-page. Dwell-time via Page Visibility + custom `time_on_page` events with `duration_ms`/`page_path`. |
| Google: Measure SPAs | https://developers.google.com/analytics/devguides/collection/ga4/single-page-applications | `user_engagement` sent before next `page_view`; engagement time for previous page calculated and attached. Virtual page views via History API. |
| GoogleChrome: detect initial visibility state | https://github.com/GoogleChrome/modern-web-guidance-src/blob/main/guides/performance/detect-initial-visibility-state/guide.md | `performance.getEntriesByType('visibility-state')` for precise history. `document.visibilityState` at exec time is race-prone. |

### 10.19 Command Palette / Unified Search (P1-14)

| Source | URL | Key Insight |
|--------|-----|-------------|
| global-search (rarumdj) | https://github.com/rarumdj/global-search | One modal mounted once at app entry. Standalone triggers anywhere. `useGlobalSearch()` imperative open. `useGlobalSearchAction()` for feature reactions. |
| kbar guide (Jay Austin) | https://jayaustindesign.com/kbar-for-react-build-a-cmd-k-command-palette-the-smart-way/ | Commands as declarative objects (id/name/section/keywords/shortcut/perform). kbar manages indexing/filtering/focus/keyboard. Hierarchical `children`. |
| spotlight-omni-search | https://github.com/Dhruv-samani/spotlight-omni-search | `SpotlightProvider` one-line integration. `aria-controls`/`aria-activedescendant` WCAG compliance. Virtual scrolling. |
| ClaudeCodeLab: React Command Palette | https://claudecode-lab.com/en/blog/claude-code-command-palette/ | `useDeferredValue`+`useMemo` for responsive filtering. `aria-activedescendant` (don't move DOM focus per item). IME-safe Enter. Destructive commands confirm. |
| acture: parameterized command palette | https://github.com/i2mint/acture/blob/main/docs/parameterized_command_palette_guide.md | Palette is consumer of registry, doesn't define commands. Schema-driven parameter collection. Validate at palette before dispatch. |
| claude-skill-registry: command palettes | https://github.com/majiayu000/claude-skill-registry/blob/main/skills/other/other/creating-command-palettes/SKILL.md | Decentralized command registration. Zustand for UI state, Tanstack Query for server state. Separate rendering from logic. |

### 10.20 Next.js Layouts, Route Boundaries & App Shell (P1-18, P1-20)

| Source | URL | Key Insight |
|--------|-----|-------------|
| Next.js: Creating Layouts and Pages | https://nextjs.org/learn/dashboard-app/creating-layouts-and-pages | Nested layout shared between pages; on navigation only page components update (partial rendering), preserving client state. Root layout required, must have html/body. |
| jsmanifest: Layouts vs Templates | https://jsmanifest.com/nextjs-app-router-layouts-templates | Layouts persist (don't unmount/remount); templates remount each navigation. Layouts for nav shells/auth/theme; templates for analytics/state reset. |
| inksh.in: The Next.js Layouts Handbook | https://www.inksh.in/blog/next-tutorial/layouts | Keep root layout a Server Component : `'use client'` it ships everything to browser, loses Metadata API, cascades client boundary. |
| Stanza: Next.js App Router | https://www.stanza.dev/concepts/nextjs-app-router | `layout.tsx` persists across navigations. Route groups `(name)` organize layouts without URL impact. Keep layout free of single-child data fetching. |
| Spell UI: Next.js App Router Guide | https://spell.sh/blog/nextjs-app-router-guide | Nested layouts compose automatically. Route groups apply different layouts to sections without URL pollution. `global-error.js` for root layout. |
| vercel-labs/nextjs-skills: file-conventions | https://github.com/vercel-labs/nextjs-skills/blob/HEAD/skills/next-best-practices/file-conventions.md | Special files: page/layout/loading/error/not-found/global-error/template/default/route. Route groups, dynamic/catch-all segments. |

### 10.21 Skip Links (P1-19)

| Source | URL | Key Insight |
|--------|-----|-------------|
| W3C WAI: G1 Skip link | https://www.w3.org/WAI/WCAG22/Techniques/general/G1 | First interactive item links to main content. Link either always visible or visible on focus. Activating moves focus to main content. (SC 2.4.1) |
| WebAIM: Skip Navigation Links | https://webaim.org/techniques/skipnav/ | Link at top, one of first items. "Skip to main content" preferred. Off-screen hide + reveal on focus. `<main>`/landmarks as alternative mechanism. |
| Deque: axe skip-link rule | https://dequeuniversity.com/rules/axe/4.7/skip-link | Place right after `<body>`. `display:none`/`visibility:hidden` inaccessible to all. Off-screen until `:focus` is best practice. |
| A11yPath: Skip Links Pattern | https://a11ypath.com/patterns/skip-links/ | MUST be first focusable element. `position:absolute; top:-100%` to hide. Target needs `tabindex="-1"` for focus to actually move. |
| WebAbility: Skip to Main Content | https://www.webability.io/blog/skip-to-main-content | First focusable in `<body>`. Matching `id` + `tabindex="-1"`. Positional hiding, never `display:none`. Next Tab continues from main content. |
| Orange: Skip links best practices | https://a11y-guidelines.orange.com/en/articles/skip-links-best-practices/ | Target landmarks (`footer`/`main`/`banner`) more robust than `id`. Focus must move, not just scroll. Consistent position across pages. |

### 10.22 Type-Safe Feature Flags & Data Modeling (P1-21)

| Source | URL | Key Insight |
|--------|-----|-------------|
| typescript.page: Type-Safe Feature Flags & Fallbacks | https://typescript.page/designing-feature-flags-and-fallbacks-for-typescript-apps-fa | Typed manifest (keys+shapes+defaults). Literal union keys + mapped type metadata. Defensive runtime merge with manifest defaults. |
| Unleash: Managing feature flags in codebase | https://docs.getunleash.io/guides/manage-feature-flags-in-code.md | `as const` manifest. Avoid dynamic flag names (prevents static analysis). Union+mapped types for compile-time checking. Explicit defaults. |
| Medium (Nikulsinh): Typed Feature Gates with Context | https://medium.com/@hadiyolworld007/typescript-typed-feature-gates-with-context-compile-time-safe-experiments-in-prod-6973fe9afc23 | `satisfies Record<string, GateDef>`. Required context per gate. `assertNever` for variant exhaustiveness. Schema (Zod) for payload validation. |
| Medium (Nikulsinh): Type-Safe Flags OpenFeature+Zod | https://medium.com/@hadiyolworld007/type-safe-feature-flags-in-typescript-openfeature-zod-in-production-01d756eaec9d | Zod schemas per flag key. `FlagValue<K>` inferred from schema. Validate raw provider output, fall back to typed default on failure. |
| gated (adelrodriguez) | https://github.com/adelrodriguez/gated | Type-safe flag library; full inference for boolean/variant flags. Provider-agnostic. Five lifecycle hooks (before/resolve/after/error/finally). |
| DEV: Feature Flags at Scale | https://dev.to/sai_ram_0000/feature-flags-at-scale-designing-a-distributed-control-system-for-production-behavior-2p30 | Flag = versioned rule tree with metadata, targeting, default, ownership, expiry. Stale flags = operational hazard. Fail-closed vs fail-open per flag. |

### 10.23 CSS File Organization & Cascade Layers (P2-25, P2-26, P2-27)

| Source | URL | Key Insight |
|--------|-----|-------------|
| MDN: Organizing your CSS | https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Styling_basics/Organizing | Break large stylesheets into multiple smaller ones. Fewer source-control conflicts. Compile partials into one bundle. |
| OpenReplay: How to Organize CSS | https://blog.openreplay.com/organize-css-web-projects/ | Declare `@layer` order early. Co-locate styles with components. Keep nesting shallow (2 levels max). Separate global from component styles. |
| Alex Pierierodov: When to Split CSS | https://alexpierierodov.com/blog/when-to-split-css-into-multiple-bundles-code-splitting-strategies-for-large-web-applications | Route-based CSS splitting. Inline critical CSS. Separate vendor CSS with long cache lifetimes. Balance file count and size. |
| Feature-Sliced Design: styled-components | https://feature-sliced.design/blog/styled-components-guide | Co-locate styles with logic. UI-specific → feature, reusable → shared/ui, global resets → app. Controlled coupling, safe refactoring. |
| Tailwind CSS: Adding custom styles | https://tailwindcss.com/docs/adding-custom-styles | `@layer components` for `.card`/`.btn` classes. `@utility` for custom utilities. Utilities layer overrides components layer. |
| Tailwind v4 Discussion #17082 | https://github.com/tailwindlabs/tailwindcss/discussions/17082 | `@apply` doesn't work in `@layer base/components` in v4. Use `@utility` to register class names for `@apply`. Breaking change from v3. |
| Tailwind v4 Discussion #16449 | https://github.com/tailwindlabs/tailwindcss/discussions/16449 | Variants don't work in `@layer` in v4. Use `@utility` with nested `@layer` instead. `@layer components` still works for plain CSS. |
| Tailwind v4 Discussion #14363 | https://github.com/tailwindlabs/tailwindcss/discussions/14363 | Nest `@layer base` inside `@utility` for custom layer placement. `:where(&)` for specificity reset. |

### 10.24 HTML Heading Hierarchy & Document Outline (P2-28)

| Source | URL | Key Insight |
|--------|-----|-------------|
| MDN: Heading Elements | https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/Heading_Elements | One `<h1>` per page. Don't skip levels. Headings create an outline for screen reader navigation. Don't use for text sizing. |
| W3C WAI: Headings | https://www.w3.org/WAI/tutorials/page-structure/headings/ | Nest by rank. Don't skip ranks. Fixed page sections (sidebar) keep consistent heading ranks. `aria-labelledby` for region labels. |
| WebAIM: Headings | https://webaim.org/techniques/headings/ | One `<h1>` describing page content (similar to `<title>`). Logical order. Screen readers navigate by headings. Missing `<h1>` = lost users. |
| web.dev: Content structure | https://web.dev/learn/accessibility/structure | Don't skip heading levels. Decouple CSS styles from heading levels. Don't fake headings with styled text. Semantic HTML preferred over ARIA. |
| W3C H42: Using h1-h6 | https://www.w3.org/WAI/WCAG22/Techniques/html/H42 | Heading markup indicates level. Check heading markup used when content is a heading. Don't use heading markup for non-headings. |

### 10.25 Empty State Design (P2-29)

| Source | URL | Key Insight |
|--------|-----|-------------|
| NN/g: Designing Empty States | https://www.nngroup.com/articles/empty-state-interface-design/ | Don't default to empty. Communicate system status. Provide direct pathways. Intentionally designed, not afterthought. |
| Carbon Design System: Empty States | https://carbondesignsystem.com/patterns/empty-states-pattern/ | Replace the element that would ordinarily show. Left-aligned block. Keep words minimal. Types: first-use, no-results, error, completion. |
| UX Patterns for Developers: Empty States | https://uxpatterns.dev/patterns/user-feedback/empty-states | Describe what happened in direct language. Tell users what they can do next. Keyboard accessible. Semantic elements first. Announce state changes. |
| Northbase: Empty States Best Practices | https://www.northbase.design/patterns/empty-states | Icon+headline+CTA universal default (29%). Search empty states: 100% neutral tone. "No [noun]" dominant headline (27%). 70% of headlines 3-6 words. |
| Pixxen: SaaS Empty State Design | https://pixxen.com/blog/saas-empty-state-design/ | Four parts: headline, supporting context, clear next action, optional visual. Nine patterns. Mistake: default "No data found" message. |

### 10.26 Next.js Metadata API & Dynamic Routes (P2-32)

| Source | URL | Key Insight |
|--------|-----|-------------|
| Next.js: generateMetadata | https://nextjs.org/docs/app/api-reference/functions/generate-metadata | Dynamic metadata from route params. `params` is a Promise in Next.js 16. `fetch` requests auto-memoized. Server Components only. |
| Next.js: Metadata and OG images | https://nextjs.org/docs/app/getting-started/metadata-and-og-images | Static `metadata` object or async `generateMetadata`. Streaming metadata for dynamic pages. `metadataBase` for relative URLs. |
| Stanza: Next.js Metadata & SEO | https://www.stanza.dev/concepts/nextjs-metadata-seo | Use `generateMetadata` for dynamic routes. React `cache()` to deduplicate fetches. Set `metadataBase` + title template in root layout. `alternates.canonical` on every page. |
| Ali Rehan Haider: Dynamic Metadata in Next.js 16 | https://alirehanhaider.com/blog/generate-dynamic-metadata-nextjs-16 | `params`/`searchParams` are Promises in Next.js 16. `await params` required. Server context only : no `window`/`document`. `parent: ResolvingMetadata` to inherit. |
| StackNotice: Next.js SEO Guide 2026 | https://stacknotice.com/blog/nextjs-seo-guide-2026 | `generateMetadata` + `getPost` with `cache()`. `ImageResponse` for dynamic OG images. `alternates.canonical` for authoritative URL. Missing descriptions = Google picks random text. |

### 10.27 React Error Boundaries (P2-36)

| Source | URL | Key Insight |
|--------|-----|-------------|
| React: Error Boundaries | https://legacy.reactjs.org/docs/error-boundaries.html | `getDerivedStateFromError` for state, `componentDidCatch` for logging. Class components only. Like `catch {}` for components. |
| react-error-boundary (npm) | https://www.npmjs.com/package/react-error-boundary | `fallback`/`fallbackRender`/`FallbackComponent`. `onError` for logging. `onReset` for state cleanup. `resetKeys` for auto-reset on prop change. Client component. |
| bvaughn/react-error-boundary (GitHub) | https://github.com/bvaughn/react-error-boundary/ | Can't catch SSR errors, event handlers, async code. `useErrorBoundary` hook for event handler errors. Serializable props only. |
| LogRocket: React error handling | https://blog.logrocket.com/react-error-handling-react-error-boundary/ | `getDerivedStateFromError` (render phase, no side effects) vs `componentDidCatch` (commit phase, side effects OK). `resetKeys` for retry. `useErrorBoundary` hook. |
| Sentry: React Error Boundary | https://docs.sentry.io/platforms/javascript/guides/react/features/error-boundary/ | `fallback` prop (element or function). `onError`/`beforeCapture`/`onMount`/`onUnmount`. `captureReactException` for custom boundaries. Scoped to wrapped subtree. |
| Stanza: React Error Boundaries | https://www.stanza.dev/concepts/react-error-boundaries | Use `react-error-boundary` library. Place at multiple levels. Connect `onError` to monitoring. Always pair with retry/navigation. |
| Nazar Boyko: Error Boundaries in Real Applications | https://www.nazarboyko.com/articles/react-error-boundaries-in-real-applications | Don't show stack trace to user. Log it, don't render it. Be specific about what failed. Provide recovery path. |

### 10.28 WAI-ARIA Disclosure & `aria-current` (P2-37, P2-39, P2-40)

| Source | URL | Key Insight |
|--------|-----|-------------|
| W3C WAI: Disclosure Pattern | https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/ | Button with `aria-expanded` + `aria-controls`. Enter/Space toggles. Optionally `aria-controls` refers to content container. |
| W3C WAI: Accordion Pattern | https://www.w3.org/WAI/ARIA/apg/patterns/accordion/ | `role heading` + `aria-level` on header. `role region` + `aria-labelledby` on panel (optional, avoid proliferation >6 panels). |
| WebAIM: Disclosures and Accordions | https://webaim.org/techniques/disclosures/ | `aria-expanded="true|false"` must match visibility. Collapsed content must not be focusable : use `display:none` or `hidden`. Native `<details>`/`<summary>` has built-in a11y. |
| MDN: aria-expanded | https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-expanded | Indicates if control is expanded/collapsed. Use with `aria-controls` or `aria-owns`. Don't include on elements that don't control visibility. |
| W3C WAI: Disclosure FAQ Example | https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-faq/ | CSS attribute selectors `[aria-expanded="false"]` sync visual state. `::before` pseudo-element for visual indicator (high-contrast safe). |
| MDN: aria-current | https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-current | `page`/`step`/`location`/`date`/`time`/`true`/`false`. Only one current item per set. Don't use as substitute for `aria-selected` in tabs/options. |
| W3C ARIA26: Using aria-current | https://www.w3.org/WAI/WCAG21/Techniques/aria/ARIA26 | Programmatically indicate current item. Navigation bar example with `aria-current="page"`. Check highlighted item has attribute with suitable value. |
| A11Y Collective: aria-current | https://www.a11y-collective.com/blog/aria-current/ | Only mark ONE item as current. Use most specific value (`page` not `true`). Combine with CSS `[aria-current="page"]` selectors. Update dynamically in SPAs. |
| Aditus: aria-current best practices | https://www.aditus.io/aria/aria-current/ | `aria-current="page"` for nav, `aria-current="location"` for breadcrumbs. Don't use on grid cells/options/rows/tabs (use `aria-selected`). |
| Heydon Works: Current page link conundrum | https://heydonworks.com/article/the-accessible-current-page-link-conundrum/ | `aria-current` presence can drive styling, removing need for JS-set classes. Pair visual appearance with aural announcement. |

### 10.29 prefers-color-scheme & Visually-Hidden CSS (P2-43, P2-45)

| Source | URL | Key Insight |
|--------|-----|-------------|
| MDN: prefers-color-scheme | https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-color-scheme | Detects light/dark preference. `light`/`dark` values. Override with CSS media query or `color-scheme` property. |
| SO: Detect dark mode with JavaScript | https://stackoverflow.com/questions/56393880/how-do-i-detect-dark-mode-using-javascript | `window.matchMedia('(prefers-color-scheme: dark)')`. Subscribe to `change` event for live updates. Fallback to light if unsupported. |
| Smashing Magazine: Setting and persisting color scheme | https://www.smashingmagazine.com/2024/03/setting-persisting-color-scheme-preferences-css-javascript/ | Three options: light/dark/system. `color-scheme` property for browser built-in dark mode. `:has()` selector for CSS-only theme switching. |
| freeCodeCamp: How to detect preferred color scheme | https://www.freecodecamp.org/news/how-to-detect-a-users-preferred-color-scheme-in-javascript-ec8ee514f1ef/ | `window.matchMedia` + `addListener` for reactive updates. Override autodetected scheme with user choice. |
| web.dev: prefers-color-scheme | https://web.dev/articles/prefers-color-scheme | Initially adhere to browser signal, then allow user override. `meta theme-color` with media attribute. Check support with `matchMedia('(prefers-color-scheme)').media`. |
| WebAIM: Invisible Content for Screen Readers | https://webaim.org/techniques/css/invisiblecontent/ | `position:absolute; left:-10000px` for off-screen. `clip-path: inset(50%)` for modern clipping. Don't hide navigable elements off-screen. |
| A11Y Collective: Visually Hidden CSS | https://www.a11y-collective.com/blog/visually-hidden/ | `clip-path: inset(50%)` preferred. `white-space: nowrap` stops wrapping. `:not(:focus):not(:active)` for focusable hidden elements. |
| CSS-Tricks: Inclusively Hidden | https://css-tricks.com/inclusively-hidden/ | `.visually-hidden:not(:focus):not(:active)` for skip links. `clip: rect(0 0 0 0); clip-path: inset(50%)` for backwards compat. `inert` attribute for modal backgrounds. |
| Scott O'Hara: Visually Hidden Hack | https://www.scottohara.me/blog/2023/03/21/visually-hidden-hack.html | `clip-path: inset(50%)` with `:not(:focus):not(:active):not(:focus-within)`. Visually hidden is a hack : use judiciously. |
| Tailwind GitHub #18768: Replace deprecated clip | https://github.com/tailwindlabs/tailwindcss/issues/18768 | Replace `clip: rect(0,0,0,0)` with `clip-path: inset(50%)`. Removes deprecated property. Aligns with MDN. No behavioral regressions. |

### 10.30 Storage Write Performance & Event Rotation (P2-47, P2-48)

| Source | URL | Key Insight |
|--------|-----|-------------|
| Philip Walton: Idle Until Urgent | https://philipwalton.com/articles/idle-until-urgent/ | `requestIdleCallback` better than debounce for localStorage writes. `IdleQueue({ensureTasksRun: true})` for unload safety. Clear pending tasks on new write. `setTimeout` fallback. |
| redux-storage-middleware | https://github.com/laststance/redux-storage-middleware/ | `debounceMs: 300`, `useIdleCallback: true`, `idleTimeout: 1000`. SSR-safe. Selective persistence. 10x fewer writes with debounce. |
| zustand-debounce | https://github.com/AbianS/zustand-debounce | `createDebouncedJSONStorage('localStorage', { debounceTime: 1000 })`. Groups rapid changes into single write. Multiple storage adapters. |
| t3code PR #497: Debounce storage writes | https://github.com/pingdotgg/t3code/pull/497 | Debounce Zustand persistence (500ms) + composer drafts (300ms). Flush on `beforeunload`. Throttle domain event processing (100ms batch). |
| TanStack/pacer | https://github.com/TanStack/pacer | Debounce, throttle, rate limit, batch, queue. Sync and async. `useDebouncedCallback`/`useThrottledValue` hooks. Persist state to storage. |
| OpenAlice: Event Log with ring buffer | https://github.com/TraderAlice/OpenAlice/blob/56f653d8/src/core/event-log.ts | Dual-write (disk + memory). Ring buffer: `buffer.push(entry); if (buffer.length > bufferSize) buffer = buffer.slice(buffer.length - bufferSize)`. One-at-a-time drop. |
| Reintech: Circular Queue in JavaScript | https://reintech.io/blog/understanding-implementing-circular-queue-javascript | `(tail + 1) % capacity` wraparound. `size` counter avoids empty/full ambiguity. LogBuffer example: if full, dequeue oldest before enqueue. |
| Elsium: RingBuffer audit storage | https://github.com/elsium-ai/elsium-ai/blob/main/packages/observe/src/audit.ts | Fixed-capacity ring buffer with `head`/`tail`/`size`. `toArray()` reconstructs in order. `last()` for most recent entry. No batch drops. |

### 10.31 Combobox Index Clamping & Zustand Selectors (P2-49, P2-50)

| Source | URL | Key Insight |
|--------|-----|-------------|
| ASOasis: React Combobox accessible | https://asoasis.tech/articles/2026-05-01-1453-react-combobox-select-component-accessible/ | Reset `activeIndex` on input change. `Math.min(last, i + 1)`/`Math.max(0, i - 1)` for clamping. `aria-activedescendant` for screen reader. Don't move DOM focus. |
| ASOasis: React Search Autocomplete | https://asoasis.tech/articles/2026-04-11-1454-react-search-autocomplete-implementation/ | "Flickering selection index: reset activeIndex when items change." Debounce + AbortController for fetch. `aria-controls` + `aria-activedescendant`. |
| React Aria: ComboBox | https://reactspectrum.blob.core.windows.net/reactspectrum/fd22c0dae1696e5c8d1322a6f822ceee3c976aef/s2-docs/react-aria/ComboBox.html | `selectedKey`/`inputValue` controlled simultaneously. `onSelectionChange` vs `onInputChange` : only one triggers per interaction. Clear `selectedKey` when input cleared. |
| React Spectrum Blog: Accessible autocomplete | https://reactspectrum.blob.core.windows.net/reactspectrum/e37224fec9f7a7327b1fa2288a33f0a95ee5d9ff/docs/blog/building-a-combobox.html | VoiceOver has limited `aria-activedescendant` support. Live regions as workaround. Track input value + selected option, sync on selection. |
| Zustand #971: Selector patterns | https://github.com/pmndrs/zustand/discussions/971 | Inline selectors fine and recommended. `useCallback` for selectors is overhead. Stable selectors slightly more performant. Move expensive computation to `useMemo`. |
| Zustand #758: Performant selectors | https://github.com/pmndrs/zustand/discussions/758 | Simple selector in component is fine. Stable selector for more optimization. `proxy-memoize` for memoizing across components. `useMemo` caches only in component. |
| Zustand #387: Best approach for selectors | https://github.com/pmndrs/zustand/discussions/387 | Define selectors outside component for stability. `useShallow` for object equality. `reselect`/`proxy-memoize` for shared expensive selectors. |
| Zustand #1809: Derived state | https://github.com/pmndrs/zustand/discussions/1809 | Derived state in selectors = not cached. `useMemo` caches in component. `proxy-memoize` caches across components. `derive-zustand` for store-level computed. |
| Zustand #108: Derived values | https://github.com/pmndrs/zustand/issues/108 | Define derived value in components/hooks or selector. `useMemo` if computationally heavy. `subscribeWithSelector` middleware for computed-on-set. |

### 10.32 Mobile Navigation Drawer (P2-46)

| Source | URL | Key Insight |
|--------|-----|-------------|
| Make Things Accessible: Nav drawer disclosure | https://www.makethingsaccessible.com/guides/accessible-nav-drawer-disclosure-widgets/ | `aria-expanded` on trigger. CSS `transition: display 500ms allow-discrete, width 500ms ease-in`. `:has()` selector for CSS-only drawer state. Hybrid push/overlay for small screens. |
| Christian Baum: Accessible sidebar drawer | https://www.christianbaum.com/blog/accessible-sidebar-drawer-with-great-ux | Radio button state trick (no JS). `transform` + CSS transition for slide animation. Gesture support (swipe to open/close). Works with JS disabled. |
| daisyUI: Drawer | https://daisyui.com/components/drawer/ | Grid layout. `drawer-toggle` hidden checkbox. `drawer-overlay` label covers page. `lg:drawer-open` for desktop. `is-drawer-open:`/`is-drawer-close:` variants. |
| MDC Drawer | https://github.com/material-components/material-components-web/blob/master/packages/mdc-drawer/README.md | `MDCDrawer.open` toggle. Focus to first focusable on open, restore to trigger on close. Dismissible (pushes content) vs modal (scrim overlay) variants. |
| Accessible Toggle | https://github.com/elivz/accessible-toggle | `mediaQuery` option enables/disables toggle by screen size. `aria-hidden` on content when collapsed. `show()`/`hide()`/`toggle()` API. Custom events. |
| W3C WAI: Disclosure Pattern | https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/ | Button + `aria-expanded` + `aria-controls`. Enter/Space toggles. Disclosure navigation menu example. |

### 10.33 Async File I/O & Markdown Truncation (P2-30, P2-31)

| Source | URL | Key Insight |
|--------|-----|-------------|
| Vercel KB: Loading static files | https://vercel.com/kb/guide/loading-static-file-nextjs-api-route | `fs.promises.readFile` with `await` in Server Components. `process.cwd()` for relative paths. `JSON.parse` for file content. |
| Node.js: Reading files | https://nodejs.org/learn/manipulating-files/reading-files-with-nodejs | `fs.readFile` (callback), `fs.readFileSync` (sync), `fsPromises.readFile` (promise). All read full content into memory. Use streams for large files. |
| SO: JSON files in Next.js | https://stackoverflow.com/questions/78461551/what-is-the-correct-way-to-use-json-files-stored-server-side-in-next-js | Abstract file reading into reusable async function. `try/catch` returns `null` on error. Type with generics. `tsconfig` `resolveJsonModule: true`. |
| Renovate PR #41919: Close unclosed markdown | https://github.com/renovatebot/renovate/pull/41919/files | `closeUnclosedStructures(text, maxLen)` repairs broken markdown after `slice()`. Tracks backtick count for code fences. Handles unclosed HTML tags. |
| mdast-util-slice-markdown | https://registry.npmjs.org/mdast-util-slice-markdown | Truncate AST tree, not raw text. Configurable partial node handling: `truncate`/`include-full`/`exclude-full`. Code blocks, links, media preserved. |
| SO: Markdown preview truncation | https://stackoverflow.com/questions/34636103/markdown-how-to-show-a-preview-such-as-the-first-n-words | Parse to HTML first, then truncate counting only text chars (not markup). Or parse to AST, truncate tree, then render. Never `slice()` raw markdown. |
| storepress-llm-md-text-splitter | https://github.com/EmranAhmed/storepress-llm-md-text-splitter | Code blocks never split. Explanatory text grouped with adjacent code. Reference links resolved per chunk. Tables/video embeds kept atomic. Stream-based. |
