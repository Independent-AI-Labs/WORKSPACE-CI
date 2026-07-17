# SPEC-WIKI-RESPONSIVE: Wiki Responsive Layout Implementation

**Date:** 2026-07-06
**Status:** Active
**Type:** Specification
**Requirements:** [REQ-WIKI-RESPONSIVE](../requirements/REQ-WIKI-RESPONSIVE.md)

> Responsive overhaul of `web/`: a phased patch over the existing
> desktop-first CSS. Implementation state per phase is tracked in
> [REQ-WIKI-RESPONSIVE](../requirements/REQ-WIKI-RESPONSIVE.md) §8.

---

**Cross-references:**
- [REQ-WIKI-RESPONSIVE](../requirements/REQ-WIKI-RESPONSIVE.md): companion requirements
- [SPEC-WIKI](SPEC-WIKI.md): parent wiki specification

---

## 1. Problem Statement

The wiki renders as a shrunken desktop layout on real phones. The root cause is a
single missing viewport meta tag in `app/layout.tsx`, which makes mobile browsers
report a fake 980px viewport so every `@media (max-width: 768px)` rule in the
codebase never fires. Beyond that, the codebase has only one width breakpoint
(768px), no fluid typography, no image overflow protection, no table scroll
wrappers, several flex rows that cannot wrap, and touch targets as small as 22px.

This spec defines a phased, low-risk patch (not a mobile-first rewrite) that
makes the site genuinely usable on phones, tablets, and desktops.

## 2. Constraints (from user decisions)

| Decision | Choice |
|---|---|
| CSS architecture | Patch the existing desktop-first CSS. Keep `max-width` queries, add breakpoints above and below. No full mobile-first rewrite. |
| Touch targets | 48px on touch devices only; desktop (mouse) stays dense. |
| Breakpoints | Content-driven: **480px / 768px / 1024px**. |
| Container queries | No. Viewport media queries only. |
| Em dashes | Not allowed in user-facing copy. |

## 3. Breakpoint Strategy

Adopt three content-driven breakpoints. Base styles (outside any query) target
desktop, matching the existing architecture. Queries narrow or widen from there.

| Breakpoint | Purpose |
|---|---|
| `@media (max-width: 1024px)` | Tablet / small laptop. Playground collapses to single column. Sidebar behavior unchanged (still desktop grid until 768px). |
| `@media (max-width: 768px)` | **Existing.** Off-canvas sidebar, mobile hamburger, single-column shell. |
| `@media (max-width: 480px)` | Small phones. Tighter padding, reduced hero, single-column grids. |

Rationale: 1024px is where the playground's fixed 400px panel starts stealing too
much width from the editor on a tablet/laptop. 480px is where 24px side padding
and 360px card min-width start breaking small phones (iPhone SE = 320px).

## 4. Phased Changes

### Phase 1: Unblock mobile (CRITICAL, single change)

**File:** `app/layout.tsx`

Add the Next.js App Router viewport export. Per Next.js docs (since v14), viewport
fields must be exported as `viewport`, NOT placed in `metadata`.

```ts
import type { Metadata, Viewport } from 'next'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}
```

Do NOT set `maximumScale: 1` or `userScalable: false`: these block accessibility
zoom and violate WCAG 1.4.4.

**Effect:** Re-activates the existing off-canvas sidebar
(`_wiki-layout.css:56-97`), mobile hamburger (`MobileNavToggle.tsx`), and
collapsing playground (`_wiki-playground.css:154`) on real phones. This single
change transforms the site from "no mobile" to "has a basic mobile layout."

**Verification:** Open the site on a real phone or Chrome DevTools mobile
emulation at 375px. The hamburger menu must appear; the sidebar must slide in.

---

### Phase 2: Stop horizontal overflow

#### 2a. Images never overflow

**File:** `src/styles/globals.css` (add after the `@import` block, before any
component styles)

```css
img {
  max-width: 100%;
  height: auto;
}
```

This is a baseline reset. Markdown READMEs rendered through `.prose` can contain
`<img>` tags at intrinsic pixel sizes; without this they overflow the viewport on
mobile. The Next.js `<Image>` components carry fixed `width`/`height` attrs and
also benefit from this safeguard.

#### 2b. Tables scroll horizontally instead of overflowing the page

**File:** `public/styles/_prose.css`

The best practice (per cr0x.net research) is to wrap tables in a scroll
container, not put `overflow-x` directly on the `<table>`. However, our markdown
is rendered via `marked` -> HTML string -> `dangerouslySetInnerHTML`, so we cannot
easily inject wrapper `<div>`s without post-processing the HTML. The pragmatic
approach for prose tables is to make the table itself a scroll container at
mobile widths:

