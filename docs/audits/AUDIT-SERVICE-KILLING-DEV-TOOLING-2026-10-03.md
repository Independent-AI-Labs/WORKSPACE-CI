# Audit: Service-Killing Dev Tooling (Port- and Name-Based Kills) of 2026-10-03

**Date:** 2026-10-03
**Auditor:** workspace-agent (opencode)
**Status:** Open - defects confirmed; guard hardening c28269e landed for direct system tools; remaining gaps recorded

## Scope and Method

This audit covers the class of dev-tooling operations that can terminate
services they do not own: kills by TCP port, kills by process name, and
container/network cleanup applied host-wide instead of project-scoped.
It follows the WORKSPACE-GATEWAY teardown audit
(`AUDIT-GATEWAY-STACK-TEARDOWN-2026-10-03.md`), which root-caused that
incident to a project-mutating `podman-compose run`; the same
"innocuous command, cross-project side effect" shape recurs in the
dev tooling audited here.

Evidence is read-only static inspection of the repositories plus the
installed guard sources:

- `WORKSPACE-PORTAL/res/ansible/dev.yml`
- `WORKSPACE-PORTAL/scripts/server.mjs`, `scripts/runner.mjs`
- `RUST-ZK-PORTAL/res/ansible/dev.yml`
- `WORKSPACE-DATAOPS/res/ansible/templates/workspace-compose.service.j2`
- `WORKSPACE-DATAOPS/res/ansible/compose.yml`
- `WORKSPACE-GUARD/config/shell_guard_policy.yaml` and its schema,
  `build_shell_guard.rs`, `src/shell_guard/main.rs`, `src/shell_guard/report.rs`

No live system was mutated during this investigation.

This document lives in WORKSPACE-CI because the removable surface (the
shell guard) and the shared CI checks are WORKSPACE-CI/WORKSPACE-GUARD
surfaces; each repository named is a consumer of them.

## Summary

Four defects share one root shape: **a destructive operation with no
ownership predicate**. A command names a port, a process pattern, or a
resource class instead of the specific service instance it is allowed
to touch, so whichever process or container happens to match is
terminated.

1. The portal's dev ansible force-kills whatever owns the dev TCP port
   (`fuser -k {{ dev_port }}/tcp`, three sites). The public portal
   tunnel points at the same port, so a dev start/stop can kill the
   public process.
