# Audit: WORKSPACE-GATEWAY Dev Stack Teardown of 2026-10-03

**Date:** 2026-10-03
**Auditor:** workspace-agent (opencode)
**Status:** Closed - root cause confirmed, reproduced path fixed, stack restored

## Scope and Method

At 13:14:50 EEST on 2026-10-03 the WORKSPACE-GATEWAY development
stack (`gateway-compose.service`, compose project
`workspace-gateway-dev`) became unreachable. This audit reconstructs
the event from host and agent evidence:

- `journalctl --user -u gateway-compose.service`
- `journalctl --user` (user-manager state transitions)
- `journalctl -b -k` (kernel network events)
- `systemctl --user show gateway-compose.service`
- the opencode session store (shard SQLite DBs under
  `~/.local/share/opencode`)
- `~/.workspace-guard.log` (guard command ledger)
- captured command output under `/tmp/opencode/`

The first pass of this audit (written before remediation) concluded
the cause was external and unattributed. That conclusion was wrong:
it relied on the modification time of a command's output file, which
is the time the file was last written (command completion), not the
time the command started. The corrected finding and the fixes are
below.

This document lives in WORKSPACE-CI because the guard, hook, and
observability layers around the failover are WORKSPACE-CI surfaces;
the Gateway is a consumer of them.

## Summary

The teardown was caused by the agent itself: a `make ch-migrate-status`
issued in this same WORKSPACE-GATEWAY session at **13:14:10 EEST**
(10:14:10Z), three seconds before the first container was signalled.

`make ch-migrate-status` runs `res/scripts/gateway-compose.sh
migrate-status`, which ran:

```
podman-compose --podman-path ... -p workspace-gateway-dev \
  -f res/docker/docker-compose.yml --profile migration run --rm migrate version
```

The `migrate` service declares `depends_on: clickhouse`
(`condition: service_healthy`). podman-compose 1.6.0 `run` starts and
reconciles dependencies unless `--no-deps` is passed. Reconciling
`clickhouse` against the already-running (unit-created) container
produced a remove-then-recreate cycle that deleted the project's
dependent containers (`gw-apisix`, `gw-grafana`, `gw-openbao`,
`gw-etcd`, ...), then failed to recreate them. The unit's foreground
process (`podman-compose ... up --force-recreate apisix`) lost its
child container and exited with status 0, so systemd marked the unit
inactive and ran `ExecStop`, which then could not find the removed
containers. Net effect: the whole dev stack down.

The concurrent activity in sibling projects (`WORKSPACE-PORTAL`,
`WORKSPACE-RP`) in the same minute was coincidental and not causal.

## Root Cause (confirmed)

`podman-compose run` is not a read-only operation on a live project.
Without `--no-deps` it reconciles the target service's `depends_on`
graph and, when the dependency spec differs from the running
container, removes dependent containers before recreating the
dependency. A "show migration status" command therefore had the side
effect of tearing down the stack.

The dangerous sequence was visible in the command's own output: it
listed the project's containers, reported `gw-migrate` missing,
then `container ... has dependent containers which must be removed
before it ... container already exists`. The status request never
returned because ClickHouse had been taken out from under it, and it
hung until the tool timeout.

## Impact

- Gateway north-south traffic through APISIX stopped.
- Grafana was removed; the separate wiki stack logged
  `connect() failed (113: No route to host)` to the Grafana upstream
  `10.99.60.3:3000` from 13:15:13 EEST.
- ClickHouse and Vector were stopped.
- No data loss: named volumes were not removed.

## Environment

| Component | Value |
| --- | --- |
| Host | `vm-ws`, Ubuntu, user manager PID 2609, lingering enabled |
| Gateway unit | `~/.config/systemd/user/gateway-compose.service` |
| Gateway project | `workspace-gateway-dev` |
| Unit `Type` / `Restart` (at event) | `simple` / `no` |
| `KillMode` | `control-group` |
| `TimeoutStopSec` | `90` |
| `SyslogIdentifier` | `gateway-compose` |
| Foreground process | `res/scripts/gateway-compose-up.sh`, ending in `exec podman-compose ... up --force-recreate apisix` |
| podman-compose | 1.6.0 (repo `.venv`) |
| Audit trail | `auditd` inactive and not installed |

