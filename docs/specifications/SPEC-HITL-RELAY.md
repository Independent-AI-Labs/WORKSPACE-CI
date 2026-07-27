# SPEC-HITL-RELAY: HITL Websocket Relay & Credential Broker Backend

**Date:** 2026-07-25
**Status:** Draft
**Type:** Specification
**Requirements:** [REQ-HITL-RELAY](../requirements/REQ-HITL-RELAY.md)
**Parent:** [SPEC-HITL](SPEC-HITL.md)

> Implementation detail for `hitl/backend`: crate layout, the v1
> protocol schema, queue schema and sweeper, PDP/CDP internals, grant
> formats, audit chain format, configuration, and test strategy. Maps
> every requirement ID in
> [REQ-HITL-RELAY](../requirements/REQ-HITL-RELAY.md) to concrete
> modules, types, and commands.

---

**Cross-references:**

- [REQ-HITL-RELAY](../requirements/REQ-HITL-RELAY.md): owning requirements contract
- [SPEC-HITL](SPEC-HITL.md): system topology, flows §3, tier policy §4, threat map §5
- [SPEC-HITL-WEB](SPEC-HITL-WEB.md): user-client side of the same API
- WORKSPACE-PORTAL `docs/specifications/SPEC-SECRETS.md` §5: AppRole/wrapping mechanics

---

## 1. Crate Layout

```
hitl/backend/
├── Cargo.toml                    # workspace
├── crates/
│   ├── hitl-protocol/            # FR-1.4: versioned types, envelopes,
│   │                             #   state machine, signature helpers
│   │                             #   #![forbid(unsafe_code)], no I/O deps
│   ├── hitl-queue/               # FR-2: durable store trait + SQLite impl
│   ├── hitl-pdp/                 # FR-3: admission, tiers, routing, limits
│   ├── hitl-cdp/                 # FR-4: OpenBao client, fulfilment, wrapping
│   ├── hitl-audit/               # FR-6: hash-chained append-only writer
│   └── hitl-server/              # binary: axum REST + WS, wiring, config
├── config/
│   ├── relay.yaml                # listeners, TLS, TTLs, rate limits
│   ├── tier_policy.yaml          # SPEC-HITL §4 policy
│   └── schemas/                  # JSON-schema for both config files
└── tests/                        # integration harness (mock agent, mock OpenBao)
```

Dependency pins (initial): `axum` 0.8, `tokio` 1, `tokio-tungstenite`,
`sqlx` (sqlite), `ed25519-dalek` 2, `jsonwebtoken` 10, `reqwest`
(rustls only), `zeroize`, `serde`/`serde_json`, `jsonschema`,
`tracing`. All pins move via `Cargo.lock` + normal review; REQ-CVE-SCAN
gate applies (`Cargo.lock` is a scanned lockfile).

## 2. Protocol v1 (FR-1, FR-1.4)

### 2.1 REST control API

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `POST /api/v1/requests` | agent | Submit request envelope (alternative to WS submission; same validation) |
| `GET /api/v1/requests/{id}` | agent (own) / approver (scoped) | Poll status |
| `POST /api/v1/requests/{id}/decision` | approver | `{ decision: approve\|deny, reason_class, tier_evidence }` |
| `GET /api/v1/feed?scope=...` | approver | Current presented queue for caller's scopes |
| `POST /api/v1/ws-ticket` | any authenticated | Mint WS ticket `{ ticket, exp }` (≤ 30 s, single use) |
| `GET /api/v1/meta/grant-pubkey` | agent | Current grant public key (key rotation support) |
| `GET /healthz`, `/readyz` | infra | Liveness / dependency readiness (NFR-2.2) |

Errors: RFC 9457 problem+json with a stable `code` enum
(`invalid_envelope`, `already_decided`, `expired`, `tier_required`,
`rate_limited`, `fulfilment_failed`, ...). No internal detail leaks.

### 2.2 Websocket channel

- URL: `wss://<relay>/ws/v1?ticket=<ticket>` - the ticket is the only
  credential in the URL; it is single-use and ≤ 30 s old (FR-7.4).
- Upgrade checks, in order: TLS terminator → `Origin` allowlist
  (FR-1.2) → ticket validity + binding to the authenticated principal
  → session established; server sends `session.hello` with resume
  cursor (NFR-2.3).
- Message unit: envelope

```json
{
  "v": 1,
  "type": "request.submit | request.status | decision.result |
           grant.deliver | feed.update | error | ping | pong",
  "id": "msg_ulid",
  "principal": "agent:<id> | user:<sub>",
  "payload": { "...": "type-specific" },
  "sig": "<base64 ed25519 over canonical(header+payload)>"
}
```

