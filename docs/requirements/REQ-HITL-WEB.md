# REQ-HITL-WEB: Sudo Approval Interface

**Date:** 2026-08-16
**Status:** Draft
**Parent:** [REQ-HITL](REQ-HITL.md)
**Specification:** [SPEC-HITL-WEB](../specifications/SPEC-HITL-WEB.md)

## 1. Scope

The web application lets authorized humans view pending sudo requests and
approve or deny one exact request. It is a Next.js BFF and UI; it has no local
execution, credential, sudo, or GUARD client.

## 2. Authentication and Authorization

| ID     | Requirement                                                                                            |
| ------ | ------------------------------------------------------------------------------------------------------ |
| AUTH-1 | Human authentication MUST use Keycloak OIDC authorization code flow and server-held sessions.          |
| AUTH-2 | Every page and API route MUST validate the session. Middleware or proxy checks alone are insufficient. |
| AUTH-3 | Feed, detail, ticket, and decision operations MUST enforce Keycloak group scope.                       |
| AUTH-4 | The requester MUST NOT approve their own request.                                                      |
| AUTH-5 | Missing or invalid authentication/configuration MUST return failure and MUST NOT fabricate a session.  |

## 3. Pages and Evidence

| ID   | Requirement                                                                                                                   |
| ---- | ----------------------------------------------------------------------------------------------------------------------------- |
| UI-1 | `/feed` MUST list only pending requests within the approver's scopes.                                                         |
| UI-2 | `/feed/<id>` MUST display principal, host, exact escaped command display, cwd, justification, age, expiry, and request hash.  |
| UI-3 | Approve and deny controls MUST exist only on the detail page.                                                                 |
| UI-4 | Decision controls MUST disable during submission and whenever session, PDP, request state, or live connectivity is unhealthy. |
| UI-5 | Terminal or expired requests MUST not present active decision controls.                                                       |
| UI-6 | The UI MUST have no tier, credential, WebAuthn-step-up, executor, command-output, or grant display.                           |

## 4. BFF and Live Updates

| ID    | Requirement                                                                                                                      |
| ----- | -------------------------------------------------------------------------------------------------------------------------------- |
| BFF-1 | Browser HTTP traffic to PDP MUST pass through authenticated BFF routes.                                                          |
| BFF-2 | PDP responses MUST be schema-validated and projected to known browser fields.                                                    |
| BFF-3 | Decision mutation MUST require session authorization, session-bound expiring CSRF, allowed origin, request hash, and rate limit. |
| BFF-4 | The browser MAY connect directly to PDP WSS only with a single-use BFF-minted ticket valid for at most 30 seconds.               |
| BFF-5 | Live updates MUST trigger canonical refetch after reconnect; reconnect does not resume or authorize an agent request.            |
| BFF-6 | Sensitive responses MUST use `Cache-Control: no-store` and MUST NOT persist request data in browser storage.                     |

## 5. Failure and Accessibility

| ID     | Requirement                                                                                                                                    |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| FAIL-1 | PDP errors MUST remain errors; they MUST NOT become empty successful feeds or successful decisions.                                            |
| FAIL-2 | Missing live connectivity MUST show degraded state and disable decisions.                                                                      |
| A11Y-1 | Decision controls, status, errors, focus behavior, labels, and keyboard operation MUST meet the existing web-component accessibility contract. |
| A11Y-2 | Status MUST not rely on color alone and dynamic errors MUST be announced.                                                                      |

## 6. Acceptance

Tests MUST cover absent configuration, session validation, scope filtering,
self-approval rejection, CSRF expiry and mismatch, allowed origin, decision
disablement, ticket single-use, response projection, reconnect/refetch,
no-store headers, and keyboard/screen-reader behavior. Completed UI source MUST
contain no operational tier, credential, WebAuthn-step-up, executor, output, or
grant path.
