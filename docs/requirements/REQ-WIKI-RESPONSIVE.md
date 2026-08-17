# REQ-WIKI-RESPONSIVE: Portal Responsive Layout

**Date:** 2026-08-16
**Status:** Active
**Type:** Requirements
**Specification:** [SPEC-WIKI-RESPONSIVE](../specifications/SPEC-WIKI-RESPONSIVE.md)

## 1. Purpose

The workspace portal MUST remain usable across phones, tablets, laptops, and
desktop displays while preserving its dense catalogue, document, landing, and
dashboard interfaces.

## 2. Requirements

| ID      | Requirement                                                                                                                                                      |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RESP-1  | `app/layout.tsx` MUST export a zoom-permitting Next.js viewport with device width and initial scale 1.                                                           |
| RESP-2  | The desktop-first stylesheet architecture MUST use viewport breakpoints at 480px, 768px, and 1024px.                                                             |
| RESP-3  | At 768px and below, the sidebar MUST become an off-canvas overlay controlled by the mobile navigation button and dismissible by navigation, backdrop, or Escape. |
| RESP-4  | At 1024px and below, the playground panes MUST stack into one column.                                                                                            |
| RESP-5  | Landing content MUST select its stacked or carousel presentation through the implemented responsive variant mechanism.                                           |
| RESP-6  | Images MUST fit their container, wide tables and source blocks MUST scroll, flexible control rows MUST wrap, and card tracks MUST fit a 320px viewport.          |
| RESP-7  | Main content and hero spacing MUST reduce at mobile breakpoints without obscuring controls or text.                                                              |
| RESP-8  | Display typography MUST use fluid token values while body and compact interface text remain readable fixed sizes.                                                |
| RESP-9  | Coarse-pointer controls MUST provide an effective touch target of approximately 48 CSS pixels while fine-pointer density remains unchanged.                      |
| RESP-10 | Embedded Grafana panels MUST use a viewport-relative height with practical minimum and maximum bounds.                                                           |
| RESP-11 | Responsive motion and transitions MUST respect `prefers-reduced-motion`.                                                                                         |
| RESP-12 | No portal route MUST introduce document-level horizontal scrolling at 320px width.                                                                               |

## 3. Verification

1. Test the shell, catalogues, project README, landing page, playground,
   configuration dialogs, and gateway at 320, 375, 768, 1024, and 1280px.
2. At narrow widths, verify sidebar open/close behavior, focus visibility,
   wrapped controls, single-column cards, and local scrolling for tables/code.
3. Under coarse-pointer emulation, verify expanded touch areas.
4. Under reduced-motion emulation, verify landing and shared transitions reduce
   motion.
5. Run `npm run lint`, `npm run type-check`, `npm test`, and `npm run build`.
