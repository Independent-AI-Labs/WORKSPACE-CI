# Workflow: Writing Website Copy

Team workflow for visitor-facing prose in workspace repos and the WORKSPACE-CI
wiki. Not a style guide for technical README bodies or API docs: a checklist for
heroes, footers, branding strings, and README catalogue blurbs.

Canonical path: `projects/CI/workflows/WORKFLOW-WRITING-WEBSITE-COPY.md`

Sources: [HubSpot blink test](https://blog.hubspot.com/blog/tabid/6307/bid/34061/how-to-make-sure-your-website-passes-the-dreaded-blink-test.aspx),
[Blend B2B homepage hero practices](https://www.blendb2b.com/websites-decoded/homepage-hero-best-practices),
plain-language guidance from [plainlanguage.gov](https://www.plainlanguage.gov/guidelines/conversational/use-pronouns/).

## When this workflow applies

| Copy type | Where it lives | This workflow |
|-----------|----------------|---------------|
| Home hero title + subtitle | WORKSPACE-CI `web/app/page.tsx`, `web/branding.yaml` | Yes |
| Footer tagline, product name | WORKSPACE-CI `web/branding.yaml` | Yes |
| Page intros, modal strings | WORKSPACE-CI `web/branding.yaml`, page components | Yes |
| **Project catalogue card blurbs** | Any sibling repo `README.md` intro (first ~2 sentences) | **Yes (full pass)** |
| Grafana subtitles, dashboard titles | `web/branding.yaml` | Light pass (clarity, no slogans) |
| README overview structure (what/why/where) | `README.md` intro | No ([WORKFLOW-WRITING-README.md](WORKFLOW-WRITING-README.md) owns structure) |
| README architecture, hook docs | `README.md` body, `docs/` | No (technical docs, not marketing) |
| Commit messages, CI output | hooks, Makefiles | No |

### How catalogue blurbs surface (WORKSPACE-CI wiki)

The wiki Project Catalogue pulls the first prose block from each sibling
README via `extractReadmeSummary()` in `web/src/lib/project-registry.ts`.
It keeps **up to three sentences** after the title; prefer **two** so the
card does not truncate. Edit the README intro, then rebuild prod wiki.

## The blink test (8 seconds)

A first-time visitor decides stay-or-leave in roughly eight seconds. Hero copy
must answer, without cleverness:

1. **What is this?** (noun: wiki, catalogue, gateway, guard, ...)
2. **Who is it for?** (operators, implementers, agents, ...)
3. **What can I do here?** (verb: browse, read, compare, inspect)

If a stranger cannot answer all three after one slow read, rewrite.

## Hero structure (two sentences max)

Applies to **wiki home hero** and **README catalogue intros** unless noted.

**Sentence 1 (category + UVP).** State the product type and the sharpest
differentiators (from repo research, not guesswork). Name 2-3 concrete
capabilities; do not open with a problem statement or requirement list.

**Sentence 2 (breadth + ops + samples last).** For product READMEs: backend
or scope breadth and observability/ops first; **sample deployments or
integrations go last** (they illustrate the repo, they do not define the
product). For wiki hero: one user verb + concrete affordances.

**Length.** Two sentences is the default. Enough detail to convey UVP; not
so listy that both sentences use the same `X does A, B, and C` shape.

Bad patterns (any repo):

- `The ultimate next-generation ... command center.`
- `Running X means managing A, B, and C...` (requirement list opener)
- Leading with sample integrations before stating what the product is
- Closing taglines after a feature list (`side by side`, `all in one place`)

See **Worked examples** for approved shapes from this workspace.

## Research before writing (product README intros)

Do not invent feature or provider lists. Read the target repo first:

1. **README:** features table, supported backends/providers, architecture,
   sample deployments. Note default vs optional.
2. **Config and code:** routes, plugins, policies, or equivalent entry points
   named in docs (paths vary by repo).
3. **Commit history** (when UVP is unclear): `git log --oneline -20`, recent
   feature commits.
4. **Upstream docs** when the product wraps a platform (e.g. APISIX plugins vs
   custom extensions vs plain relays): do not collapse into one shorthand label.

## Banned patterns (wiki UI + catalogue blurbs)

Do not ship these in visitor-facing copy:

| Pattern | Why |
|---------|-----|
| Em dash as a punchline connector | Reads like AI slide deck; use a period, semicolon, or rewrite as one sentence |
| Closing taglines (`side by side`, `all in one place`, `every guardrail`) | Adds nothing after the list; sounds like stock marketing |
| `The unified wiki for…` leading article + stacked features | Weak opener; prefer direct `Unified wiki for…` or `A single wiki for…` |
| Triple adjectives in a hero | Save precision for the page that owns the feature |
| Inside-baseball jargon without context on home hero | OK on dedicated pages; home/catalogue uses shorter labels |
| Exclamation marks | Never on heroes or footers |
| Passive openings (`It is designed to…`) | Use active: `Browse…`, `Read…`, `Open…` |
| Feature-inventory lists (`THING has X, Y, Z… THING also does A, B, C`) | Reads like a spec sheet; fold into two purposeful sentences |
| Parallel pipeline verbs (`present / pass / continue / leave`) | Same rhythm in both sentences; vary structure |
| False dichotomy paired clauses (`Cloud X use… local Y use…`) | State mechanisms once if needed; do not mirror structure |
| Implementation bragging in intro (`pure Lua`, `no sidecar`, hot-path) | Belongs in architecture docs, not catalogue card |
| Colon/comma feature dumps after the product name | `Product: A, B, C, D, …` |
| Shorthand that understates supported backends | Match README/config tables, not one vendor label |
| Too telegraphic | Catalogue blurbs need UVP depth, not tagline length |

## Word choice (WORKSPACE-CI wiki hero)

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

### Wiki hero / branding (WORKSPACE-CI)

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

### Project catalogue README intro (any repo)

1. **Research** (see above) before drafting.
2. **Draft two sentences** immediately under the `#` title; keep blockquote and
   diagrams below a blank line so `extractReadmeSummary()` stops at sentence 2.
3. **Sentence 1:** product category + top UVP features (name them concretely).
4. **Sentence 2:** backend/scope breadth, telemetry or ops, then sample
   integrations **last** (semicolon or final clause).
5. **Paragraph 3+** for default deployment, deep tables, architecture links;
   not in the catalogue blurb.
6. **Read aloud**; reject if both sentences share the same list rhythm.
7. **Rebuild prod wiki** after README intro changes (sibling README is copied
   into the prod image).

## Review checklist (PR or self-review)

### Wiki hero / branding

- [ ] First sentence names wiki + domain (digital and AI safety)
- [ ] Second sentence starts with a user verb
- [ ] No em dashes
- [ ] No closing tagline after a comma list
- [ ] No words from the banned table
- [ ] Read aloud in under 10 seconds
- [ ] `web/branding.yaml` `name` and `footer_tagline` stay consistent with hero tone
- [ ] Tests/fixtures updated if `branding.yaml` strings changed

### Project catalogue README intro

- [ ] Exactly two sentences in the catalogue blurb (third+ only in body copy)
- [ ] Sentence 1: category + named UVP (researched from repo, not generic)
- [ ] Sentence 2: breadth and telemetry/ops before any sample integrations
- [ ] Sample deployments appear **last** in sentence 2 when mentioned
- [ ] Provider/backend list matches README or config (not shorthand)
- [ ] No implementation bragging in the intro
- [ ] No feature-inventory or parallel verb-chain patterns
- [ ] No em dashes; read aloud in under 12 seconds

## AI / agent instructions

When asked to rewrite wiki marketing copy or README catalogue intros:

1. Load this file first (`projects/CI/workflows/WORKFLOW-WRITING-WEBSITE-COPY.md`).
2. **Research the target repo** (README, features, config, recent commits)
   before proposing copy.
3. Propose **at most two sentences** for heroes and catalogue blurbs.
4. Show the banned-pattern diff (what you removed and why).
5. Use worked examples for tone and structure; do not copy product names into
   unrelated repos.
6. Do not lead catalogue intros with sample deployments; put them last in
   sentence 2 when relevant.
7. Do not commit, push, or rebuild prod unless the user explicitly asks.
8. Do not bump unrelated dependencies to land a copy commit.

## Worked examples

*Illustrative only. Do not copy product names or backends into unrelated repos.*

### WORKSPACE-CI wiki: home hero subtitle

```
Unified wiki for the digital and AI safety stack. Browse git hooks,
static checks, guard policies, runtime blocks, and LLM gateway
operations from one catalogue.
```

### WORKSPACE-CI wiki: branding (`branding.yaml`)

```yaml
name: "Digital and AI Workspace Guardrails"
footer_tagline: "The Digital and AI Workspace Guardrails Wiki"
```

### WORKSPACE-CI wiki: rejected hero anti-pattern

```
The unified wiki for the AI safety stack. Native git hooks, static
anti-pattern analysis, policy enforcement, runtime escape-hatch
blocking, and a multi-tenant LLM gateway, every guardrail, side by side.
```

Problems: weak opener, over-long feature names, em-dash tagline, slogan ending.

### WORKSPACE-GATEWAY: approved catalogue intro

```
Apache APISIX gateway for shared LLM traffic with per-tenant keys, spend
limits, and PII redaction. Cloud backends run through ai-proxy or relay
configuration, including OpenAI, Anthropic, Gemini, Bedrock, and others,
with usage, cost, and health tracked in ClickHouse and Grafana; this repo
ships sample routes to OpenCode and llamafile.
```

Sentence 1 = category + tenant controls + PII. Sentence 2 = backend breadth,
telemetry, samples last.

### WORKSPACE-GATEWAY: rejected catalogue intros

```
Multi-tenant LLM gateway on APISIX: per-tenant keys, spend limits, PII
redaction, Prometheus metrics, and Grafana dashboards, side by side.
```

Problems: list dump, closing tagline, no provider breadth, samples missing.

```
When clients call the gateway, virtual keys resolve through OpenBao, requests
pass to cloud relays, responses continue through redaction, and usage leaves
for ClickHouse.
```

Problems: parallel verb pipeline, no UVP in sentence 1, reads like a runbook.

### WORKSPACE-GATEWAY: research notes (that repo only)

When editing WORKSPACE-GATEWAY copy, verify against its Supported Providers
table: `ai-proxy` / `ai-proxy-multi` vs relay routes; do not write
"OpenAI-compatible only."

### WORKSPACE-GUARD: approved catalogue intro shape

Two sentences naming concrete programs and mechanisms (syscall boundary,
relocated binaries, three program names) instead of vague "framework"
language. See that repo's README intro for the current text.