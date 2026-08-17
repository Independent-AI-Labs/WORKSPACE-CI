# SPEC-HITL-RELAY: Sudo Approval PDP

**Date:** 2026-08-16
**Status:** Target specification; implementation pending
**Requirements:** [REQ-HITL-RELAY](../requirements/REQ-HITL-RELAY.md)

## 1. Process

One Rust service owns:

- agent mTLS connections;
- signed request validation;
- approver HTTPS and WebSocket endpoints;
- policy evaluation;
- SQLite request state;
- serialized hash-chained JSONL audit.

No private backend IPC or additional security process exists.

## 2. Agent Connection

1. Complete mTLS and map the certificate to one provisioned agent principal.
2. Generate a 256-bit server nonce and bind it to the connection.
3. Accept one bounded canonical `sudo.request` envelope.
4. Verify Ed25519 signature and require its key mapping to equal the mTLS
   principal.
5. Validate exact UTF-8 argv, cwd/caller identity, host, expiry, and policy.
6. Persist `pending`, append audit, and expose the request to scoped approvers.
7. Wait on that connection until decision, cancellation, disconnect, or expiry.
8. Deliver an approved response only if the connection and all bindings still
   match. Close after one terminal response.

The server does not send a token or execution instruction that another process
can redeem.

## 3. Canonical Shapes

Request payload:

```text
request_id
argv: string[]
cwd: { path, device, inode }
caller: { uid, gid, groups, agent_id }
host_id
justification
server_nonce
expires_at
```

Decision response:

```text
request_id
request_hash
server_nonce
decision: approved | denied | expired | cancelled
decided_at
expires_at
```

Canonical serialization permits integer numeric values only. Duplicate keys,
unknown fields, invalid UTF-8, noncanonical forms, and trailing bytes reject the
message.

## 4. SQLite

One `requests` table stores canonical request bytes, request hash, identity,
scope, policy version, timestamps, state, and decision evidence. Constraints
limit state names and make request IDs unique.

Terminal transition uses one immediate transaction equivalent to:

```sql
UPDATE requests
SET state = ?, approver_id = ?, decided_at = ?
WHERE request_id = ? AND state = 'pending' AND expires_at > ?;
```

Exactly one changed row means success. Zero means stale, expired, missing, or
already decided.

No execution status, command output, credential field, tier, grant, or resume
record is stored.

## 5. Policy

Policy inputs are authenticated agent, host, argv, cwd scope, and approver
group. The output is either reject or one approver scope. Policy does not parse
shell semantics beyond validating the `sudo` command surface and does not copy
GUARD rules.

## 6. Approver Endpoints

```text
GET  /api/v1/feed
GET  /api/v1/requests/{id}
POST /api/v1/decisions
POST /api/v1/ws-ticket
GET  /api/v1/live?ticket=...
GET  /healthz
GET  /readyz
GET  /api/v1/meta/version
```

Keycloak JWT validation checks algorithm, signature, issuer, audience, expiry,
and groups. Feed/detail scope filtering occurs in the query and again before
serialization. Decision mutation revalidates scope and requester exclusion.

WebSocket tickets are random, hashed at rest, origin-bound, single-use, and
expire within 30 seconds.

## 7. Audit

The PDP owns one append descriptor and writer lock. For each accepted state
change it builds the next record, appends one line, calls the configured
synchronization operation, and only then acknowledges the transaction.

Startup streams and verifies sequence and hash continuity before readiness.
There is no separate audit service or socket.

## 8. Failure Behavior

| Failure                           | Behavior                                                  |
| --------------------------------- | --------------------------------------------------------- |
| Agent disconnect                  | Cancel pending request; deliver nothing.                  |
| Reconnect                         | New connection, nonce, request ID, and approval required. |
| SQLite unavailable                | Reject submissions/decisions; readiness false.            |
| Audit unavailable                 | Reject submissions/decisions; readiness false.            |
| Keycloak verification unavailable | Reject approver operations; readiness false.              |
| Policy invalid                    | Start unready.                                            |
| Oversized or malformed input      | Bounded protocol error, then close.                       |

## 9. Tests

Tests cover canonical messages, malformed input, mTLS/signing mismatch, nonce
reuse, connection binding, exact argv hashes, state races, expiry, cancellation,
scope filtering, self-approval, ticket replay, audit corruption, and dependency
loss. Completed source must contain no operational CDP, OpenBao, executor,
credential, tier, grant, or execution-output path.

## 10. Implementation Status

| Item                       | Status    |
| -------------------------- | --------- |
| Target PDP                 | Specified |
| Obsolete scaffold cleanup  | Pending   |
| Operational implementation | Pending   |
