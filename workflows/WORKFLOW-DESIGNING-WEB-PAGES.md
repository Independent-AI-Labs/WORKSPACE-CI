# Workflow: Designing Web Pages

Team workflow for building visitor-facing web pages and wikis in workspace repos:
how to commit to a design direction, avoid the recognisable AI slop defaults, use
real imagery, and enforce the result in tests. Copy and structure are covered by
[WORKFLOW-WRITING-WEBSITE-COPY.md](WORKFLOW-WRITING-WEBSITE-COPY.md) and
[WORKFLOW-WRITING-WIKIS.md](WORKFLOW-WRITING-WIKIS.md).

Canonical path: `/opt/workspace-ci/workflows/WORKFLOW-DESIGNING-WEB-PAGES.md`

Sources: [Anthropic, Improving frontend design through Skills](https://claude.com/blog/improving-frontend-design-through-skills),
[Anthropic frontend-design skill](https://raw.githubusercontent.com/anthropics/skills/main/skills/frontend-design/SKILL.md),
[Anthropic, Prompting for frontend aesthetics](https://platform.claude.com/cookbook/coding-prompting-for-frontend-aesthetics),
[avoid-ai-design](https://github.com/funboy322/avoid-ai-design),
[refero anti-ai-slop](https://github.com/referodesign/refero_skill/blob/master/skills/refero-design/references/anti-ai-slop.md),
[925Studios, AI slop design tells](https://www.925studios.co/blog/ai-slop-design-tells),
[Sailop, AI Slop Encyclopedia](https://sailop.com/blog/ai-slop-encyclopedia),
[Developers Digest, AI Design Slop](https://www.developersdigest.tech/blog/ai-design-slop-and-how-to-spot-it),
[Pew Research, When Online Content Disappears](https://www.pewresearch.org/data-labs/2024/05/17/when-online-content-disappears/).

## When this workflow applies

| Artifact | Examples | This workflow |
| -------- | -------- | ------------- |
| Static wikis and documentation sites | Archive wikis, project references | Yes |
| Landing pages and marketing sites | Product hero, feature pages | Yes |
| Web components and design systems | Shared cards, modals, tokens | Yes (tokens and rules) |
| README and catalogue copy | Blurbs, hero strings | No (website-copy workflow) |
| Server routes and data loading | APIs, loaders | No (project architecture) |
| Diagrams | Mermaid, charts | No (diagram workflow) |

## The thesis: slop is the absence of a decision

A model predicts the median of its training data. Asked for a page with no
direction, it returns the same safe defaults: Inter, a purple gradient, a
centred hero, three rounded cards. Anthropic calls this distributional
convergence. The fix is not a different default, it is a recorded decision on
every axis the brief leaves free. Write those decisions down before coding, as
in `wiki/docs/DESIGN-DIRECTION.md`, so they do not drift back.

## Anti-slop rules

### Typography

- Do not use Inter, Roboto, Open Sans, Lato, or the raw system stack as an
  unchosen default. The workspace static-site contract keeps system fonts, so buy
  distinctiveness elsewhere: scale extremes, weight contrast, and a paired
  monospace face for data and identifiers.
- Avoid the local maxima that replace Inter: Space Grotesk and Geist.
- Use a type scale with real jumps. Body to display should be roughly 3x, weights
  400 versus 700, not 400 versus 600.
- Never italicise or recolour one word of a headline as an accent.

### Color

- No purple-to-blue or indigo-to-violet gradient. This is the loudest single tell.
- No gradient `background-clip: text` headlines.
- One dominant base and one sharp accent beat a timid, evenly distributed
  palette. Draw the palette from the subject, not from a framework default.
- Avoid untouched shadcn zinc or slate, and default Tailwind `blue-600`.
- If a dark theme exists, keep body contrast above the WCAG threshold.
- A functional scrim (for text over an image) is allowed; decorative gradient
  washes are not.

### Layout

- Avoid the full-viewport centred hero that stacks eyebrow, title, lede, and CTA
  on one axis. Bias left or right, or use an asymmetric frame.
- Avoid the three-equal-column icon-tile feature grid, numbered step sequences,
  and stat-banner rows.
- Give the page a layout concept and repeat it. Uniform `gap-4` with no spatial
  hierarchy reads as a template.
- Assume readers arrive on deep pages. Every page explains itself without the
  home page.

### Components and chrome

| Banned tell | Replacement |
| --- | --- |
| Identical rounded cards, one radius on everything, one soft shadow | A layout primitive chosen for the subject: readout rows, plates, hairline panels |
| `backdrop-blur` glassmorphism by reflex | Flat surfaces with a deliberate border or rule |
| Coloured left-border card, the "AI citation" stripe | A real label, tag, or heading |
| Icon in a rounded square, emoji as icons or bullets | Real imagery, or a plain text label |
| Tracked-out ALL-CAPS eyebrow above every heading | Descriptive headings; reserve caps for in-fiction or data labels |
| Middle-dot meta strings (`A · B · C`) | A consistent separator (`A // B`), or a list |
| `→` appended to link and button text | Plain link text |

### Imagery

- **Never collapse an image-led subject into text and CSS decorations.** If the
  reference or the subject is carried by photography, screenshots, or art,
  preserve that role with a real asset.
- Use original or archival media when it exists. Do not generate imagery for a
  subject that has a real archive.
- Fall back to an intentional stand-in frame (fixed aspect ratio, caption,
  credit) when the asset is unavailable. Never fake photography with CSS blobs.
- Every image gets intrinsic `width` and `height`, alt text, a caption where it
  carries meaning, and a source credit. Hero images may use
  `fetchpriority="high"`; all others defer loading.
- Copyrighted media stays out of the repository. Keep it under a gitignored path,
  record provenance in a tracked credits file, and render acceptably in a clone.

### Copy

- No "Elevate / Seamless / Powerful", no generic Get Started / Learn more pairs,
  no invented metrics. This overlaps the website-copy workflow; both apply.

## The design-brief process

1. **Pick one committed direction** drawn from the subject, not from a trend.
   Name it in one line.
2. **Record the decisions**: palette (4 to 6 named values with roles), type roles
   and scale, a layout concept, the component vocabulary, and the media role.
   Use one-sentence descriptions and an ASCII wireframe to compare options.
3. **Review against the brief.** For each axis, ask whether it is the default you
   would produce for any similar page. If it is, revise it and say what changed.
4. **Spend boldness in one place.** Let one element be memorable; keep the frame
   quiet. Before shipping, remove one accessory.
5. **Verify visually.** Take screenshots at 320, 375, 768, 1024, and 1280 pixels
   in light and dark, and under reduced motion. A picture catches what prose
   misses.

## Enforce in tests, not in prose

The workspace doctrine is enforcement, not instruction (see
`docs/presentation-guardrails.md`). A design rule that is not tested will drift.

| Check | What it asserts |
| ----- | --------------- |
| Slop lint | No AI-purple hexes, no `box-shadow`, no `backdrop-filter`, no `background-clip`, no non-zero `border-radius` on card primitives, no middle-dot separators |
| Image integrity | Every manifest image exists; every `<img>` has alt, width, height, and loading or fetchpriority |
| Link and document contract | Landmarks, one heading, internal links resolve, no third-party asset origins |
| Weight budget | Route, JavaScript, and CSS budgets, as in the SPA reference |
| Accessibility | Automated axe pass on every route |
| Visual review | Screenshots at the breakpoints above |

Prefer the smallest enforcement that catches the regression: a banned-substring
linter for hexes and properties, a manifest check for imagery, and one screenshot
pass for composition.

## Worked example: StarCraft: Ghost archive wiki

_Illustrates the rules. Page and palette names are not requirements elsewhere._

The first draft was forgettable rather than maximal: no gradients or glass, but
an unchosen AI-purple accent (`#7a4bd0`), a centred article column, auto-fit
rounded cards, uppercase tracked labels, middle-dot separators, and zero images
for a subject made of archival imagery.

| Axis | Before | After |
| ---- | ------ | ----- |
| Accent | AI purple `#7a4bd0` | Phosphor green and HUD amber sampled from the game, no purple |
| Layout | Centred 68ch column, card grid | Asymmetric terminal frame: status bar, numbered mission-index rail, hairline panels |
| Components | Rounded cards, pill chips | Bracket-cornered panels, bracketed `[PRESENT]` status tokens, readout tables |
| Type | System stack, uniform scale | System plus monospace for identifiers, scale extremes, `//` section marks |
| Imagery | None | 55 real archived images: hero key art, per-article plates, a media gallery |
| Proof | None | Slop lint, image-manifest integrity, weight budgets, document contract |

The palette was drawn from the artifact rather than the model: the key art is
violet, so the interface deliberately uses the game's green-and-amber HUD
instead, which avoids the AI-purple default while staying true to the subject.

### Image pipeline pattern from that wiki

1. A curated `image-sources.json` lists real source URLs with role, caption, alt,
   and credit.
2. A fetch step downloads originals through the Internet Archive raw endpoint
   into a gitignored tree.
3. An optimize step writes WebP and JPEG derivatives plus a manifest with
   dimensions, and a tracked credits table with live and archive URLs.
4. Pages reference local derivatives; the document test verifies alt, dimensions,
   deferred loading, and that every referenced asset exists.

## Review checklist

- [ ] A committed design direction is written down with palette, type, layout,
      components, and media role
- [ ] No Inter, Roboto, Space Grotesk, or Geist as an unchosen default
- [ ] No purple-to-blue gradient or gradient text
- [ ] No centred full-viewport hero or three-card icon grid
- [ ] No uniform rounded-card kit, glassmorphism, or coloured left-border cards
- [ ] No tracked ALL-CAPS eyebrows or middle-dot meta strings
- [ ] Image-led subjects use real assets, with alt, dimensions, caption, and
      credit; no fake imagery
- [ ] Copyrighted media is gitignored with tracked provenance
- [ ] A slop lint and an image-integrity test run in CI
- [ ] Screenshots verified at 320 to 1280 pixels, light and dark, reduced motion
- [ ] Weight and accessibility budgets still pass
- [ ] One bold element; at least one accessory removed

## AI / agent instructions

When asked to build or restyle a web page:

1. Load this file, plus
   [WORKFLOW-WRITING-WEBSITE-COPY.md](WORKFLOW-WRITING-WEBSITE-COPY.md) for copy
   and [WORKFLOW-WRITING-WIKIS.md](WORKFLOW-WRITING-WIKIS.md) for structure.
2. **Research the subject** and its real imagery before choosing anything. Do not
   generate imagery for a subject that has a real archive.
3. **Write the design brief before the code.** Palette, type, layout, components,
   media role, and the one bold element. Review it against the defaults.
4. **Implement to the brief**, then add the slop lint and image-integrity tests in
   the same change.
5. **Take screenshots** at the required breakpoints before declaring done.
6. Report what defaults you rejected and why.
7. Do not commit, push, or deploy unless the user explicitly asks.

## References

- [WORKFLOW-WRITING-WEBSITE-COPY.md](WORKFLOW-WRITING-WEBSITE-COPY.md) (hero and catalogue copy)
- [WORKFLOW-WRITING-WIKIS.md](WORKFLOW-WRITING-WIKIS.md) (wiki structure and sourcing)
- [WORKFLOW-CREATING-DIAGRAMS.md](WORKFLOW-CREATING-DIAGRAMS.md) (Mermaid)
- [WORKFLOW-WRITING-README.md](WORKFLOW-WRITING-README.md) (prose style)
- [Anthropic, Improving frontend design through Skills](https://claude.com/blog/improving-frontend-design-through-skills)
- [avoid-ai-design](https://github.com/funboy322/avoid-ai-design)
- [925Studios, AI slop design tells](https://www.925studios.co/blog/ai-slop-design-tells)
- [refero anti-ai-slop](https://github.com/referodesign/refero_skill/blob/master/skills/refero-design/references/anti-ai-slop.md)
- [Pew Research, When Online Content Disappears](https://www.pewresearch.org/data-labs/2024/05/17/when-online-content-disappears/) (link rot and archives)
