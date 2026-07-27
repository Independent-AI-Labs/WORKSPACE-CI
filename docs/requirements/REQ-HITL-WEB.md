# REQ-HITL-WEB: HITL Web Backend & Approver UI

**Date:** 2026-07-25
**Status:** Draft
**Type:** Requirements
**Parent:** [REQ-HITL](REQ-HITL.md)
**Specification:** [SPEC-HITL-WEB](../specifications/SPEC-HITL-WEB.md)

> Requirements for `hitl/web`: the Next.js application that registers
> and authenticates human users (Keycloak OIDC via NextAuth 5),
> presents each authenticated approver with their scoped HITL feed,
> captures approve/deny decisions (with WebAuthn step-up for
> credential-releasing requests), and proxies all relay interaction
> server-side. It is the only human-facing surface of the HITL system
> and is held to the anti-scraping / anti-spoofing / anti-XSS bar of
> REQ-HITL NFR-1..3 throughout.

---

**Cross-references:**

- [REQ-HITL](REQ-HITL.md): parent system requirements (tiers, transport, audit)
- [SPEC-HITL-WEB](../specifications/SPEC-HITL-WEB.md): companion specification
- [REQ-HITL-RELAY](REQ-HITL-RELAY.md): the relay API this app consumes
- [SPEC-HITL-RELAY](../specifications/SPEC-HITL-RELAY.md): protocol v1, WS ticket flow
- [REQ-WEB-COMPONENTS](REQ-WEB-COMPONENTS.md) / [SPEC-WEB-COMPONENTS](../specifications/SPEC-WEB-COMPONENTS.md): shared component package this app consumes
- WORKSPACE-PORTAL `docs/specifications/SPEC-AUTHENTICATION.md`: NextAuth 5 + Keycloak pattern reused here
- WORKSPACE-PORTAL `docs/specifications/SPEC-AUTHORIZATION.md`: RBAC/permission-guard pattern
- WORKSPACE-PORTAL `docs/specifications/SPEC-SECRETS.md` §7.2: UI security constraints precedent (masking, no-store, CSP, rate limits)

---

## 1. Purpose & Scope

### 1.1 Purpose

Give human approvers a secure, non-exploitable surface for HITL
oversight: see exactly the requests routed to them, understand what
they are approving (evidence pack), decide with the right
authentication strength, and never become a channel through which
credentials, sessions, or decisions can be scraped, spoofed, or
replayed.

### 1.2 Scope

**This document OWNS the requirements for:**

- User registration/authentication flows (Keycloak OIDC, NextAuth 5).
- Approver session management and scope-based feed access.
- The HITL feed UI: presentation, evidence pack, decision capture.
- WebAuthn/FIDO2 step-up for Tier 2 decisions.
- Server-side relay proxying (route handlers / server actions) and
  the user-side websocket lifecycle.
- Browser-side hardening: CSP, XSS, CSRF, caching, masking, clipboard.

**This document DOES NOT:**

- Own the relay protocol itself (REQ-HITL-RELAY); this app is a client.
- Own Keycloak domain/client provisioning or group management
  (PORTAL SPEC-IAM pattern; consumes it).
- Own OpenBao interaction of any kind - the web tier NEVER contacts
  OpenBao and never sees credential material.
- Own agent-client concerns (REQ-HITL-GUARD).
- Own marketing/public content surfaces.

### 1.3 Terminology

Inherits REQ-HITL §1.3 and REQ-HITL-RELAY §1.3. Additionally:

| Term | Definition |
|------|------------|
| Approver session | NextAuth JWT session (httpOnly cookie) of a user whose Keycloak groups include at least one `hitl-approvers:*` scope. |
| BFF | Backend-for-frontend: the Next.js server layer that holds the user's access token and proxies relay calls; the browser never talks to the relay directly except the WS upgrade. |
| Step-up | A fresh WebAuthn authentication ceremony performed at decision time, proven to the relay as tier evidence. |

---

## 2. Functional Requirements

### FR-1: Registration & Authentication

| ID | Requirement |
|----|-------------|
| FR-1.1 | Users MUST authenticate via Keycloak OIDC using NextAuth 5, following the PORTAL pattern: authorization-code flow, JWT session strategy, httpOnly `SameSite=Strict` secure cookies. |
| FR-1.2 | Self-registration is NOT in-app: account creation is admin-provisioned in Keycloak (PORTAL account-manager precedent); the app MUST handle unknown/unauthorized users with a neutral "no access" screen (no user-enumeration oracle). |
| FR-1.3 | Approver capability MUST derive exclusively from Keycloak group membership (`hitl-approvers:*`); roles/groups MUST be re-validated server-side on every request - never trusted from client state. |
| FR-1.4 | Session lifetime MUST be ≤ 30 minutes of token validity with refresh per the PORTAL pattern; idle approver sessions MUST NOT hold relay WS connections indefinitely. |
| FR-1.5 | Users eligible for Tier 2 decisions MUST have a WebAuthn authenticator registered in Keycloak; the UI MUST detect absence and block Tier 2 approval affordances with guidance. |

