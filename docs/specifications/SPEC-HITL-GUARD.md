# SPEC-HITL-GUARD: WORKSPACE-GUARD HITL Elevation Integration Contract

**Date:** 2026-07-25
**Status:** Draft
**Type:** Specification
**Requirements:** [REQ-HITL-GUARD](../requirements/REQ-HITL-GUARD.md)
**Parent:** [SPEC-HITL](SPEC-HITL.md)

> Contract-level implementation detail for the GUARD HITL elevation
> integration: exact hook points in the existing guard code, the new
> bash wrapper surface, the ELEVATE verdict data flow, elevation-token
> redemption pseudocode, policy schema extensions, and the exit-code
> allocation. File paths below refer to the WORKSPACE-GUARD repository;
> the implementation itself lands there under its own REQ/SPEC pair
> derived from this contract.

---

**Cross-references:**

- [REQ-HITL-GUARD](../requirements/REQ-HITL-GUARD.md): owning requirements contract
- [SPEC-HITL](SPEC-HITL.md): system flows §3.1, threat map §5
- [SPEC-HITL-RELAY](SPEC-HITL-RELAY.md): protocol v1 (§2), elevation token format (§5.1)
- WORKSPACE-GUARD `src/block.rs`, `src/binary_guard.rs`, `src/binary_policy_types.rs`, `src/exec.rs`, `src/log.rs`, `build.rs`: hook points (GUARD repo)

---

## 1. Hook Points (GUARD repo)

| Existing code | Current behaviour | HITL insertion |
|---------------|-------------------|----------------|
| `src/block.rs` - sudo-gated subcommand branch | non-root → block with "run with sudo" hint | consult `hitl_policy`: opted-in class → ELEVATE path; otherwise unchanged |
| `src/binary_policy_types.rs` - `PolicyKind` enum | `DenyNonRoot`, `DenyAllNonRoot`, `ArgValidate`, `PassThrough` | add `RequireApproval` (compiled from policy YAML) |
| `src/binary_guard.rs` - `decide()` | per-basename policy decision | `RequireApproval` → build request, call agent client, await verdict |
| `src/exec.rs` - pre-exec gate | lock → contract check → execve | token redemption + argv-hash verify inserted after lock acquisition, immediately before exec |
| `src/log.rs` - `block()`/`warn()` | tty + file audit | new `elevate()` audit variant (request ID, state, outcome) |
| `build.rs` codegen | YAML → const literals | new `config/hitl_policy.yaml` → `const HITL_POLICY` |
| `config/guard_environment.yaml` | closed child env allowlist | add only: relay endpoint var name + state-file path constant; nothing secret-bearing |

## 2. Bash Wrapper Surface (FR-1)

Deployment model mirrors the binary-lock program:

```
/usr/bin/bash                  → capability-locked wrapper (new surface)
/usr/bin/bash.real             → root:root 0700 real bash
/usr/lib/workspace-guard/
    hitl-policy.yaml.hash      # integrity anchor (deploy-time)
    grant-pubkey.pem           # root-owned relay grant public key (NFR-1.3)
/var/lib/workspace-guard/hitl/
    state/                     # root-owned grant state dir (FR-2.3)
```

Invocation classification:

1. Non-interactive script/exec (`bash -c ...`): the command line is
   classified against `hitl_policy.yaml` command classes (§5).
   - `deny` class → existing block path (exit 1).
   - `elevate` class → ELEVATE flow (§3).
   - no match → pass through to `bash.real` with the existing
     closed-env discipline.
2. Interactive shells: pass through; gated commands inside the session
   are caught by the *binary* wrappers (sudo, systemctl, ...) which carry
   their own `RequireApproval` policy - the bash wrapper does not
   attempt in-session interception.

Rationale: bash argv classification alone is insufficient for
interactive use; the per-binary guards remain the enforcement layer,
and the bash wrapper covers the agent's primary automation surface
(`bash -c`).

## 3. ELEVATE Data Flow (FR-2)

```
wrapper decide() → ELEVATE
  ├─ build request payload { display, argv_sha256, host, agent_id,
  │    justification, ttl, idempotency_key }
  ├─ hitl-agent (helper, §4): AppRole login → ws-ticket → wss submit
  │    → await decision (bounded: min(request TTL, wait_cap))
  │     ├─ approved → elevation token → write grant state file
  │     │             (root-owned dir, O_NOFOLLOW, symlink_metadata
  │     │              verified, mode 0600) → return APPROVED
  │     ├─ denied/expired/timeout/error → return DENIED(+reason)
  ├─ on APPROVED: re-hash argv → redemption verify (§4.2) →
  │    mark jti used → exec gated command → report outcome
  └─ audit elevate() at each transition
```

Wait semantics (FR-1.4, NFR-2.1): the wrapper prints one status line
(`HITL: request <id> pending (ttl Ns)`) and blocks up to the wait cap
(default 300 s, ≤ TTL). This matches agent loop semantics (the caller
is a program, not a tty user). No GUARD locks are held while waiting;
lock acquisition happens after redemption, in the existing pre-exec
position.

## 4. Agent Client & Redemption

### 4.1 `hitl-agent` helper

