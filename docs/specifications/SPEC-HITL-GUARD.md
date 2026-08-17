# SPEC-HITL-GUARD: `escalate` Execution Contract

**Date:** 2026-07-25
**Status:** Draft
**Type:** Specification
**Requirements:** [REQ-HITL-GUARD](../requirements/REQ-HITL-GUARD.md)
**Parent:** [SPEC-HITL](SPEC-HITL.md)

## 1. Process Boundary

`escalate` is the only new executable and the only local HITL client:

```text
agent
  -> escalate sudo <argv...>
       -> PDP over one mTLS connection
       -> human approval
       -> guarded /bin/bash -c <quoted command>
       -> guarded /usr/bin/sudo <argv...>
       -> command
```

The Bash and sudo guards receive no HITL code, state, protocol, or policy.
`escalate` contains no copy of their rules.

## 2. Startup

`escalate` is installed root-owned and SUID with execution restricted to the
root-managed provisioned-agent group. Startup proceeds in this order:

1. Capture real UID, primary GID, and supplementary groups from kernel APIs.
2. Reject callers outside the provisioned-agent group.
3. Require argv to begin with the literal `sudo` and contain a command.
4. Reject invalid UTF-8. Kernel argv cannot contain NUL; construction APIs also
   reject any interior NUL.
5. Open `.` as a directory with `O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW`; record
   its canonical path, device, and inode.
6. Open the root-owned mTLS certificate/key and Ed25519 signing key with
   `O_RDONLY | O_CLOEXEC | O_NOFOLLOW`; require regular files owned by UID 0
   with no group/world write bits.
7. Load both identities, close the source descriptors, disable core dumps, and
   set the process non-dumpable.
8. Drop effective UID to the real caller while retaining only the saved root UID
   needed for the final transition.

No environment value selects identity paths or changes these checks.

## 3. Request and Decision

The submitted request contains:

```text
request_id
argv: ordered UTF-8 strings
cwd: { canonical_path, device, inode }
caller: { uid, gid, supplementary_groups, agent_id }
host_id
server_nonce
expires_at
```

The canonical request hash covers every field and the protocol version.
`escalate` signs that request with Ed25519. The PDP derives approver scope from
policy and returns a decision on the same mTLS connection.
An approval response covers the request hash, server nonce, connection binding,
decision, and expiry.

`escalate` does not accept a portable token. A closed connection cannot be
resumed. Any transport failure exits `5`; retry requires a fresh invocation,
nonce, request, and human approval.

## 4. Wait and Cancellation

The process remains attached to the caller and waits until the earlier of the
request expiry or configured wait limit. It may print request ID and state to
stderr, but no private identity or reusable authorization material.

On an interrupt, it sends cancellation over the live connection, closes the
connection, and exits `5`. Since root is regained only after final
approval verification, interrupted or failed waits cannot execute.

## 5. Final Verification and UID Transition

Before regaining root, `escalate` verifies:

1. the response belongs to the current authenticated connection;
2. request hash, nonce, decision, and expiry match;
3. argv and captured caller identity are unchanged;
4. `fstat()` on the open cwd descriptor still matches the approved device and
   inode;
5. the canonical cwd path still resolves to that device and inode.

It then uses the platform UID API to set real, effective, and saved UID to 0.
Failure is terminal. After all UIDs are root, the process immediately performs
the guarded Bash exec described below and cannot return to caller privilege.

## 6. Deterministic Shell Quoting

Every UTF-8 argv element is encoded as one POSIX shell word:

1. Start the word with a single quote.
2. Copy every byte other than `'` unchanged.
3. Encode each `'` as `'"'"'`.
4. End the word with a single quote.
5. Join encoded words with one ASCII space.

Examples:

| Argument          | Encoded word        |
| ----------------- | ------------------- |
| `sudo`            | `'sudo'`            |
| empty string      | `''`                |
| `a b`             | `'a b'`             |
| `don't`           | `'don'"'"'t'`       |
| `$(id); rm -rf /` | `'$(id); rm -rf /'` |

The resulting command starts with the encoded literal `sudo`. This encoding is
injective for accepted argv: parsing it as shell words recovers exactly the
original argument sequence, and metacharacters inside arguments remain data.

## 7. Guarded Execution

The final call is equivalent to:

```text
execve("/bin/bash", ["bash", "-c", quoted_command], caller_environment)
```

`/bin/bash` is the existing shell guard, not `/bin/bash.real`. It scans the full
quoted command with its existing policy. If accepted, the real shell parses the
quoted words and invokes `/usr/bin/sudo`, which is the existing sudo guard, not
`/usr/bin/sudo.real`. Because `escalate` set all UIDs to root before the Bash
exec, the sudo guard applies its existing root behavior and all existing argument
checks.

Neither guard receives a special flag, environment variable, file descriptor,
approval token, or bypass. The caller environment is forwarded to guarded Bash;
the existing Bash and sudo sanitization remains authoritative.

## 8. Direct Sudo

The existing non-root sudo rejection remains a rejection. Its diagnostic adds:

```text
Use human approval: escalate sudo <command> [args...]
```

The sudo guard does not invoke `escalate`.

## 9. Exit and I/O

Before execution, denial, expiry, cancellation, disconnection, malformed data,
identity mismatch, or internal failure exits `5`. After the final `execve`, stdin,
stdout, stderr, terminal state, signals, and exit status follow normal Bash/sudo
behavior. `escalate` does not proxy or persist command output.

## 10. Tests

The WORKSPACE-GUARD implementation requires focused tests for:

- caller-group rejection before machine-identity access;
- privilege drop during network parsing and bounded waiting;
- decision binding and fail-closed disconnect behavior;
- cwd device/inode/path verification;
- shell-quote round trips for empty strings, whitespace, quotes, substitutions,
  separators, newlines, Unicode, and leading dashes;
- end-to-end guarded Bash and guarded sudo invocation without direct `.real`
  execution;
- unchanged existing Bash and sudo policy results;
- direct-sudo denial guidance;
- status `5` for every HITL non-execution outcome.

## 11. Implementation Status

| Item                    | Status      |
| ----------------------- | ----------- |
| Contract                | Specified   |
| `escalate` binary       | Not started |
| GUARD diagnostic change | Not started |
