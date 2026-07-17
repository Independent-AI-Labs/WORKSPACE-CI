# REQ-WIKI-RESPONSIVE: Wiki Responsive Layout

**Date:** 2026-07-17
**Status:** Active
**Type:** Requirements
**Specification:** [SPEC-WIKI-RESPONSIVE](../specifications/SPEC-WIKI-RESPONSIVE.md)

> Mandates that the wiki web UI ([`web/`](../../web/)) is usable on
> phones, tablets, and desktops: a correct viewport export, three
> content-driven breakpoints (480px / 768px / 1024px), no horizontal
> overflow, 48px-class touch targets on coarse-pointer devices only, and
> fluid display typography. This is a patch over the existing
> desktop-first CSS, not a mobile-first rewrite. Container queries are
> explicitly excluded.

---

**Cross-references:**
- [SPEC-WIKI-RESPONSIVE](../specifications/SPEC-WIKI-RESPONSIVE.md): companion specification
- [REQ-WIKI](REQ-WIKI.md) / [SPEC-WIKI](../specifications/SPEC-WIKI.md): parent wiki feature set
- [`web/app/layout.tsx`](../../web/app/layout.tsx): viewport export
- [`web/public/styles/_variables.css`](../../web/public/styles/_variables.css): fluid type scale
- [`web/public/styles/_a11y.css`](../../web/public/styles/_a11y.css): touch-target expansion

---

## 1. Purpose & Scope

### 1.1 Purpose
Make the wiki genuinely usable on real phones, tablets, and desktops via
a phased, low-risk patch on top of the existing desktop-first CSS.

### 1.2 Scope
**This document OWNS the requirements for:**
- The viewport meta behavior of the Next.js app
- The breakpoint strategy (480px / 768px / 1024px)
- Horizontal-overflow prevention (images, tables, flex rows, card grids)
- Touch-target sizing on coarse-pointer devices
- Content padding and fluid display typography

**This document DOES NOT:**
- Redefine the wiki feature set (owned by [REQ-WIKI](REQ-WIKI.md))
- Mandate a mobile-first CSS rewrite or container queries
- Cover dark/light theme adjustments or mobile navigation patterns

### 1.3 Terminology
| Term | Definition |
|------|------------|
| Breakpoint | A `@media (max-width: Npx)` boundary: 480, 768, or 1024 |
| Coarse pointer | A touch primary input, matched by `@media (pointer: coarse)` |
| Hit-area expansion | Invisible `::after` with negative `inset` that grows the tappable area without changing visual size |
| Fluid type | `clamp(min, preferred, max)` font sizes with `vw + rem` preferred values |

## 2. Functional Requirements

### FR-1: Viewport
| ID | Requirement |
|----|-------------|
| FR-1.1 | The app MUST export a Next.js `viewport` object with `width: 'device-width'` and `initialScale: 1` from `app/layout.tsx` (NOT via `metadata`). |
| FR-1.2 | The viewport MUST NOT set `maximumScale: 1` or `userScalable: false` (WCAG 1.4.4 accessibility zoom). |

### FR-2: Breakpoints
| ID | Requirement |
|----|-------------|
| FR-2.1 | The CSS MUST use content-driven breakpoints at 480px, 768px, and 1024px, keeping `max-width` queries over a desktop-first base. |
| FR-2.2 | The playground MUST collapse to a single column at 1024px. |
| FR-2.3 | The off-canvas sidebar and mobile hamburger MUST be active at 768px and below. |
| FR-2.4 | Container queries MUST NOT be used; viewport media queries only. |

### FR-3: No Horizontal Overflow
| ID | Requirement |
|----|-------------|
| FR-3.1 | Images MUST have `max-width: 100%; height: auto` as a baseline reset. |
| FR-3.2 | Prose tables and config-field tables MUST scroll horizontally at mobile widths (`display: block; overflow-x: auto`) instead of overflowing the page. |
| FR-3.3 | Flex rows that can exceed the viewport MUST wrap (`flex-wrap: wrap`). |
| FR-3.4 | Card grids MUST NOT force a track wider than the container on small phones (`minmax(min(100%, 360px), 1fr)` pattern). |