## Timeline (EEST = UTC+3)

| Time (EEST) | Time (UTC) | Event |
| --- | --- | --- |
| 13:14:10 | 10:14:10 | Agent issues `make ch-migrate-status` in the WORKSPACE-GATEWAY session |
| 13:14:10 | 10:14:10 | `podman-compose ... run --rm migrate version` starts; begins reconciling dependencies |
| 13:14:13 | 10:14:13 | First container `SIGTERM`; Vector logs `signal="SIGTERM"` |
| 13:14:13-18 | 10:14:13-18 | 34 veth interfaces unregister across 8 bridges (`podman2,4,8,9,10,11,12,16`) |
| 13:14:17 | 10:14:17 | OpenBao shutdown; etcd receives `terminated` |
| 13:14:19 | 10:14:19 | Unit foreground process exits status 0; `ActiveExitTimestamp` set; 3 veths re-enter `forwarding` |
| 13:14:19 | 10:14:19 | Unit `ExecStop` reports four containers already absent |
| 13:14:49 | 10:14:49 | `gw-clickhouse` forced to `SIGKILL` after 30 s |
| 13:14:50 | 10:14:50 | `gw-prometheus`, `gw-vector` stopped; unit inactive |
| 13:17:10 | 10:17:10 | `make ch-migrate-status` killed after 180 s timeout (`migstatus.txt` last write) |

The earlier audit read the 13:17:10 file timestamp as the command's
start. It is the command's end; the start is 13:14:10, before the
teardown.

## Evidence Catalogue

### E-1 Root-cause command was issued at 13:14:10, before the teardown

From the WORKSPACE-GATEWAY opencode session store, the tool call was
created at `2026-10-03 10:14:10Z` and its step finished at
`10:17:10Z` (the 180 s tool timeout):

```
2026-10-03 10:14:10|ses_f1430c841ffeOSl93aVN6nL5FA|tool bash
  make ch-migrate-status > /tmp/opencode/migstatus.txt 2>&1
  ... step-finish at 10:17:10
```

### E-2 The command's own output shows dependency reconciliation

`/tmp/opencode/migstatus.txt` (verbatim, trimmed):

```
bash res/scripts/gateway-compose.sh migrate-status
Error: no container with name or ID "gw-migrate" found: no such container
gw-clickhouse
gw-apisix
gw-vector
gw-apisix
gw-vector
Error: no container with ID or name "gw-migrate" found: no such container
gw-clickhouse
gw-prometheus
gw-grafana
gw-openbao
gw-etcd
Error: container 3282... has dependent containers which must be removed before it: b4b9...: container already exists
gw-grafana
gw-openbao
gw-etcd
Error: "gw-openbao" is not a valid container, cannot be used as a dependency: no container with name or ID "gw-openbao" found
gw-clickhouse
gw-vector
make: *** [Makefile:258: ch-migrate-status] Terminated
```

podman-compose is creating/removing project containers, not merely
reading migration state.

### E-3 The migrate service declares a dependency

`res/docker/docker-compose.yml`:

```
migrate:
  profiles: [migration]
  image: migrate/migrate@sha256:...
  container_name: gw-migrate
  depends_on:
    clickhouse:
      condition: service_healthy
  ...
```

This `depends_on` is what `run` without `--no-deps` reconciles.

### E-4 podman-compose 1.6.0 `run` supports and honours `--no-deps`

From the installed package:

```
podman_compose.py:4602: parser.add_argument("--no-deps", ...)
podman_compose.py:4067: if deps and not args.no_deps:
```

### E-5 The unit exited status 0 (clean), then ExecStop ran

`systemctl --user show gateway-compose.service`:

```
ExecStart={ ... gateway-compose-up.sh ... ; start 2026-09-28 09:43:05 ; stop 2026-10-03 13:14:19 ; status=0 }
ExecStop={ ... podman-compose ... stop -t 30 apisix ; start 13:14:19 ; stop 13:14:19 ; pid 291016 }
ExecStop={ ... podman-compose ... stop -t 30 clickhouse vector openbao prometheus grafana etcd ; start 13:14:19 ; stop 13:14:50 ; pid 291348 }
ExecMainStartTimestamp=Mon 2026-09-28 09:43:05 EEST
ExecMainExitTimestamp=Sat 2026-10-03 13:14:19 EEST
ExecMainStatus=0
Result=success
NRestarts=0
```

The foreground `up` process exited on its own with status 0; systemd
then deactivated the unit and ran `ExecStop`. A status-0 exit is why
neither `Restart=on-failure` nor an `OnFailure` unit would fire.

### E-6 Containers were removed, not stopped

```
Oct 03 13:14:19 gateway-compose[291279]: Error: no container with name or ID "gw-apisix" found: no such container
Oct 03 13:14:19 gateway-compose[291602]: Error: no container with name or ID "gw-openbao" found: no such container
Oct 03 13:14:19 gateway-compose[291595]: Error: no container with name or ID "gw-etcd" found: no such container
Oct 03 13:14:19 gateway-compose[291597]: Error: no container with name or ID "gw-grafana" found: no such container
Oct 03 13:14:49 gateway-compose[291606]: StopSignal SIGTERM failed to stop container gw-clickhouse in 30 seconds, resorting to SIGKILL
```

### E-7 Container shutdown notices, 13:14:13-18

```
Oct 03 13:14:17 gateway-compose[3552965]: [vector] | 2026-10-03T10:14:13.831729Z INFO vector::signal: Signal received. signal="SIGTERM"
Oct 03 13:14:17 gateway-compose[3552965]: [openbao] | ==> OpenBao shutdown triggered
Oct 03 13:14:18 gateway-compose[3552965]: [etcd] | ... "received signal; shutting down","signal":"terminated"
```

### E-8 Network remove-then-recreate cycle

Counted from the kernel window 13:14:13-13:14:50: 34 `unregistering`
events and 3 `entered forwarding state` events across 8 distinct
bridges (`podman2,4,8,9,10,11,12,16`).

### E-9 The sibling wiki stack observed Grafana disappear

```
Oct 03 13:15:52 wiki-prod-compose[3556853]: [wiki-nginx] | 2026/10/03 10:15:13 [error] 27#27: *150175 connect() failed (113: No route to host) ... upstream: "http://10.99.60.3:3000/grafana/api/live/ws"
```

### E-10 No resource-pressure or kernel-fault cause

No `oomd`/`Killed process`/`hung_task`/`I/O error`/`segfault` record
in the window.

### E-11 Sibling compose units did not restart

`workspace-compose.service` and `wiki-prod-compose.service` show
`NRestarts=0` and unchanged `ActiveEnterTimestamp`. Their cleanup
paths (such as `--remove-orphans`) did not run.

### E-12 The sibling sessions were concurrent but not causal

The guard ledger shows `WORKSPACE-PORTAL` git commits at
10:14:11-15Z and opencode snapshot `write-tree` in `WORKSPACE-RP` /
`WORKSPACE-GUARD` in the same seconds. None of those issued a podman
command. The correlation is timing-only; the causal command is E-1.

### E-13 No `execve` audit trail exists

`auditd` is inactive and not installed, so no kernel `execve` record
exists. The command that tore the stack down was identified from the
agent session store instead (E-1), and by the stack's own logs (E-2,
E-5).

## Analysis

- The teardown required deleting and recreating project containers.
  `make ch-migrate-status` did exactly that (E-2), starting at 13:14:10
  (E-1), with the first `SIGTERM` three seconds later.
- The unit did not crash and was not stopped by systemd: its main
  process exited 0 once its child container vanished (E-5).
- The absence of a `Stopping` line is expected for a `Type=simple`
  unit whose main process exits on its own; it is not evidence of a
  missing log.
- The concurrent sibling sessions are timing coincidence (E-12).

This corrects the initial audit, which had exonerated
`make ch-migrate-status` on the strength of the command's output-file
mtime. That reasoning was wrong (completion vs. start time).