```css
@media (max-width: 768px) {
  .prose table {
    display: block;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    white-space: nowrap;
  }
  .prose th, .prose td {
    white-space: normal;
    overflow-wrap: break-word;
  }
}
```

`white-space: nowrap` on the table (block-level) prevents the table from
collapsing cells to unreadable widths; `white-space: normal` on cells lets prose
wrap within cells while the table scrolls horizontally as a unit.

**File:** `public/styles/_config-table.css`

Apply the same pattern to `.config-field-table`:

```css
@media (max-width: 768px) {
  .config-field-table {
    display: block;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
}
```

#### 2c. Flex rows that cannot wrap

Add `flex-wrap: wrap` to the 7 flex containers identified in the audit. Each
gets a minimal one-line addition (no other changes to those rules):

| File | Line | Selector | Change |
|---|---|---|---|
| `_tabs.css` | 7 | `.tabs__list` | add `flex-wrap: wrap;` |
| `_config-dialog.css` | 6 | `.config-dialog__tabs` | add `flex-wrap: wrap;` |
| `_wiki-breadcrumbs.css` | 11 | `.wiki-breadcrumbs__list` | add `flex-wrap: wrap;` |
| `_wiki-layout.css` | 14 | `.wiki-header` | add `flex-wrap: wrap;` |
| `_wiki-footer.css` | 3 | `.wiki-footer` | add `flex-wrap: wrap;` |
| `_project-card.css` | 7 | `.project-detail__header` | add `flex-wrap: wrap;` |
| `_wiki-patterns.css` | 19 | `.category-nav__header` | add `flex-wrap: wrap;` |

For `.wiki-header`, also add `gap: var(--space-2)` so wrapped rows don't touch.

#### 2d. Bare `<pre>` in check detail page

**File:** `app/checks/[id]/page.tsx` line 100-102`

The `<pre>` for `found.signature` is outside `.prose`, so it does not inherit
`.prose pre { overflow-x: auto }`. Add a scroll wrapper or a utility class:

Option A (inline style, minimal):
```tsx
<pre style={{ overflowX: 'auto' }}>
  <code>{found.signature}</code>
</pre>
```

Option B (add a shared utility class in `_prose.css`):
```css
.pre-scroll {
  overflow-x: auto;
}
```
and apply `className="pre-scroll"` to the `<pre>`.

**Chosen: Option A** (inline): single occurrence, no new class to maintain.

#### 2e. Card grid min-width too high for small phones

**File:** `public/styles/_wiki-card.css` line 3

Current: `grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));`

360px exceeds iPhone SE (320px) and similar small phones by ~40px, causing
horizontal overflow. Change to use `min()` so the track never exceeds the
container:

```css
grid-template-columns: repeat(auto-fill, minmax(min(100%, 360px), 1fr));
```

`min(100%, 360px)` resolves to the container width when below 360px, and 360px
otherwise. This is the standard pattern for fluid auto-fill grids on small
screens.

---

### Phase 3: Touch targets (touch devices only, desktop unchanged)

**Technique:** Use `@media (pointer: coarse)` which targets touch devices
specifically, regardless of viewport width. This is superior to a width
breakpoint because:
- A touch laptop at 1440px width still gets 48px targets (correct: touch device)
- A narrow desktop browser at 500px with a mouse stays dense (correct: mouse user)
- A tablet at 800px gets 48px targets (correct: touch device)

Per WCAG 2.5.5 (AAA) and Material Design, 48x48 CSS px is the target. We use the
`::after` hit-area expansion technique (per modern-css.com research) which grows
the tappable area WITHOUT changing the visual size, so the desktop design is
completely unaffected even on touch laptops.

**File:** `public/styles/_a11y.css` (append)

```css
/* Touch target expansion: touch devices only.
   Visual size unchanged; only the tappable hit area grows. */
