# Workflow: Writing Wikis

Team workflow for building and maintaining reference wikis in workspace repos: a
shared page structure, citation rules, sourcing standards, and review checklist.
Catalogued pages and home heroes are covered by
[WORKFLOW-WRITING-WEBSITE-COPY.md](WORKFLOW-WRITING-WEBSITE-COPY.md). Page
layout, palette, and imagery are covered by
[WORKFLOW-DESIGNING-WEB-PAGES.md](WORKFLOW-DESIGNING-WEB-PAGES.md). Technical
README bodies are covered by
[WORKFLOW-WRITING-README.md](WORKFLOW-WRITING-README.md).

Canonical path: `/opt/workspace-ci/workflows/WORKFLOW-WRITING-WIKIS.md`

Sources: [Ward Cunningham, Design Principles of Wiki](http://c2.com/doc/wikisym/WikiSym2006.pdf),
[Dan Brown, Eight principles of information architecture](https://web.archive.org/web/2019/http://www.asis.org/Bulletin/Aug-10/AugSep10_Brown.pdf),
[Diátaxis](https://diataxis.fr/), [Wikipedia:Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing),
[Wikipedia:Identifying reliable sources](https://en.wikipedia.org/wiki/Wikipedia:Identifying_reliable_sources),
[Google developer documentation style guide](https://developers.google.com/style),
[GOV.UK writing guidelines](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/),
[plainlanguage.gov](https://www.plainlanguage.gov/),
[Nielsen Norman Group, How Users Read on the Web](https://www.nngroup.com/articles/how-users-read-on-the-web/),
[Pew Research, When Online Content Disappears](https://www.pewresearch.org/data-labs/2024/05/17/when-online-content-disappears/),
[Internet Archive, Recovering the Dead Web](https://blog.archive.org/2026/04/23/gone-but-not-forgotten-recovering-the-dead-web/).

## When this workflow applies

| Artifact | Examples | This workflow |
| -------- | -------- | ------------- |
| Reference wiki pages | Project history, timelines, catalogue of artifacts, glossaries | Yes |
| Research compendiums | Source archives, media inventories, factual appendices | Yes |
| Single exploded topics | One long article with no cross-links | Partial (writing, sourcing, and lead rules still apply) |
| README body | Install catalog, subsystem sections | No (README workflow) |
| Hero and catalogue copy | Wiki home title, README blurb | No (website-copy workflow) |
| Release notes, changelogs | Versioned, dated records | No (changelog convention) |

A wiki is a set of interlinked reference pages that a reader can enter from any
page and navigate by title. Build one when the material has more than roughly
five distinct subjects, when readers will arrive from search on a deep page, or
when facts will be corrected over months. For a single subject, write one article.

## Page inventory

Define the page set before writing prose. A working wiki has these page kinds:

| Page kind | Job | Example |
| --------- | --- | ------- |
| Home or portal | State the subject in two sentences, then link every category | `index` |
| Hub or category | List the child pages for one theme, each with a one-line annotation | `campaign`, `media` |
| Article | Explain one subject in full, with references | `development-history` |
| Timeline | Date-ordered events, one row per entry | `timeline` |
| Reference or inventory | Tables of facts: files, builds, people, sources | `builds`, `people` |
| Glossary | Short definitions for terms used across pages | `glossary` |
| Sources | Every external reference, with archive links and access dates | `sources` |
| 404 | A real branded page that links back to the home and a sitemap | `404.html` |

One topic gets one canonical page. When two pages cover the same subject, merge
them and leave a redirect. Duplicate pages drift apart and both become wrong.

## Structure an article

Use the same order on every article so readers learn the shape:

1. **Lead.** Two to four sentences that define the subject, give the single most
   important fact, and place it in context. A reader who stops here has the gist.
2. **Infobox or fact table.** Dates, status, key people, identifiers. Keep it to
   the facts that appear as one line, not prose.
3. **Sections.** Descriptive headings, front-loaded. Each section states its
   point in the first sentence.
4. **Categories or tags.** Classification used by the hub pages.
5. **References.** Numbered sources for every non-obvious claim, with title,
   publisher, date, and an archive link.

The lead carries the article. Write it last, after the facts settle.

## Naming and linking

- **Title pages with precise noun phrases.** `development-history` and
  `the-2004-build`, not `stuff` or `info`. Cunningham's precise principle: the
  title should avoid most name clashes on its own.
- **Keep slugs stable.** A page title can change; the URL should not, because
  external links point at it. Add a redirect when a slug must move.
- **Use one flat namespace.** Every page has a unique title, so a link needs no
  breadcrumb to be understood.
- **Link first mentions.** The first occurrence of another page's subject
  becomes a link. Later occurrences stay plain.
- **Avoid orphans.** Every page is reachable from a hub or the home. Run a link
  check that lists pages with no inbound links.
- **External links get descriptive text.** Link the source title, then the
  archive copy.

## Information architecture

Dan Brown's principles map cleanly onto a wiki:

| Principle | Wiki application |
| --------- | ---------------- |
| Objects | Treat each subject as a page with a stable structure and lifecycle |
| Choices | Keep each hub list short and scoped to one task |
| Disclosure | Show enough in the lead and hub annotation to let readers judge depth |
| Exemplars | Describe a category by listing a few real pages in it |
| Front doors | Assume readers arrive on deep pages from search, so every page explains itself |
| Multiple classification | Offer category pages, a timeline, and an index by kind |
| Focused navigation | Keep one primary nav; do not mix browse menus with utility links |
| Growth | Structure hubs and categories to absorb new pages without a restructure |

## Writing rules

The full prose rules live in
[WORKFLOW-WRITING-README.md](WORKFLOW-WRITING-README.md#prose-style-technical-body).
They apply here unchanged: flat factual sentences, no contrast constructions, no
meta lead-ins, no empty qualifiers, no boast. Wiki-specific additions:

- **Front-load every page and section.** The first sentence carries the point.
  Readers skim headings and leads before committing.
- **Write descriptive, removable headings.** A reader scrolling only the
  headings should follow the article. Avoid `Introduction` and question headings.
- **Keep paragraphs short.** Five sentences is a ceiling. Split sentences over
  roughly 25 words.
- **State the subject of a leaked, cancelled, or unfinished project as a fact
  and label its status.** `The build contains six playable missions.` Add the
  date and source. Do not pad with speculation.
- **Use the active voice.** `Blizzard bought Swingin' Ape in 2005.`

### Banned AI writing tells

Wikipedia's editors catalogue the patterns that read as machine-generated. None
of them belong in a reference wiki.

| Pattern | Why | Fix |
| ------- | --- | --- |
| `Not only X, but Y` and `It is not just X` | Antithesis asserts by contrast | State X, then Y as facts |
| `stands as a ... to`, `plays a ... role` | Editorial boilerplate | Name the mechanism |
| Corporate filler verbs and adjectives (the banned-words config lists them) | Vague, says nothing | Use the plain verb or noun |
| `In conclusion`, `Overall`, `In summary` | Restates the section | Cut |
| Rule of three adjective stacks | Rhythm without content | Keep the one adjective that carries a fact |
| Bolded lead noun list (`**X:** ... **Y:** ...`) in every paragraph | Template drift | Prose, or a real table |
| Em dash for punch | Style tell | Comma, colon, or a period |
| `It is worth noting that` | Empty qualifier | Cut, or state the fact |

## Sourcing and citations

The wiki is only as good as its references. Hold to these rules on every page.

- **Separate primary from secondary.** A build dump, a press release, and a
  journalist's analysis carry different weight. Say which one each claim rests
  on. Primary artifacts prove what exists; secondary sources explain intent.
- **Cite what you write.** Every non-obvious date, name, number, and quote needs
  a reference. A claim a reader might question needs a source, and so does a
  claim a reader might simply want to check.
- **Prefer reliable sources.** Favour first-party material (official sites,
  developer statements, archive dumps), professional reporting, and peer
  documentation. Treat fan wikis and forum posts as leads, then verify against a
  stronger source.
- **Quote exactly and date the quote.** A statement about a cancelled project is
  true as of its date. Attribute it and keep the date.
- **Archive every link at capture time.** Pew Research found 38 percent of 2013
  webpages were gone by 2023, and Internet Archive recovers only part of that
  loss. Save each page to the Wayback Machine when you cite it, then link both
  the live URL and the archive copy.
- **Write the reference consistently.** Author or site, page title, publication
  date, access date, live URL, archive URL. Keep the order the same everywhere.
- **Never cite a search-result page or a bare domain.** Link the page that
  carries the claim.
- **Mark uncertainty once.** Use a short status line or a notes column for
  unconfirmed material. Do not hedge in every sentence.

## Maintain the wiki

A wiki fails by rotting, not by being wrong on day one.

- **Run the link check in CI.** Fail the build on a dead external link. Keep an
  allowlist for sources that move, and replace the link when it does.
- **Re-verify volatile pages** on a schedule: prices, staff, status, and any
  date-sensitive claim.
- **Watch the source list.** When a source is removed from the web, restore the
  archive link and leave a note.
- **Fix orphans and duplicate topics** when the link check reports them.
- **Record corrections.** A changelog or a `last-reviewed` date per page tells
  readers the page is cared for.

## Static build (workspace wikis)

Workspace wikis follow the documents-first pattern used by the SPA reference
site. The pages are the site.

- **Every route is a complete HTML document** that renders and reads with
  JavaScript disabled: full head, landmarks, content, and footer.
- **One hand-written stylesheet**, a few kilobytes of vanilla JavaScript, no
  framework, no build step, no webfonts, no third-party requests. JavaScript
  upgrades same-origin navigation with the Navigation API and View Transitions.
- **Per-route files:** `site/<locale>/<route>/index.html`, plus `404.html`.
  `site/assets/routes.json` and `locales.json` drive the runtime nav.
- **Accessibility:** WCAG 2.2 AA, one `<h1 tabindex="-1">` per page, a skip
  link, `header`/`main#main`/`footer` landmarks, a labelled primary nav, and a
  status live region that announces route changes.
- **Budgets enforced in CI:** under 50 KB Brotli per route, under 8 KB
  hand-written JavaScript, under 8 KB CSS. A `tools/measure.mjs` run rewrites a
  receipts block in the colophon from measured bytes.
- **Tests:** `tools/test-documents.mjs` asserts the document contract (landmarks,
  one h1, no third-party origins, internal links resolve).

## Review checklist

- [ ] Every page has a unique noun-phrase title and a stable slug
- [ ] Every page opens with a lead that stands alone
- [ ] Headings are descriptive, front-loaded, and removable
- [ ] Every non-obvious claim has a reference with a date
- [ ] Primary and secondary sources are distinguished
- [ ] Every external link has an archive copy
- [ ] No AI writing tells from the banned table
- [ ] No contrast constructions, meta lead-ins, empty qualifiers, or praise
- [ ] No orphan pages; every page reachable from a hub
- [ ] Hubs list their children with one-line annotations
- [ ] Link check passes; no dead external links
- [ ] Route document contract and weight budgets pass
- [ ] `404` page links home and to the index

## AI / agent instructions

When asked to create or edit a workspace wiki:

1. Load this file first. Load
   [WORKFLOW-WRITING-WEBSITE-COPY.md](WORKFLOW-WRITING-WEBSITE-COPY.md) for the
   home hero and
   [WORKFLOW-CREATING-DIAGRAMS.md](WORKFLOW-CREATING-DIAGRAMS.md) for timelines
   or structure diagrams.
2. **Define the page inventory before writing.** List pages, their kinds, and
   their parent hubs.
3. **Research from sources, then cite.** Read the target repo, primary
   artifacts, and upstream sources. Never invent a date, a name, or a number.
4. **Draft each page with its lead last.** Front-load the final version.
5. **Archive every external link** you add, and write the reference in the
   standard field order.
6. **Strip banned prose** from the checklist and report what you removed.
7. **Add the page to a hub and the route registry.** No page ships as an orphan.
8. **Run the link check and the weight measurement** before finishing.
9. Do not commit, push, or rebuild prod unless the user explicitly asks.

## Worked example: StarCraft: Ghost archive wiki

_Illustrates the rules above. Do not copy its page names into unrelated wikis._

| Page | Kind | Parent | Lead fact |
| ---- | ---- | ------ | --------- |
| `index` | Home | none | A cancelled 2002-2006 stealth-action game, documented from the leaked 2004 build |
| `timeline` | Timeline | index | Announced 2002, shelved 2006, cancelled 2014 |
| `development` | Article | index | Nihilistic, then Swingin' Ape, then an internal Blizzard hold |
| `the-leak` | Article | index | The May 8 2004 build, dumped and released by Finn Hillbilly |
| `campaign` | Hub | index | Six playable missions of a roughly 45-mission plan |
| `systems` | Hub | index | Psi powers, calldowns, and weapons, with wired and unwired states |
| `multiplayer` | Article | index | Promised 16-player play, absent from the build |
| `story` | Article | index | Project Shadow Blade and the terrazine Spectres |
| `media` | Reference | index | Cutscenes, video, sound banks, and unit bios |
| `people` | Reference | index | Studios, designers, and the composer |
| `faq` | Article | index | Common questions with sourced answers |
| `sources` | Sources | index | The full reference list with archive links |
| `gap-analysis` | Article | index | Stated vision against what the build contains |
| `404.html` | 404 | none | A styled miss page linking home and the index |

Approved lead shape for the article on the build:

```
The build was compiled on May 8 2004 and dumped by Finn Hillbilly, who
released it in December 2019. It is an Xbox development image that runs in
Cxbx-Reloaded, and it contains six playable missions from a planned slate
of about 45.
```

Rejected lead, with the reasons:

```
It is worth noting that this legendary, not only cancelled but also
long-lost build evokes a bygone era of gaming.
```

Problems: empty qualifier (`It is worth noting`), praise (`legendary`),
antithesis (`not only ... but also`), boilerplate (`evokes a bygone era`),
and no fact.

### Reference shape from that wiki

```
Hidden Palace, "StarCraft: Ghost (May 8, 2004 prototype)", accessed
October 6 2026, https://hiddenpalace.org/... ; archived at
https://web.archive.org/web/.../https://hiddenpalace.org/...
```

Fields in order: site, page title, access date, live URL, archive URL.

## References

- [WORKFLOW-WRITING-WEBSITE-COPY.md](WORKFLOW-WRITING-WEBSITE-COPY.md) (home hero, catalogue intros)
- [WORKFLOW-WRITING-README.md](WORKFLOW-WRITING-README.md) (prose style, README structure)
- [WORKFLOW-CREATING-DIAGRAMS.md](WORKFLOW-CREATING-DIAGRAMS.md) (Mermaid rules)
- [Diátaxis](https://diataxis.fr/) (tutorials, how-to, reference, explanation)
- [Ward Cunningham, Design Principles of Wiki](http://c2.com/doc/wikisym/WikiSym2006.pdf) (open, precise, convergent)
- [Dan Brown, Eight principles of information architecture](https://web.archive.org/web/2019/http://www.asis.org/Bulletin/Aug-10/AugSep10_Brown.pdf) (front doors, growth, classification)
- [Wikipedia:Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing) (banned tells)
- [Wikipedia:Identifying reliable sources](https://en.wikipedia.org/wiki/Wikipedia:Identifying_reliable_sources) (source tiers)
- [GOV.UK writing guidelines](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/) (plain English, structure)
- [Pew Research, When Online Content Disappears](https://www.pewresearch.org/data-labs/2024/05/17/when-online-content-disappears/) (link rot rates)
- [Internet Archive, Recovering the Dead Web](https://blog.archive.org/2026/04/23/gone-but-not-forgotten-recovering-the-dead-web/) (archive rescue)
