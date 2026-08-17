# REQ-HITL-RELAY: Sudo Approval PDP

**Date:** 2026-08-16
**Status:** Draft
**Parent:** [REQ-HITL](REQ-HITL.md)
**Specification:** [SPEC-HITL-RELAY](../specifications/SPEC-HITL-RELAY.md)

## 1. Scope

The relay is one policy decision point (PDP) process. It accepts signed
`escalate sudo ...` requests, presents them to authorized approvers, persists one
terminal human decision, and returns an approved response only on the original
authenticated agent connection.

It does not broker credentials, execute commands, contact sudo, issue portable
grants, or supervise local execution.

## 2. Agent Protocol

| ID      | Requirement                                                                                                                                                    |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AGENT-1 | Agent connections MUST use TLS with a provisioned client certificate.                                                                                          |
| AGENT-2 | The PDP MUST issue a fresh unpredictable server nonce before accepting a request.                                                                              |
| AGENT-3 | Every request MUST carry an Ed25519 signature over canonical protocol bytes. The signing identity and mTLS identity MUST map to the same principal.            |
| AGENT-4 | The only accepted operation MUST represent `escalate sudo <command> [args...]` with exact ordered UTF-8 argv and the complete REQ-HITL binding fields.         |
| AGENT-5 | Protocol version, message type, field lengths, argv count/length, TTL, identity, signature, nonce, host, cwd, and policy MUST be validated before persistence. |
| AGENT-6 | Unknown fields, unknown message types, invalid UTF-8, malformed signatures, stale nonces, and unsupported versions MUST be rejected.                           |
| AGENT-7 | Approval MUST be returned only on the same healthy connection and only once. Disconnect ends the request authority; reconnect starts a new request.            |
| AGENT-8 | Errors MUST use stable bounded shapes and MUST NOT reveal whether another principal, request, or scope exists.                                                 |

## 3. Approver API

| ID    | Requirement                                                                                                           |
| ----- | --------------------------------------------------------------------------------------------------------------------- |
| WEB-1 | HTTPS feed, detail, ticket, and decision endpoints MUST require a valid Keycloak identity and authorized group scope. |
| WEB-2 | Feed and detail queries MUST return only requests within the approver's scopes.                                       |
| WEB-3 | Decision submission MUST bind request ID, request hash, decision, approver identity, and current pending state.       |
| WEB-4 | The requester MUST NOT approve their own request.                                                                     |
| WEB-5 | A single-use WebSocket ticket MUST bind approver, scopes, expected origin, and expiry no later than 30 seconds.       |
| WEB-6 | Ticket consumption MUST be atomic. Access tokens and cookies MUST NOT appear in WebSocket URLs.                       |

## 4. State and Policy

| ID       | Requirement                                                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| STATE-1  | SQLite MUST store canonical request data, request hash, identity, policy version, scope, state, timestamps, and terminal decision evidence. |
| STATE-2  | State MUST be limited to `pending`, `approved`, `denied`, `expired`, and `cancelled`.                                                       |
| STATE-3  | An immediate transaction MUST enforce `pending` to one terminal state with first-valid-wins semantics.                                      |
| STATE-4  | The sweeper MUST expire elapsed pending requests within a configured finite interval.                                                       |
| STATE-5  | Connection loss or authenticated cancellation MUST prevent approval delivery and close the request.                                         |
| POLICY-1 | Schema-validated policy MUST map host and exact sudo request scope to an approver group.                                                    |
| POLICY-2 | Policy MUST NOT duplicate local GUARD command rules or create typed executor operations.                                                    |
| POLICY-3 | Invalid policy MUST make readiness fail.                                                                                                    |

## 5. Audit

| ID      | Requirement                                                                                                             |
| ------- | ----------------------------------------------------------------------------------------------------------------------- |
| AUDIT-1 | The PDP MUST be the sole writer of one append-only hash-chained JSONL stream.                                           |
| AUDIT-2 | Admission, rejection, presentation, decision, expiry, cancellation, disconnect, and response delivery MUST be recorded. |
| AUDIT-3 | Audit append and synchronization MUST complete before state acknowledgement.                                            |
| AUDIT-4 | Audit corruption or write failure MUST make readiness fail and stop submissions and decisions.                          |
| AUDIT-5 | Audit MUST exclude private keys and reusable authorization material.                                                    |

## 6. Limits and Readiness

| ID      | Requirement                                                                                                                                             |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LIMIT-1 | Connection count, pending count, message bytes, argv fields, request TTL, decision rate, and wait duration MUST have hard limits.                       |
| LIMIT-2 | Oversized input MUST be rejected before full allocation or persistence.                                                                                 |
| READY-1 | `/healthz` reports process liveness only.                                                                                                               |
| READY-2 | `/readyz` is successful only when policy, SQLite, audit, TLS identity, agent trust, signing-key mapping, and Keycloak verification material are usable. |
| READY-3 | No degraded mode may approve a request.                                                                                                                 |

## 7. Excluded Architecture

The PDP contract excludes:

- credential request classes;
- approval tiers and WebAuthn step-up;
- CDP, OpenBao, and protected executor connections;
- execution plans, grant delivery, token redemption, and replay databases;
- command output capture or storage;
- reconnect/resume authority.

## 8. Acceptance

Tests MUST prove mTLS and Ed25519 identity binding, exact request hashing,
first-valid-wins decisions, scope isolation, self-approval rejection, ticket
single-use, cancellation, expiry, disconnect failure, audit durability, bounded
input, and fail-closed readiness. Source and protocol scans MUST prove excluded
architecture is absent from the completed implementation.