@media (pointer: coarse) {
  .icon-btn,
  .theme-toggle,
  .btn,
  .tab,
  .config-dialog__tab,
  .copy-button,
  .wiki-sidebar__link,
  .search-modal__close,
  .collapsible-section__header,
  .pill,
  .filter-pill,
  .category-nav__pill {
    position: relative;
  }

  .icon-btn::after,
  .theme-toggle::after,
  .btn::after,
  .tab::after,
  .config-dialog__tab::after,
  .copy-button::after,
  .wiki-sidebar__link::after,
  .search-modal__close::after,
  .collapsible-section__header::after,
  .pill::after,
  .filter-pill::after,
  .category-nav__pill::after {
    content: '';
    position: absolute;
    inset: -8px;
    border-radius: inherit;
  }
}
```

`inset: -8px` expands the hit area 8px in every direction. A 32px button becomes
a 48px tappable area. The `::after` is invisible (no background/border) so visual
design is untouched.

**Exception: mobile hamburger.** This button is mobile-only (already inside
`@media (max-width: 768px)`, hidden on desktop). Make it visually 44px since it
is the primary mobile navigation control and should look tappable:

**File:** `public/styles/_wiki-layout.css` (inside the existing 768px block,
lines 68-69)

```css
.mobile-nav-toggle {
  width: 44px;   /* was 32px */
  height: 44px;  /* was 32px */
}
```

**Testing caveat:** Chrome DevTools responsive mode at narrow widths does NOT
trigger `pointer: coarse` unless touch emulation is enabled. To test touch
targets, use DevTools -> Toggle device toolbar -> select a mobile device (which
enables touch emulation) rather than just resizing the window.

---

### Phase 4: Content padding + fluid typography

#### 4a. Reduce `.wiki-content` padding on mobile

**File:** `public/styles/_wiki-layout.css`

Current: `.wiki-content { padding: var(--space-6); }` (24px all sides, no
reduction). On a 320px screen this consumes 48px (24 x 2), leaving 272px.

```css
@media (max-width: 768px) {
  .wiki-content {
    padding: var(--space-4);  /* 16px */
  }
}

@media (max-width: 480px) {
  .wiki-content {
    padding: var(--space-3);  /* 12px, leaves 296px on a 320px screen */
  }
}
```

#### 4b. Fluid typography for display headings

**File:** `public/styles/_variables.css` lines 52-61

Convert the type scale to fluid `clamp()` values. Per research (KitLab, Modern
CSS Tools, thecrit.co), the preferred value MUST include `vw + rem` for
accessibility (preserves browser zoom and user font-size settings). Scale range:
320px (min) to 1280px (max). Keep body and small UI text stable (not fluid) per
TYPECLAMP guidance: fluid type is strongest for display headings.

Only convert the display tier (xl and above). Body/base/sm/xs stay fixed rem:

```css
/* ---- Tier 1: Typography scale (font-size) ---- */
--text-xs: 0.75rem;      /* 12px, fixed (UI labels) */
--text-sm: 0.875rem;     /* 14px, fixed (UI labels) */
--text-base: 1rem;       /* 16px, fixed (body, WCAG minimum) */
--text-lg: clamp(1rem, 0.9rem + 0.42vw, 1.125rem);     /* 16-18px */
--text-xl: clamp(1.125rem, 0.95rem + 0.83vw, 1.25rem); /* 18-20px */
--text-2xl: clamp(1.25rem, 0.9rem + 1.67vw, 1.5rem);   /* 20-24px */
--text-3xl: clamp(1.5rem, 0.9rem + 3vw, 1.875rem);     /* 24-30px */
--text-4xl: clamp(1.75rem, 0.75rem + 5vw, 2.25rem);    /* 28-36px */
--text-5xl: clamp(2rem, 0.5rem + 7.5vw, 3rem);         /* 32-48px */
```

These resolve to the same max values as before at 1280px+, so desktop appearance
is unchanged. On mobile they scale down smoothly without breakpoint jumps.

**File:** `public/styles/_hero.css` line 9

`.hero__title` uses `var(--text-4xl)` which is now fluid: no change needed. It
will automatically scale from 28px (mobile) to 36px (desktop).

**File:** `public/styles/_prose.css` lines 12-14

`.prose h1/h2/h3` use `--text-2xl/--text-xl/--text-lg` which are now fluid: no
change needed. They scale automatically.

#### 4c. Reduce hero padding on mobile

**File:** `public/styles/_hero.css`

```css
@media (max-width: 480px) {
  .hero {
    padding: var(--space-4) var(--space-3);  /* 16px 12px, was 32px 24px */
  }
}
```

---

### Phase 5: Playground collapse + Grafana iframe + cleanup

#### 5a. Playground collapses at 1024px (not just 768px)

**File:** `public/styles/_wiki-playground.css`

Current: `grid-template-columns: 1fr 400px` (line 16), collapses to `1fr` at
`max-width: 768px` (line 154). A fixed 400px panel on a 900px tablet leaves only
500px for the editor. Move the collapse up to 1024px:

```css
@media (max-width: 1024px) {
  .playground-panes {
    grid-template-columns: 1fr;
  }
}
```

Keep the existing 768px block for any further mobile-specific playground styling.

#### 5b. Grafana iframe responsive height

**File:** `src/components/wiki/GrafanaEmbed.tsx` lines 20-21

Current: `<iframe width="100%" height="1200" />`: fixed 1200px height is not
fluid. Replace with a viewport-relative height that works on all screens:

```tsx
<iframe
  src={src}
  width="100%"
  height="600"
  style={{ height: 'clamp(400px, 80vh, 1200px)' }}
  frameBorder="0"
  title={title}
