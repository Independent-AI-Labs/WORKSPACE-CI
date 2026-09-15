# Namespace Migration Tracker

Consolidated tracking for the removal of all `AMI`-era and other obsolete
identifiers across the workspace. Executed in source on 2026-09-14; the
operator items at the bottom are the only open work.

Mapping (old -> new):

| Old                       | New                          | Class          |
| ------------------------- | ---------------------------- | -------------- |
| `AMI-SRP` / `ami-srp`     | `WORKSPACE-RP` / `workspace-rp` | repo name   |
| `AMI-DATAOPS`             | `WORKSPACE-DATAOPS`          | repo name      |
| `AMI-AGENTS` / `ami-agents` | `WORKSPACE-VM` / `workspace-vm` | repo name |
| `AMI-PORTAL`              | `WORKSPACE-PORTAL`           | repo name      |
| `AMI-CI`                  | `WORKSPACE-CI`               | repo name      |
| `@ami/srp-tasks`          | `rp-tasks`                   | npm package    |
| `@ami/ui`                 | `@workspace/ui`              | npm scope      |
| `packages/ami-ui/`        | `packages/workspace-ui/`     | package dir    |
| `ami-tasks` / `ami-objects` | `rp-tasks` / `rp-objects`  | CLI binaries   |
| `@ami(` directive (graphql) | `@workspace(`               | schema language |
| `ami.*` graphql namespaces | `workspace.*`                | schema language |
| `AMI_DATA_ROOT`           | `WORKSPACE_DATA_ROOT`        | env var        |
| `AMI_PROJECT(_ROOT)`      | `WORKSPACE_PROJECT(_ROOT)`   | env var        |
| `AMI_ACTOR`               | `WORKSPACE_ACTOR`            | env var        |
| `AMI_ROOT` / `ami_root`   | `WORKSPACE_ROOT` / `workspace_root` | env/var |
| `AMI_DATA_ROOT` (DATAOPS) | `WORKSPACE_DATA_ROOT`        | env var        |
| `ami-*` compose services/units/CLIs | `workspace-*`       | infra names    |
| `ami_*` env/metrics (DATAOPS) | `WORKSPACE_*`            | env/metrics    |
| `AMI-Signature/-Sender-Id/-Bundle-Id` | `WORKSPACE-*`      | wire headers   |
| `ami_mail` role           | `workspace_mail`             | ansible role   |
| `ami-alertmanager` unit   | `workspace-alertmanager`     | systemd unit   |
| `ami-portal-dev*` units   | `workspace-portal-dev*`      | systemd units  |
| `docs/AMI-MAIL.md`        | `docs/WORKSPACE-MAIL.md`     | doc filename   |
| `schemas/graphql/ami_*.graphql` | `schemas/graphql/workspace_*.graphql` | graphql |
| keycloak realm `ami`      | `workspace`                  | realm default  |
| `*.ami.local`             | `*.workspace.local`          | emails         |
| `ami-show-all`, `ami:doc:*`, `ami-local-edits` | `ws-*` | client storage |
| `srp-*` CSS (task UI)     | `task-*`                     | CSS prefix     |
| `vnd.ami.tasks.v1+json`   | `vnd.workspace.tasks.v1+json`| media type     |

## Execution state

### WORKSPACE-RP - DONE (source)
81+51 files migrated across five passes; graphql schemas renamed;
`[[bin]]` names `rp-tasks`/`rp-objects` (+ `CARGO_BIN_EXE_*` macros);
`coverage.txt` stale artifact deleted; `WS-1` test fixtures; build green,
all workspace tests green. Root-owned leftovers in operator script.

### WORKSPACE-DATAOPS - DONE (source)
86 files + template/test renames (`workspace-intake.service.j2`,
`workspace-compose.service.j2`, `test_workspace_backup_e2e.py`); env vars
(`WORKSPACE_DATA_ROOT`, `WORKSPACE_PROJECT_ROOT`, `WORKSPACE_ACTOR`,
intake/report/backup families); compose services/volumes/units `workspace-*`;
wire headers `WORKSPACE-Signature/Sender-Id/Bundle-Id`; realm default
`workspace`. **Environment fix**: dev extra now carries the full pytest
toolchain; Makefile pins `UV_PROJECT_ENVIRONMENT` to the repo venv so tests
no longer fall through to the umbrella env; `make test` 1212 passed.
Stale `config-staging` drafts removed. One banned-words finding remains,
unblocked by the operator v5 round-trip below.

