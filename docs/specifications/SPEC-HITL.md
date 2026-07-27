# SPEC-HITL: Human-in-the-Loop Oversight & Credential Brokering System

**Date:** 2026-07-25
**Status:** Draft
**Type:** Specification
**Requirements:** [REQ-HITL](../requirements/REQ-HITL.md)

> System-level implementation detail for the HITL oversight and
> credential-brokering service: component topology, trust boundaries,
> the canonical request lifecycle, the end-to-end message flow, tier
> policy, and the threat-model-to-mitigation mapping shared by all
> component specifications (SPEC-HITL-RELAY, SPEC-HITL-WEB,
> SPEC-HITL-GUARD). Maps every requirement ID in
> [REQ-HITL](../requirements/REQ-HITL.md) to owning components and
> concrete mechanisms.

---

**Cross-references:**

- [REQ-HITL](../requirements/REQ-HITL.md): owning requirements contract
- [SPEC-HITL-RELAY](SPEC-HITL-RELAY.md): relay backend (PDP/CDP, queue, protocol)
- [SPEC-HITL-WEB](SPEC-HITL-WEB.md): web UI (Keycloak auth, approver feed, WebAuthn)
- [SPEC-HITL-GUARD](SPEC-HITL-GUARD.md): GUARD elevation integration contract
- WORKSPACE-PORTAL `docs/specifications/SPEC-SECRETS.md`: OpenBao auth methods, policies, response wrapping
- WORKSPACE-PORTAL `docs/specifications/SPEC-AUTHENTICATION.md`: NextAuth 5 + Keycloak OIDC pattern
- [CB4A draft](https://datatracker.ietf.org/doc/html/draft-hartman-credential-broker-4-agents-00): broker architecture, TM-1..TM-10

---

## 1. Component Topology

```
                        ┌────────────────────────────────────────────┐
                        │              hitl/web (Next.js)            │
                        │  NextAuth 5 (Keycloak OIDC) · HITL feed UI │
                        │  WebAuthn step-up · WS/REST user client    │
                        └───────────────┬────────────────────────────┘
                                        │ https/wss (user JWT)
                                        ▼
┌──────────────┐  AppRole   ┌────────────────────────────────────────────┐
│ agent client │───────────►│            hitl/backend (Rust)             │
│ (GUARD wrap, │  wss       │  ┌─────────────┐    signed    ┌─────────┐  │
│  agent run-  │            │  │     PDP     │──approval───►│   CDP   │  │
│  time, CI)   │◄───────────│  │ queue·tier· │   record     │ OpenBao │  │
└──────────────┘   grant    │  │ routing·rl  │              │ client  │  │
                            │  └──────┬──────┘              └────┬────┘  │
                            └─────────┼──────────────────────────┼───────┘
                                      │ append-only              │ https
                                      ▼                          ▼
                              ┌──────────────┐           ┌──────────────┐
                              │  Audit sink  │           │   OpenBao    │
                              │ (hash-chain, │           │ (SPEC-SECRETS│
                              │  separate    │           │  deployment) │
                              │  boundary)   │           └──────────────┘
                              └──────────────┘
                                        ▲
                                        │ JWKS / WebAuthn
                                ┌───────┴───────┐
                                │   Keycloak    │
                                └───────────────┘
```

Trust boundaries (FR-1.2, FR-1.5):

| Boundary | Rule |
|----------|------|
| Agent client → relay | Reaches the relay's public WS/REST listener only. No route to CDP internals, OpenBao, or the audit sink. |
| User client → relay | Reaches the same public listener, authenticated with Keycloak-issued tokens. |
| PDP → CDP | Internal channel; CDP accepts only PDP-signed approval records (FR-1.3). |
| CDP → OpenBao | The only OpenBao client in the system; network-restricted (SPEC-SECRETS NFR-1.9). |
| All → audit sink | Append-only write; no update/delete path exists for any writer (FR-4.1). |

## 2. Request Lifecycle (FR-2)

Canonical state machine (all components share these exact states and
transition names in protocol payloads and audit entries):

```
submitted ──► queued ──► presented ──► approved ──► fulfilled ──► audited
    │            │           │            │
    │            │           │            ├──────► denied ────► audited
    │            │           │            └──────► expired ───► audited
    │            │           └───────────────────► expired ───► audited
    │            └───────────────────────────────► expired ───► audited
    └──────────────── (invalid) ─────────────────► rejected ──► audited
```

Transition rules:

1. `submitted → queued`: schema-validated, signature-verified, PDP
   policy admission (rate limits, routing, tier assignment). Rejection
   here is `rejected` with a reason class.
2. `queued → presented`: delivered to at least one eligible approver's
   feed. Presentation is idempotent across approver sessions.
3. `presented → approved | denied`: exactly one terminal decision is
   accepted (first valid signed decision wins; subsequent decisions for
   the same request are logged and discarded).
4. `approved → fulfilled`: CDP verifies the signed approval record,
   performs the OpenBao fetch (credential requests) or mints the
   elevation token, and delivers the grant. Fulfilment failure
   (OpenBao error, path not permitted) transitions to `rejected` with
   reason class `fulfilment_failed` - never a silent hang.
5. Any non-terminal state older than its TTL transitions to `expired`.
6. Every terminal transition emits the closing audit event linking
   request ID + idempotency key (FR-4.4).

State storage (NFR-4.1): the queue is a durable store (SQLite with WAL
for single-node MVP; schema supports swapping to Postgres without
protocol changes). In-memory-only queues are forbidden.

## 3. End-to-End Flows

### 3.1 Elevation flow (Tier 1, reference consumer: GUARD)

1. GUARD wrapper intercepts a sudo-gated command opted into HITL
   elevation; builds a request envelope: `{ agent_id, action: "exec",
   argv_hash, display_command (redacted), justification, nonce,
   idempotency_key, ttl }`, signs it with the agent's session key.
2. Agent client obtains an AppRole token (≤ 300 s), requests a WS
   ticket from `POST /api/v1/ws-ticket`, upgrades to wss, submits the
   envelope.
3. PDP admits, tiers (Tier 1), routes to the approver set for the
   agent's owner scope; request becomes `presented`.
4. Approver reviews the evidence pack in the web UI, approves with
   their authenticated session; web UI POSTs the decision; relay
   countersigns the approval record.
5. CDP mints an elevation token: `{ request_id, request_hash,
   agent_key_fingerprint, exp ≤ now+300s, jti }`, signed with the
   relay's grant-signing key; delivered to the waiting agent client
   over the same WS connection.
6. Wrapper verifies the token against the relay's public key, checks
   hash binding + fingerprint + expiry + single-use, executes the
   command under the permitted context, records redemption locally.
7. Relay closes the audit chain on redemption notification or token
   expiry.

### 3.2 Credential flow (Tier 2)

Steps 1-3 as above, except the PDP assigns Tier 2 (any request whose
fulfilment reads an OpenBao path).

4. Approver clicks approve; the web UI triggers a WebAuthn ceremony
   (Keycloak ACR step-up, `acr_values` per SPEC-HITL-WEB §4). The
   decision POST includes the WebAuthn assertion reference.
5. PDP verifies tier evidence, countersigns the approval record.
6. CDP verifies the record, reads the requested OpenBao path **now**
   (FR-2.5), wraps the response with `-wrap-ttl ≤ 300s` bound to a
   single unwrap, and delivers the wrapping token to the agent client.
7. Agent client unwraps at execution time (single use); the credential
   never transits the approver UI, never touches browser storage,
   never appears in any log (NFR-1.4).
8. Audit chain closes on unwrap (OpenBao audit device) + relay
   fulfilment event, correlated by request ID.

### 3.3 Denial / expiry

- Denial: approver decision `deny` + reason class → agent client
  receives structured rejection → local fail-closed handling
  (FR-2.8).
- Expiry: TTL elapses in any non-terminal state → `expired` → agent
  client notified → audit closed. Approvers see the request removed
  from their feed; late decisions are rejected.

## 4. Tier Policy (FR-3)

| Request class | Examples | Tier |
|---------------|----------|------|
| Command elevation, no credential path | `sudo systemctl restart X`, root-gated git subcommand | 1 |
| Credential-releasing | Any request naming an OpenBao path or dynamic-credential role | 2 |
| Ambiguous / unclassified | Anything the PDP cannot classify with confidence | 2 (fail toward higher tier, FR-3.2) |

Policy source: versioned YAML (`hitl/backend/config/tier_policy.yaml`,
schema-validated, NFR-5.3) mapping request classes and OpenBao path
globs to tiers and approver scopes. The PDP compiles it at startup;
invalid policy = relay refuses to start (fail-closed).

Approver set resolution (FR-3.4): request scopes map to Keycloak
groups (e.g. `hitl-approvers:<scope>`); the relay resolves group
membership via the token's `groups` claim. Self-approval exclusion
(FR-3.5) is enforced by comparing the request's attributable human
identity against the approver set at decision time.

## 5. Threat Model → Mitigation Map (NFR-1..3)

Adapting CB4A TM-1..TM-10 to this system:

| Threat | Description | Mitigation | Where |
|--------|-------------|------------|-------|
| T-1 Broker compromise | CDP is the highest-value target | No shell, minimal runtime, creds zeroed post-wrap (NFR-1.2), network-isolated (FR-1.2), canary paths (NFR-3.2) | SPEC-HITL-RELAY §7 |
| T-2 Agent compromise | Malicious/controlled requester | Zero standing privilege (NFR-1.1), AppRole CIDR binding (FR-5.1), rate limits (NFR-3.1), all requests human-gated | REQ-HITL-GUARD |
| T-3 Grant replay/scraping | Intercepted grant reused | Sender-constrained grants (NFR-1.3), single-use jti, ≤ 5 min TTL, non-renewable (FR-2.7) | SPEC-HITL-RELAY §5 |
| T-4 Approval fatigue | Rubber-stamping | Evidence pack (NFR-3.3), default-deny on timeout, batching limits, rate limits | SPEC-HITL-WEB §5 |
| T-5 MitM on transport | TLS interception/downgrade | TLS 1.2+ everywhere (NFR-2.1), ticket-based upgrade (NFR-2.2), signed envelopes (NFR-2.4) | SPEC-HITL-RELAY §4 |
| T-6 CSWSH | Cross-site websocket hijack | Origin allowlist at upgrade (NFR-2.3); no cookie-auth on WS (ticket only) | SPEC-HITL-RELAY §4 |
| T-7 Approval spoofing | Forged approver decision | Signed approval records with server nonce (FR-3.3, NFR-2.5); WebAuthn for Tier 2 (FR-3.1) | SPEC-HITL-WEB §4 |
| T-8 Confused deputy | Request context mismatch | PDP validates agent identity vs. requested scope; justification never an authz input (NFR-3.4) | SPEC-HITL-RELAY §3 |
| T-9 Audit tampering | Hidden malicious activity | Append-only hash-chained sink, separate boundary, fail-closed on unavailability (FR-4.1/4.2) | SPEC-HITL-RELAY §6 |
| T-10 Approver impersonation | Stolen session approves | Tier 2 requires fresh WebAuthn assertion (phishing-resistant, FR-3.1); session lifetimes short (PORTAL: 30 min JWT) | SPEC-HITL-WEB §3 |

## 6. Technology Selection

| Component | Selection | Rationale |
|-----------|-----------|-----------|
| Relay language | Rust 2021 (tokio + axum + tokio-tungstenite) | Matches GUARD toolchain; memory safety in the credential path; axum gives REST + WS upgrade in one service with typed extractors. |
| Queue store (MVP) | SQLite (WAL mode, `sqlx`) | Durable, zero-dep, single-node; schema forward-compatible with Postgres. |
| OpenBao client | `vaultrs`-style HTTP client (pinned) or thin hand-rolled `reqwest` client | Only needs: AppRole login, token renew, KVv2 read, wrap/unwrap, sys/health. |
| Grant signing | Ed25519 (relay grant key pair; public half distributed to consumers at provision) | Fast verify in GUARD's Rust context (`ed25519-dalek` precedent-free but ecosystem-standard); matches SPEC-SECRETS transit `ed25519` choice. |
| Web UI | Next.js + React + TS per workspace convention; NextAuth 5 + Keycloak | Reuses PORTAL's proven auth stack (SPEC-AUTHENTICATION) and CI repo's web conventions. |
| WebAuthn | Keycloak WebAuthn via ACR/AMR step-up; assertion evidence surfaced to the relay | No separate WebAuthn server to operate; Keycloak already the IdP (C-2). |
| Audit sink | File-backed hash-chained JSONL shipped to the existing log pipeline (Vector precedent in GATEWAY) as MVP; dedicated append-only store as the production target | Satisfies FR-4.1 without new infrastructure on day one; sink failure still fails closed. |

## 7. Requirement → Component Map

| REQ-HITL ID | Owning component spec |
|-------------|------------------------|
| FR-1.1-FR-1.5 (architecture) | SPEC-HITL-RELAY §1, §7 |
| FR-2.1-FR-2.8 (lifecycle) | SPEC-HITL-RELAY §2-§5 |
| FR-3.1-FR-3.5 (tiers) | SPEC-HITL-RELAY §3 (PDP), SPEC-HITL-WEB §4 (WebAuthn) |
| FR-4.1-FR-4.4 (audit) | SPEC-HITL-RELAY §6 |
| FR-5.1-FR-5.4 (consumers) | SPEC-HITL-RELAY §4 (protocol), SPEC-HITL-GUARD (reference consumer) |
| NFR-1.x (credential safety) | SPEC-HITL-RELAY §5, §7; SPEC-HITL-WEB §6 |
| NFR-2.x (transport) | SPEC-HITL-RELAY §4; SPEC-HITL-WEB §3 |
| NFR-3.x (abuse) | SPEC-HITL-RELAY §3; SPEC-HITL-WEB §5 |
| NFR-4.x (reliability) | SPEC-HITL-RELAY §2, §8; SPEC-HITL-WEB §7 |
| NFR-5.x (maintainability) | All component specs |

## 8. Rollout Plan

1. Land all four REQ/SPEC pairs (Draft) - this change.
2. Scaffold `hitl/backend` (Rust crate, CI gates) with the protocol
   schema crate first (NFR-5.2): types + state machine + signature
   helpers, fully unit-tested before any networking.
3. PDP + queue + WS endpoint against a mock CDP; SPEC-HITL-RELAY
   verification tests V-queue/V-protocol.
4. CDP against a dev OpenBao (SPEC-SECRETS compose profile); Tier 2
   enforcement with a no-op WebAuthn verifier.
5. Scaffold `hitl/web`; Keycloak client + approver feed + decision
   flow; real WebAuthn step-up.
6. GUARD reference consumer behind an opt-in policy flag
   (`SPEC-HITL-GUARD`), starting with a single low-blast-radius
   sudo-gated command class.
7. Burn-in with `mandatory: false`-style opt-in across one dev
   machine, then status Draft → Active.

## 9. Implementation Status

| Item | Status | Evidence |
|------|--------|----------|
| §1 topology | Specified | this document |
| §2 lifecycle | Specified | this document; shared enum to land in `hitl/backend/crates/hitl-protocol` |
| §3 flows | Specified | this document |
| §4 tier policy | Specified | `hitl/backend/config/tier_policy.yaml` (planned) |
| §5 threat map | Specified | this document |
| Component scaffolds | Not started | - |