### FR-2: HITL Feed

| ID | Requirement |
|----|-------------|
| FR-2.1 | The feed MUST present exactly the requests the relay routes to the caller's scopes (server-side scoping at the relay; the UI additionally filters defensively). Requests outside the caller's scopes MUST NOT be fetchable by ID either. |
| FR-2.2 | Each feed item MUST render the evidence pack (REQ-HITL NFR-3.3): agent identity, host/target, display command/action, scope, justification, request age, TTL countdown, tier badge, and risk flags. |
| FR-2.3 | Request parameters rendered in the UI MUST be the relay's redacted display fields; the UI MUST NOT attempt to decode or request unredacted parameters. |
| FR-2.4 | The feed MUST update in near-real-time (WS per SPEC-HITL-RELAY §2.3) and MUST reflect expiry/decision-by-others immediately (item removal + reason). |
| FR-2.5 | The feed MUST have explicit degraded states: relay unreachable, WS disconnected (reconnecting), session expired - each visually distinct; NO interactive decision affordance may appear usable while the channel is degraded (REQ-HITL NFR-4.4). |

### FR-3: Decisions

| ID | Requirement |
|----|-------------|
| FR-3.1 | Approve/deny actions MUST be explicit, per-request, and non-batched by default; bulk operations are forbidden in v1. |
| FR-3.2 | Every decision MUST be submitted server-side (BFF route handler) with the user's access token; the browser MUST NOT hold relay credentials or sign decisions itself. |
| FR-3.3 | Tier 2 approvals MUST complete a WebAuthn step-up ceremony immediately before decision submission; the decision POST MUST include the assertion reference as tier evidence. A Tier 2 POST without valid evidence MUST fail (relay-side per REQ-HITL-RELAY FR-3.4; UI-side pre-check). |
| FR-3.4 | Deny SHOULD capture a reason class from a fixed list (free text optional); decisions MUST be non-revocable once submitted (relay enforces first-valid-wins). |
| FR-3.5 | The UI MUST show the decision outcome and the request's terminal state; on `already_decided` races the UI MUST present the actual winner's outcome, not an error alone. |

### FR-4: Browser Security

| ID | Requirement |
|----|-------------|
| FR-4.1 | All responses MUST send: strict CSP (`default-src 'self'`, no `unsafe-eval`, nonce-based scripts), `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy` deny-by-default, and HSTS in production. |
| FR-4.2 | Any secret-like display (e.g. wrapped-token status) MUST be masked by default with click-to-reveal and clipboard-only copy via `navigator.clipboard` (SPEC-SECRETS FR-14.2/14.3 pattern). In practice v1 displays NO credential values at all - this clause governs any future addition. |
| FR-4.3 | `dangerouslySetInnerHTML` is FORBIDDEN; all relay-supplied strings render via React escaping. Markdown rendering of justification text, if added, MUST use a sanitized renderer. |
| FR-4.4 | Sensitive API responses MUST carry `Cache-Control: no-store`; the feed MUST NOT persist request data to `localStorage`/`sessionStorage`/IndexedDB. |
| FR-4.5 | CSRF: mutation routes MUST require a per-session token in addition to the session cookie (SPEC-SECRETS §7.2 precedent); SameSite=Strict is necessary but not sufficient. |
| FR-4.6 | WS tickets MUST be fetched server-side and handed to the client only as the short-lived ticket itself; the user's access token MUST NEVER be exposed to client-side JS or appear in WS URLs. |

---

## 3. Non-Functional Requirements

### NFR-1: Anti-Exploitation

| ID | Requirement |
|----|-------------|
| NFR-1.1 | No credential material, grant tokens, wrapping tokens, or OpenBao identifiers beyond request metadata may transit or be rendered by the web tier (REQ-HITL NFR-1.1/1.4). A log-scrubbing test MUST prove relay payloads containing such fields are neither logged nor rendered. |
| NFR-1.2 | All relay responses MUST be validated against the protocol schema server-side before use; unexpected fields MUST be stripped, not passed through to the browser. |
| NFR-1.3 | Decision endpoints MUST be rate-limited per user (aligned with relay approver limits) and MUST reject duplicate submissions idempotently. |
| NFR-1.4 | The app MUST NOT expose user enumeration, scope membership, or other approvers' activity beyond the shared feed items' decision outcomes. |

### NFR-2: Availability & UX

| ID | Requirement |
|----|-------------|
| NFR-2.1 | Feed render from navigation < 2 s on healthy LAN; WS reconnect with exponential backoff and jitter. |
| NFR-2.2 | The app MUST remain navigable (read-only) during relay partial degradation, with decision affordances disabled per FR-2.5. |
| NFR-2.3 | Accessibility: decision controls MUST be keyboard-operable and screen-reader labelled (approvals are safety-critical interactions). |

### NFR-3: Maintainability