### FR-4: Touch Targets
| ID | Requirement |
|----|-------------|
| FR-4.1 | On `@media (pointer: coarse)` devices, interactive controls (buttons, tabs, pills, sidebar links, dialog tabs, close/copy buttons) MUST reach a 48x48 CSS px tappable area via invisible `::after` hit-area expansion (`inset: -8px`), leaving visual size unchanged. |
| FR-4.2 | Desktop (fine pointer) density MUST be unchanged. |
| FR-4.3 | The mobile hamburger (mobile-only control) SHOULD be visually 44px. |

### FR-5: Padding and Typography
| ID | Requirement |
|----|-------------|
| FR-5.1 | `.wiki-content` padding MUST reduce at 768px and again at 480px. |
| FR-5.2 | Display-tier font sizes (lg and above) MUST use fluid `clamp()` values whose preferred term includes `vw + rem`; body and small UI text MUST stay fixed rem. |
| FR-5.3 | Fluid maxima MUST resolve to the same values as before at 1280px+, leaving desktop appearance unchanged. |

## 3. Non-Functional Requirements
| ID | Requirement |
|----|-------------|
| NFR-1.1 | `npm run lint` and `npm run build` in `web/` MUST pass after each phase. |
| NFR-1.2 | No new stylesheet or component files SHOULD be created; the patch edits existing files. |

## 4. Constraints
| ID | Constraint | Source |
|----|-----------|--------|
| C-1 | Em dashes are not allowed in user-facing copy | user decision recorded in SPEC-WIKI-RESPONSIVE §2 |
| C-2 | Desktop-first CSS architecture is retained | SPEC-WIKI-RESPONSIVE §2 |
| C-3 | Next.js App Router viewport export requires Next.js 14+ | Next.js docs |

## 5. Assumptions
| ID | Assumption |
|----|-----------|
| A-1 | Prose tables have no sticky headers. |
| A-2 | Markdown is rendered to an HTML string, so table wrapper divs cannot be injected; tables themselves become scroll containers. |

## 6. Open Questions
None.

## 7. Verification Matrix
| # | Test | Maps to |
|---|------|---------|
| V1 | Manual: Chrome DevTools device emulation at 320/375/768/1024/1280px | FR-1, FR-2, FR-3, FR-5 |
| V2 | Manual: touch emulation, inspect `::after` hit areas | FR-4 |
| V3 | `npm run lint` + `npm run build` in `web/` | NFR-1.1 |

## 8. Implementation Status
| Item | Status | Evidence |
|------|--------|----------|
| FR-1.1/FR-1.2 viewport export | Implemented | web/app/layout.tsx (`export const viewport`) |
| FR-2.2 playground collapse at 1024px | Implemented | web/public/styles/_wiki-playground.css |
| FR-2.3 off-canvas sidebar at 768px | Implemented | web/public/styles/_wiki-layout.css, MobileNavToggle.tsx |
| FR-3.1 image reset | Implemented | web/src/styles/globals.css |
| FR-3.2 table scroll | Implemented | web/public/styles/_prose.css, _config-table.css |
| FR-3.3 flex wrapping | Implemented | _tabs.css, _wiki-layout.css, others per spec phase 2c |
| FR-3.4 card grid min() | Not implemented | web/public/styles/_wiki-card.css still `minmax(360px, 1fr)` |
| FR-4.1/FR-4.2 hit-area expansion | Implemented | web/public/styles/_a11y.css (`@media (pointer: coarse)`) |
| FR-5.2 fluid type scale | Implemented | web/public/styles/_variables.css (clamp tiers) |
| Grafana iframe responsive height | Implemented | web/src/components/wiki/GrafanaEmbed.tsx (`clamp(400px, 80vh, 1200px)`) |
| Bare `<pre>` overflow fix (spec phase 2d) | Not applicable | checks detail route (`app/checks/[id]/`) no longer exists |
