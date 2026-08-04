# REQ-HITL: Human-in-the-Loop Oversight & Credential Brokering System

**Date:** 2026-07-25
**Status:** Draft
**Type:** Requirements
**Specification:** [SPEC-HITL](../specifications/SPEC-HITL.md)

> This document defines the system-level requirements for a generic
> human-in-the-loop (HITL) oversight service: a websocket relay that
> queues oversight/approve-deny requests from machine clients (agent
> clients, capability-locked wrappers), presents them to authenticated
> human approvers via a web UI, and - only after approval, at execution
> time - retrieves keys/credentials from OpenBao to fulfil or reject the
> request. The design follows the credential-broker / token-vault
> pattern (IETF draft CB4A, Curity token vault, Auth0 identity-chained
> authorization): agents never hold or see real credentials; policy
> decisions (PDP) are separated from credential delivery (CDP); every
> grant is short-lived, single-use, non-renewable, and sender-
> constrained. This is the parent requirements document; component
> contracts live in REQ-HITL-RELAY, REQ-HITL-WEB, and REQ-HITL-GUARD.

---

**Cross-references:**

- [SPEC-HITL](../specifications/SPEC-HITL.md): companion specification (implementation detail)
- [REQ-HITL-RELAY](REQ-HITL-RELAY.md): relay service (backend) requirements
- [REQ-HITL-WEB](REQ-HITL-WEB.md): web backend/UI requirements
- [REQ-HITL-GUARD](REQ-HITL-GUARD.md): WORKSPACE-GUARD elevation integration contract
- [SPEC-HITL-RELAY](../specifications/SPEC-HITL-RELAY.md), [SPEC-HITL-WEB](../specifications/SPEC-HITL-WEB.md), [SPEC-HITL-GUARD](../specifications/SPEC-HITL-GUARD.md): component specifications
- WORKSPACE-PORTAL `docs/specifications/SPEC-SECRETS.md`: OpenBao deployment, auth methods (JWT via Keycloak JWKS, AppRole, response wrapping) this system reuses
- WORKSPACE-PORTAL `docs/specifications/SPEC-IAM.md` / `SPEC-AUTHENTICATION.md` / `SPEC-AUTHORIZATION.md`: Keycloak OIDC + NextAuth 5 pattern the web UI reuses
- WORKSPACE-GATEWAY `docs/architecture/KEY-MANAGEMENT.md`: production OpenBao precedent (virtual-key resolution)
- WORKSPACE-GUARD `README.md` / `docs/specifications/SPEC-GIT-GUARD.md`: capability-locked wrapper surfaces, fail-closed conventions, root-owned state-file trust pattern
- [IETF draft-hartman-credential-broker-4-agents (CB4A)](https://datatracker.ietf.org/doc/html/draft-hartman-credential-broker-4-agents-00): credential broker architecture, tiered approvals, threat model TM-1..TM-10
- [RFC 8693](https://datatracker.ietf.org/doc/rfc8693/): OAuth 2.0 Token Exchange (derivative-token minting model)
- [RFC 9449](https://datatracker.ietf.org/doc/rfc9449/): DPoP - sender-constrained tokens (grant replay mitigation)

---

## 1. Purpose & Scope

### 1.1 Purpose

Agents operating on workspace dev machines are deliberately
capability-locked (WORKSPACE-GUARD): root and sudo-gated operations are
hard-denied, and there is no path for an agent to obtain elevation or
credentials autonomously. Where a legitimate operation needs elevation
or secrets, the only safe path is explicit, authenticated, audited
human approval - without ever placing credentials in the agent's
hands, context, logs, or memory. This requirement set defines that
path: a generic, reusable HITL relay plus web UI, backed by OpenBao,
that any consumer surface (GUARD wrappers, agent runtimes, CI jobs)
can integrate with.

### 1.2 Scope

**This document OWNS the requirements for:**

- System architecture: relay (backend), web UI, OpenBao broker, audit
  pipeline, and their trust boundaries.
- The canonical request lifecycle state machine shared by all
  components and consumers.
- Cross-cutting security invariants (credential handling, transport,
  approval strength tiers, audit, fail-closed behaviour).
- The threat model and its mandated mitigations.
- Component decomposition and inter-component contracts (owning which
  REQ owns what).

**This document DOES NOT:**

- Own the relay's internal API/message schema details (REQ-HITL-RELAY).
- Own UI presentation details, registration flows, or per-route
  frontend hardening (REQ-HITL-WEB).
- Own WORKSPACE-GUARD-side wrapper implementation (REQ-HITL-GUARD
  owns the contract; the GUARD repo owns its own REQ/SPEC pair for
  the implementation).
- Own OpenBao server provisioning, sealing, or namespace layout
  (WORKSPACE-PORTAL SPEC-SECRETS owns that; this system is a client).
- Own Keycloak domain/client provisioning (PORTAL SPEC-IAM owns the
  pattern; this system consumes it).
- Replace or weaken any existing WORKSPACE-GUARD deny-list policy:
  HITL elevation is additive and opt-in per policy rule.

### 1.3 Terminology

| Term | Definition |
|------|------------|
| Relay | The Rust backend service (`hitl/backend`). Hosts the websocket endpoint, the request queue, the PDP, and the CDP. |
| PDP | Policy Decision Point. Evaluates whether a request may be approved (routing, tier policy, rate limits). Holds no credentials. |
| CDP | Credential Delivery Point. The only component with OpenBao access. Fetches credentials strictly after a valid approval, at fulfilment time. Accepts only PDP-signed approval records. |
| Agent client | Machine-side requester (e.g. WORKSPACE-GUARD wrapper, agent runtime). Authenticates via OpenBao AppRole. Never receives raw long-lived credentials. |
| User client | Browser session of a human approver, served by the web UI. Authenticates via Keycloak OIDC. |
| Request | A structured, signed envelope describing the action seeking approval (command, target, justification hash, agent identity, idempotency key, TTL). |
| Grant | The fulfilment artifact delivered to an agent client after approval: either an elevation token (capability grant, no credentials) or a wrapped credential (single-use OpenBao response-wrapped secret). |
| Elevation token | A short-lived, single-use, sender-constrained token proving human approval of a specific action; redeemed locally (e.g. by a GUARD wrapper) - carries no secret material. |
| Wrapped credential | An OpenBao response-wrapping token (single-use, short TTL) through which the actual secret is unwrapped at execution time. |
| Tier 1 / Tier 2 | Approval strength tiers. Tier 1: authenticated session approval (command elevation). Tier 2: WebAuthn/FIDO2 step-up (any request that releases credentials). |
| Evidence pack | The structured context presented to the approver: agent identity, action, target, parameters (redacted), justification, request hash, risk flags. |
| Fail-closed | On any infrastructure uncertainty (relay unreachable, audit unavailable, state file unreadable), the decision is DENY. |

### 1.4 Architecture Rationale

| Candidate | Verdict | Rationale |
|-----------|---------|-----------|
| **Credential broker (PDP/CDP split, agent never sees creds)** | **Selected** | Industry consensus for agent HITL (CB4A, Curity, Auth0); collapses leak blast radius; approval is cryptographically bound to fulfilment. |
| Agent holds OpenBao token, policy-gated directly | Rejected | Agent compromise = vault access; no human-in-the-loop guarantee; violates zero-standing-privilege. |
| Long-lived scoped tokens issued at onboarding | Rejected | Standing privilege; stale across approval waits; unbounded replay window. |
| Sudo/pkexec interactive prompts on the host | Rejected | Requires tty interactivity agents lack (cf. GUARD foreground-push rule); no central audit; credentials still land in agent env. |

Selection criteria: zero credential exposure to the agent, just-in-time
issuance at execution time, verifiable per-action accountability,
fail-closed behaviour consistent with existing workspace guards.

---

## 2. Functional Requirements

### FR-1: Component Architecture

| ID | Requirement |
|----|-------------|
| FR-1.1 | The system MUST comprise four components: (a) relay backend (`hitl/backend`, Rust), (b) web UI (`hitl/web`, Next.js per workspace conventions), (c) OpenBao as the sole credential store, (d) an append-only audit pipeline. |
| FR-1.2 | The relay MUST implement the PDP and CDP as separately deployable units (separate processes or, at minimum, separate modules with disjoint network reachability). Only the CDP MAY hold an OpenBao service token. Agent client network paths MUST NOT reach the CDP or OpenBao directly (network-level enforcement, CB4A TM-1). |
| FR-1.3 | The CDP MUST accept fulfilment instructions exclusively as PDP-signed approval records. Unsigned or unverifiable fulfilment requests MUST be rejected. |
| FR-1.4 | The web UI MUST NOT hold OpenBao service credentials for the HITL flow. Human approver identity reaches the relay as a Keycloak-issued OIDC token; the relay validates it against Keycloak JWKS. |
| FR-1.5 | OpenBao MUST remain reachable only from the relay CDP (and existing authorised backends), never from agent clients, user clients, or the public internet (SPEC-SECRETS NFR-1.9 applies unchanged). |

### FR-2: Request Lifecycle

| ID | Requirement |
|----|-------------|
| FR-2.1 | Every request MUST traverse the canonical state machine: `submitted → queued → presented → approved | denied | expired → fulfilled | rejected → audited`. State transitions MUST be monotonic; terminal states (`denied`, `expired`, `fulfilled`, `rejected`) MUST be irreversible. |
| FR-2.2 | Every request MUST carry: unique request ID, agent identity, requested action + parameters (with sensitive parameters redacted or hashed), idempotency key, request signature, justification, and TTL. Requests missing any field MUST be rejected at submission. |
| FR-2.3 | Every request MUST have a bounded TTL. Expiry MUST transition the request to `expired` and emit a terminal audit event. There MUST be no silent dropping of pending requests. |
| FR-2.4 | Fulfilment MUST be idempotent on the idempotency key: duplicate submissions or replayed delivery MUST NOT produce duplicate side effects or duplicate grants. |
| FR-2.5 | Credential-releasing requests MUST fetch credentials from OpenBao strictly after approval, at fulfilment time (never at submission or presentation time), and MUST deliver them as single-use wrapped credentials with TTL ≤ 5 minutes. |
| FR-2.6 | Elevation-only requests MUST be fulfilled with an elevation token: short-lived (≤ 5 minutes), single-use, bound to the exact request hash, and sender-constrained to the requesting agent instance. |
| FR-2.7 | Grants MUST be non-renewable. Expiry is absolute; a new grant requires a new request and a new approval. |
| FR-2.8 | Denial MUST return a structured rejection (reason class, no sensitive detail) to the requesting agent client and MUST close the audit chain. |

### FR-3: Approval Tiers

| ID | Requirement |
|----|-------------|
| FR-3.1 | The system MUST support at least two approval tiers. Tier 1 (session-authenticated approve/deny) suffices for command-elevation requests that release no credentials. Tier 2 (WebAuthn/FIDO2 step-up, phishing-resistant) is MANDATORY for any request whose fulfilment releases credentials from OpenBao. |
| FR-3.2 | Tier assignment MUST be a server-side policy decision (PDP), never client-asserted. Policy MUST fail toward the higher tier on ambiguity. |
| FR-3.3 | Approvals MUST be cryptographically signed records binding: request ID, request hash, approver identity, tier evidence (including WebAuthn assertion reference for Tier 2), timestamp, and decision. The CDP MUST verify this record before fulfilment (FR-1.3). |
| FR-3.4 | Approval routing MUST target the resource owner / responsible approver set for the requesting agent or target scope - not an unfiltered global queue. |
| FR-3.5 | Self-approval MUST be impossible: the requesting identity (or its owning human, where attributable) MUST NOT appear in its own approver set. |

### FR-4: Audit

| ID | Requirement |
|----|-------------|
| FR-4.1 | Every state transition, approval/denial, credential fetch, grant issuance, and grant redemption MUST be written to an append-only, hash-chained audit log on a trust boundary separate from PDP and CDP. Neither PDP nor CDP may modify or delete prior entries. |
| FR-4.2 | Audit unavailability MUST be fail-closed: no approvals are processed and no grants are issued while the audit sink is unreachable (CB4A storage requirement). |
| FR-4.3 | Audit entries MUST NOT contain secret values, wrapped tokens, grant tokens, or credential material - only identifiers, hashes, and accessors (cf. SPEC-SECRETS §2.4 HMAC'd accessors). |
| FR-4.4 | Approval events MUST be linkable to execution/fulfilment events via request ID and idempotency key, so every approved action has a closed evidence trail. |

### FR-5: Consumer Integration

| ID | Requirement |
|----|-------------|
| FR-5.1 | Agent clients MUST authenticate to the relay via OpenBao AppRole: per-machine role, CIDR-bound, SecretID delivered via response wrapping at provision time, token TTL ≤ 300 s (SPEC-SECRETS §5.2/5.3 pattern). |
| FR-5.2 | The relay MUST expose a documented, versioned protocol (websocket message schema + REST control endpoints) consumable by GUARD wrappers, agent runtimes, and CI jobs without component-specific forks. |
| FR-5.3 | Consumer-side failure semantics MUST be fail-closed: unreachable relay, protocol errors, or expired grants result in local denial, consistent with existing GUARD conventions. |
| FR-5.4 | The system MUST define a capability-locked `bash` wrapper elevation flow as the reference consumer (REQ-HITL-GUARD): sudo/root-gated commands become HITL elevation requests instead of hard drops, where policy opts in. |

---

## 3. Non-Functional Requirements

### NFR-1: Credential Safety (Anti-Leak)

| ID | Requirement |
|----|-------------|
| NFR-1.1 | Agent clients MUST never receive long-lived credentials, OpenBao tokens, or vault-reachable network paths. Request/fulfilment payloads MUST be structurally incapable of carrying raw secrets to the agent (schema-level exclusion). |
| NFR-1.2 | The CDP MUST NOT cache decrypted credentials beyond the fulfilment operation; credential material MUST be zeroed from memory immediately after wrapping/delivery (CB4A TM-1 mitigation). |
| NFR-1.3 | Grants MUST be sender-constrained (DPoP-style key binding, RFC 9449 model): a grant intercepted in transit MUST NOT be redeemable by another party. |
| NFR-1.4 | Secret values MUST NOT appear in any log, websocket frame visible to approvers beyond necessity, browser storage, or analytics. Approver-facing displays MUST mask values by default (SPEC-SECRETS FR-14.2 pattern). |
| NFR-1.5 | Responses carrying grant or request payloads MUST be marked `Cache-Control: no-store`; no client-side caching of sensitive payloads is permitted. |

### NFR-2: Transport & Channel Security (Anti-MitM / Anti-Spoofing)

| ID | Requirement |
|----|-------------|
| NFR-2.1 | All external communication MUST use TLS 1.2+ (wss/https). Plaintext listeners are forbidden outside loopback-only development profiles. |
| NFR-2.2 | Websocket connections MUST authenticate during the upgrade handshake via a short-lived, single-use ticket obtained from an authenticated REST endpoint. Credentials, session tokens, and grants MUST NOT appear in URLs, query strings, or upgrade headers beyond the ticket. |
| NFR-2.3 | The websocket endpoint MUST validate the `Origin` header against an allowlist (CSWSH defence) and MUST reject cross-origin upgrades. |
| NFR-2.4 | Protocol messages MUST be signed envelopes: tampering between otherwise-authenticated peers MUST be detectable. |
| NFR-2.5 | Approval actions MUST be non-replayable: signed approval records embed the request hash and a server nonce; re-submission MUST be rejected (FR-2.4). |

### NFR-3: Abuse Resistance

| ID | Requirement |
|----|-------------|
| NFR-3.1 | The relay MUST enforce per-agent and per-approver rate limits on submissions and decisions, with challenge/backpressure on excess. |
| NFR-3.2 | The system MUST support canary credentials: vault entries that MUST never be requested; any access attempt triggers immediate alert and revocation of the requesting agent's session (CB4A §6). |
| NFR-3.3 | Approver UX MUST present the evidence pack (§1.3) and MUST default-deny on timeout, minimising blind/fatigued approvals. |
| NFR-3.4 | Justification text is forensic evidence only: the PDP MUST NOT auto-approve based on justification content (CB4A justification rule). |

### NFR-4: Reliability & Performance

| ID | Requirement |
|----|-------------|
| NFR-4.1 | The request queue MUST be durable: relay restart MUST NOT lose `queued`/`presented` requests. |
| NFR-4.2 | Submission-to-presentation latency SHOULD be < 2 s on a healthy LAN; approval-to-fulfilment latency SHOULD be < 5 s including the OpenBao fetch. |
| NFR-4.3 | The relay MUST degrade fail-closed: loss of Keycloak JWKS, OpenBao, or the audit sink halts the affected pipeline stage (approvals / fulfilment) without crashing or silently passing. |
| NFR-4.4 | The web UI MUST remain operable for approvers on degraded relay connectivity (explicit offline/pending states; no phantom approvals). |

### NFR-5: Maintainability

| ID | Requirement |
|----|-------------|
| NFR-5.1 | Code lands under `hitl/backend` (Rust) and `hitl/web` (Next.js) in this repo, following existing WORKSPACE-CI conventions (lint/typecheck gates, pre-commit, 512-line file canon where applicable). |
| NFR-5.2 | The protocol schema MUST be versioned from v1 and changes MUST be backward-compatible within a major version or gated behind explicit negotiation. |
| NFR-5.3 | All security-relevant defaults (TTLs, rate limits, tier policy) MUST live in reviewed configuration with schema validation, not scattered literals. |

---

## 4. Constraints

| ID | Constraint | Source |
|----|------------|--------|
| C-1 | OpenBao is the only permitted credential store; no secrets in env files, databases, or browser storage. | SPEC-SECRETS / project policy |
| C-2 | Keycloak is the only permitted human identity provider; NextAuth 5 OIDC is the web integration pattern. | PORTAL SPEC-IAM |
| C-3 | Agent client auth is OpenBao AppRole with wrapped SecretID delivery. | FR-5.1 |
| C-4 | Tier 2 (WebAuthn/FIDO2) is mandatory for credential release; SMS/TOTP step-up is NOT acceptable. | CB4A Tier 3 guidance, FR-3.1 |
| C-5 | Fail-closed is the universal default; fail-open behaviour like REQ-CVE-SCAN's offline mode is FORBIDDEN in the approval/fulfilment path. | GUARD conventions |
| C-6 | Component code lives in `hitl/backend` and `hitl/web` in this repository. | Project layout decision 2026-07-25 |
| C-7 | The relay is implemented in Rust; the web UI in Next.js/React/TypeScript per workspace conventions. | Project layout decision 2026-07-25 |

---

## 5. Assumptions

| ID | Assumption |
|----|------------|
| A-1 | An OpenBao instance (per SPEC-SECRETS) with AppRole, JWT auth, response wrapping, and audit devices is available to the relay CDP. |
| A-2 | A Keycloak domain with the workspace OIDC client pattern (PORTAL) exists and supports WebAuthn as an authentication mechanism / ACR step-up. |
| A-3 | Approvers possess WebAuthn-capable authenticators (platform passkeys or security keys). |
| A-4 | Dev machines running agent clients have outbound HTTPS to the relay but no route to OpenBao (network segmentation per SPEC-SECRETS NFR-1.9). |
| A-5 | The audit sink (append-only store) is operated as a separate trust boundary with its own availability SLO. |

---

## 6. Open Questions

1. **Approver feed transport.** The relay speaks websocket to agent clients (mandated). The approver feed in the web UI could reuse PORTAL's proven SSE pattern instead of a second WS fan-out. Decision deferred to REQ-HITL-WEB; either must satisfy NFR-2 unchanged.
2. **Tier 2 quorum.** Should credential release ever require m-of-n approvers (dual-key, CB4A break-glass analogue)? Initial contract: single approver; quorum as follow-up.
3. **mTLS agent identity.** AppRole is the MVP (C-3); OpenBao PKI-issued client certificates (SPEC-SECRETS §3.3) are the documented upgrade path for stronger workload identity.
4. **Break-glass flow.** Emergency fulfilment bypassing normal approval (dual-authorised, auto-expiring, mandatory post-incident review) is recognised but deferred to a dedicated REQ.
5. **Behavioural baselining.** CB4A recommends anomaly detection on request patterns (confused-deputy detection). Deferred; rate limits + canaries are the MVP controls.

---

## 7. Verification Matrix

| # | Test | Maps to |
|---|------|---------|
| V1 | Submit a credential-releasing request; verify no OpenBao read occurs before approval (audit + OpenBao audit device cross-check). | FR-2.5, NFR-1.1 |
| V2 | Approve at Tier 1 a credential-releasing request: PDP MUST escalate to Tier 2; without WebAuthn assertion the request MUST NOT be fulfilled. | FR-3.1, FR-3.2 |
| V3 | Intercept a grant and attempt redemption from a different key/process: MUST fail (sender constraint). | NFR-1.3 |
| V4 | Kill the audit sink; submissions, approvals, and fulfilments MUST all halt (fail-closed), resuming cleanly after restoration. | FR-4.2, NFR-4.3 |
| V5 | Replay a signed approval record (same request ID + nonce): MUST be rejected; no duplicate grant. | NFR-2.5, FR-2.4 |
| V6 | Attempt cross-origin websocket upgrade with a valid ticket: MUST be rejected on Origin. | NFR-2.3 |
| V7 | Restart the relay with requests in `queued`/`presented`: all MUST reappear post-restart with TTLs intact. | NFR-4.1 |
| V8 | Request a canary credential path: alert fires, agent session revoked, audit chain records the event. | NFR-3.2 |
| V9 | Attempt self-approval (requester identity in approver set): MUST be rejected by PDP. | FR-3.5 |
| V10 | End-to-end reference flow: GUARD wrapper submits elevation request → approver approves (Tier 1) → elevation token redeemed locally → audit chain closed. | FR-5.4, FR-4.4 |

---

## 8. Implementation Status

| Item | Status | Evidence |
|------|--------|----------|
| REQ-HITL (this document) | Draft | - |
| REQ/SPEC-HITL-RELAY | Draft | `docs/requirements/REQ-HITL-RELAY.md`, `docs/specifications/SPEC-HITL-RELAY.md` |
| REQ/SPEC-HITL-WEB | Draft | `docs/requirements/REQ-HITL-WEB.md`, `docs/specifications/SPEC-HITL-WEB.md` |
| REQ/SPEC-HITL-GUARD | Draft | `docs/requirements/REQ-HITL-GUARD.md`, `docs/specifications/SPEC-HITL-GUARD.md` |
| `hitl/backend` scaffold | Implemented | `hitl-protocol` (envelopes, state machine, sig helpers) + `hitl-server` shell; cargo gates in `check-push` |
| `hitl/web` scaffold | Implemented | `hitl/web/` package; lint/type-check/test green; uses `@workspace-ci/web-components` |
