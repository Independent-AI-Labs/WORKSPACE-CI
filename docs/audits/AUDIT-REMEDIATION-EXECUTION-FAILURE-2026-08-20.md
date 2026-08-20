# Audit: CI Deployment Deadlock and Gateway Recovery Failure

**Date:** 2026-08-20
**Status:** Confirmed defects; remediation and acceptance requirements defined
**Systems:** WORKSPACE-CI, WORKSPACE-GATEWAY, rootless Podman, ClickHouse
**Related audit:**
[`AUDIT-DEPLOYMENT-DEADLOCK-2026-08-19.md`](AUDIT-DEPLOYMENT-DEADLOCK-2026-08-19.md)

## 1. Executive Finding

WORKSPACE-CI was built at the transient physical candidate path and then
published at a different path. Generated Python and Podman metadata retained
the transient path, leaving the deployed Python environment, protected Git
hooks, and rootless Podman configuration unusable after publication.

The intended recovery mechanism is the operator-reviewed writable provisioner.
It must rebuild an exact reviewed artifact while exposing the physical
candidate at its final logical path in a private mount namespace. The current
artifact must not provide new deployment-control code required to repair that
artifact.

Gateway recovery was then complicated by inode exhaustion inside the
ClickHouse volume. An attempted recovery incorrectly proposed deleting the
complete ClickHouse named volume and manually encoded Compose container
dependencies in Ansible. That approach would destroy data and violates the
container lifecycle ownership boundary. It is rejected.

The required remediation has two independent goals:

1. restore WORKSPACE-CI through its normal writable-provisioner and atomic
   publication mechanism; and
2. recover ClickHouse capacity without deleting committed data or bypassing
   ClickHouse and Compose ownership semantics.

Neither goal is complete until its live acceptance evidence passes.

## 2. Required Invariants

### 2.1 WORKSPACE-CI deployment

1. The operator-reviewed writable checkout owns deployment orchestration.
2. The deployed artifact is built only from exact reviewed `origin/main`.
3. Deployment orchestration must not execute the current installed artifact.
4. New repair machinery must come from the writable provisioner, not from the
   old candidate artifact being repaired.
5. The physical candidate must be built through logical
   `/opt/workspace-ci` in a private mount namespace.
6. Generated runtime metadata must never contain
   `/opt/.workspace-ci.candidate`.
7. Candidate-path references must be rejected, not rewritten.
8. Publication must remain a same-filesystem atomic rename or directory
   exchange.
9. Failure must not leave a retained displaced artifact at the candidate path.
10. Protected hooks must execute through a verified deployed runtime.

### 2.2 Gateway and ClickHouse recovery

1. Compose owns Gateway container creation, dependency ordering, teardown, and
   recreation.
2. Podman owns named-volume lifecycle.
3. ClickHouse owns committed table parts and merge-recovery semantics.
4. A container may be recreated without deleting its named volume.
5. `podman-compose down` without `-v` preserves named volumes.
6. `podman volume rm docker_clickhouse-data` destroys all ClickHouse volume
   data and is prohibited unless complete data loss is explicitly authorized.
7. Direct deletion below the ClickHouse data directory is prohibited until the
   exact table and artifact classes are proven and the operation is supported
   by documented ClickHouse recovery semantics.
8. Ingestion must remain stopped throughout recovery and verification.
9. ClickHouse must be stable before Vector or APISIX ingestion resumes.

## 3. Observed Failures

### 3.1 Candidate-bound Python environment

The deployed environment retained the physical candidate pathname:

```text
/opt/workspace-ci/.venv/bin/python
  -> /opt/.workspace-ci.candidate/.boot-linux/python/.../python3.13
```

The target disappeared when the candidate was published and later cleaned.
The deployed virtual environment therefore became unusable.

### 3.2 Candidate-bound Podman configuration

The user Podman configuration retained the same transient path:

```toml
[engine]
helper_binaries_dir = ["/opt/.workspace-ci.candidate/.boot-linux/bin"]
conmon_path = ["/opt/.workspace-ci.candidate/.boot-linux/bin/conmon"]

[engine.runtimes]
crun = ["/opt/.workspace-ci.candidate/.boot-linux/bin/crun"]
```

Podman initialization then failed while resolving `netavark`, `conmon`, and
`crun`.

### 3.3 Protected hook failure

Generated hooks invoke the deployed virtual environment directly:

```text
/opt/workspace-ci/.venv/bin/python -m ci.<check>
```

