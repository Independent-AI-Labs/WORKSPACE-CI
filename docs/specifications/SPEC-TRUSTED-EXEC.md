# SPEC-TRUSTED-EXEC: Trusted-Code Service-Killing Pattern Detection

**Date:** 2026-10-04
**Status:** Active; implementation in progress
**Contract:** [`REQ-TRUSTED-EXEC.md`](../requirements/REQ-TRUSTED-EXEC.md)

## 1. Purpose

The runtime shell guard cannot scan trusted code. This check closes that
gap with a deterministic, non-exemptible, blocking static scan of
authored executable code across every consumer repository.

- Hook id: `check-trusted-exec`
- Checker: `lib/check_trusted_exec.py`, reached through the
  `ci_check_trusted_exec` shell function in `lib/checks_core.sh`
- Policy: `config/trusted_exec.yaml` (root-owned, activated by
  `make deploy-ci`)
- Hook kind: `shell`, entry `ci_check_trusted_exec`, stage
  `pre-commit`, `always_run: true`, `pass_filenames: false`,
  `mandatory: true`, `safety: true`, `applicable_to: [any]`
- The checker lives in `lib/` rather than `ci/check_*.py`: the
  required-hooks manifest registers `lib/` shell checks through the
  `ci_*` function contract, which is the bootstrap path a new checker
  can take before the sealed artifact is redeployed.

## 2. Components

| Component | Responsibility |
| --- | --- |
| `lib/check_trusted_exec.py` | Load policy, detect carrier, build views, match rules, report findings |
| `lib/checks_core.sh` | `ci_check_trusted_exec` entry that runs the checker under the sealed runtime |
| `ci/banned_scan/discover.py` | NUL-delimited tracked and untracked discovery (reused) |
| `ci/banned_scan/classify.py` | Exact-file classification and `policy-definition` skip (reused) |
| `ci/inline_code_decode.py` | Raw, normalized, and bounded decoded views (reused) |
| `config/trusted_exec.yaml` | Rule table (root-owned policy) |
| `config/trusted_exec.schema.yaml` | Field documentation |
| `tests/unit/trusted_exec/test_check_trusted_exec.py` | Unit coverage |

The checker MUST NOT reuse the shell guard's runtime pattern table
directly. The runtime table includes command-position and pipe-context
anchors that are correct only against a single command string, not
against a whole source file.

## 3. Policy Shape

```yaml
version: "1.0.0"
decode:
  max_depth: 2
rules:
  - id: port-kill
    mode: raw-regex
    category: port-kill
    flags: [i]
    carriers: [shell, yaml, systemd, makefile, javascript, python, lua]
    pattern: '\bfuser\b[^\x3b|&]*\s-[^\x3b|&\s]*k\b'
    reason: "a port or file-use kill removes whichever process holds the descriptor"
```

- One `version`, one `decode.max_depth`, one `rules` list.
- `exemptions` and `allowed_constructs` are not part of this shape. A
  policy that declares either MUST fail to load.
- Every rule is non-exemptible by construction.
- `carriers` is a nonempty subset of the supported carrier ids. A rule
  absent from a carrier does not apply to it.

## 4. Carriers

| Carrier id | Detection |
| --- | --- |
| `shell` | `.sh`, `.bash`, `.zsh`, `.ksh`, `.ash`, or a shebang naming a shell |
| `yaml` | `.yml`, `.yaml` (ansible, compose, systemd templates) |
| `systemd` | `.service`, `.socket`, `.timer`, `.target`, `.mount`, `.path`, `.slice`, `.scope` |
| `makefile` | `Makefile`, `makefile`, `GNUmakefile`, `*.mk` |
| `javascript` | `.js`, `.mjs`, `.cjs`, `.jsx`, `.ts`, `.tsx` |
| `python` | `.py` |
| `lua` | `.lua` |
| `markdown` | `.md`, `.markdown`, `.mdown` - excluded, never scanned |

A file with no supported carrier is scanned with every rule, so renaming
or removing an extension does not evade detection. Markdown is never
scanned.

## 5. Scan Pipeline

1. Discover files (REQ-TRUSTED-EXEC section 3).
2. Skip definitional files: the checker's fixed `SELF_SKIP` set and any
   file classified `policy-definition` in `config/file_classifications.yaml`.
3. Detect the carrier. Markdown: skip.
4. Read once as strict UTF-8. A NUL byte or invalid encoding fails the
   check.
5. Build views once: `raw`, `normalized`, and bounded `decoded` /
   `decoded-normalized` (base64, hex, percent).
6. For each rule whose carriers match (or whose carrier is unknown),
   match the compiled pattern against every view; de-duplicate by
   location.
7. Report findings in stable order and exit 1 if any exist.

## 6. Rule Table