2. The portal's Node dev runner kills by process pattern (`next
   dev|start` under the app dir) and by port listener, with no check
   that the target belongs to the dev unit.
3. `RUST-ZK-PORTAL` carries the identical `fuser -k` pattern.
4. The DATAOPS compose unit's `ExecStartPre` removes a shared network
   and force-removes stopped containers **host-wide**, without a
   compose-project filter; the portal invokes DATAOPS runtime targets on
   every dev start.

None of these caused the 2026-10-03 gateway teardown (they target port
3000, not the gateway's 9080/3030/8123), but each can kill an unrelated
service and each is currently invisible to the guard.

## Post-audit update: guard hardening c28269e (2026-10-03)

After this audit was written, the WORKSPACE-GUARD workstream landed
`c28269e` ("feat: sudo-gate direct system-tool commands in the shell
guard"). It adds two `scope: command` patterns with disposition `exec`
(block), deliberately omitting the `sudo`/`doas` launchers so the
operator path stays open:

- `system-manager-command`: mutating `systemctl`/`loginctl` verbs,
  bare `systemd-run`, and `service` start/stop. Read-only verbs
  (`status`, `show`, `list-*`, `is-*`, `cat`, `get-*`) still pass.
- `system-admin-command`: user/group admin, module loading,
  device-mapper, mount/swap, audit/MAC, cron/tmpfiles, network
  config, hostname/time/locale, mutating `ip` object-verbs, and the
  `sysctl -w` form. Read-only `ip ... show` and `sysctl -a` still
  pass.

Effect on this audit's findings:

| Finding | After c28269e |
| --- | --- |
| F-4 trigger (`systemctl --user stop/restart`) | blocked at the agent command channel |
| the restore-test action in the gateway teardown audit | blocked |
| F-1/F-3 `fuser -k <port>` | still open (no guard pattern) |
| kill-by-port (`lsof/ss/netstat ... \| xargs kill`) | still open |
| F-4/F-5 destructive compose forms as direct agent commands | already blocked by the existing `podman-command` rule (it matches the `podman` in `podman-compose`, including via an `xargs` launcher) |
| all four findings inside trusted code | still open - see below |

The landing design is **block + sudo escape**, not the report-only mode
this audit originally proposed (P-1/P-2). The block choice is stronger
for the agent command channel; a report-only disposition remains the
right shape only for patterns that are not yet safe to block.

### The structural gap is unchanged

The shell guard scans only `bash -c` text and *untrusted* script
bodies. All four findings live in **trusted** code (root-owned repo
scripts, ansible `shell:` task bodies, or systemd `ExecStartPre`), so
no shell-guard pattern can close them. That path requires the static
report check in P-3. The two genuinely missing agent-channel patterns
are `fuser -k` and the `lsof/ss/netstat ... | xargs kill` form.

See `WORKSPACE-GUARD/docs/AUDIT-DIRECT-SYSTEM-TOOL-GATING-2026-10.md`.

## Post-audit update: P-3 static gate decisions (2026-10-04)

P-3 is being implemented as a blocking, non-exemptible protected hook
named `check-trusted-exec`, not as the report-only check originally
proposed. The operator decisions:

- It applies to every repository (`applicable_to: [any]`) and is
  installed even at `poc` tier (`safety: true`, `mandatory: true`).
- Every rule is non-exemptible. There is no per-repository exemption
  file and no configuration overlay.
- It is blocking from the first activation. There is no report-only
  phase; the three known offender repositories go red until P-4 and P-5
  land.
- Vendored and mirrored repositories install no hooks and are
  unaffected.
- Carriers scanned: shell, YAML (ansible, compose, systemd templates),
  systemd units, Makefile recipes, JavaScript and TypeScript, Python,
  and Lua. Markdown is not scanned.
- Detection reuses the banned-pattern discovery and classification
  pipeline and the bounded decode views of the inline-code checker, so
  encoded forms are covered.
- Self-reference is handled with the same exact-file classification
  mechanism as the sibling content gates (`policy-definition` plus the
  checker's fixed definitional set); that is not a repository exemption.

Contract and specification:
`docs/requirements/REQ-TRUSTED-EXEC.md`,
`docs/specifications/SPEC-TRUSTED-EXEC.md`.

## Findings

### F-1 Portal kills whatever owns the dev port

`WORKSPACE-PORTAL/res/ansible/dev.yml` runs, at three sites
(lines 149-160, 176-187, 822-833):

```
fuser -k {{ dev_port }}/tcp
```

`dev_port` comes from `NEXT_DEV_PORT` with a default of `3000`
(`dev.yml:18`). `fuser -k` terminates **every process holding that
port**, with no check that the holder is `workspace-portal-dev`. Two
consequences:

- The public portal ingress (Cloudflare tunnel) forwards to
  `localhost:3000` (`cloudflare/config.yml.example:13`,
  `docs/TUNNEL-SETUP.md`). A dev start/stop/restart can kill the
  process serving the public site.
- If `NEXT_DEV_PORT` is set to a port owned by another managed service,
  the start/stop path kills that service instead. The port is selected
  by environment, not by ownership.

### F-2 Portal dev runner kills by process pattern and port

`WORKSPACE-PORTAL/scripts/server.mjs`:

- `killOrphans()` (lines 123-143) reads `ps -eo pid,command` and sends
  `SIGKILL` to every line matching `/next (dev|start)/` whose command
  includes the app directory. A production `next start` launched from
  the same directory is collateral.
- `cmdStop()` (lines 200-223) resolves the listener on the base port
  and sends `SIGKILL` to it if it differs from the recorded pid.

`scripts/runner.mjs:41` exposes `kill-orphans`, so this is reachable
from the normal developer workflow.

### F-3 RUST-ZK-PORTAL repeats the port kill

`RUST-ZK-PORTAL/res/ansible/dev.yml` runs `fuser -k {{ dev_port }}/tcp`
at lines 104-109 and 166-171. The task name claims "this port only",
but "this port" is exactly the unowned predicate: the command kills
whatever holds the port, not the service it started.

### F-4 DATAOPS pre-start cleanup is not project-scoped

`WORKSPACE-DATAOPS/res/ansible/templates/workspace-compose.service.j2`
(lines 20-24):

```
ExecStartPre=-{{ container_runtime_path }} network rm -f docker_default
ExecStartPre=-/bin/sh -c '... ps -aq --filter "status=exited" --filter "status=dead" --filter "status=created" | xargs -r ... rm -f'
ExecStartPre=-/bin/sh -c '... pod ls -q --filter "status=exited" --filter "status=dead" --filter "status=created" | xargs -r ... pod rm -f'
ExecStart=... up --remove-orphans
ExecStop=... down
```

The container/pod removals filter on **status only**, not on
`label=io.podman.compose.project=dataops`, so they remove stopped
containers from any project. `network rm -f docker_default` removes a
shared name globally. The compose project itself is pinned
(`name: dataops`), so `down`/`--remove-orphans` stay in-project, but
the `ExecStartPre` escapes it.

Reachability: `WORKSPACE-PORTAL/Makefile:304-312` `_ensure-dataops`
invokes `make -C WORKSPACE-DATAOPS runtime-up PROFILES=data,secrets` on
every `dev`, `dev-start`, `dev-restart`, and `deploy-dev`. `runtime-up`
itself only runs `up -d` (not a teardown), but any start/restart of the
DATAOPS unit runs the host-wide `ExecStartPre`.

### F-5 Related: project-mutating `run` without `--no-deps`

The gateway's `make ch-migrate-status` ran `podman-compose run` without
`--no-deps`, which reconciled the service's `depends_on` and tore down
the project. That is fixed in WORKSPACE-GATEWAY and documented in the
teardown audit; it is included here because it is the same class
(a read-looking command with a project-wide side effect) and because
the guard prevention below should cover it too.

## Why the guard did not see these

The shell guard scans two inputs:

- agent command text passed to `bash -c` (`Invocation::Command`), and
- **untrusted** script bodies read from the filesystem
  (`Invocation::Untrusted`).

It does not scan **trusted** scripts (root-owned, root-locked
ancestry) or ansible `shell:` task strings; those execute directly
(`src/shell_guard/main.rs:483-485`). Every defect above lives in
trusted repo scripts or ansible task bodies, so the runtime guard is
structurally unable to catch the shipped code. `fuser`, port-based
kills, `--remove-orphans`, and host-wide `xargs ... rm` are also not in
the current pattern table (`config/shell_guard_policy.yaml`). Finally,
the guard ledger records git operations and blocked rules only
(`audit()` in `main.rs:282-301`), so a destructive-but-allowed command
leaves no trace.

Any prevention that relies on the runtime guard alone therefore fails
open for exactly these cases. Prevention needs two layers: a
**report-only runtime layer** (observe and record destructive intents
from the agent command channel) and a **report-only static layer**
(flag the patterns where they are authored, in repo scripts and
ansible tasks).

## Prevention Mechanics

### P-1 Guard report-only rule mode (schema and runtime)

The shell guard is block-only: the first match calls `block()` and exits
(`main.rs:462-466`, `487-491`). Add a per-pattern `mode` field with
values `block` (default) and `report`.

Schema (`WORKSPACE-GUARD/config/shell_guard_policy.schema.yaml`):

```
- path: patterns[].mode
  type: string
  required: false
  default: block
  description: "block = terminate the command (current behaviour). report = log and notify, then continue. Report hits never change the exit status."
