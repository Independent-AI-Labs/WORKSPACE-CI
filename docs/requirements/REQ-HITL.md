# REQ-HITL: Human Approval for Sudo

**Date:** 2026-08-16
**Status:** Draft
**Type:** Requirements
**Specification:** [SPEC-HITL](../specifications/SPEC-HITL.md)

## 1. Purpose

HITL provides one function: a provisioned agent submits one exact
`escalate sudo <command> [args...]` request and waits for an authorized human to
approve or deny it. Approval returns on the same authenticated connection;
`escalate` then executes locally through the existing Bash and sudo guards.

Component contracts are defined by
[REQ-HITL-RELAY](REQ-HITL-RELAY.md),
[REQ-HITL-WEB](REQ-HITL-WEB.md), and
[REQ-HITL-GUARD](REQ-HITL-GUARD.md).

## 2. Scope

The system contains:

- the separate SUID-root `escalate` client;
- one policy decision point (PDP) service;
- one approver web application;
- Keycloak human authentication;
- SQLite request state;
- append-only hash-chained JSONL audit.

The system has no credential broker, OpenBao integration, approval tiers,
protected executor, execution plan, portable grant, local grant redemption,
password transport, or standing authorization.

The current repository is a fail-closed scaffold, not an operational approval
system.

## 3. Request Lifecycle

The complete state model is:

```text
pending -> approved | denied | expired | cancelled
```

All four destination states are terminal. `approved` means the exact bound
approval response was delivered to the waiting `escalate` process. Command
execution and command outcome remain local and are not PDP lifecycle states.

| ID     | Requirement                                                                                                                               |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| LIFE-1 | SQLite MUST be the durable source of truth for requests and decisions.                                                                    |
| LIFE-2 | Submission MUST create one `pending` request with an unpredictable request ID, server nonce, absolute expiry, and canonical request hash. |
| LIFE-3 | The first valid terminal transition MUST win atomically. Later decisions MUST be rejected.                                                |
| LIFE-4 | Pending requests MUST expire within a bounded interval after their absolute expiry.                                                       |
| LIFE-5 | Caller cancellation or connection loss MUST prevent approval delivery and transition the request to `cancelled` or `expired`.             |
| LIFE-6 | A disconnected invocation MUST start over with a fresh request. Requests MUST NOT resume across connections or process restarts.          |

## 4. Request Binding

| ID     | Requirement                                                                                                                                                                                                                             |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BIND-1 | Each request MUST bind the exact ordered UTF-8 sudo argv, canonical cwd path and device/inode identity, host identity, caller UID, primary GID, supplementary groups, provisioned agent identity, request ID, server nonce, and expiry. |
| BIND-2 | `escalate` MUST sign the canonical request envelope with its provisioned Ed25519 identity in addition to authenticating with mTLS.                                                                                                      |
| BIND-3 | The PDP MUST verify the mTLS identity, envelope signature, principal binding, request schema, command surface, nonce, expiry, and policy before presenting the request.                                                                 |
| BIND-4 | Human approval MUST bind the canonical request hash. Display text is evidence only and MUST NOT be authoritative.                                                                                                                       |
| BIND-5 | The positive response MUST be accepted only by the same `escalate` process on the same authenticated connection that submitted the request.                                                                                             |
| BIND-6 | A disconnect, malformed response, identity mismatch, request mismatch, denial, expiry, cancellation, or timeout MUST prevent local privilege transition.                                                                                |

## 5. Policy and Approvers

| ID    | Requirement                                                                                                                                                                            |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PDP-1 | Schema-validated policy MUST map the bound request to an allowed host, command scope, and approver group. Invalid or missing policy MUST make readiness fail.                          |
| PDP-2 | Policy MUST NOT duplicate Bash, sudo, binary, git, or filesystem guard rules. HITL decides whether a human permits the exact request; local guards remain independently authoritative. |
| PDP-3 | Human authentication MUST use Keycloak OIDC. Approver eligibility MUST derive from scoped Keycloak groups and be revalidated when deciding.                                            |
| PDP-4 | The attributable requester MUST NOT approve their own request.                                                                                                                         |
| PDP-5 | Justification text MUST be treated only as escaped evidence and MUST NOT affect authorization.                                                                                         |
| PDP-6 | Submission and decision rates, message size, argv count/length, request TTL, pending count, and connection duration MUST be bounded.                                                   |

## 6. Transport