Because that interpreter link was dangling, protected commit and push
operations could not complete.

### 3.4 ClickHouse inode exhaustion

The root filesystem retained substantial free byte capacity but had only 2,897
free inodes in the last measurement:

```text
Filesystem inodes: 60,850,176
Used inodes:       60,847,279
Free inodes:            2,897
```

The recorded inode audit attributes 54,256,736 filesystem objects to:

```text
${HOME}/.local/share/containers/storage/volumes/docker_clickhouse-data/
_data/store/9f2/9f22ffe3-5d3d-49d6-833a-d9ddaa44f23a
```

Read-only Atomic database metadata maps the UUID to `system.metric_log`:

```text
system/metric_log.sql:
ATTACH TABLE _ UUID '9f22ffe3-5d3d-49d6-833a-d9ddaa44f23a'
```

The table is a monthly partitioned `MergeTree` containing ClickHouse internal
metrics history, not application request or billing data. Its metadata has no
TTL. The inode audit shows large numbers of `delete_tmp_tmp_merge_*`
directories. ClickHouse source identifies `tmp_` and `delete_tmp_` directories
as incomplete or deletion-stage temporary directories cleaned during
`MergeTree` startup, but host deletion remains prohibited; ClickHouse must own
that cleanup.

### 3.5 Gateway lifecycle masking

The Gateway systemd unit remained active while its foreground Compose startup
was wedged and ClickHouse was absent. Unit activity therefore did not prove
required-service readiness.

The unit's stop operation stopped containers but did not remove them. A later
manual dependency-removal attempt removed APISIX before Podman rejected the
remaining removals. This demonstrated why Compose, rather than ad hoc Podman
commands, must own project dependency ordering.

## 4. Root Causes

### 4.1 Runtime construction occurred at the wrong logical path

Python virtual environments and Podman runtime configuration are not safely
relocatable by directory rename. Building them at the physical candidate path
and publishing them at `/opt/workspace-ci` created invalid absolute metadata.

### 4.2 Deployment-control code crossed into the target artifact

The repair initially resolved new namespace and verification helpers through
the candidate:

```text
$CANDIDATE/scripts/run-candidate-namespace
$CANDIDATE/ci/verify_candidate_paths.py
```

Current upstream does not contain those new repair files. Requiring the old
artifact to supply them recreates the bootstrap deadlock.

Deployment-control primitives must resolve from the operator-reviewed writable
provisioner. The candidate supplies the exact reviewed artifact and its normal
build definitions, not new machinery required to repair deployment.

### 4.3 Hook generation bypassed the runtime launcher

The hook generator converts `uv run python -m ci.*` to direct
`.venv/bin/python` execution. This increases coupling to one generated link and
contradicts the repository policy that cross-artifact Python execution must use
the deployed runtime launcher.

### 4.4 Podman bootstrap mutated persistent configuration during construction

Podman bootstrap wrote directly to the deployment owner's persistent
`~/.config/containers` directory. Candidate construction therefore leaked its
current logical path outside the candidate and could affect the running host
before publication completed.

### 4.5 Post-publication cleanup was not failure-complete

After atomic exchange, the displaced old artifact occupies the fixed candidate
path. If a later operation fails before explicit candidate cleanup, cleanup
must still remove that displaced tree. A publication marker must not suppress
required post-publication cleanup.

### 4.6 Gateway service activity was treated as readiness

`Type=simple` tracks the foreground Compose process. It does not by itself
prove that ClickHouse and every required service exist and are healthy. The
deployment flow lacked a final required-container and endpoint acceptance
boundary before reporting success.

### 4.7 ClickHouse recovery was designed before table identification

The pathological UUID, table role, active parts, inactive parts, mutations,
and temporary merge artifacts were not conclusively identified before a reset
operation was proposed. This inverted the required order of evidence and
action.

### 4.8 Container dependencies were duplicated outside Compose

Ansible attempted to remove named containers directly. Podman correctly
rejected removal when dependent containers remained. Compose already contains
the dependency graph and teardown implementation; duplicating it created an
incorrect and partial operation.

## 5. Rejected Approaches

### 5.1 Runtime path rewriting

Searching and replacing candidate path bytes in virtual environments, scripts,
or binaries is rejected. Runtime metadata may be binary, undiscovered, or
semantically non-relocatable. Runtimes must be created at their final logical
path.

### 5.2 Candidate-owned repair helpers

