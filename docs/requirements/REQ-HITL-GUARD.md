# REQ-HITL-GUARD: WORKSPACE-GUARD HITL Elevation Contract

**Date:** 2026-07-25
**Status:** Draft
**Type:** Requirements
**Parent:** [REQ-HITL](REQ-HITL.md)
**Specification:** [SPEC-HITL-GUARD](../specifications/SPEC-HITL-GUARD.md)

## 1. Purpose

`escalate sudo <command> [args...]` gives a provisioned agent a synchronous
human-approval path for one exact sudo invocation. The separate `escalate`
binary owns HITL communication and the privilege transition. Existing Bash and
sudo guards remain independent enforcement layers and retain their current
policies.

## 2. Responsibility Boundaries

| Component  | Responsibility                                                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `escalate` | Validate the caller and request, submit it, wait for one decision, and execute the approved invocation through the existing guards. |
| Bash guard | Apply its existing command-text checks and execute allowed Bash input. It MUST NOT submit, approve, resume, or store HITL requests. |
| sudo guard | Apply its existing root and argument checks. It MUST NOT contact HITL or consume approval artifacts.                                |
| PDP        | Authenticate `escalate`, validate and scope the request, obtain the human decision, and return the result on the live connection.   |

No HITL verdict, network client, approval state, grant redemption, command-class
policy, or executor mechanism may be added to either existing guard.

## 3. Functional Requirements

### FR-1: Command Surface

| ID     | Requirement                                                                                                                                                                                                                                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FR-1.1 | The only agent command surface MUST be `escalate sudo <command> [args...]`. `escalate` MUST reject a missing command, any first argument other than the literal `sudo`, NUL-containing input, and any argument that is not valid UTF-8.                                                          |
| FR-1.2 | `escalate` MUST be a root-owned SUID executable available only to members of a dedicated root-managed provisioned-agent group. It MUST validate the caller's real UID, primary GID, supplementary groups, and group eligibility before loading machine identity or opening a network connection. |
| FR-1.3 | Direct non-root `sudo` MUST retain its existing denial and add guidance to invoke the equivalent `escalate sudo ...` command. It MUST NOT redirect automatically.                                                                                                                                |
| FR-1.4 | `escalate` MUST preserve the caller's stdin, stdout, stderr, signal behavior, and environment through execution, subject only to the existing Bash and sudo guard sanitization.                                                                                                                  |

### FR-2: Request Binding

| ID     | Requirement                                                                                                                                                                                                                                     |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-2.1 | The request MUST bind the exact ordered UTF-8 argv, canonical working-directory path and device/inode identity, host identity, caller UID, primary GID, supplementary groups, provisioned agent identity, request ID, server nonce, and expiry. |
| FR-2.2 | The approver display MUST be derived from the bound argv but MUST NOT be authoritative. Approval MUST apply only to the bound request values.                                                                                                   |
| FR-2.3 | The PDP MUST derive approver scope from policy. `escalate` MUST NOT provide or override approver scope.                                                                                                                                         |
| FR-2.4 | Immediately before execution, `escalate` MUST verify that the caller identity, open working-directory identity, request values, live connection, server nonce, and expiry still match the approved request. Any mismatch MUST fail closed.      |

### FR-3: Approval Session

| ID     | Requirement                                                                                                                                                                                               |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-3.1 | `escalate` MUST authenticate directly to the PDP with a root-provisioned mTLS identity and sign the canonical request envelope with a root-provisioned Ed25519 identity.                                  |
| FR-3.2 | The PDP MUST require the mTLS and Ed25519 identities to map to the same provisioned agent principal.                                                                                                      |
| FR-3.3 | Approval MUST be a single-use response on the same authenticated connection that submitted the request. The response MUST bind the complete request hash, server nonce, connection, decision, and expiry. |
| FR-3.4 | A disconnect, reconnect requirement, malformed response, denial, expiry, verification failure, or timeout MUST prevent execution. A new invocation MUST create a new request and require a new approval.  |
| FR-3.5 | Waiting MUST be synchronous and bounded by the earlier of request expiry and the configured wait limit. Interruption MUST send cancellation on the live connection, close it, and exit without execution. |
| FR-3.6 | HITL non-execution outcomes MUST exit with status `5`. Once execution begins, the invoked command's normal process status MUST reach the caller.                                                          |