- Canonical signing form: JCS (RFC 8785) of the envelope minus `sig`.
- Request payload schema (submission):

```json
{
  "request_id": "ulid (client-generated)",
  "idempotency_key": "ulid",
  "class": "exec.elevation | credential.fetch",
  "action": { "display": "sudo systemctl restart wiki",
              "argv_sha256": "...", "argv_enc_for_relay": null },
  "target": { "host": "dev-vm-01", "scope": "workspace-ci" },
  "credential": null,                        // or { "bao_path": "...", "role": null }
  "justification": "free text (forensic only, REQ-HITL NFR-3.4)",
  "ttl_seconds": 900,
  "agent_nonce": "random-32B"
}
```

Schema-level credential-safety rule (REQ-HITL NFR-1.1): no field in
any agent-bound message can carry secret bytes - `hitl-protocol`
enforces this with distinct `AgentBound`/`ApproverBound` payload types
that simply have no secret-typed fields.

### 2.3 Approver feed transport decision (resolves REQ-HITL OQ-1)

The relay implements the approver feed over the same WS channel
(`feed.update` messages): one fan-out code path, one auth model, and
approver liveness is implicit in the connection. WS is the only shipped
transport; if WS proves problematic behind proxies, that is a v2
decision, recorded here as an open question rather than shipped as an
alternate code path.

## 3. Queue & Sweeper (FR-2)

SQLite (WAL) schema:

```sql
CREATE TABLE requests (
  request_id      TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  state           TEXT NOT NULL CHECK (state IN
    ('submitted','queued','presented','approved','denied',
     'expired','fulfilled','rejected')),
  envelope_json   TEXT NOT NULL,      -- original signed envelope (forensic)
  request_hash    TEXT NOT NULL,      -- sha256 of canonical request payload
  tier            INTEGER NOT NULL,
  scope           TEXT NOT NULL,
  agent_id        TEXT NOT NULL,
  created_at      INTEGER NOT NULL,
  expires_at      INTEGER NOT NULL,
  decided_by      TEXT,
  decision_record TEXT,               -- PDP-signed approval record JSON
  grant_jti       TEXT
);
CREATE TABLE grant_jtis (             -- FR-5.3 replay registry
  jti TEXT PRIMARY KEY, expires_at INTEGER NOT NULL
);
CREATE TABLE audit_head (             -- FR-6.2 chain head, single row
  id INTEGER PRIMARY KEY CHECK (id = 1), head_hash TEXT NOT NULL
);
```

- Decision acceptance: single transaction - `UPDATE ... SET state=?
  WHERE request_id=? AND state IN ('queued','presented')` + insert
  decision record + audit append; row-count 0 ⇒ `already_decided`
  (FR-2.4).
- Sweeper task: every 5 s, `state IN non-terminal AND expires_at < now`
  → `expired` + audit + WS notify (FR-2.3).
- On boot: reload non-terminal rows, re-arm timers, re-present to
  scopes (FR-2.2).

## 4. PDP Internals (FR-3)

Pipeline per submission:

1. **Verify**: envelope signature, schema, TTL bounds, idempotency.
2. **Classify**: `tier_policy.yaml` rules evaluated in order:

```yaml
version: 1
default_tier: 2                    # FR-3.1 fail-high
rules:
  - match: { class: "exec.elevation", credential: null }
    tier: 1
    scopes: ["hitl-approvers:ops"]
  - match: { class: "credential.fetch" }
    tier: 2
    scopes: ["hitl-approvers:secrets"]
    bao_paths: ["platform/secrets/service/data/hitl/*"]   # FR-4.5 allowlist
```

3. **Route**: resolve scope → Keycloak group; store scope on the row.
4. **Limit**: token buckets per `agent_id` (default 10 req/min) and per
   approver (default 30 decisions/min) (FR-3.3).
5. **Audit-append** then enqueue (write-ahead, FR-6.4).

Approval record (FR-3.4), signed with the PDP signing key:

```json
{ "request_id": "...", "request_hash": "...", "approver": "user:sub",
  "tier": 2, "tier_evidence": { "webauthn_assertion_id": "...", "acr": "..." },
  "nonce": "server-32B", "iat": 1753450000, "decision": "approve" }
```

The nonce is bound to the request row at presentation; the CDP checks
freshness + single-use (record hash inserted into `grant_jtis`-style
registry).

## 5. Grants (FR-5)

### 5.1 Elevation token

JWT, Ed25519 (EdDSA), claims:

```
iss = hitl-relay, sub = agent:<id>, jti, iat, exp ≤ iat+300,
request_id, request_hash, cnf = { "jwk-thumbprint": agent session key }
```