Using new helpers from the old candidate is rejected because it requires the
repair to be present upstream before the repair can enable commit and push.

### 5.3 Hook bypass

Skipping protected hooks does not repair the installed runtime and violates the
protected workflow. The deployed artifact must be rebuilt so the hooks execute
normally.

### 5.4 Direct installed-artifact mutation

Editing files or links below `/opt/workspace-ci` is rejected. The complete
artifact must be rebuilt and atomically republished.

### 5.5 Complete ClickHouse volume reset

Deleting `docker_clickhouse-data` is rejected because it destroys all
ClickHouse data. It is not a data-preserving recovery mechanism.

The corresponding Gateway whole-volume clean and ClickHouse reset entrypoints
have been removed from executable source. Ordinary Gateway lifecycle commands
now preserve every named volume.

### 5.6 Direct temporary-directory deletion without proof

Names such as `tmp_merge_*` or `delete_tmp_*` are not sufficient authorization
for deletion. The table, ClickHouse version semantics, server state, and exact
artifact class must be established first.

### 5.7 Manual container dependency removal

Removing APISIX, Vector, and ClickHouse with direct Podman commands is rejected.
Compose owns and already implements dependency-aware project teardown.

The invalid per-container reset operation has been removed. Recovery used
Compose to recreate the affected services without `-v`; every named volume was
preserved.

## 6. Required WORKSPACE-CI Solution

### 6.0 Deployment Interpreter Inventory

The deployment path currently contains eight non-hermetic system-interpreter
executions in `scripts/deploy-ci`:

| Operation | Invocation |
| --- | --- |
| Candidate cleanup unseal | `/usr/bin/python3 "$ATTRS" unseal-candidate` |
| Cleanup deployed-root reseal | `/usr/bin/python3 "$ATTRS" seal-deployed` |
| Candidate-path verification | `/usr/bin/python3 "$VERIFY_PATHS" "$CANDIDATE"` |
| Candidate descendant sealing | `/usr/bin/python3 "$ATTRS" seal-candidate` |
| Candidate-root unseal | `/usr/bin/python3 "$ATTRS" unseal-candidate-root` |
| Deployed-root unseal | `/usr/bin/python3 "$ATTRS" unseal-deployed` |
| Atomic directory exchange | `/usr/bin/python3 "$CANDIDATE/ci/atomic_exchange.py" ...` |
| Final deployed-root seal | `/usr/bin/python3 "$ATTRS" seal-deployed` |

The post-publication import check in `scripts/deploy-ci` and the independent
Ansible runtime check are hermetic: both execute Python through deployed
`/opt/workspace-ci/.boot-linux/bin/uv` with `--project`, `--no-sync`, and the
final artifact path.

The banned-word scanner did not report the eight system calls because
`config/banned_words.yaml` exempts `\bpython3?\b` for every shell and Python
file and separately exempts all `scripts/` paths. Those blanket exceptions
neutralize the deprecated-Python rule for deployment code. Remediation must
remove the blanket exceptions, add a non-exemptible absolute-system-interpreter
rule for deployment paths, and retain only exact justified exceptions.

### 6.0.1 Enforcement-Gap Inventory

The following incident patterns were not prevented by either protected commit
checks or the installed shell guard. "Removed" means the current remediation
diff removes the instance; it does not mean the enforcement gap is fixed.