- Separate small Rust binary (GUARD repo, `src/bin/hitl-agent.rs` or a
  mode of the guard binary), `#![forbid(unsafe_code)]`, deps limited
  to: tokio, tokio-tungstenite (rustls), ed25519-dalek, jsonwebtoken,
  serde, sha2, zeroize.
- Session key: Ed25519 generated per process invocation
  (FR-3.4); its thumbprint is sent in the request envelope; the relay
  binds it into the grant's `cnf` (SPEC-HITL-RELAY §5.1).
- AppRole bootstrap: `/etc/workspace-guard/hitl/approle` (root-owned,
  symlink-verified): role_id + wrapped secret_id; unwrap at first use
  per provisioning runbook; token TTL ≤ 300 s, refreshed per session.
- TLS: system roots; relay hostname pinned in policy config; invalid
  certs hard-fail (FR-3.2).

### 4.2 Redemption verification (FR-2.4) - pseudocode

```rust
fn redeem(token: &str, pending: &PendingRequest, pubkey: &VerifyingKey)
    -> Result<Grant, DenyReason>
{
    let claims = jwt::decode::<GrantClaims>(token, pubkey, &validation(EdDSA))?;
    require!(claims.exp <= claims.iat + 300);            // hard cap
    require!(claims.request_id  == pending.request_id);
    require!(claims.request_hash == sha256_canonical(pending.argv));
    require!(claims.cnf.thumbprint == pending.session_thumbprint);
    require!(jit_registry_insert_if_absent(&claims.jti)); // atomic, FR-2.5
    Ok(Grant { jti: claims.jti })
}
```

All comparisons constant-time; any `require!` failure → denial +
`elevate()` audit with reason class; no partial state.

### 4.3 Grant state file (FR-2.3)

The state file carries **no token bytes**: only
`{ request_id, request_hash, jti, exp, session_thumbprint }` - the
values the exec-side wrapper re-checks against the pending context and
its own recomputed argv hash. The token itself lives only in the
helper's memory. This keeps V10 (no grant bytes at rest) achievable
while preserving the root-owned, symlink-verified, fail-closed trust
pattern of the guard's root-gated policy files.

## 5. Policy Schema (FR-1.3, OQ-4)

`config/hitl_policy.yaml` (GUARD repo; schema-validated; baked via
build.rs):

```yaml
version: 1
relay:
  endpoint: "wss://hitl.example.local"
  pubkey_path: /usr/lib/workspace-guard/grant-pubkey.pem
defaults:
  ttl_seconds: 600
  wait_cap_seconds: 300
bash_surface:
  classes:
    - id: svc-restart
      match: { argv_glob: "systemctl restart *" }
      verdict: elevate
      tier_hint: 1
      exec_mechanism: policy_drop        # OQ-1 option (a): gate was policy-only
    - id: pkg-install
      match: { argv_glob: "apt-get install *" }
      verdict: elevate
      tier_hint: 1
      exec_mechanism: policy_drop
git_surface:                          # first opt-ins (OQ-4)
  - { subcommand: submodule, verdict: elevate }
  # checkout/switch/restore stay legacy-gated until burn-in
binary_surface:
  - { basename: systemctl, policy: require-approval, classes: [svc-restart] }
```

`exec_mechanism: policy_drop` (OQ-1): for v1 only policy-only gates
opt in - the wrapper simply refrains from blocking and execs under the
caller's identity. Capability-loaning mechanisms (option b/c) require a
separate hardening review before any class uses them.

## 6. Exit Codes (FR-1.4, C-6)

Proposal for GUARD repo sign-off (extends the existing 0/1/2/4
contract):

| Code | Meaning |
|------|---------|
| 0 | pass / elevation approved + executed (child exit code propagated where applicable) |
| 1 | policy block (unchanged) |
| 2 | infrastructure failure incl. relay unreachable (unchanged class; log signature distinguishes) |
| 3 | elevation denied / expired / timed out (NEW - was unused in README contract) |
| 4 | contract failure (unchanged) |

## 7. Audit Mapping (FR-4)

| Event | Channel | Fields |
|-------|---------|--------|
| request submitted | `log::elevate()` → file + tty notice | request_id, class, display, ttl |
| decision received | same | request_id, outcome, latency |
| redemption | same | request_id, jti prefix, argv_hash match=true |
| exec outcome | same + relay report | exit class |
| tamper (state file/pubkey/symlink) | RED tier (existing audit tiers) | path, expected vs actual |

## 8. Testing Strategy (GUARD repo, per its harness conventions)

- Unit: policy compile tests (YAML → const), redemption verify
  table-tests over forged-token corpus (V4), state-file adversarial
  tests (V5).
- Integration: mock relay (axum test server speaking protocol v1)
  driving V1-V3, V9; QEMU/podman E2E harness precedent for the full
  wrapper surface (V6-V8).
- Regression: full existing `guard_policy_matrix.yaml` MUST pass
  unchanged with HITL config absent (NFR-3.1) and present (NFR-1.1).

## 9. Implementation Status

| Item | Status | Evidence |
|------|--------|----------|
| §1-§7 contract | Specified | - |
| GUARD repo REQ/SPEC pair | Not started | derived from this contract |
| Code | Not started | - |
