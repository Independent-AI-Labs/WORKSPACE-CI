# REQ-HITL-RELAY: HITL Websocket Relay & Credential Broker Backend

**Date:** 2026-07-25
**Status:** Draft
**Type:** Requirements
**Parent:** [REQ-HITL](REQ-HITL.md)
**Specification:** [SPEC-HITL-RELAY](../specifications/SPEC-HITL-RELAY.md)

> Requirements for `hitl/backend`: the Rust relay service that hosts
> the agent-facing websocket endpoint and REST control API, owns the
> durable request queue, implements the PDP (policy, tiers, routing,
> rate limits) and the CDP (the only OpenBao client in the system),
> issues sender-constrained single-use grants, and writes the
> hash-chained audit stream. It is the generic, consumer-agnostic core
> of the HITL system; GUARD wrappers, agent runtimes, and CI jobs all
> speak the same versioned protocol.

---

**Cross-references:**

- [REQ-HITL](REQ-HITL.md): parent system requirements (lifecycle, tiers, audit, NFRs)
- [SPEC-HITL-RELAY](../specifications/SPEC-HITL-RELAY.md): companion specification
- [REQ-HITL-WEB](REQ-HITL-WEB.md): approver-facing client of this relay
- [REQ-HITL-GUARD](REQ-HITL-GUARD.md): reference agent client
- [SPEC-HITL](../specifications/SPEC-HITL.md): topology, flows, threat map
- WORKSPACE-PORTAL `docs/specifications/SPEC-SECRETS.md`: AppRole, response wrapping, token TTLs reused by the CDP

---

## 1. Purpose & Scope

### 1.1 Purpose

Provide a single, hardened service through which every HITL oversight
request and every credential fulfilment flows, such that: (a) no agent
client ever contacts OpenBao or holds credential material, (b) no
approval is valid without a signed, tier-appropriate decision record,
and (c) every transition is durably queued and immutably audited.

### 1.2 Scope

**This document OWNS the requirements for:**

- The agent-facing websocket protocol and REST control API (versioned).
- The durable queue and the REQ-HITL §2 lifecycle state machine.
- PDP: admission, tier assignment, approver routing, rate limits.
- CDP: OpenBao access, fulfilment, grant minting and wrapping.
- Grant formats (elevation token, wrapped credential) and their
  sender-constraining.
- The audit event schema and hash-chaining discipline.
- Relay-side configuration, secrets handling, and failure semantics.

**This document DOES NOT:**

- Own approver UI/UX or Keycloak client setup (REQ-HITL-WEB).
- Own any consumer-side wrapper logic (REQ-HITL-GUARD).
- Own OpenBao server operation (SPEC-SECRETS).
- Own approver notification channels outside the web feed (email/push
  are future work).

### 1.3 Terminology

Inherits REQ-HITL §1.3. Additionally:

| Term | Definition |
|------|------------|
| WS ticket | Single-use, ≤ 30 s TTL opaque token minted by `POST /api/v1/ws-ticket`; the only accepted credential at websocket upgrade. |
| Envelope | The signed JSON message unit of the protocol: `{ header, payload, signature }`. |
| Grant key | Ed25519 key pair used by the CDP to sign elevation tokens; public half provisioned to consumers. |
| Approval record | PDP-countersigned decision object consumed by the CDP (REQ-HITL FR-3.3). |

---

## 2. Functional Requirements

### FR-1: API Surface

| ID | Requirement |
|----|-------------|
| FR-1.1 | The relay MUST expose a versioned REST control API under `/api/v1/` including at minimum: `POST /requests` (submit), `GET /requests/{id}` (status), `POST /requests/{id}/decision` (approver decision), `GET /feed` (approver queue listing), `POST /ws-ticket`, `GET /healthz`, `GET /readyz`. |
| FR-1.2 | The relay MUST expose a websocket endpoint (e.g. `/ws/v1`) used for agent request submission/status streaming and approver live feed updates. The upgrade MUST require a valid WS ticket (REQ-HITL NFR-2.2) and an allowlisted `Origin` (REQ-HITL NFR-2.3). |
| FR-1.3 | All protocol payloads MUST be signed envelopes: agent envelopes signed with the agent session key established at AppRole login; server envelopes signed with the grant key. Unsigned or unverifiable envelopes MUST be rejected and audited. |
| FR-1.4 | The protocol schema MUST be defined in a dedicated, separately testable crate/module (`hitl-protocol`), versioned from v1, with serde-compatible types shared (as documentation or generated bindings) by consumers. |
| FR-1.5 | Malformed messages, unknown types, and version mismatches MUST produce structured errors and MUST NOT panic or disconnect unrelated sessions. |