/>
```

`clamp(400px, 80vh, 1200px)`: 400px minimum on short screens, 1200px max on tall
desktops, 80% of viewport height in between. The inline `height="600"` attr is a
default for the rare browser that ignores inline styles (and gets overridden by
the style).

#### 5c. Remove dead stylesheet import

**File:** `src/styles/globals.css` line 22

`_tooling-card.css` is 0 bytes (empty file) but still imported. Remove the import
line. Keep or delete the empty file itself: removing the import is sufficient to
stop loading dead CSS.

```diff
- @import '../../public/styles/_tooling-card.css';
```

---

## 5. Files Changed (summary)

| File | Phase | Change |
|---|---|---|
| `app/layout.tsx` | 1 | Add `export const viewport` |
| `src/styles/globals.css` | 2a, 5c | Add `img` reset; remove dead `_tooling-card.css` import |
| `public/styles/_prose.css` | 2b | Mobile table scroll |
| `public/styles/_config-table.css` | 2b | Mobile config table scroll |
| `public/styles/_tabs.css` | 2c | `flex-wrap: wrap` |
| `public/styles/_config-dialog.css` | 2c | `flex-wrap: wrap` |
| `public/styles/_wiki-breadcrumbs.css` | 2c | `flex-wrap: wrap` |
| `public/styles/_wiki-layout.css` | 2c, 3, 4a | Header wrap+gap, hamburger 44px, content padding |
| `public/styles/_wiki-footer.css` | 2c | `flex-wrap: wrap` |
| `public/styles/_project-card.css` | 2c | `flex-wrap: wrap` |
| `public/styles/_wiki-patterns.css` | 2c | `flex-wrap: wrap` |
| `app/checks/[id]/page.tsx` | 2d | `overflowX: auto` on bare `<pre>` |
| `public/styles/_wiki-card.css` | 2e | `minmax(min(100%, 360px), 1fr)` |
| `public/styles/_a11y.css` | 3 | Touch target hit-area expansion |
| `public/styles/_variables.css` | 4b | Fluid `clamp()` type scale |
| `public/styles/_hero.css` | 4c | Mobile hero padding |
| `public/styles/_wiki-playground.css` | 5a | Collapse at 1024px |
| `src/components/wiki/GrafanaEmbed.tsx` | 5b | Responsive iframe height |

**Total: 18 files.** No new files created (spec excluded).

## 6. Out of Scope

- Full mobile-first CSS rewrite (inverting all queries to `min-width`).
- Container queries.
- Tailwind responsive utilities migration.
- Default project icon for WORKSPACE-GATEWAY (cancelled earlier).
- Sidebar collapse behavior changes.
- Dark/light theme adjustments for mobile.
- Mobile-specific navigation patterns (bottom nav, tab bars).

## 7. Verification Plan

After each phase:
1. `npm run lint`: must pass.
2. `npm run build`: must succeed (run after final phase).

After all phases, manual browser testing at these widths:
- **320px** (iPhone SE): no horizontal scroll, cards single column, hamburger
  works, tables scroll, padding tight but readable.
- **375px** (iPhone 12/13): same as above, slightly more room.
- **768px** (iPad portrait): off-canvas sidebar, single-column playground.
- **1024px** (iPad landscape / small laptop): playground collapses, desktop
  sidebar visible.
- **1280px** (desktop): unchanged from current appearance.

Touch target testing: DevTools -> device toolbar -> select a touch device (e.g.
iPhone 12) -> verify hit areas are enlarged (inspect `::after` pseudo-element on
buttons).

## 8. Risks

| Risk | Mitigation |
|---|---|
| `clamp()` type scale changes desktop appearance | Values resolve to same max at 1280px+. Verify at 1280px and 1920px. |
| `pointer: coarse` not testable in plain responsive mode | Use DevTools device emulation with touch enabled. |
| `display: block` on tables breaks sticky headers | We have no sticky headers in prose tables. Config tables: verify visually. |
| `flex-wrap: wrap` on `.wiki-header` changes header layout | Header has `justify-content: space-between`: wrapping pushes actions to a new row, which is the desired mobile behavior. Verify at 768px. |
| Removing `_tooling-card.css` import breaks tooling page | File is 0 bytes (empty). Tooling cards use base `.card` styles. Verify `/tooling` page renders. |
