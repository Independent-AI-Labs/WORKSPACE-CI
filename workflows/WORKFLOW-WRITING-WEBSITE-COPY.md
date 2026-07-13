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
| **Project catalogue card blurbs** | Sibling `README.md` intro (first ~2 sentences) | **Yes (full pass)** |
| Grafana subtitles, dashboard titles | `web/branding.yaml` | Light pass (clarity, no slogans) |
| README architecture, hook docs | `README.md` body, `docs/` | No (technical docs, not marketing) |
| Commit messages, CI output | hooks, Makefiles | No |

### How catalogue blurbs surface

The wiki Project Catalogue pulls the first prose block from each sibling
README via `extractReadmeSummary()` in `web/src/lib/project-registry.ts`.
It keeps **up to three sentences** after the title; prefer **two** so the
card does not truncate. Edit the README intro, then rebuild prod wiki.

## The blink test (8 seconds)

A first-time visitor decides stay-or-leave in roughly eight seconds. Hero copy
must answer, without cleverness:

1. **What is this?** (noun: wiki, catalogue, dashboard)
2. **Who is it for?** (digital and AI safety work, operators, implementers)
3. **What can I do here?** (verb: browse, read, compare, inspect)

If a stranger cannot answer all three after one slow read, rewrite.

## Hero structure (two sentences max)

Applies to **wiki home hero** and **README catalogue intros** unless noted.

**Sentence 1 (category + UVP).** State the product type and the sharpest
differentiators (from repo research, not guesswork). Name 2-3 concrete
capabilities; do not open with a problem statement or requirement list.

- Good (wiki): `Unified wiki for the digital and AI safety stack.`
- Good (gateway README): `Apache APISIX gateway for shared LLM traffic with per-tenant keys, spend limits, and PII redaction.`
- Bad: `The ultimate next-generation AI safety command center.`
- Bad: `Running LLM traffic means managing keys, budgets, and compliance…`

**Sentence 2 (breadth + ops + samples last).** For product READMEs: backend
breadth and observability first; **sample routes or integrations go last**
(OpenCode, llamafile, etc. are examples, not the product definition). For
wiki hero: one user verb + concrete affordances.

- Good (wiki): `Browse git hooks, static checks, guard policies, runtime blocks, and LLM gateway operations from one catalogue.`
- Good (gateway README): `Cloud backends run through ai-proxy or relay configuration, including OpenAI, Anthropic, Gemini, Bedrock, and others, with usage, cost, and health tracked in ClickHouse and Grafana; this repo ships sample routes to OpenCode and llamafile.`
- Bad: `This repo ships OpenCode and llamafile routes and also supports many providers.`
- Bad: `Native git hooks, static anti-pattern analysis, policy enforcement, runtime escape-hatch blocking, and a multi-tenant LLM gateway, every guardrail, side by side.`

**Length.** Two sentences is the default. Enough detail to convey UVP; not
so listy that both sentences use the same `X does A, B, and C` shape.

## Research before writing (product README intros)

Do not invent provider lists or features. Read the target repo first:

1. **README**: Features table, Supported Providers, Architecture, sample
   deployments. Note what is default vs optional.
2. **Config / routes**: e.g. `conf/apisix.yaml`, plugin lists in
   `docs/BUILTIN-PLUGINS.md` for gateway work.
3. **Commit history** (when UVP is unclear): `git log --oneline -20`,
   feature commits, reconciler/telemetry additions.
4. **Cross-check APISIX docs**: built-in plugins (`ai-proxy`,
   `ai-proxy-multi`) vs custom Lua plugins vs plain relay upstreams.
   Do not collapse these into "OpenAI-compatible only."

### Gateway provider facts (WORKSPACE-GATEWAY)

Use accurate names from the README Supported Providers table:

| Mechanism | Backends |
|-----------|----------|
| `ai-proxy` / `ai-proxy-multi` | OpenAI, DeepSeek, Azure OpenAI, AIMLAPI, Anthropic, OpenRouter, Gemini, Vertex AI, Bedrock, `openai-compatible` |
| Relay routes (this repo) | `relay-opencode`, `relay-opencode-federated` (OpenCode Go), `relay-llamafile` (local llamafile) |

**UVP to foreground in sentence 1:** PII redaction (+ re-hydration), OpenBao
virtual keys, per-key RPM/token budgets, SSE usage to ClickHouse, Grafana
dashboards, billing reconciler.

**Defer to sentence 2 or body:** provider table, ClickHouse/Grafana detail,
sample routes (always **last** in the intro).

## Banned patterns (wiki UI + catalogue blurbs)

Do not ship these in visitor-facing copy:

