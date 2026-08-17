# SPEC-WIKI-RESPONSIVE: Portal Responsive Implementation

**Date:** 2026-08-16
**Status:** Active
**Type:** Specification
**Requirements:** [REQ-WIKI-RESPONSIVE](../requirements/REQ-WIKI-RESPONSIVE.md)

## 1. Strategy

The portal retains desktop-first base styles and narrows behavior with three
viewport breakpoints:

| Breakpoint | Responsibility                                                 |
| ---------- | -------------------------------------------------------------- |
| 1024px     | Stack playground panes and adapt large compositions            |
| 768px      | Activate off-canvas navigation and compact shell layout        |
| 480px      | Tighten phone spacing, typography, hero, and card presentation |

Shared tokens and accessibility rules live in `web-components`; portal layout
and feature rules live under `web/public/styles` and are composed by
`web/src/styles/globals.css`.

## 2. Viewport and Overflow

`web/app/layout.tsx` exports `Viewport` with `width: 'device-width'` and
`initialScale: 1`. Zoom remains enabled.

`globals.css` clips accidental root overflow and constrains images. Feature
styles provide local overflow for prose tables, schema fields, highlighted
source, Makefiles, and modal content. Flexible headers, breadcrumbs, tabs,
filters, footers, and card actions wrap before they exceed the viewport.

Card grids use a minimum track bounded by the container so a nominal desktop
card width never forces horizontal scrolling on a 320px phone.

## 3. Navigation

Desktop layout uses the persistent sidebar and supports its compact rail state.
At 768px and below:

1. `MobileNavToggle` opens the sidebar overlay;
2. a backdrop covers the page content;
3. route changes close the sidebar;
4. Escape closes the sidebar;
5. selecting a sidebar link closes the sidebar and resets its scroll position
   for the next open.

The button reports `aria-expanded` and targets `wiki-sidebar` with
`aria-controls`.

## 4. Feature Layouts

### 4.1 Landing

`LandingStageVariant` selects stacked and carousel compositions according to
the portal stylesheet contract. Both variants consume the same controller and
content. Media uses container bounds; text measurement prevents transition
layout jumps. Pointer parallax and timed motion stop or simplify when reduced
motion is requested.

### 4.2 Catalogues and Dialogs

Catalogue cards collapse to one column as available width narrows. Filters and
tabs wrap. Dialogs constrain width and height to the viewport, keep their close
and copy controls reachable, and scroll schema/source content internally.

### 4.3 Project Documentation

README images scale to their prose container. Tables and preformatted blocks
scroll locally. Project headers and metadata wrap. Repository assets continue
through the project asset endpoint at every width.

### 4.4 Playground

The desktop playground uses editor and result panes. At 1024px and below,
`.playground-panes` becomes one column. The CodeMirror viewport remains
scrollable, controls wrap, and result selection continues to scroll the editor
to the selected line.

### 4.5 Gateway

Dashboard tabs remain operable when they wrap or scroll. `GrafanaEmbed` uses
`clamp(400px, 80vh, 1200px)` for panel height so both short mobile screens and
tall desktop screens remain useful.

## 5. Touch and Typography

`web-components/src/styles/_a11y.css` applies coarse-pointer hit-area expansion
to shared and portal controls without increasing fine-pointer visual density.
The mobile navigation button has a visibly touchable mobile size.

Typography tokens in `web-components/src/styles/_variables.css` use fluid
`clamp()` values for display tiers. Preferred values combine relative and
viewport units. Body and compact UI tiers remain fixed relative sizes.

## 6. Verification Matrix

| Surface         | 320/375         | 768                | 1024               | 1280           |
| --------------- | --------------- | ------------------ | ------------------ | -------------- |
| Shell/sidebar   | overlay         | overlay            | persistent         | persistent     |
| Landing         | stacked/compact | responsive variant | responsive variant | carousel/full  |
| Card catalogues | one column      | fluid grid         | fluid grid         | full grid      |
| Dialogs/source  | viewport-bound  | viewport-bound     | bounded            | bounded        |
| Playground      | stacked         | stacked            | stacked            | two pane       |
| Grafana         | bounded iframe  | bounded iframe     | bounded iframe     | bounded iframe |

Automated validation uses the web lint, type-check, test, and build commands.
Manual browser verification covers navigation dismissal, touch targets,
reduced motion, focus visibility, and the absence of document-level horizontal
scrolling.