| Pattern | Observed consequence | Why commit checks missed it | Why shell guard missed it | Status |
| --- | --- | --- | --- | --- |
| Absolute `/usr/bin/python3` execution | Eight non-hermetic deployment operations | Blanket `python3?` exceptions cover `.sh`, `.py`, and `scripts/` | `alt-interp` matches bare interpreter names, not absolute paths, and command scope does not inspect trusted script semantics | Present |
| Python indirection around blocked filesystem operations | `chattr` and atomic exchange execute behind Python | Same blanket Python exceptions | Guard scans shell text, not subprocess behavior inside Python | Present |
| Ansible `command`/`shell` result buffering | Deployment appeared frozen for minutes | Silent-output detector treated later `debug` replay as acceptable | Guard sees `ansible-playbook`, not task execution semantics | Removed locally; repository findings remain |
| Nominal stream variable without a consumed sink | Detector accepted `CI_STREAM_OUTPUT` although direct commands still buffered | Detector checked marker presence rather than data flow | Guard has no cross-process output-flow model | Removed |
| `/dev/tty` output redirection inside Ansible | Task failed because the module had no controlling terminal | No deployment-context terminal rule | Redirection is not destructive or suppressed output | Removed |
| Make `@` recipe suppression | Operator command was hidden | No effective rule existed before the new silent-output pattern | Guard executes the hidden command but does not control Make display | Removed |
| Direct `bash.real` invocation | Namespace bypassed the normal guarded Bash path | No effective protected-path rule covered namespace helpers | Guard cannot intercept execution that bypasses it | Removed |
| Hiding `bash.real` while invoking guarded Bash | Guard failed closed because its backing shell disappeared | No guard-contract integration test ran as root | Failure occurs inside the guard after static policy scanning | Removed |
| Candidate bootstrap using live `HOME` | Candidate wrote live user Podman configuration | No namespace-home isolation rule or generated-output assertion | Guard strips environment overrides but does not detect destination semantics | Removed locally; root proof pending |
| Required generated Podman files absent | Failure occurred only after publication | Candidate verifier did not require those outputs | Guard does not verify artifact completeness | Removed locally; live acceptance pending |
| Per-descendant `lsattr | awk | grep` loop | Hundreds of thousands of pipelines and trace lines | No process-amplification or per-path-loop rule | Every individual command is allowed | Removed |
| Unbounded xtrace of bulk verification | Successful paths flooded operator output | No bulk-output-volume rule | Guard does not reason about shell tracing volume | Removed |
| Long silent recursive deployment phases | No timely indication of the active operation | No provisioning observability contract | Commands are valid and non-destructive | Partially remediated |
| Failed deployment log owned only by root | Retained diagnostics were unreadable to the source owner | No failure-artifact ownership test | Guard does not manage log ownership | Removed |
| Failed log deleted while `tail` remained alive | Tail warned after log removal and diagnostics raced | No interruption lifecycle test | Multi-process lifecycle ordering is outside command regexes | Removed |
| Candidate helper resolution through candidate checkout | Repair helper was absent from exact upstream candidate | No writable-provisioner boundary check | All individual path executions were allowed | Removed |
| `/proc/self/fd` script sibling resolution | Namespace helper could not resolve or execute sibling files | No file-descriptor entrypoint test | Guard classified FD-backed script paths separately but did not validate sibling resolution | Removed |
| Candidate physical-path runtime coupling | Generated runtime could fail after rename | Earlier checks did not execute all final-path runtimes | Guard does not inspect generated runtime metadata | Locally addressed; acceptance pending |
| Post-publication cleanup only on selected paths | Displaced candidate could remain after later failure | Missing failure-complete cleanup test | Cleanup control flow is outside regex policy | Removed locally; acceptance pending |
| Destructive Gateway lifecycle targets | `down -v` and volume-reset routes could delete persistent data | No lifecycle-wide persistent-data rule covered existing source | Guard patterns do not model Compose volume semantics through wrappers | Removed locally; scanner gap remains |
| Guard state-purge target and stale manifest entries | Ordinary lifecycle exposed destructive Guard state removal | Policy/generated files retained blanket exceptions and stale data | Guard protects command execution, not its own source manifest completeness | Executable path removed; manifest pending |
| ClickHouse internal metric logs without inode controls | Temporary merge trees exhausted host inodes | No operational-resource or system-table policy check | Not a shell-command pattern | Source prevention added; observation pending |

Protected commit hooks also cannot inspect changes before a commit is attempted.
During this incident the deployment bootstrap itself was required to repair the
hooks, so repeated uncommitted root deployment runs exercised writable source
that had not passed a protected commit transaction. `make check-push` did run,
but the blanket exceptions and missing semantic detectors above allowed these
patterns through.

### 6.1 Writable provisioner boundary

The operator runs the writable source entrypoint with root authority. That
provisioner must use its own reviewed:

- Ansible orchestration;
- private mount-namespace helper;
- candidate-path verifier;
- publication and cleanup implementation.

The provisioner clones exact reviewed `origin/main` as the artifact input.

### 6.2 Final-logical-path construction

The provisioner must:

1. create `/opt/.workspace-ci.candidate` on the `/opt` filesystem;
2. enter a private mount namespace;
3. preserve access to the physical candidate through a private bind mount;
4. hide the host `/opt` only inside that namespace;
5. bind the physical candidate at `/opt/workspace-ci`;
6. run the artifact's existing build and installation targets through that
   final logical path;
7. leave the host's current `/opt/workspace-ci` untouched until publication.