| Pattern | Why |
|---------|-----|
| Em dash as a punchline connector | Reads like AI slide deck; use a period, semicolon, or rewrite as one sentence |
| Closing taglines (`side by side`, `all in one place`, `every guardrail`) | Adds nothing after the list; sounds like stock marketing |
| `The unified wiki for…` leading article + stacked features | Weak opener; prefer direct `Unified wiki for…` or `A single wiki for…` |
| Triple adjectives (`multi-tenant LLM gateway` in hero) | Save precision for the page that owns the feature |
| `-hatch` jargon without context on home hero | OK on `/guard` or `/runtime-hooks`; home hero uses shorter labels (`runtime blocks`) |
| Exclamation marks | Never on heroes or footers |
| Passive openings (`It is designed to…`) | Use active: `Browse…`, `Read…`, `Open…` |
| Feature-inventory lists (`THING has X, Y, Z… THING also does A, B, C`) | Reads like a spec sheet; fold into two purposeful sentences |
| Parallel pipeline verbs (`present / pass / continue / leave`) | Same rhythm in both sentences; vary structure |
| `Cloud models use… local models use…` paired clauses | False dichotomy; say relay vs ai-proxy once if needed |
| Implementation bragging in intro (`pure Lua`, `no sidecar`, hot-path) | Belongs in architecture docs, not catalogue card |
| Leading with samples before provider breadth | OpenCode/llamafile are examples; default deployment can sit in ¶3+ |
| Colon/comma feature dumps after the product name | `Gateway: keys, limits, redaction, metrics, …` |
| "OpenAI-compatible only" when ai-proxy-multi lists many providers | Under-researched; check Supported Providers table |
| Too telegraphic | Catalogue blurbs need UVP depth, not tagline length |

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

### Wiki hero / branding

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

### Project catalogue README intro

1. **Research** (see above) before drafting.
2. **Draft two sentences** immediately under the `#` title; keep blockquote and
   diagrams below a blank line so `extractReadmeSummary()` stops at sentence 2.
3. **Sentence 1:** product category + top UVP features (name them: PII
   redaction, virtual keys, spend limits, etc.).
4. **Sentence 2:** provider/backend breadth → telemetry stack → sample routes
   **last** (semicolon or final clause).
5. **Paragraph 3+** for default deployment, links to Supported Providers,
   architecture; not in the catalogue blurb.
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
- [ ] Sentence 2: providers/backends and telemetry before any sample routes
- [ ] Sample integrations (OpenCode, llamafile) appear **last** in sentence 2
- [ ] Provider list matches README Supported Providers / config (not shorthand)
- [ ] No sidecar/Lua/hot-path bragging in the intro
- [ ] No feature-inventory or parallel verb-chain patterns
- [ ] No em dashes; read aloud in under 12 seconds

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

### WORKSPACE-GATEWAY catalogue intro (approved shape)

```
Apache APISIX gateway for shared LLM traffic with per-tenant keys, spend
limits, and PII redaction. Cloud backends run through ai-proxy or relay
configuration, including OpenAI, Anthropic, Gemini, Bedrock, and others,
with usage, cost, and health tracked in ClickHouse and Grafana; this repo
ships sample routes to OpenCode and llamafile.
```

Sentence 1 = category + tenant controls + PII. Sentence 2 = ai-proxy/relay
breadth → ClickHouse/Grafana → samples last.

### Gateway intro anti-patterns (rejected in review)

```
Multi-tenant LLM gateway on APISIX: per-tenant keys, spend limits, PII
redaction, Prometheus metrics, and Grafana dashboards, side by side.
```

Problems: em-dash list dump, closing tagline, no provider breadth, samples
missing, marketing tone.

```
When clients call the gateway, virtual keys resolve through OpenBao, requests
pass to cloud relays, responses continue through redaction, and usage leaves
for ClickHouse.
```

Problems: parallel verb pipeline, no UVP in sentence 1, reads like a runbook.

## AI / agent instructions

When asked to rewrite wiki marketing copy or README catalogue intros:

1. Load this file first.
2. **Research the target repo** (README features/providers, config, recent
   commits) before proposing copy. For gateway work, read Supported Providers
   and distinguish `ai-proxy` / `ai-proxy-multi` from relay routes.
3. Propose **at most two sentences** for heroes and catalogue blurbs.
4. Show the banned-pattern diff (what you removed and why).
5. Do not add enthusiasm, metaphors, or `-hatch` jargon to the home hero.
6. Do not lead catalogue intros with sample deployments; put them last in
   sentence 2.
7. Do not commit, push, or rebuild prod unless the user explicitly asks.
8. Do not bump unrelated dependencies to land a copy commit.