### FR-2: Queue & Lifecycle

| ID | Requirement |
|----|-------------|
| FR-2.1 | The relay MUST implement the REQ-HITL §2 state machine exactly; persisted transitions are the source of truth. |
| FR-2.2 | The queue MUST be durable across restarts (REQ-HITL NFR-4.1): pending requests with their TTLs survive a relay restart. |
| FR-2.3 | TTL enforcement MUST be active (a sweeper), not lazy-only: expiry transitions fire within a bounded interval of TTL elapse even without traffic. |
| FR-2.4 | Decision acceptance MUST be first-valid-wins and atomic: concurrent approve/deny races resolve to exactly one terminal decision. |
| FR-2.5 | Submission MUST enforce idempotency keys: a re-submitted key returns the existing request rather than creating a duplicate. |

### FR-3: PDP (Policy Decision Point)

| ID | Requirement |
|----|-------------|
| FR-3.1 | The PDP MUST assign approval tiers per REQ-HITL §4 policy: any request naming an OpenBao path or credential role is Tier 2; classification failure defaults to Tier 2. |
| FR-3.2 | The PDP MUST route requests to the approver scope mapped from the request's target/agent owner (REQ-HITL FR-3.4) and MUST exclude self-approval (REQ-HITL FR-3.5). |
| FR-3.3 | The PDP MUST enforce per-agent submission rate limits and per-approver decision rate limits (REQ-HITL NFR-3.1), with configurable thresholds. |
| FR-3.4 | The PDP MUST countersign decisions into approval records binding request ID, request hash, approver identity, tier evidence, nonce, and timestamp; the record MUST be single-use. |
| FR-3.5 | Tier policy and routing config MUST be loaded from schema-validated configuration; invalid config MUST prevent startup (fail-closed). |

### FR-4: CDP (Credential Delivery Point)

| ID | Requirement |
|----|-------------|
| FR-4.1 | The CDP MUST be the only component holding an OpenBao service token (AppRole, CIDR-bound, TTL ≤ 300 s, renewed in-process; REQ-HITL FR-5.1 pattern). |
| FR-4.2 | The CDP MUST fulfil only PDP-signed approval records and MUST verify: signature, request hash match, tier evidence, nonce freshness, and record single-use before any OpenBao access. |
| FR-4.3 | OpenBao reads MUST happen strictly at fulfilment time (REQ-HITL FR-2.5). Pre-fetching, caching, or speculative reads are forbidden. |
| FR-4.4 | Credential fulfilment MUST use OpenBao response wrapping (`wrap-ttl ≤ 300 s`, single unwrap) so the CDP never emits raw secret material onto the wire in plaintext form beyond the wrap mechanism. |
| FR-4.5 | The CDP MUST enforce an allowlist of permitted OpenBao paths/roles per request class from configuration; requests outside the allowlist MUST be rejected before any vault access. |
| FR-4.6 | Decrypted credential material MUST be zeroed from CDP memory immediately after wrapping (REQ-HITL NFR-1.2). |
| FR-4.7 | OpenBao unavailability MUST fail fulfilment closed: the request transitions to `rejected`/`fulfilment_failed` with audit, never to a silent retry loop or a pass-through. |

### FR-5: Grants

| ID | Requirement |
|----|-------------|
| FR-5.1 | Elevation tokens MUST be Ed25519-signed JWT-like objects binding: request ID, request hash, agent key fingerprint, `jti`, `exp ≤ iat + 300 s`; non-renewable, single-use. |
| FR-5.2 | Grants MUST be sender-constrained (REQ-HITL NFR-1.3): redemption requires proof of possession of the requesting agent's session key. |
| FR-5.3 | The relay MUST track grant `jti`s until expiry and MUST reject duplicate redemption notifications (replay defence). |
| FR-5.4 | Grant delivery MUST occur only over the authenticated channel of the requesting agent's own session; grants are never broadcast or delivered to approver sessions. |