This is sufficient to make existing upstream Python and Podman build logic
generate `/opt/workspace-ci` paths during the bootstrap repair.

### 6.3 Candidate verification

Before publication, verification must:

- scan runtime symlinks and regular-file metadata for the physical candidate
  path;
- execute the Python interpreter and required imports through
  `/opt/workspace-ci` inside the namespace;
- execute generated entrypoints;
- execute protected-hook commands in a read-only mode;
- execute Podman and its required helper resolution without touching the
  current host artifact;
- reject every candidate-bound reference.

### 6.4 Podman configuration publication

Candidate construction must not write persistent user Podman configuration.
It must stage `containers.conf` and `registries.conf` inside the candidate using
final `/opt/workspace-ci` paths. After successful artifact publication, the
provisioner installs those reviewed files into the deployment owner's
configuration directory as a separate operation.

### 6.5 Hook execution

Generated hooks must use the deployed `uv` launcher with explicit project and
no-sync arguments. They must not invoke `.venv/bin/python` directly.

### 6.6 Failure-complete cleanup

Cleanup must distinguish:

- pre-publication candidate: remove it while leaving the current artifact
  untouched;
- post-exchange displaced artifact: remove it from the candidate path even if
  later verification or hook installation fails.

The new deployed artifact remains current after a post-publication failure; no
rollback exchange occurs.

### 6.7 Bootstrap deployment sequence

The first corrected deployment may publish the unchanged current upstream
commit. Its purpose is to rebuild generated runtime content at the final
logical path and restore functional protected hooks. After those hooks work,
the permanent source remediation can be committed, pushed, and deployed as the
new exact upstream revision through the same entrypoint.

## 7. Required ClickHouse Recovery Investigation

No destructive ClickHouse recovery step is approved by this audit. The next
work is evidence collection.

### 7.1 Table identification

Map UUID `9f22ffe3-5d3d-49d6-833a-d9ddaa44f23a` through ClickHouse metadata to:

- database;
- table;
- engine;
- table purpose;
- partition key;
- active mutations;
- active and inactive part counts.

If ClickHouse cannot start, use read-only metadata files and documented
ClickHouse on-disk metadata structure. Do not infer the table solely from
directory names.

### 7.2 Artifact classification

For the identified table, classify inode consumers as:

- committed active parts;
- committed inactive parts;
- detached parts;
- incomplete temporary merge output;
- incomplete insert output;
- mutation output;
- ClickHouse internal telemetry.

The classification must cite ClickHouse 24.8 behavior or source documentation.

### 7.3 Recovery proof

Before host mutation:

1. reproduce or copy representative metadata into an isolated fixture;
2. prove the proposed recovery does not remove committed parts;
3. prove ClickHouse can attach or start with the remaining metadata;
4. define exact preconditions and failure behavior;
5. obtain independent review of the mutation set.

If sufficient inode capacity cannot be created without deleting uncommitted
artifacts, the procedure must state that constraint explicitly. It must not
silently convert the operation into a full volume reset.

## 8. Required Gateway Solution

### 8.1 Stable runtime path

Gateway provisioning must resolve Podman and CI tooling only from:

```text
/opt/workspace-ci
```

No unit, Make target, hook, or generated configuration may resolve a sibling
`projects/CI` checkout or the physical candidate path.

### 8.2 Compose lifecycle ownership

Gateway teardown and recreation must use Compose. If a data-preserving
ClickHouse recovery eventually requires containers to be absent, the lifecycle
boundary is:

```text
systemd user service stop
podman-compose down without -v
verified recovery operation
normal Compose/Ansible deployment
```

This sequence removes and recreates containers while preserving all named
volumes. It does not authorize deleting the ClickHouse volume.

### 8.3 Ingestion isolation

ClickHouse must start and pass recovery checks before Vector and APISIX resume.
The current startup script starts ClickHouse and then immediately proceeds to
Vector and other services. Recovery mode needs an explicit boundary that keeps
writers stopped until ClickHouse verification succeeds.

### 8.4 Readiness acceptance

Gateway deployment must not report success based only on systemd activity. It
must verify:

- every required container exists;
- every required container is running;
- ClickHouse responds and reports expected tables;
- Vector's sink is healthy;
- APISIX, Admin API, OpenBao, etcd, Prometheus, and Grafana endpoints respond;
- no Compose startup process remains wedged;
- logs contain no repeated merge, insert, helper-path, or missing-container
  failures.