| ID    | Requirement                                                                                                                                                         |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NET-1 | `escalate` MUST connect directly to the PDP with its provisioned mTLS client identity.                                                                              |
| NET-2 | Agent envelope signatures MUST use Ed25519 over canonical protocol bytes and be bound to the authenticated mTLS principal.                                          |
| NET-3 | Browser requests MUST use authenticated HTTPS through the Next.js BFF. Browser live updates MAY use a single-use PDP WebSocket ticket valid for at most 30 seconds. |
| NET-4 | WebSocket upgrade MUST validate ticket, expected origin, principal, scopes, and expiry. Cookies and access tokens MUST NOT appear in WebSocket URLs.                |
| NET-5 | TLS, signature, schema, origin, ticket, or identity failure MUST fail closed with uniform non-enumerating errors.                                                   |

## 7. Web Application

| ID    | Requirement                                                                                                                    |
| ----- | ------------------------------------------------------------------------------------------------------------------------------ |
| WEB-1 | Feed, detail, ticket, and decision routes MUST require a valid approver session and authorized scope.                          |
| WEB-2 | The browser MUST display principal, host, exact escaped command display, cwd, justification, age, expiry, and request hash.    |
| WEB-3 | Decision controls MUST be present only on request detail and disabled when session, PDP, or live state is unhealthy.           |
| WEB-4 | Mutations MUST require session validation, scope authorization, session-bound expiring CSRF verification, and rate limiting.   |
| WEB-5 | Sensitive responses MUST use `Cache-Control: no-store`; request data MUST NOT persist in browser storage.                      |
| WEB-6 | Missing authentication or PDP configuration MUST return failure and MUST NOT fabricate users, requests, tickets, or decisions. |

## 8. Audit

| ID      | Requirement                                                                                                                                   |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| AUDIT-1 | The PDP MUST append hash-chained JSONL records for admission, presentation, decision, cancellation, expiry, response delivery, and rejection. |
| AUDIT-2 | Each record MUST correlate request ID, principal, approver, policy version, request hash, timestamps, prior record hash, and outcome.         |
| AUDIT-3 | Audit MUST exclude mTLS private keys, signing keys, complete authentication material, and any response capable of authorizing execution.      |
| AUDIT-4 | Audit append and synchronization MUST complete before acknowledging the associated state change.                                              |
| AUDIT-5 | Audit failure MUST stop submissions and decisions until the normal audit path is restored.                                                    |

## 9. Local Execution Boundary

| ID      | Requirement                                                                                                          |
| ------- | -------------------------------------------------------------------------------------------------------------------- |
| LOCAL-1 | The PDP and web application MUST NOT execute commands, contact sudo, or receive local root authority.                |
| LOCAL-2 | Only `escalate` MAY perform the approved local privilege transition, exactly as defined by REQ-HITL-GUARD.           |
| LOCAL-3 | Approval MUST NOT bypass or modify any existing local guard decision.                                                |
| LOCAL-4 | There MUST be no approved shell, reusable grant, cached approval, reconnect resume, or alternate authorization path. |
| LOCAL-5 | Command stdin, stdout, stderr, signals, and exit status remain local and MUST NOT be proxied or stored by HITL.      |

## 10. Reliability and Readiness

| ID    | Requirement                                                                                                                                     |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-1 | Untrusted protocol parsing MUST avoid panics and unsafe code.                                                                                   |
| NFR-2 | PDP readiness MUST require policy, SQLite, audit, Keycloak verification material, and server identities.                                        |
| NFR-3 | Loss of any required dependency MUST halt the affected operation without alternate authorization.                                               |
| NFR-4 | Pending waits, WebSocket connections, messages, queue depth, TTL, and rates MUST be finite.                                                     |
| NFR-5 | Rust fmt, clippy with denied warnings, tests, web lint, web type-check, web tests, dependency validation, and vulnerability scanning MUST pass. |

## 11. Acceptance Gate

Operational approval requires:

1. An end-to-end approved request returns one bound live response and executes
   only through `escalate`, guarded Bash, and guarded sudo.
2. Denial, expiry, cancellation, timeout, disconnect, replay, forged signature,
   changed request data, wrong scope, self-approval, and cross-origin attempts
   all fail closed.
3. Concurrent decisions produce exactly one terminal state.
4. Existing Bash and sudo guard denials still block an approved request.
5. Missing PDP, policy, SQLite, audit, Keycloak, or identity material keeps the
   relevant service unready and prevents approval.
6. No credential broker, OpenBao route, protected executor, grant token,
   execution plan, approval tier, or command-output store exists.
7. Every component requirement and verification matrix passes.