### FR-6: Audit

| ID | Requirement |
|----|-------------|
| FR-6.1 | The relay MUST emit an audit event for every lifecycle transition, decision, OpenBao access, grant issuance, and redemption notification, per REQ-HITL FR-4. |
| FR-6.2 | Events MUST be hash-chained (each event embeds the previous event's hash) and written append-only to the configured sink; sink failure MUST halt approvals and fulfilment (REQ-HITL FR-4.2). |
| FR-6.3 | Event payloads MUST exclude secrets, tokens, grants, and wrapping tokens; identifiers and hashes only (REQ-HITL FR-4.3). |
| FR-6.4 | Audit writes MUST be durable before the corresponding state transition is acknowledged to clients (write-ahead discipline). |

### FR-7: Authentication & Authorization

| ID | Requirement |
|----|-------------|
| FR-7.1 | Agent clients MUST authenticate via OpenBao AppRole per REQ-HITL FR-5.1; the relay MUST verify the AppRole token and bind the session to the agent identity and (where available) source CIDR. |
| FR-7.2 | User (approver) requests MUST present a Keycloak-issued bearer token; the relay MUST validate signature (JWKS), issuer, audience, and expiry. |
| FR-7.3 | Approver authorization MUST be scope-based: an approver sees and decides only requests routed to scopes they are a member of. |
| FR-7.4 | WS tickets MUST be minted only for already-authenticated principals, be single-use, and expire ≤ 30 s. |
| FR-7.5 | Token/session verification failures MUST be indistinguishable in timing and response shape (no oracle for valid vs. invalid identities). |

---

## 3. Non-Functional Requirements

### NFR-1: Security

| ID | Requirement |
|----|-------------|
| NFR-1.1 | TLS 1.2+ on all listeners; the CDP→OpenBao channel MUST use TLS in non-dev profiles (SPEC-SECRETS §1.2 production note). |
| NFR-1.2 | The relay MUST NOT log envelope payloads containing request parameters beyond redacted display fields; structured logging with a secrets-exclusion test. |
| NFR-1.3 | Memory handling for credential material MUST use zeroizing buffers (`zeroize` crate or equivalent). |
| NFR-1.4 | The CDP network policy MUST permit egress only to OpenBao and the audit sink; the PDP/public listener MUST NOT reach OpenBao (defence in depth behind FR-4.1). |

### NFR-2: Reliability & Performance

| ID | Requirement |
|----|-------------|
| NFR-2.1 | Submission-to-presentation < 2 s and approval-to-fulfilment < 5 s on healthy LAN (REQ-HITL NFR-4.2). |
| NFR-2.2 | `/readyz` MUST report dependency health (queue store, Keycloak JWKS reachability, OpenBao via CDP, audit sink) and fail closed. |
| NFR-2.3 | WS connections MUST support reconnect-with-resume: an agent client reconnecting with a valid session MUST receive pending terminal states for its requests. |
| NFR-2.4 | The relay MUST bound per-connection and global WS session counts with backpressure, not unbounded growth. |

### NFR-3: Maintainability

| ID | Requirement |
|----|-------------|
| NFR-3.1 | Rust 2021, workspace crate layout under `hitl/backend`; `hitl-protocol` types crate separated from the service binary. |
| NFR-3.2 | All configuration (tier policy, path allowlists, rate limits, TTLs) MUST be schema-validated YAML with reviewed defaults (REQ-HITL NFR-5.3). |
| NFR-3.3 | Unsafe code is forbidden in credential, grant, and protocol paths; `#![forbid(unsafe_code)]` at crate roots where feasible. |
| NFR-3.4 | The crate MUST pass the repo's standard gates (fmt, clippy deny-warnings, tests) and the CVE scan hook (REQ-CVE-SCAN) clean. |

---

## 4. Constraints

| ID | Constraint | Source |
|----|------------|--------|
| C-1 | Rust implementation; tokio ecosystem. | REQ-HITL C-7 |
| C-2 | OpenBao is the only credential backend; CDP is its only client. | REQ-HITL C-1, FR-1.2 |
| C-3 | Human identity only via Keycloak-issued tokens (JWKS validation). | REQ-HITL C-2 |
| C-4 | Fail-closed everywhere; no offline/fail-open mode in the approval or fulfilment path. | REQ-HITL C-5 |
| C-5 | Protocol versioned from v1; breaking changes require a new version path. | REQ-HITL NFR-5.2 |

---

## 5. Assumptions

| ID | Assumption |
|----|------------|
| A-1 | OpenBao exposes AppRole, KVv2, response wrapping, and a reachable audit device (SPEC-SECRETS). |
| A-2 | Keycloak JWKS endpoint is reachable from the relay; approver tokens carry a `groups` claim for scope routing. |
| A-3 | Single-node deployment is the MVP topology; HA is out of scope (SQLite WAL acceptable). |
| A-4 | Consumers can verify Ed25519 signatures and hold a pre-provisioned copy of the grant public key. |

---

## 6. Open Questions

1. **Approver feed fan-out.** WS multiplexing for approvers vs. SSE from the web tier (REQ-HITL Open Question 1) - the relay protocol supports both; the web spec decides.
2. **Postgres migration trigger.** Define queue-depth/HA thresholds that force the store swap; schema is forward-compatible (SPEC-HITL §6).
3. **Grant key rotation.** Rotation cadence and consumer public-key distribution mechanism (manual provision vs. OpenBao-hosted pubkey endpoint).
4. **Break-glass endpoint.** Reserved versioned path shape (`/api/v1/breakglass/*`) but deferred per REQ-HITL Open Question 4.

---

## 7. Verification Matrix

| # | Test | Maps to |
|---|------|---------|
| V1 | Submit/approve/fulfil elevation request end-to-end with a mock agent client; states traverse exactly per state machine; audit chain closed. | FR-2.1, FR-5.1 |
| V2 | Restart relay mid-`presented`; request reappears with remaining TTL; decision still accepted once. | FR-2.2, FR-2.4 |
| V3 | Race two decisions concurrently: exactly one terminal decision; loser receives `already_decided`. | FR-2.4 |
| V4 | Re-submit with same idempotency key: same request returned, no duplicate. | FR-2.5 |
| V5 | Attempt fulfilment with forged/unsigned/stale approval record: CDP rejects before any OpenBao call (assert zero vault reads via OpenBao audit device). | FR-4.2 |
| V6 | Credential request: assert first OpenBao read timestamp ≥ approval timestamp. | FR-4.3 |
| V7 | Wrapped credential: single unwrap succeeds, second unwrap fails; wrap TTL ≤ 300 s. | FR-4.4 |
| V8 | Grant replay: redeem intercepted elevation token with wrong session key: rejected. | FR-5.2, FR-5.3 |
| V9 | Stop audit sink: submissions/approvals/fulfilments halt; restore: resume with unbroken hash chain. | FR-6.2 |
| V10 | Cross-origin WS upgrade with valid ticket: rejected; missing/expired/reused ticket: rejected. | FR-1.2, FR-7.4 |
| V11 | Tier misclassification probe: request with ambiguous class routed to Tier 2. | FR-3.1 |
| V12 | Rate-limit fuzz: >N submissions/s per agent → 429/backpressure; no queue corruption. | FR-3.3, NFR-2.4 |
| V13 | Log scan: run full E2E suite, grep service logs for canary secret values and grant tokens: zero matches. | NFR-1.2 |

---

## 8. Implementation Status

| Item | Status | Evidence |
|------|--------|----------|
| REQ-HITL-RELAY (this document) | Draft | - |
| `hitl/backend` crate scaffold | Implemented | workspace + `hitl-server` (healthz/readyz fail-closed, meta/version); `make -C hitl/backend check` + `make check-push` green |
| `hitl-protocol` types crate | Implemented | envelope/state/types/sig/error modules, `#![forbid(unsafe_code)]`, 21 unit tests (state-machine exhaustive pairs, canonical-sign stability, envelope round-trip) |
| PDP / queue / WS endpoint | Not started | - |
| CDP / OpenBao client | Not started | - |