```

Codegen (`build_shell_guard.rs`) carries `mode` into the generated
`SHELL_PATTERNS` tuple; the policy matrix gains an `expect: reported`
outcome so every report rule is test-covered alongside the blocked
ones. Runtime (`main.rs`) branches after a hit:

```
if hit.rule.mode == "report" {
    report::report_notice(hit.rule, &display, &excerpt);
    // fall through to exec_real, never exit
} else {
    block(hit.rule, &display, &excerpt);
}
```

`report_notice` reuses the existing report renderer and the `audit()`
sink, writing reason `report rule: <id>`, and prints one line to the
tty. It must be non-fatal by construction.

### P-2 Report-only shell patterns for the service-killing class

Add these as `mode: report`, `scope: both`, so they also cover
untrusted script bodies while the team baselines signal. They are
deliberately report-only first: promoting them to `block` is a
follow-up decision once the false-positive rate is known.

```
  - id: report-port-kill
    regex: '\bfuser\b[^;|&]*\s-k\b'
    hint: "port-based kill: verify the listener belongs to the target unit before killing"
    mode: report
  - id: report-orphan-remove
    regex: '\bdown\b[^;|&]*--remove-orphans|--remove-orphans'
    hint: "orphan removal must be project-scoped; confirm the compose project before running"
    mode: report
  - id: report-network-remove
    regex: '\bnetwork\s+(rm|remove)\b[^;|&]*\s-f\b'
    hint: "removing a shared network affects every project attached to it"
    mode: report
  - id: report-mass-container-rm
    regex: '\bps\b[^;|&]*\s-a[^;|&]*\|[^;|&]*\bxargs\b[^;|&]*\b(rm|pod\s+rm)\b'
    hint: "host-wide container removal: filter by compose project label"
    mode: report
  - id: report-cross-unit-control
    regex: '\bsystemctl\s+--user\s+(stop|restart|kill)\b'
    hint: "stopping/restarting a unit you do not own can kill a running service"
    mode: report
  - id: report-compose-run
    regex: '\bcompose\b[^;|&]*\brun\b'
    hint: "podman-compose run reconciles dependencies unless --no-deps is passed"
    mode: report