| ID | Requirement |
|----|-------------|
| NFR-3.1 | Next.js + React + TypeScript per workspace conventions (`web/` in this repo and PORTAL are the references): App Router, server components by default, minimal client islands. |
| NFR-3.2 | All relay interaction MUST go through a single typed client module generated/derived from the `hitl-protocol` schema (no ad-hoc fetch calls in components). |
| NFR-3.3 | The app MUST pass the repo's lint/typecheck/test gates and the CVE scan hook (REQ-CVE-SCAN) with zero suppressions at introduction. |
| NFR-3.4 | The app MUST build its UI from `@workspace-ci/web-components` (REQ-WEB-COMPONENTS): primitives, theming, tokens, and the content pipeline come from the package; no component, hook, or CSS partial may be copied from `web/`. HITL-domain components (EvidencePack, TierBadge, DecisionPanel) live in this app per REQ-WEB-COMPONENTS FR-6.2. |

---

## 4. Constraints

| ID | Constraint | Source |
|----|------------|--------|
| C-1 | Keycloak is the only IdP; NextAuth 5 the only auth integration. | REQ-HITL C-2 |
| C-2 | The web tier MUST NOT contact OpenBao. | REQ-HITL FR-1.4/FR-1.5 |
| C-3 | WebAuthn/FIDO2 (not SMS/TOTP) for Tier 2. | REQ-HITL C-4 |
| C-4 | Code lives in `hitl/web` in this repository. | REQ-HITL C-6 |
| C-6 | Shared UI comes from `@workspace-ci/web-components`; the app is a standalone service that only adds the package dependency. | REQ-WEB-COMPONENTS FR-6.1 |
| C-5 | WS ticket flow per SPEC-HITL-RELAY §2.2; no cookie-authenticated WS. | REQ-HITL NFR-2.2/2.3 |

---

## 5. Assumptions

| ID | Assumption |
|----|------------|
| A-1 | A Keycloak client for `hitl-web` can be provisioned with WebAuthn required-action support and ACR mapping (PORTAL bootstrap precedent). |
| A-2 | Approver groups (`hitl-approvers:*`) are managed in Keycloak by platform admins. |
| A-3 | Modern browsers with WebAuthn platform authenticator or security-key support. |
| A-4 | The app deploys behind TLS with a stable origin allowlisted at the relay. |

---

## 6. Open Questions

1. **Approver notifications beyond the feed** (email/push when items arrive): deferred; v1 assumes approvers watch the feed.
2. **Read-only auditor role** (view feed + audit trail without decision rights): valuable, deferred to follow-up REQ.
3. **i18n**: follow CI `web/` precedent (single locale) or PORTAL's next-intl? Initial: single locale, structure not hostile to later i18n.
4. **"Approve with edits"** (modify parameters before approval): explicitly out of v1; approvals are binary over the exact request hash.

---

## 7. Verification Matrix

| # | Test | Maps to |
|---|------|---------|
| V1 | User without `hitl-approvers:*` group: feed empty, direct request-ID fetch denied, no enumeration difference vs. unknown ID. | FR-1.3, FR-2.1, NFR-1.4 |
| V2 | Tier 2 approve without WebAuthn ceremony: relay rejects; UI shows step-up required, never silently downgrades. | FR-3.3 |
| V3 | Tamper feed payload in transit (test double) injecting unexpected fields/script strings: stripped/escaped, no execution. | NFR-1.2, FR-4.3 |
| V4 | Attempt decision POST without CSRF token / cross-site: rejected. | FR-4.5 |
| V5 | Kill relay mid-session: UI enters degraded state, decision buttons disabled, recovers on relay return without phantom approvals. | FR-2.5, NFR-2.2 |
| V6 | Race two approvers on one request: loser sees `already_decided` with the winning outcome. | FR-3.5 |
| V7 | Browser devtools audit after full flow: no access token in JS-reachable scope, no feed data in web storage, `no-store` on API responses. | FR-4.4, FR-4.6 |
| V8 | CSP report-only then enforcing: zero violations from app code; injected inline script blocked. | FR-4.1 |
| V9 | Session expiry mid-decision: decision rejected, user re-authenticates, request state correctly re-rendered. | FR-1.4 |
| V10 | Rate-limit decisions client-side + server-side: excess blocked without queue corruption. | NFR-1.3 |

---

## 8. Implementation Status

| Item | Status | Evidence |
|------|--------|----------|
| REQ-HITL-WEB (this document) | Draft | - |
| `hitl/web` scaffold | Implemented | `hitl/web/` package; lint/type-check/test green; uses `@workspace-ci/web-components` |
| Keycloak client + NextAuth wiring | Not started | Stub `app/lib/auth.ts` documents replacement point |
| Feed UI + decision flow | Implemented | `EvidencePack`, `DecisionPanel`, `FeedList`, `DegradedBanner`; BFF contract tests green |
| WebAuthn step-up | Not started | Tier 2 badge present; ceremony wiring stubbed |