### WORKSPACE-PORTAL - DONE (source)
219 files; `@workspace/ui` + dir rename; `rp-tasks` dep + runtime specifier;
`workspace-portal-dev*` units; realm defaults; emails; localStorage keys
(`ws-show-all`, `ws:doc:openPaths`); IndexedDB `ws-local-edits`; `task-*`
CSS prefix; `vnd.workspace.tasks` media type; `workspace-ui.css` +
`workspace-logo.svg` renamed; extension bundles cleanly rebuilt (stale
hashed chunks purged); npm lock resynced. `make type-check` green;
swallow gate green. Banned-words gate blocked ONLY on the root-owned
`file_classifications` binary-marker fix (operator script).

### WORKSPACE-STREAMS - DONE (source)
32 files; `workspace_mail` role + `workspace-mail.yml` playbook;
`workspace-alerts.rules`; `workspace-alertmanager.service`;
`docs/WORKSPACE-MAIL.md`; `workspace_sync_worker_router`;
`WORKSPACE_ROOT`; single-brace jinja bug in `inbox-digest-cron.yml`
fixed (`{ ami_cron_bin }` -> `{{ workspace_cron_bin }}`);
`workspace_streams.egg-info` removed. Swallow gate green with ZERO
exemptions (the three legacy entries are dead; removal queued in the
operator script).

### WORKSPACE-VM umbrella - DONE (source)
386 files; `ami.*` -> `workspace.*` module refs; `ami-*` units/scripts
(`workspace-banner.sh`, `workspace_failure_notify.sh`,
`workspace_gitleaks_sweep.sh`, `workspace-web.service`, ...); `OpenAMI` ->
`OpenWORKSPACE`; `_ami_echo`/`_ami_ssh_setup` -> `_workspace_*`;
`workspace-clones.yaml`/`moon.yml`/`.moon/workspace.yml` cleaned;
`workspace-rp` registered as moon source; root pyproject AMI relics
removed; root unit tests 1014 passed. Nine previously-dead (always-skipped)
`bootstrap-repos` tests resurrected, fixture corrected to create the boot
python stub + current clone paths. Vendored `.gcloud` SDK untouched
(an accidental filename corruption was fully reverted; content verified
intact).

### Root env separation (leak fix)
Root pyproject keeps `dataops` editable (root CLIs consume
`dataops.cli_components` as a library - intentional) but NO LONGER carries
DATAOPS test-only deps; DATAOPS is self-sufficient in its own `.venv`.
Moon link kept per operator.

## Operator actions (open, in order)

1. `sudo bash /tmp/opencode/config-namespace-cleanup.sh`
   - PORTAL v5: 10 exemption paths `ami-ui` -> `workspace-ui`
   - DATAOPS v5: intake template exemption path
   - PORTAL `file_classifications.yaml`: delete + mv staged corrected copy
     (binary markers for renamed fonts/logo) - **unblocks PORTAL gate**
   - RP `quality_exceptions.yaml` project -> WORKSPACE-RP
   - STREAMS `silent_swallow_exceptions.yaml`: drop 3 dead legacy entries
2. `sudo bash /tmp/opencode/umbrella-config-fix.sh`
   - `workspace/config/project_enforcement.yaml` reason string
3. `sudo bash /tmp/opencode/portal-dep-excludes.sh`
   - add `rp-tasks` (local `file:` napi dep, unpinnable) to npm_excludes -
     **unblocks PORTAL dependency gate**
4. RP v5-wave file moves still pending from earlier:
   `mv` 7 staged config files into place + `.markdown_docs_exceptions.yaml`
   at repo root, chown root (block provided previously)
5. DATAOPS `.markdown_docs_exceptions.yaml` restore (staged; mv + chown)
6. Deployed-state renames (next deploy cycle): Keycloak realm `workspace`
   recreation; systemd units under new names (portal dev units,
   alertmanager, compose units, umbrella service units); docker
   volumes/services `workspace-*` (migrate data volumes before
   `runtime-up` or data is lost); himalaya fork branch `ami` ->
   `workspace` then flip the two `--branch` refs in STREAMS
7. GitHub-side: `gh repo rename WORKSPACE-RP --repo Independent-AI-Labs/AMI-SRP`;
   `gh repo rename WORKSPACE-DATAOPS --repo .../AMI-DATAOPS`; decide
   AMI-DOCS / AMI-TRADING repo renames (workspace-clones.yaml entries
   still point at the old GitHub names until then); DNS for
   `portal.ami-remote.work` replacement
8. Commits (after 1-5): PORTAL, RP, DATAOPS, STREAMS namespace+migration
   commits, then push

## Notes

- Historical filenames quoted in `docs/proposals/MIGRATION-*.md` are left
  as accurate record of deleted files (frozen migration transcripts).
- `portal.ami-remote.work` FQDN and himalaya `--branch ami` remain
  functional until DNS/branch renames land (items 6-7).
- CI-source follow-up (separate): bare-interpreter regex should recognize
  `uv run --no-project python3` (3 PORTAL exemptions pending on it).
