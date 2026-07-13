# Workflow: Writing Website Copy

Team workflow for wiki and product-facing prose in this repo. Not a style
guide for READMEs or API docs: a checklist for homepage heroes, footers,
branding strings, and other visitor-facing lines that must read like a human
wrote them on purpose.

Sources: [HubSpot blink test](https://blog.hubspot.com/blog/tabid/6307/bid/34061/how-to-make-sure-your-website-passes-the-dreaded-blink-test.aspx),
[Blend B2B homepage hero practices](https://www.blendb2b.com/websites-decoded/homepage-hero-best-practices),
plain-language guidance from [plainlanguage.gov](https://www.plainlanguage.gov/guidelines/conversational/use-pronouns/).

## When this workflow applies

| Copy type | Where it lives | This workflow |
|-----------|----------------|---------------|
| Home hero title + subtitle | `web/app/page.tsx`, `web/branding.yaml` | Yes |
| Footer tagline, product name | `web/branding.yaml` | Yes |
| Page intros, modal strings | `web/branding.yaml`, page components | Yes |
| Grafana subtitles, dashboard titles | `web/branding.yaml` | Light pass (clarity, no slogans) |
| README architecture, hook docs | `README.md`, `docs/` | No (technical docs, not marketing) |
| Commit messages, CI output | hooks, Makefiles | No |

## The blink test (8 seconds)

A first-time visitor decides stay-or-leave in roughly eight seconds. Hero copy
must answer, without cleverness:

1. **What is this?** (noun: wiki, catalogue, dashboard)
2. **Who is it for?** (digital and AI safety work, operators, implementers)
3. **What can I do here?** (verb: browse, read, compare, inspect)

If a stranger cannot answer all three after one slow read, rewrite.

## Hero structure (two sentences max)

**Sentence 1 (category + scope).** State the product type and domain. No
adjectives unless they disambiguate.

- Good: `Unified wiki for the digital and AI safety stack.`
- Bad: `The ultimate next-generation AI safety command center.`

**Sentence 2 (concrete affordances).** List what visitors can open or do here.
Use plain nouns and one strong verb at the start (`Browse`, `Read`, `Inspect`).
Cap at one short list; do not tack on a closing tagline.

- Good: `Browse git hooks, static checks, guard policies, runtime blocks, and LLM gateway operations from one catalogue.`
- Bad: `Native git hooks, static anti-pattern analysis, policy enforcement, runtime escape-hatch blocking, and a multi-tenant LLM gateway, every guardrail, side by side.`

## Banned patterns (wiki UI)

Do not ship these in visitor-facing copy:

| Pattern | Why |
|---------|-----|
| Em dash as a punchline connector | Reads like AI slide deck; use a period or rewrite as one sentence |
| Closing taglines (`side by side`, `all in one place`, `every guardrail`) | Adds nothing after the list; sounds like stock marketing |
| `The unified wiki for…` leading article + stacked features | Weak opener; prefer direct `Unified wiki for…` or `A single wiki for…` |
| Triple adjectives (`multi-tenant LLM gateway` in hero) | Save precision for the page that owns the feature |
| `-hatch` jargon without context on home hero | OK on `/guard` or `/runtime-hooks`; home hero uses shorter labels (`runtime blocks`) |
| Exclamation marks | Never on heroes or footers |
| Passive openings (`It is designed to…`) | Use active: `Browse…`, `Read…`, `Open…` |

## Word choice

| Prefer | Avoid in heroes |
|--------|-----------------|
| git hooks | native git hooks (redundant on a technical wiki) |
| static checks | static anti-pattern analysis (too long for hero) |
| guard policies | policy enforcement (vague) |
| runtime blocks | escape-hatch blocking (inside baseball on home) |
| LLM gateway operations | multi-tenant LLM gateway (feature dump) |
| catalogue / wiki | platform, solution, ecosystem |

Match depth to page: home hero is shorthand; dedicated pages carry exact terms
from code and config.

## Writing procedure

1. **Draft in a text editor first.** Not inline in JSX until the line passes
   read-aloud test.
2. **Read aloud once.** If you run out of breath or stumble on the list, shorten.
3. **Count sentences.** Hero subtitle: 2. Page intro: 1-3. Footer tagline: 1.
4. **Check verbs.** Second sentence should start with what the user does.
5. **Remove the last clause.** If the final phrase is motivational, delete it.
6. **Paste into source.** `web/branding.yaml` for reusable strings;
   `web/app/page.tsx` only when the string is home-only.
7. **Rebuild prod wiki** after hero/branding changes:
   `make wiki-prod-build && make wiki-prod-restart` from `projects/CI`.

## Review checklist (PR or self-review)

- [ ] First sentence names wiki + domain (digital and AI safety)
- [ ] Second sentence starts with a user verb
- [ ] No em dashes
- [ ] No closing tagline after a comma list
- [ ] No words from the banned table
- [ ] Read aloud in under 10 seconds
- [ ] `web/branding.yaml` `name` and `footer_tagline` stay consistent with hero tone
- [ ] Tests/fixtures updated if `branding.yaml` strings changed

## Examples (this wiki)

### Home hero subtitle

```
Unified wiki for the digital and AI safety stack. Browse git hooks,
static checks, guard policies, runtime blocks, and LLM gateway
operations from one catalogue.
```

### Product name + footer (`branding.yaml`)

```yaml
name: "Digital and AI Workspace Guardrails"
footer_tagline: "The Digital and AI Workspace Guardrails Wiki"
```

### Anti-patterns we already rejected

```
The unified wiki for the AI safety stack. Native git hooks, static
anti-pattern analysis, policy enforcement, runtime escape-hatch
blocking, and a multi-tenant LLM gateway, every guardrail, side by side.
```

Problems: weak opener, over-long feature names, em-dash tagline, slogan ending.

## AI / agent instructions

When asked to rewrite wiki marketing copy:

1. Load this file first.
2. Propose at most two sentences for heroes.
3. Show the banned-pattern diff (what you removed and why).
4. Do not add enthusiasm, metaphors, or `-hatch` jargon to the home hero.
5. Do not bump unrelated dependencies to land a copy commit.