```

Ordering matters: report patterns are listed after the existing block
patterns so a command that is already blocked still reports the block
rule first.

### P-3 Static report-only CI check for authored code

The runtime guard cannot see trusted scripts. Add a consumer check that
scans repo shell scripts and ansible task bodies for the same patterns
and reports (does not fail the build initially). It reuses the banned
pattern scan pipeline and its exceptions file, at the same place the
banned-words check runs. Initial patterns mirror P-2 plus:

- `fuser -k` in any dev/lifecycle script,
- `--remove-orphans` without a project pin on the same command,
- `ps ... -a ... | xargs ... rm` without a `label=` filter,
- `compose ... run` without `--no-deps` on the same line.

Output goes to the CI report stream, not to a gate failure, until the
baseline is clean.

### P-4 Ownership-scoped kill helper (consumer fix)

Replace `fuser -k {{ dev_port }}/tcp` with a helper that:

1. resolves the listener pid,
2. reads its cgroup or systemd unit,
3. kills only if the unit is the tool's own unit, otherwise fails
   loudly with the discovered owner.

The same helper served to RUST-ZK-PORTAL removes both copies of F-3.

### P-5 Project-scoped container and network cleanup (consumer fix)

DATAOPS `ExecStartPre` should filter every removal by
`label=io.podman.compose.project=dataops` and must not `network rm -f`
a shared name that other projects attach to; if the network is shared
by contract, create/verify it instead of removing it.

### P-6 Port ownership discipline (process fix)

Dev ports must come from a dedicated range, chosen so they are never the
same as a port the public ingress uses. The public tunnel and the dev
server must not share a port; if they must, the start path must assert
the prior owner before evicting it.

## Recommendations

### Immediate

1. Apply the P-4 helper in `WORKSPACE-PORTAL` and `RUST-ZK-PORTAL`
   (kills only the owning unit; loud failure otherwise).
2. Apply the P-5 project scope in `WORKSPACE-DATAOPS`.

### Short term

3. Implement the guard `mode: report` field (P-1) and land the P-2
   report rules; baseline for one week before considering promotion to
   `block`.
4. Add the P-3 static report check so authored code is covered where
   the runtime guard cannot reach.

### Structural

5. Track service ownership (port to unit to project) as data, and make
   every eviction/kill path consult it rather than matching by port or
   name.
6. Promote the report rules to `block` once the baseline is clean, so
   the service-killing class is refused rather than merely recorded.

## Open Items

- [x] Direct system-tool gating (`systemctl`/`loginctl`, admin tooling) blocked in the shell guard (`c28269e`, guard workstream).
- [x] `systemctl --user stop/restart` blocked at the agent command channel.
- [ ] Add guard patterns for `fuser -k` and port-based kill on the agent command channel (guard workstream).
- [~] P-3 static check for the same patterns in trusted scripts, ansible task bodies, systemd units, and application source (CI workstream). Implemented as the blocking, non-exemptible `check-trusted-exec` gate; see the 2026-10-04 update above, `REQ-TRUSTED-EXEC`, and `SPEC-TRUSTED-EXEC`.
- [ ] P-4 ownership-scoped kill helper in WORKSPACE-PORTAL and RUST-ZK-PORTAL (consumer workstreams).
- [ ] P-5 project-scoped DATAOPS pre-start cleanup (consumer workstream).
- [x] Decide the enforcement posture for the covered cases: block, non-exemptible, no report-only phase (supersedes the P-1/P-2 report-only mode for the static layer).

## Appendix A - Evidence Locations

| Finding | Repository | Location |
| --- | --- | --- |
| F-1 | WORKSPACE-PORTAL | `res/ansible/dev.yml:149-160,176-187,822-833`; `dev_port` at `:18` |
| F-1 impact | WORKSPACE-PORTAL | `cloudflare/config.yml.example:13`; `docs/TUNNEL-SETUP.md` |
| F-2 | WORKSPACE-PORTAL | `scripts/server.mjs:123-143,200-223`; `scripts/runner.mjs:41` |
| F-3 | RUST-ZK-PORTAL | `res/ansible/dev.yml:104-109,166-171` |
| F-4 | WORKSPACE-DATAOPS | `res/ansible/templates/workspace-compose.service.j2:20-24` |
| F-4 trigger | WORKSPACE-PORTAL | `Makefile:304-312` (`_ensure-dataops`) |
| F-5 | WORKSPACE-GATEWAY | see `AUDIT-GATEWAY-STACK-TEARDOWN-2026-10-03.md` |
| Guard gap | WORKSPACE-GUARD | `src/shell_guard/main.rs:282-301,462-491`; `config/shell_guard_policy.yaml` |
| Guard report path | WORKSPACE-GUARD | `src/shell_guard/report.rs`; codegen `build_shell_guard.rs` |

## Appendix B - Guard Block vs Report Flow

```
classify(args)
  Command(text)  -> find_hit(text, rules, "command")
  Script(path)   -> classify_script
                      Trusted         -> exec_real (NEVER SCANNED)   <-- F-1..F-4 live here
                      Untrusted(body) -> find_hit(body, rules, "untrusted-script")
  hit:
    mode == "block"  (current, only) -> block() and exit(1)
    mode == "report" (proposed)      -> report_notice(); continue to exec_real
```

The `Trusted -> exec_real (NEVER SCANNED)` edge is why authored code
requires the P-3 static layer.

## Revision History

| Date | Change |
| --- | --- |
| 2026-10-03 | Initial audit: service-killing dev tooling; guard report-only prevention proposed. |
| 2026-10-03 | Reconciled with guard hardening `c28269e` (block + sudo escape for direct system tools); remaining gaps recorded. |