### FR-4: Privilege Handling

| ID     | Requirement                                                                                                                                                                                                                                |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FR-4.1 | At startup, `escalate` MUST securely open and validate its root-owned mTLS files and the current working directory, make the process non-dumpable, and then drop effective privilege to the caller before parsing network data or waiting. |
| FR-4.2 | The mTLS files MUST be regular, root-owned, non-group/world-writable, opened without following symlinks, and never exposed through argv, environment, inherited file descriptors, logs, or child processes.                                |
| FR-4.3 | Only after validating the bound live approval MAY `escalate` set its real, effective, and saved UID to root. It MUST then immediately execute the guarded Bash path and MUST NOT return to caller privilege.                               |

### FR-5: Guarded Execution

| ID     | Requirement                                                                                                                                                                                                                                                                                   |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-5.1 | `escalate` MUST deterministically shell-quote every validated argv element into one Bash command string. Quoting MUST preserve each argument exactly, including empty strings, whitespace, quotes, substitutions, separators, and leading dashes, without interpretation during construction. |
| FR-5.2 | `escalate` MUST invoke the normal guarded `/bin/bash -c` path with the complete quoted `sudo` command as command text. It MUST NOT invoke `bash.real`, `sudo.real`, or any diverted real binary directly.                                                                                     |
| FR-5.3 | The existing Bash guard MUST inspect the complete generated command using its existing policy. If allowed, Bash invokes the normal guarded sudo path, whose existing root and argument checks also apply.                                                                                     |
| FR-5.4 | Approval MUST NOT bypass or modify any existing Bash, sudo, binary, git, or filesystem guard decision. No duplicate copy of guard policy may exist in `escalate` or the PDP.                                                                                                                  |

### FR-6: Audit

| ID     | Requirement                                                                                                                                                                        |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-6.1 | Request submission, decision, cancellation, verification failure, expiry, privilege transition, and execution handoff MUST be correlated by request ID in the central audit chain. |
| FR-6.2 | Logs MUST NOT contain mTLS private keys, complete authentication material, or an approval response capable of authorizing execution.                                               |
| FR-6.3 | After handoff, normal command output MUST pass directly through existing file descriptors. `escalate` MUST NOT proxy, capture, redact, store, or reinterpret command output.       |

## 4. Constraints

| ID  | Constraint                                                                                                                                                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C-1 | No root broker, protected executor, sudo plugin, askpass helper, password transport, local grant file, redemption database, or asynchronous resume path is part of this contract. |
| C-2 | Existing GUARD policy remains authoritative and unchanged except for direct-sudo guidance text.                                                                                   |
| C-3 | Relay or PDP unavailability always fails closed.                                                                                                                                  |
| C-4 | Implementation belongs in WORKSPACE-GUARD; these documents define the cross-repository contract.                                                                                  |

## 5. Verification

| ID  | Test                                                                                                                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V-1 | An approved `escalate sudo ...` request executes once through guarded Bash and guarded sudo with the exact original argv.                                         |
| V-2 | Shell metacharacters, quotes, whitespace, empty arguments, and leading dashes round-trip exactly through deterministic quoting and cannot add or remove commands. |
| V-3 | Existing Bash or sudo guard rejection still prevents execution after HITL approval.                                                                               |
| V-4 | Denial, timeout, disconnect, cancellation, stale nonce, changed cwd identity, changed caller identity, or altered argv exits `5` without regaining root.          |
| V-5 | An ineligible caller is rejected before machine-identity access or network activity.                                                                              |
| V-6 | Direct non-root sudo remains denied and prints `escalate sudo ...` guidance.                                                                                      |
| V-7 | Private-key material is absent from argv, environment, inherited descriptors, logs, core dumps, and child processes.                                              |

## 6. Implementation Status

| Item                      | Status      |
| ------------------------- | ----------- |
| Cross-repository contract | Specified   |
| `escalate` implementation | Not started |
| GUARD guidance update     | Not started |
