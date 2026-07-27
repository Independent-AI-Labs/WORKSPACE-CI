# SPEC-HITL-WEB: HITL Web Backend & Approver UI

**Date:** 2026-07-25
**Status:** Draft
**Type:** Specification
**Requirements:** [REQ-HITL-WEB](../requirements/REQ-HITL-WEB.md)
**Parent:** [SPEC-HITL](SPEC-HITL.md)

> Implementation detail for `hitl/web`: Next.js app layout, NextAuth 5
> + Keycloak wiring, the BFF proxy layer, feed/decision flows including
> the WebAuthn step-up, browser security headers, and test strategy.
> Maps every requirement ID in
> [REQ-HITL-WEB](../requirements/REQ-HITL-WEB.md) to concrete routes,
> modules, and components.

---

**Cross-references:**

- [REQ-HITL-WEB](../requirements/REQ-HITL-WEB.md): owning requirements contract
- [SPEC-HITL](SPEC-HITL.md): system flows §3, threat map §5
- [SPEC-HITL-RELAY](SPEC-HITL-RELAY.md): protocol v1 consumed here (§2)
- [SPEC-WEB-COMPONENTS](SPEC-WEB-COMPONENTS.md): shared UI package consumed here (§1, §5)
- WORKSPACE-PORTAL `app/lib/auth.ts`, `middleware.ts`, `app/lib/permissions.ts`: reference implementations for auth/guard patterns
- WORKSPACE-PORTAL `docs/specifications/SPEC-SECRETS.md` §7: API-proxy + UI security precedent

---

## 1. App Layout

```
hitl/web/
├── package.json                  # next 16, react 19, next-auth 5 (PORTAL pins)
│                                 # + "@workspace-ci/web-components": "*"
├── next.config.ts                # security headers (§5)
│                                 # + transpilePackages: ['@workspace-ci/web-components']
├── middleware.ts                 # session guard on /feed, /api/hitl/*
├── app/
│   ├── layout.tsx / page.tsx     # landing → sign-in or feed redirect
│   │                             # layout uses <ThemeScript/> from the package
│   ├── feed/page.tsx             # server component: initial feed SSR
│   ├── feed/[id]/page.tsx        # request detail + evidence pack
│   ├── api/
│   │   ├── auth/[...nextauth]/   # NextAuth handler
│   │   └── hitl/
│   │       ├── feed/route.ts         # GET  → relay GET /api/v1/feed
│   │       ├── requests/[id]/route.ts# GET  → relay GET /api/v1/requests/{id}
│   │       ├── decisions/route.ts    # POST → relay decision (BFF, §3)
│   │       └── ws-ticket/route.ts    # POST → relay mint ticket (BFF)
│   └── lib/
│       ├── auth.ts               # NextAuth config (Keycloak provider)
│       ├── relay-client.ts       # single typed relay client (NFR-3.2)
│       ├── scopes.ts             # groups → approver scopes, guards
│       └── csrf.ts               # per-session mutation tokens (FR-4.5)
└── src/
    ├── components/               # HITL-domain only: FeedList, FeedItem,
    │                             # EvidencePack, DecisionPanel, TierBadge,
    │                             # DegradedBanner
    └── hooks/useHitlFeed.ts      # WS client lifecycle (client island)
```

UI composition rule (REQ-HITL-WEB NFR-3.4, REQ-WEB-COMPONENTS FR-6):
all generic primitives - Button, Modal, Tabs, Toggle, Tooltip,
CopyButton, Icon, ErrorBoundary, CollapsibleSection, loading states,
ThemeToggle/ThemeLogo, design tokens, and the packaged theme store -
come from `@workspace-ci/web-components`. `src/components/` holds only
HITL-domain composites. Styling: `app/globals.css` imports
`@import 'tailwindcss'`, `@source` the package, and the package's
`styles/base.css` (SPEC-WEB-COMPONENTS §5); Remix Icon CSS imported
app-side per the package contract.

Conventions follow this repo's `web/` (Tailwind, server components
first) and PORTAL's auth modules; client components are limited to the
feed island and decision controls.

## 2. Authentication (FR-1)

- `auth.ts`: Keycloak provider (issuer/client from env), JWT session
  strategy, 30-min token lifetime (FR-1.4); callbacks map
  `realm_access.roles` + `groups` into the session token; `signIn`
  callback rejects users with no `hitl-approvers:*` group (FR-1.2/1.3)
  with a neutral denial page.
- Cookie: `authjs.session-token`, httpOnly, `sameSite: 'strict'`,
  `secure` in prod - identical to PORTAL.
- Every BFF route re-reads the session via `auth()` and re-derives
  scopes from the token's groups claim (FR-1.3); no scope data is
  accepted from the client.