## 9. ClickHouse Recurrence Prevention

After data-preserving recovery, recurrence controls must be applied and
verified on the running tables.

### 9.1 Insert batching

- Vector request logging must use bounded batches large enough to avoid one
  part per event.
- Direct APISIX usage inserts must use ClickHouse asynchronous inserts with a
  verified busy timeout and wait behavior.
- Retry logic must not duplicate unbounded inserts during ClickHouse pressure.

### 9.2 MergeTree circuit breakers

Every affected MergeTree table must have reviewed limits for:

- `parts_to_delay_insert`;
- `parts_to_throw_insert`;
- `inactive_parts_to_delay_insert`;
- `inactive_parts_to_throw_insert`;
- any applicable total-part limit.

Values must be verified from `system.tables` after deployment, not only from
schema source text.

### 9.3 Operational monitoring

Acceptance must record and monitor:

- active parts by table and partition;
- inactive parts;
- pending and failed mutations;
- merge queue age;
- asynchronous insert queue behavior;
- filesystem inode consumption;
- insert rejection and delay events.

Ingestion resumes only after these values remain bounded during an observation
window.

## 10. Execution Order

The following order is mandatory because each stage establishes prerequisites
for the next:

1. review and correct the writable CI provisioner boundary;
2. complete read-only ClickHouse table and artifact identification;
3. independently approve a data-preserving inode-recovery procedure;
4. keep Gateway and ingestion stopped;
5. execute the proven ClickHouse recovery procedure;
6. verify sufficient inode capacity for a complete concurrent CI candidate;
7. run the normal root-owned CI deployment entrypoint to rebuild current
   upstream at the final logical path;
8. verify Python, Podman, user configuration, hooks, ownership, immutability,
   source identity, and candidate cleanup;
9. run protected source validation;
10. commit and push the permanent CI remediation through functioning hooks;
11. redeploy exact new `origin/main` through the same CI entrypoint;
12. verify mandatory CI first-install, replacement, broken-current, and failure
    injection cases;
13. review and commit Gateway path, batching, readiness, and ClickHouse-limit
    changes;
14. deploy Gateway through its normal user-scoped Ansible and systemd path;
15. start ClickHouse without ingestion and verify recovered data and settings;
16. start Vector and verify bounded inserts;
17. start APISIX and the remaining services;
18. run complete endpoint, log, part-count, and inode acceptance checks.

Any unexpected result invalidates the remaining sequence. The operator must
stop and update the evidence model rather than improvise a new mutation.

## 11. Acceptance Criteria

### 11.1 WORKSPACE-CI

- current artifact may be absent, healthy, or unusable;
- provisioner never executes the current artifact before publication;
- exact upstream identity is preserved;
- candidate is built through `/opt/workspace-ci` in a private namespace;
- host view of the current artifact remains unchanged before publication;
- no runtime metadata contains the physical candidate path;
- Python, Podman, generated entrypoints, and hooks execute before and after
  publication;
- atomic publication succeeds;
- ownership and immutable attributes are verified;
- every failure path removes the candidate or displaced tree as required;
- protected commit and push hooks complete normally.

### 11.2 ClickHouse

- pathological UUID is mapped to a table with evidence;
- no committed data is deleted by recovery;
- recovered tables pass integrity and query checks;
- active and inactive part counts are bounded;
- no failed mutation or merge loop recurs;
- inode use remains stable;
- configured circuit breakers are visible on running tables.

### 11.3 Gateway

- systemd unit is active only with a non-wedged foreground process;
- all required containers exist and run;
- all health endpoints pass;
- Vector and APISIX resume only after ClickHouse acceptance;
- no runtime path references `projects/CI` or the physical candidate;
- no unrelated named volume is changed;
- logs show no repeated ClickHouse merge or Podman helper-path failures.

## 12. Conclusion

The CI deadlock is caused by final-path-sensitive runtime metadata generated at
the transient candidate path. The correct repair is complete artifact
reconstruction through the final logical path under control of the writable
provisioner, followed by normal atomic publication and hook installation.

The Gateway inode incident is a separate data-recovery problem. It cannot be
solved safely by deleting the ClickHouse volume or manually removing dependency
containers. Recovery must begin with exact table identification and documented
classification of committed versus incomplete artifacts, preserve committed
data, and return lifecycle ownership to Compose and ClickHouse.

No remediation is complete until the live acceptance criteria above pass.