Patterns are the authored-code forms of the classes in the
service-killing audit. They are matched against the original,
normalized, and decoded views.

Bare program names match ordinary identifiers in source, so every rule
requires a command form: a verb, a flag, or a trailing argument.

| id | category | core pattern |
| --- | --- | --- |
| `service-manager` | service-manager | `systemctl ... (start\|stop\|restart\|reload\|kill\|mask\|enable\|poweroff\|...)` |
| `loginctl-session` | service-manager | `loginctl ... (terminate-session\|kill-session\|terminate-user\|...)` |
| `systemd-run` | service-manager | `systemd-run` |
| `service-verb` | service-manager | `service <unit> (start\|stop\|restart\|...)` |
| `port-kill` | port-kill | `fuser ... -k` |
| `port-pipeline-kill` | port-kill | `(lsof\|ss\|netstat) ... \| ... kill` |
| `process-name-kill` | process-name-kill | `pkill\|killall` followed by a flag or an argument |
| `orphan-remove` | orphan-remove | `--remove-orphans` with no project selector (`-p`/`--project-name`/`-f`/`--file`) on the same command |
| `network-remove` | network-remove | `network (rm\|remove) ... -f` |
| `mass-container-remove` | mass-container-remove | `ps ... -a ... \| xargs ... rm`, `pod ls ... \| xargs ... pod rm` |
| `compose-run-no-deps` | compose-run | `(podman-compose\|podman compose\|docker compose) ... run` without `--no-deps` |

The `compose-run-no-deps` pattern uses a negative lookahead so a command
that passes `--no-deps` is not reported.

Broad package-management program names (user, group, module, firewall,
and mount administration) are deliberately not in this table: they block
at the runtime command channel and, statically, match ordinary
identifiers. They can be added here after the scoped-helper rework
removes the legitimate uses.

The direct tool-invocation classes (`systemctl`, `loginctl`,
`systemd-run`, `service`, and system-admin tooling) are owned by the
runtime shell guard, which blocks them at the agent command channel.
They are deliberately not in this table: statically they name their own
unit or match ordinary identifiers, so a whole-file scan would flag
reviewed deploy scripts without adding coverage. The static lane owns
only ownership-free predicates, which are dangerous in any file.

Measured against the WORKSPACE-CI tree after the rule refinement, the
policy reports no findings. Earlier revisions that also matched
unit-control verbs or bare program names reported reviewed deploy
scripts and ordinary identifiers; those classes belong to the runtime
lane.

## 7. Non-Exemptibility And Self-Reference

- The policy shape has no exemption key; the loader rejects one.
- Definitional files that carry the patterns (the checker, the policy
  and its schema, and the unit test) are listed in the checker's
  `SELF_SKIP` set.
- Additional definitional files are excluded by the exact-file
  `policy-definition` classification in `config/file_classifications.yaml`,
  the same mechanism the sibling content gates use.
- No repository override, glob, environment variable, or configuration
  file can suppress a rule.

## 8. Fail-Closed Behavior

- Missing or invalid policy: exit 1.
- Unreadable or non-UTF-8 discovered file: exit 1.
- A policy that declares `exemptions` or `allowed_constructs`: exit 1.
- An empty `rules` list: exit 1 (an inert gate is a misconfiguration).

## 9. Hook Wiring

- Registered in `config/required_hooks.yaml` (root-owned) with
  `safety: true`.
- Added to `.pre-commit-config.yaml` next to `check-inline-code`.
- Added to the generated `templates/ci-profile.template.yaml` by
  `scripts/scaffold-ci --emit-template`.
- Consumers pick it up on the next scaffold or profile update. Because
  it is `safety: true` and `mandatory: true`, it is installed even at
  `poc` tier and cannot be exempted through `quality_exceptions.yaml`.

## 10. Tests

`tests/unit/trusted_exec/test_check_trusted_exec.py` proves the REQ-TRUSTED-EXEC
acceptance list: per-carrier detection (shell, YAML, systemd, Makefile,
JavaScript, Python, Lua, extensionless shebang), Markdown exclusion,
encoded forms, `--no-deps` allow, composer orphan/network/mass-remove
forms, definitional skip, path independence, and exemption rejection.

## 11. Rollout

The gate is blocking from the first activation; there is no report-only
phase. Three known offender repositories go red until their consumer
fixes land (P-4 and P-5 in the service-killing audit):

- `WORKSPACE-PORTAL` (`res/ansible/dev.yml`, `scripts/server.mjs`,
  `scripts/runner.mjs`)
- `RUST-ZK-PORTAL` (`res/ansible/dev.yml`)
- `WORKSPACE-DATAOPS`
  (`res/ansible/templates/workspace-compose.service.j2`)

Vendored and mirrored repos install no hooks and are unaffected.