Redemption (consumer side, SPEC-HITL-GUARD §4): verify signature +
`exp` + `request_hash` equals the local request hash + `cnf` matches
the requesting key + `jti` unused (local registry + relay
notification). Sender constraint = the token is only meaningful to the
key whose thumbprint is in `cnf` (FR-5.2).

### 5.2 Wrapped credential

CDP fulfilment for `credential.fetch`:

```text
bao write -wrap-ttl=300s -f <allowed path>   → wrapping_token
deliver { "kind": "bao-wrap", "token": wrapping_token, "request_id", "jti" }
```

The agent unwraps at execution time; the raw secret transits only
OpenBao→(wrapped)→agent-exec-context (FR-4.4). CDP buffers use
`zeroize::Zeroizing<Vec<u8>>` (NFR-1.3).

## 6. Audit Chain (FR-6)

Event JSONL, one per line, append-only:

```json
{ "seq": 412, "ts": 1753450000123, "kind": "decision.approved",
  "request_id": "...", "actor": "user:sub", "request_hash": "...",
  "detail": { "tier": 2 }, "prev_hash": "sha256:...", "hash": "sha256:..." }
```

`hash = sha256(canonical(event minus hash))`; `prev_hash` chains.
Writer: `hitl-audit` holds an exclusive append handle; on I/O error it
enters fail-closed mode - PDP decision endpoint and CDP fulfilment both
gate on `audit healthy` (FR-6.2). Ship to the log pipeline (Vector
pattern from WORKSPACE-GATEWAY) for off-box retention; the local file
remains the chain-of-custody source.

## 7. CDP Deployment & Hardening (FR-4, SPEC-HITL T-1)

- Separate systemd unit `hitl-cdp.service` (same binary,
  `--role=cdp`), `NoNewPrivileges`, `ProtectSystem=strict`,
  `PrivateTmp`, egress restricted to OpenBao + audit sink via
  firewall rules (NFR-1.4).
- AppRole SecretID delivered at provision via response wrapping
  (SPEC-SECRETS §5.3); the unit stores only the RoleID + a
  single-use wrapped SecretID bootstrap file, re-wrapped on rotation.
- PDP↔CDP channel (MVP single host): Unix datagram socket
  `/run/hitl/pdp-cdp.sock`, peer-cred verified; messages are the
  signed approval records - the CDP performs no PDP logic.

## 8. Configuration

`config/relay.yaml` (schema-validated at boot, invalid = refuse start,
FR-3.5):

```yaml
listen: { https: "0.0.0.0:8443" }
tls: { cert: /etc/hitl/tls.crt, key: /etc/hitl/tls.key, min_version: "1.2" }
origins: ["https://hitl.example.local"]
keycloak: { issuer: "...", jwks_url: "...", audience: "hitl-relay" }
openbao: { addr: "https://127.0.0.1:8200", approle: { role_id: "..." } }
audit: { path: /var/lib/hitl/audit.jsonl }
queue: { path: /var/lib/hitl/queue.db, sweeper_interval_s: 5 }
limits: { agent_rpm: 10, approver_dpm: 30, ws_max_per_principal: 4, ws_max_global: 512 }
ttl: { request_max_s: 3600, ws_ticket_s: 30, grant_s: 300 }
```

## 9. Testing Strategy

| Layer | Mechanism | Covers |
|-------|-----------|--------|
| `hitl-protocol` unit | Property tests (envelope round-trip, canonical-sign stability, state-machine transition legality via exhaustive pair enumeration) | FR-1.3-1.5, FR-2.1 |
| `hitl-queue` unit | SQLite in-tmpfs; concurrency races via spawned tasks | FR-2.2-2.5 |
| PDP unit | Table-driven tier/routing/limit cases | FR-3.x |
| CDP integration | Mock OpenBao (axum test server) asserting call order & wrap params; one network-gated test against dev OpenBao | FR-4.x, V5-V7 |
| E2E | `tests/e2e.rs`: spawn server, scripted agent + approver clients; runs V1-V13 from REQ-HITL-RELAY §7 | all V-items |
| Audit | Chain-verifier CLI (`hitl-audit-verify`) replaying the log; used in CI on E2E artifacts | FR-6, V9 |

## 10. Implementation Status

| Item | Status | Evidence |
|------|--------|----------|
| §1 layout | Partially implemented | `hitl-protocol` + `hitl-server` crates only; queue/pdp/cdp/audit crates pending |
| §2 protocol v1 | Partially implemented | envelope types, state machine, Ed25519 sign/verify, error codes in `hitl-protocol`; REST/WS endpoints pending |
| §3-§8 internals | Specified | - |
| Code | Scaffold implemented | `make -C hitl/backend check` green (fmt, clippy `-D warnings`, 24 tests); wired into root `check-push` |