## Fixes Applied

1. **`res/scripts/gateway-compose.sh`** - added `--no-deps` to the
   `migrate-up`, `migrate-status`, and `migrate-force` `run`
   invocations, with a comment explaining the dependency
   reconciliation. This removes the teardown side effect.
2. **`res/ansible/compose.yml`** - the OpenBao pre-start probe is now
   `when: gateway_active.rc == 0`, `failed_when: false`, and the
   stale-container recreate condition ignores empty stdout. Previously
   the probe ran against a freshly restarted unit before OpenBao was
   ready and aborted `make gw-start`.
3. **`res/ansible/templates/gateway-compose.service.j2`** -
   `Restart=no` -> `Restart=always`. The teardown exited status 0, so
   `on-failure` would not have helped; `always` self-heals an
   unexpected exit and does not fight an explicit `systemctl stop`.

### Verification

```
make ch-migrate-status     # returns schema version 16; stack stays up
make gw-start              # exits 0 end to end (previously aborted at the probe)
make gw-verify             # APISIX/etcd/ClickHouse/Grafana/Prometheus UP; sanity HTTP 200
```

## Recommendations

### Observability

1. Enable an execution record for container tooling: add `podman` and
   `podman-compose` to the guard's logged set, or install `auditd`
   with an `execve` rule. Today a container command leaves no
   attributable trace unless it fails loudly.
2. Keep the dev-stack journal range and sampler output for the
   incident window in a durable location.

### Structural

3. Treat `podman-compose run` as a project-mutating operation in this
   repo. Any future wrapper must pass `--no-deps` when the stack may be
   live, or exec into an existing container instead.
4. Optionally add an `OnFailure` notifier for genuine start failures
   (it will not catch status-0 exits; `Restart=always` covers those).

## Open Items

- [x] Correct the root cause (agent `make ch-migrate-status`, not an external teardown).
- [x] Fix `migrate-*` to use `--no-deps`.
- [x] Fix the cold-start probe guard and `make gw-start` abort.
- [x] Harden the unit with `Restart=always`.
- [x] Restore and verify the stack (all services UP, sanity 200).
- [ ] Add container tooling to the execution-audit surface (guard or `auditd`).

## Appendix A - Commands Used (read only)

```
journalctl --user -u gateway-compose.service --since '2026-10-03 13:05' --until '2026-10-03 13:16'
journalctl --user --since '2026-10-03 13:13:55' --until '2026-10-03 13:15:05'
journalctl -b -k --since '2026-10-03 13:13:55' --until '2026-10-03 13:15:05'
journalctl --since '2026-10-03 13:14:15' --until '2026-10-03 13:14:52' -o verbose
systemctl --user show gateway-compose.service
systemctl --user is-active gateway-compose.service
sqlite3 ~/.local/share/opencode/shard-2be653fbf3845539.db   # session/message/part queries
stat -c '%y  %n' /tmp/opencode/migstatus.txt
```

## Appendix B - Guard-Ledger Notes

The guard ledger records git operations and blocked commands only.
Ordinary `podman`/`podman-compose` executions are absent, which is why
the initial pass could not attribute the teardown. The agent session
store proved to be the reliable source for agent-issued commands.

## Related Guard Hardening (2026-10-03)

`WORKSPACE-GUARD` `c28269e` now blocks direct `systemctl`/`loginctl`
mutating verbs at the agent command channel, covering the class of the
restore-test action (a direct `systemctl --user stop`). The in-repo
migrate fix above is independent of that guard change; the guard adds
a second layer against the same failure mode.

See `AUDIT-SERVICE-KILLING-DEV-TOOLING-2026-10-03.md`.

## Revision History

| Date | Change |
| --- | --- |
| 2026-10-03 | Initial audit (pre-remediation). Attributed the teardown externally. |
| 2026-10-03 | Corrected: root cause is the agent's `make ch-migrate-status` / `podman-compose run` dependency reconciliation. Fixes applied and verified. |
| 2026-10-03 | Added the related guard-hardening note (`c28269e`). |