- WebAuthn eligibility (FR-1.5): on session creation, the BFF checks
  the Keycloak account for a registered WebAuthn credential (via the
  token's `acr`/AMR history or an admin-API lookup cached ≤ 5 min);
  the UI greys Tier 2 approve buttons with an explainer when absent.

## 3. BFF Proxy & Decision Flow (FR-3, FR-4.6)

`relay-client.ts` is the only module importing the relay base URL and
attaching the user's access token. All calls validate responses with
zod schemas generated from the `hitl-protocol` JSON schema and strip
unknown fields (NFR-1.2).

Decision POST sequence (Tier 1):

1. Client island POSTs `/api/hitl/decisions` with
   `{ request_id, decision, reason_class, csrf_token }`.
2. Route handler: session check → CSRF check → scope check →
   `POST /api/v1/requests/{id}/decision` at the relay with the user's
   access token.
3. Relay response (including `already_decided` with the winning
   outcome) is normalised and returned; the feed island updates via
   WS `feed.update`.

Tier 2 adds the step-up (FR-3.3):

1. User clicks Approve on a Tier 2 item → the BFF initiates a Keycloak
   re-authentication with `acr_values` mapped to the WebAuthn level
   (`/authorize?prompt=login&acr_values=<webauthn-acr>` in a popup or
   full redirect preserving return state).
2. Keycloak runs the WebAuthn ceremony; the returned ID token carries
   the elevated `acr`/`amr` and a fresh `auth_time`.
3. The BFF submits the decision with the fresh token; the relay
   verifies `acr`, `auth_time` recency (≤ 120 s), and audience, and
   records the assertion reference as tier evidence
   (SPEC-HITL-RELAY §4).
4. If the ceremony is cancelled/fails, no decision is submitted; the
   UI returns to the item unchanged.

WS lifecycle (FR-2.4/4.6, SPEC-HITL-RELAY §2.2): the feed island
POSTs `/api/hitl/ws-ticket` (server-side mint) → opens
`wss://<relay-origin>/ws/v1?ticket=...` - note the ticket is the only
credential in the URL and expires in 30 s; reconnects re-mint via BFF.
On `close`, exponential backoff (1 s → 30 s, ±20 % jitter) with a
visible degraded banner and disabled decision controls (FR-2.5).

## 4. Feed & Evidence Pack UI (FR-2)

`EvidencePack` renders, in order:

| Field | Source | Notes |
|-------|--------|-------|
| Agent identity + host | `envelope.principal`, `target.host` | monospace, copyable |
| Action display | `action.display` | pre-redacted by relay; rendered escaped |
| Scope / tier | `scope`, `tier` | TierBadge (1 = session, 2 = WebAuthn required) |
| Justification | `justification` | collapsible; plain text only |
| Request hash | `request_hash` | truncated, full on expand (approver can eyeball binding) |
| Age / TTL | `created_at`, `expires_at` | live countdown; item greys at <60 s |
| Risk flags | relay-computed (new agent, first-seen action, canary-adjacent path) | amber/red chips |

No batch approve (FR-3.1); keyboard operable with explicit focus order
(NFR-2.3); `deny` opens reason-class select (fixed enum from
`hitl-protocol`) with optional comment (FR-3.4).

## 5. Security Headers & Browser Policy (FR-4)

`next.config.ts` applies to all routes:

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'nonce-<per-request>';
  style-src 'self' 'unsafe-inline';      # Tailwind runtime constraint, tracked as OQ
  connect-src 'self' wss://<relay-origin>;
  img-src 'self' data:; font-src 'self';
  frame-ancestors 'none'; base-uri 'none'; form-action 'self'
Strict-Transport-Security: max-age=63072000; includeSubDomains   (prod)
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Permissions-Policy: camera=(), microphone=(), geolocation=(),
                    publickey-credentials-get=(self)             # WebAuthn
Cache-Control: no-store                                          # /api/hitl/* and /feed
```

Additional rules: no `dangerouslySetInnerHTML` (lint rule, FR-4.3)
with exactly one exemption - the packaged `<ThemeScript/>` no-flash
bootstrap from `@workspace-ci/web-components` (SPEC-WEB-COMPONENTS
§4.3), which is a fixed, audited string delivered under the per-request
CSP nonce; no web storage for feed data (FR-4.4) - the theme store's
single `localStorage` key (package-default `wc-theme`) is the only
sanctioned storage write; clipboard writes only via
`navigator.clipboard.writeText` behind a user gesture; masked-by-default
component for any future secret-like value (FR-4.2).

## 6. Threat Controls Mapping (SPEC-HITL §5)

| Threat | Web-side control |
|--------|------------------|
| T-4 fatigue | Evidence pack, per-request decisions, no bulk UI, reason classes |
| T-6 CSWSH | Ticket-only WS auth; cookies never sent to the relay origin; relay validates Origin |
| T-7 approval spoofing | Server-side decision submission; CSRF token; Tier 2 WebAuthn with fresh `auth_time` |
| T-10 impersonation | 30-min sessions, step-up for Tier 2, `SameSite=Strict` |

## 7. Testing Strategy

| Layer | Mechanism | Covers |
|-------|-----------|--------|
| Unit (vitest) | scope derivation, zod stripping, CSRF module, countdown/TTL logic | FR-1.3, NFR-1.2, FR-2 |
| Component (Testing Library) | EvidencePack rendering/escaping, DecisionPanel tier gating, degraded states | FR-2.5, FR-3.3, FR-4.3 |
| Route-handler integration | Mock relay (MSW): decision proxy, already_decided normalisation, ws-ticket minting, header assertions | FR-3, FR-4.1/4.4/4.6 |
| E2E (Playwright, repo `browser` tooling precedent) | Full flow against dev relay + dev Keycloak incl. real WebAuthn virtual authenticator (CDP) | V1-V10 |
| Security regression | CSP evaluator + storage audit in E2E teardown (V7, V8) | FR-4 |

## 8. Implementation Status

| Item | Status | Evidence |
|------|--------|----------|
| §1-§6 design | Specified | - |
| Scaffold | Implemented | `hitl/web/` package + app layout + routes + BFF stand-ins + HITL components; lint/type-check/test green |
| NextAuth 5 + Keycloak auth | Deferred | Scaffold `app/lib/auth.ts` documents replacement point |
| WebAuthn step-up | Deferred | Tier 2 UI badge present; ceremony wiring stubbed |
| Live relay integration | Deferred | `relay-client.ts` uses typed zod schemas; returns safe static defaults when `RELAY_BASE_URL` is unset |
