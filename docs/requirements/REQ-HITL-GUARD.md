# REQ-HITL-GUARD: WORKSPACE-GUARD HITL Elevation Integration Contract

**Date:** 2026-07-25
**Status:** Draft
**Type:** Requirements
**Parent:** [REQ-HITL](REQ-HITL.md)
**Specification:** [SPEC-HITL-GUARD](../specifications/SPEC-HITL-GUARD.md)

> Requirements for the reference agent client of the HITL system: a
> capability-locked `bash` wrapper surface in WORKSPACE-GUARD that
> converts policy-approved sudo/root-gated commands into HITL
> elevation requests instead of hard drops, plus the elevation-token
> redemption contract any GUARD wrapper uses to act on an approval.
> This document owns the cross-repo CONTRACT; the implementation lands
> in the WORKSPACE-GUARD repository under its own REQ/SPEC pair and
> deployment machinery. Every behaviour here preserves GUARD's
> deny-list, fail-closed posture: HITL elevation is additive, opt-in
> per policy rule, and never weakens an existing block.

---

**Cross-references:**

- [REQ-HITL](REQ-HITL.md): parent system requirements (lifecycle, grants, agent auth)
- [SPEC-HITL-GUARD](../specifications/SPEC-HITL-GUARD.md): companion specification (hook points, token redemption, config)
- [REQ-HITL-RELAY](REQ-HITL-RELAY.md): relay protocol this client speaks
- [SPEC-HITL-RELAY](../specifications/SPEC-HITL-RELAY.md): envelope schema, grant format (§5.1)
- WORKSPACE-GUARD `README.md`: programs, execution classes, exit-code contract
- WORKSPACE-GUARD `docs/specifications/SPEC-GIT-GUARD.md` / `SPEC-BINARY-LOCK.md`: wrapper architecture this contract extends
- WORKSPACE-GUARD `src/block.rs`, `src/binary_guard.rs`, `src/binary_policy_types.rs`, `src/log.rs`: current decision points (implementation repo)

---

## 1. Purpose & Scope

### 1.1 Purpose

Today GUARD hard-blocks non-root invocation of sudo-gated operations
with a "run with sudo" hint, and fleet users have no sudo at all. For
operations that are legitimate but gated, this creates either dangerous
workarounds or dead ends. The HITL integration gives GUARD-wrapped
surfaces a third verdict beside PASS and BLOCK: ELEVATE - request
human approval through the relay, and proceed only with a valid,
locally verifiable elevation token. Credentials are never involved at
this layer: the wrapper redeems *approval*, not secrets (Tier 1); any
future secret need goes through the full Tier 2 credential flow as a
separate request class.

### 1.2 Scope

**This document OWNS the requirements for:**

- The `bash` wrapper surface: capability-locked bash with automated
  elevation through HITL for root/sudo-gated command classes.
- The ELEVATE verdict semantics and its insertion into existing GUARD
  decision points without weakening current policy.
- Elevation-token redemption: verification, binding, single-use,
  fail-closed handling on the consuming host.
- The GUARD-side agent client contract: AppRole provisioning, relay
  connectivity, timeouts, offline behaviour.
- GUARD-side audit of elevation requests, grants, and executions.

**This document DOES NOT:**

- Own relay/web internals (REQ-HITL-RELAY / REQ-HITL-WEB).
- Own credential-fetch (Tier 2) consumer flows beyond noting they use
  the same agent client channel.
- Own GUARD's deployment/provisioning machinery (GUARD repo docs).
- Permit any interactive prompt on the host (GUARD surfaces remain
  non-interactive; approval happens in the web UI, out of band).

### 1.3 Terminology

Inherits REQ-HITL §1.3 and REQ-HITL-RELAY §1.3. Additionally:

| Term | Definition |
|------|------------|
| ELEVATE verdict | A GUARD policy outcome that suspends execution pending HITL approval, distinct from PASS/BLOCK. |
| Redemption | Local verification and consumption of an elevation token by the wrapper immediately before the gated exec. |
| Grant state file | Root-owned, symlink-verified file through which a received elevation token is handed to the wrapper context (existing GUARD trust pattern). |

---

## 2. Functional Requirements

### FR-1: Bash Wrapper Surface

