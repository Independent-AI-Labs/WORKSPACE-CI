# SPEC-HITL-WEB: Sudo Approval Interface

**Date:** 2026-08-16
**Status:** Target specification; implementation pending
**Requirements:** [REQ-HITL-WEB](../requirements/REQ-HITL-WEB.md)

## 1. Routes

```text
/feed
/feed/[id]
/api/hitl/feed
/api/hitl/requests/[id]
/api/hitl/decisions
/api/hitl/ws-ticket
```

Feed cards link to detail and contain no decision controls. Detail renders
request evidence and approve/deny controls for an eligible pending request.

## 2. Session

Auth.js uses Keycloak authorization code flow and an encrypted server-managed
session. Route handlers validate session and group scope independently of the
route proxy. There is one approval strength; no WebAuthn step-up route or tier
state exists.

## 3. Relay Client

The server-only PDP client requires a fixed configured base URL, disables cache,
rejects non-success status, and validates every response with Zod. Browser code
does not receive PDP access tokens or machine identity.

Browser types contain:

```text
id, principal, host, command_display, cwd, scope,
justification, request_hash, created_at, expires_at, state
```

No credential, tier, executor, grant, or output field is accepted.

## 4. Decision

Decision POST body contains:

```text
request_id
request_hash
decision: approved | denied
csrf
```

The BFF validates session, scope, requester exclusion, allowed origin,
session-bound CSRF and expiry, then forwards through the server PDP client.
Controls remain disabled until the mutation settles and canonical request state
is refetched.

## 5. Live Feed

The BFF obtains a single-use PDP ticket bound to session, scopes, origin, and a
30-second maximum expiry. The browser opens WSS with only that ticket, validates
bounded event shapes, and refetches canonical data after reconnect.

Live connectivity is presentation support only. It never carries agent approval
authority and cannot resume a disconnected `escalate` request.

## 6. Security Headers and Storage

Existing CSP, frame, content-type, referrer, and permissions-policy headers
remain. Dynamic responses use `no-store`. Request data is held only in page
state and is not written to local storage, session storage, IndexedDB, service
worker caches, or URLs.

## 7. Degraded State

Absent session or PDP configuration returns `503` or authentication failure.
PDP failure remains visible. Feed data is never fabricated. Decision controls
are absent or disabled when authorization or connectivity is uncertain.

## 8. Tests

Tests cover route authorization, scope filtering, feed/detail separation,
escaped evidence, CSRF binding/expiry, origin checks, decision request hash,
disabled controls, schema rejection, no-store, ticket behavior, reconnect
refetch, and accessibility. Obsolete tier components and fields are removed in
the implementation phase.

## 9. Implementation Status

| Item                                       | Status    |
| ------------------------------------------ | --------- |
| Target web contract                        | Specified |
| Obsolete tier cleanup                      | Pending   |
| Operational authentication/PDP integration | Pending   |
