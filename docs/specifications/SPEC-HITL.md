# SPEC-HITL: Sudo Approval Architecture

**Date:** 2026-08-16
**Status:** Target specification; implementation pending
**Requirements:** [REQ-HITL](../requirements/REQ-HITL.md)

## 1. Topology

```text
escalate
  | mTLS + Ed25519 signed request
  v
PDP -------------------- SQLite
  |                         |
  +--------------------- hash-chained JSONL audit
  |
  +---- HTTPS/WSS ---- Next.js BFF ---- Keycloak ---- approver
  |
  +---- bound live decision response ----> escalate
                                               |
                                               v
                                  guarded Bash -> guarded sudo
```

There is one backend security process: the PDP. There is no CDP, OpenBao client,
protected executor, credential channel, grant signer, or audit-writer service.
The PDP serializes its own audit appends.

## 2. Implemented Scaffold

`hitl/backend` currently provides protocol envelope/signature helpers,
lifecycle types, health endpoints, and fail-closed readiness scaffolding.
`hitl/web` provides feed/detail/decision components and fail-closed relay-client
boundaries.

Obsolete credential, tier, grant, and fulfilment types were removed because
they are not part of the target contract.

## 3. Protocol

### Request

The canonical request contains:

```text
version
message_type = sudo.request
request_id
principal
argv: ordered UTF-8 strings
cwd: { canonical_path, device, inode }
caller: { uid, gid, supplementary_groups, agent_id }
host_id
justification
server_nonce
expires_at
signature
```

`escalate` authenticates with mTLS and signs the canonical envelope with its
Ed25519 key. The PDP requires both identities to map to the same provisioned
principal.

### Decision

The PDP returns one of:

```text
approved | denied | expired | cancelled
```

The response binds protocol version, request ID, canonical request hash, server
nonce, decision, and expiry to the existing authenticated connection. It is not
a token and is invalid outside that connection and waiting process.

Any disconnect ends the invocation. A replacement connection creates a new
request and requires a new decision.

## 4. State

SQLite stores one row per request with:

- request ID and canonical request bytes/hash;
- authenticated principal and host;
- exact argv and cwd/caller binding;
- policy version and approver scope;
- created and expiry timestamps;
- current state;
- approver identity and decision timestamp when terminal.

An immediate transaction changes `pending` to exactly one terminal state. A
unique request ID and state predicate enforce first-valid-wins. A sweeper expires
elapsed pending requests. Connection loss cancels a pending request; no reconnect
state is stored.

## 5. PDP Flow

1. Accept an mTLS connection from `escalate`.
2. Issue a fresh server nonce bound to the connection.
3. Parse the bounded request and verify Ed25519 signature, mTLS principal, exact
   identity binding, schema, expiry, and sudo-only command surface.
4. Load policy and derive host/command scope and approver group.
5. Persist `pending` and synchronously append audit.
6. Present the request only to eligible non-requester approvers.
7. Validate Keycloak session, group scope, CSRF, rate limit, request hash, and
   current pending state.
8. Atomically persist the first terminal decision and append audit.
9. If approved and the submitting connection is still the original healthy
   connection, deliver the bound positive response and audit delivery.
10. Otherwise cancel or expire without delivering authority.

`approved` is terminal after successful response delivery. HITL does not monitor
or record the later local command result.

## 6. Web Flow

The Next.js application uses Keycloak OIDC and server-held sessions. Browser
routes are feed and request detail. Decision controls appear only on detail.

The BFF performs authenticated HTTPS calls to PDP. For live feed updates, it
mints a single-use, origin-bound PDP WebSocket ticket valid for at most 30
seconds. Browser responses are schema-projected, escaped, and `no-store`.

There is no approval tier, WebAuthn step-up, credential evidence, executor
status, or command-output view.

## 7. Audit

The PDP appends one JSON object per line under an exclusive writer lock. Each
record includes:

```text
sequence, timestamp, event_type, request_id, principal_id,
approver_id, policy_version, request_hash, state_from, state_to,
reason_class, previous_hash, record_hash
```

The record hash covers canonical record content and `previous_hash`. Append and
file synchronization complete before the corresponding state acknowledgement.
Startup verifies the chain and refuses readiness on corruption.

## 8. Deployment

The target needs only:

| Unit | Required access                                                                         |
| ---- | --------------------------------------------------------------------------------------- |
| PDP  | mTLS listener, SQLite, audit file, policy, agent CA, Ed25519 public keys, Keycloak JWKS |
| Web  | Keycloak client, PDP HTTPS/WSS                                                          |

Neither unit receives sudo access, local root execution authority, OpenBao
access, or agent private keys. `escalate` is installed separately through
WORKSPACE-GUARD under SPEC-HITL-GUARD.

## 9. Verification

1. Protocol tests cover canonical signing, mTLS/signing-principal mismatch,
   malformed input, bounds, and decision binding.
2. SQLite tests cover first-valid-wins, cancellation, expiry, and terminal-state
   rejection.
3. PDP tests cover policy, scope, self-approval exclusion, connection binding,
   disconnect, ticket consumption, and rate limits.
4. Audit tests cover serialized append, synchronization, restart verification,
   and corruption refusal.
5. Web tests cover absent configuration, sessions, scopes, CSRF, projection,
   degraded state, and reconnecting feed updates.
6. End-to-end tests prove approved, denied, expired, cancelled, disconnected,
   replayed, and locally guard-rejected sudo flows.
7. Repository scans prove the operational architecture contains no credential,
   tier, CDP, OpenBao, executor, execution-plan, or grant path.

## 10. Implementation Status

| Item                              | Status    |
| --------------------------------- | --------- |
| Target architecture               | Specified |
| Obsolete scaffold type removal    | Pending   |
| PDP and SQLite                    | Pending   |
| Web authentication/live decisions | Pending   |
| GUARD `escalate` client           | Pending   |