| ID | Requirement |
|----|-------------|
| FR-1.1 | A capability-locked `bash` wrapper MUST be added to GUARD's wrapper family, following the existing binary-guard model (policy selected by invocation, compiled-in policy, root-locked enforcement files). |
| FR-1.2 | The wrapper MUST classify invocations into the existing verdicts plus ELEVATE: plain commands pass; deny-listed commands block (unchanged, even for root); configured sudo/root-gated command classes route to HITL elevation instead of direct drop. |
| FR-1.3 | Elevation-eligible command classes MUST be an explicit opt-in policy list (YAML, schema-validated, compile-time baked per GUARD's build.rs codegen pattern). A command class not on the list MUST keep its current behaviour exactly. |
| FR-1.4 | The wrapper MUST remain non-interactive: no tty prompts. Pending elevation surfaces as a structured status line (request ID, state) and the wrapper MUST exit non-zero with a dedicated exit code while pending/denied/expired, per GUARD's exit-code contract (0 pass, 1 policy block, 2 infrastructure). A pending request MUST NOT block the agent's shell indefinitely; wait-with-timeout semantics are defined in the SPEC. |

### FR-2: Elevation Flow

| ID | Requirement |
|----|-------------|
| FR-2.1 | On ELEVATE, the wrapper (or its helper agent client) MUST submit a REQ-HITL-RELAY v1 `exec.elevation` request: display command (redacted per relay rules), argv hash, host identity, agent identity, justification if supplied, TTL. |
| FR-2.2 | Approval MUST produce a relay-signed elevation token (SPEC-HITL-RELAY §5.1); denial/expiry/unreachable relay MUST resolve to local denial (fail-closed, REQ-HITL FR-5.3). |
| FR-2.3 | Token hand-off to the exec context MUST use the root-owned state-file pattern: root-owned directory, symlink-verified regular file, fail-closed when absent/unreadable/mismatched (the root-gated policy-file precedent). |
| FR-2.4 | Redemption MUST verify, locally and offline against the pre-provisioned relay grant public key: signature, `exp` (≤ 5 min from issue), `request_hash` equality with the pending request, `cnf` thumbprint match to the requesting session key, and `jti` not previously redeemed. Any failure = denial. |
| FR-2.5 | A redeemed token MUST authorise exactly one exec of the exact hashed argv; post-exec the token MUST be invalidated locally and redemption MUST be reported to the relay (best-effort notification; local invalidation is authoritative). |
| FR-2.6 | Token verification and argv hashing MUST run in the wrapper's privilege context with the closed-environment discipline of existing GUARD exec paths; any new env/fd plumbing MUST be explicitly allow-listed. |

### FR-3: Agent Client Contract

| ID | Requirement |
|----|-------------|
| FR-3.1 | The GUARD host's agent client MUST authenticate to the relay via OpenBao AppRole per REQ-HITL FR-5.1 (per-machine role, CIDR-bound, wrapped SecretID at provision). |
| FR-3.2 | Relay communication MUST use the WS ticket + wss flow with Origin/ticket checks (REQ-HITL-RELAY FR-1.2); TLS with pinned or system-root verification - no `danger_accept_invalid_certs` outside test builds. |
| FR-3.3 | Relay unreachable, protocol error, or any timeout MUST produce local denial with a distinct log signature; NO request may be treated as approved by default, by cache, or by retry heuristic. |
| FR-3.4 | The agent session key (sender constraint) MUST be generated per boot or per session, held only in the agent client process memory, and MUST NOT be written to disk. |
| FR-3.5 | Background/non-interactive contexts MUST be supported by design (approval is out of band), but the existing foreground-only rules for sensitive operations (e.g. git push) remain in force - HITL approval does NOT override a GUARD interactivity rule. |

### FR-4: Audit & Observability

| ID | Requirement |
|----|-------------|
| FR-4.1 | Every elevation request, grant receipt, redemption, denial, and expiry MUST be logged through GUARD's existing audit channels (`~/.workspace-guard.log` / `/var/log/workspace-guard.log` / `/dev/tty` block notices), carrying request ID and outcome - never token bytes or argv content beyond the redacted display form. |
| FR-4.2 | Redemption reporting MUST include the exec outcome (exit code class) so the relay-side audit chain closes with what actually happened (REQ-HITL FR-4.4). |
| FR-4.3 | Drift or tampering indicators (unexpected state file, wrong ownership, public-key mismatch) MUST be RED-level audit findings consistent with GUARD's audit tiers. |

---

## 3. Non-Functional Requirements

### NFR-1: Security

| ID | Requirement |
|----|-------------|
| NFR-1.1 | HITL elevation MUST NOT weaken any existing GUARD verdict: blocked stays blocked; sudo-gated stays gated unless its class opts into elevation; partial-rule root gates keep their semantics unless explicitly migrated. |
| NFR-1.2 | The elevation path MUST NOT introduce SUID/new file capabilities beyond the wrapper family's existing model; the wrapper runs under the caller's privileges and the approval only relaxes *policy*, never *Unix identity* - elevated exec still uses the operator-approved mechanism defined per command class in the SPEC. |
| NFR-1.3 | The grant public key and AppRole bootstrap material MUST be root-owned, root-provisioned, and symlink-verified at every read. |
| NFR-1.4 | Token parsing/verification MUST be implemented in Rust with the same care class as existing guard code: no panics on adversarial input, constant-time comparisons for hashes/thumbprints, `#![forbid(unsafe_code)]` in the verification module. |

### NFR-2: Reliability

| ID | Requirement |
|----|-------------|
| NFR-2.1 | Elevation wait MUST be bounded (default ≤ request TTL, hard cap configurable) and MUST NOT hold locks (e.g. `.git` lock discipline) while waiting: lock acquisition happens after approval, immediately before exec, following existing pre-exec lock + post-exec relock discipline. |
| NFR-2.2 | Relay reconnection MUST use bounded backoff; a wrapper invocation never waits longer than its TTL budget across reconnects. |
| NFR-2.3 | The agent client MUST tolerate relay restarts mid-request via resume semantics (REQ-HITL-RELAY NFR-2.3). |

### NFR-3: Compatibility

| ID | Requirement |
|----|-------------|
| NFR-3.1 | Hosts without HITL provisioning (no AppRole material, no grant pubkey) MUST behave exactly as today: no HITL code path exists on such hosts, so ELEVATE-eligible classes keep their current gate behaviour (block/hint) by absence of the feature, not by any alternate branch. The feature is absent, not broken. |
| NFR-3.2 | Policy schema changes MUST be additive; existing `guard_subcommands.yaml` / `binary-policy-rules.yaml` entries remain valid without modification. |

---

## 4. Constraints

| ID | Constraint | Source |
|----|------------|--------|
| C-1 | Fail-closed everywhere; unreachable relay = deny. | REQ-HITL C-5, GUARD convention |
| C-2 | No interactive prompts on the host. | GUARD design; FR-1.4 |
| C-3 | Policy is compile-time baked YAML per GUARD build.rs codegen. | GUARD architecture |
| C-4 | Elevation tokens are the only grant type consumed at this layer; credentials require the separate Tier 2 flow. | REQ-HITL FR-3.1 |
| C-5 | Implementation lives in WORKSPACE-GUARD; this document is the contract of record. | Cross-repo split |
| C-6 | Exit codes follow the GUARD contract; a new code for elevation-pending/denied requires GUARD repo sign-off. | GUARD README exit codes |

---

## 5. Assumptions

| ID | Assumption |
|----|------------|
| A-1 | Dev machines have outbound HTTPS/WSS to the relay and no route to OpenBao (REQ-HITL A-4). |
| A-2 | Provisioning (GUARD's install machinery) can deliver AppRole bootstrap material and the relay grant public key as root-owned files. |
| A-3 | An approver watches the feed within typical request TTLs during working hours; otherwise requests expire safely. |
| A-4 | The wrapper exec context can verify Ed25519 (Rust, matching the relay's grant key). |

---

## 6. Open Questions

1. **Elevation exec mechanism per class.** Options: (a) wrapper drops the gate and execs under caller (only meaningful where the gate was policy-only), (b) helper with narrowly-scoped file capability per class, (c) systemd-run transient unit. Per-class decision recorded in the SPEC's policy table; start with (a) for policy-only gates.
2. **Wait UX.** Synchronous wait-with-timeout (v1) vs. submit-and-poll (`hitl status <id>`) - v1 is synchronous; async CLI is a GUARD-side follow-up.
3. **Multi-command sessions.** No standing "approved shell" - each gated command is its own request. A session-grant concept is explicitly rejected for v1; revisit with data.
4. **Which sudo-gated git subcommands opt in first.** Candidates: `submodule`, `checkout/switch/restore` non-destructive variants. Recorded in SPEC §5 policy table.

---

## 7. Verification Matrix

| # | Test | Maps to |
|---|------|---------|
| V1 | Opted-in gated command: wrapper submits request, approver approves, token redeems, exact argv execs once; second exec attempt denied. | FR-2.1-2.5 |
| V2 | Same command, approver denies: wrapper exits with elevation-denied code; audit entries on both sides correlate by request ID. | FR-2.2, FR-4.1 |
| V3 | Relay unreachable: local denial, distinct log signature, exit code per contract; no hang beyond timeout. | FR-3.3, NFR-2.1 |
| V4 | Forged token (wrong key / tampered claims / expired / argv-hash mismatch / jti reuse): each variant denied locally without relay contact. | FR-2.4 |
| V5 | State-file attacks: symlink substitution, wrong ownership, missing file: fail-closed denial + RED audit. | FR-2.3, FR-4.3 |
| V6 | Non-opted-in gated command: behaviour byte-identical to pre-HITL GUARD. | FR-1.3, NFR-1.1 |
| V7 | Host without HITL provisioning: behaviour byte-identical to pre-HITL GUARD, single log note; no HITL code path executes. | NFR-3.1 |
| V8 | Lock discipline: no `.git`/locked-path locks held during approval wait; lock-verify-exec-relock sequence intact. | NFR-2.1 |
| V9 | Timeout: no decision within TTL → wrapper exits elevation-expired; relay shows `expired`; audit closed both sides. | FR-2.2, NFR-2.1 |
| V10 | Token material scan: no grant bytes in logs, state file contains hash-bound reference only per SPEC design, session key never on disk. | FR-3.4, FR-4.1, NFR-1.4 |

---

## 8. Implementation Status

| Item | Status | Evidence |
|------|--------|----------|
| REQ-HITL-GUARD (this document) | Draft | - |
| GUARD-side REQ/SPEC pair | Not started | lands in WORKSPACE-GUARD repo |
| Bash wrapper surface | Not started | - |
| Elevation redemption | Not started | - |
