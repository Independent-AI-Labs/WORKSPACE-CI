# SPEC-SYSTEM-RESOURCES: System and HOME Resource Containment Doctrine

**Date:** 2026-07-27
**Status:** Active
**Type:** Specification

> This document specifies the containment doctrine for system and
> `$HOME` resources across the workspace: no unsanctioned or
> undocumented use of resources outside the workspace. All tools,
> interpreters, and runtimes live inside per-project `.boot-<platform>`
> directories (root-locked, world read+exec). Operational make targets
> never install -- they fail fast with remediation. Installs are
> operator-run elevated targets.

---

## Doctrine

1. **Containment.** Every interpreter, package manager, tool binary,
   and downloaded SDK must resolve inside a `.boot-<platform>` directory
   owned by the project that bootstraps it. Escapes into `$HOME`
   (`~/.local/share/uv`, `~/.cache`, `~/.npm`, ...) or system paths
   (`/usr`, `/opt`, `/usr/local`) are violations unless sanctioned below.
2. **Root-locked, world read+exec.** Boot directories are owned by
   `root:root`, mode `0755`. Agents and services read and execute from
   them; they cannot write.
3. **Operational targets fail fast.** Any make target used at runtime
   (dev servers, tests, builds) must not install or modify the boot
   dir. If a required tool is missing or the boot dir is not writable,
   the target exits non-zero with a remediation message, e.g.
   `ERROR: <tool> missing. Provision: sudo make install-<tool>`.
4. **Installs are elevated, idempotent, per-tool.** Each tool has an
   `install-<tool>` make target that invokes a `scripts/bootstrap-<tool>`
   script. Bootstrap scripts are idempotent (safe re-run, skip when
   current) and contain everything they create inside the boot dir.
5. **Sanctioned escapes are explicit.** The only permitted references
   outside the workspace are listed below; each is documented here.

## Environment-Level Containment

The following environment variables are exported by every project
Makefile (and bootstrap scripts) so package managers never touch
`$HOME`:

| Variable | Value | Purpose |
| --- | --- | --- |
| `UV_PYTHON_INSTALL_DIR` | `<project>/.boot-<platform>/python` | uv-managed interpreter pool |
| `UV_TOOL_DIR` | `<project>/.boot-<platform>/uv-tools` | uv tool environments |
| `UV_CACHE_DIR` | root-local cache (elevated runs) | isolate cache per user |
| `PLAYWRIGHT_BROWSERS_PATH` | `<project>/.boot-<platform>/playwright-browsers` | browser binaries |

`uv python install` must always be invoked with `--no-bin` so it does
not create wrapper links in `~/.local/bin`.

## Domain Layout

| Domain | Boot dir | Owner of bootstrap |
| --- | --- | --- |
| CI (deployed, immutable) | `projects/CI/.boot-<platform>` | `projects/WORKSPACE-CI` promoted via `sudo make deploy-ci` |
| VM root | `WORKSPACE-VM/.boot-<platform>` | `WORKSPACE-VM` root Makefile + `workspace/scripts/bootstrap/` |
| Each project | `projects/<P>/.boot-<platform>` (may inherit) | project's own Makefile |

Boot directories are root-locked after provisioning; promotion of the CI
domain happens only through `sudo make deploy-ci` (deploys from
`origin/main`).

## Sanctioned References (Non-Violations)

The following references to paths outside the workspace are sanctioned
and documented; anything else is a violation to fix.

| Reference | Kind | Rationale |
| --- | --- | --- |
| `/usr/bin/qemu-*` | system binary | VM runtime installed by the OS package manager during `make init` |
| `/usr/share/qemu`, `/usr/share/seabios`, `/usr/share/OVMF*` | system data | QEMU firmware/ROMs shipped by OS packages |
| `/usr/bin/crontab`, cron spool | system service | scheduled tasks registered by operator-run setup |
| `/usr/bin/git*` guard/hook scripts | workspace-owned wiring | scripts installed by the workspace's hook installer |
| Homebrew (linuxbrew / opt prefix) | platform toolchain | macOS/Linux package toolchain owned by `bootstrap-homebrew` |
| Podman system install | system service | container runtime requires system-level installation |
| gcc/clang sysroot pseudo-links | toolchain metadata | compiler-provided paths, not workspace-created files |
| `workspace/scripts/bin/*` wrappers (`oc`, `vm`, `run`, `repo`, `rules`, `ops`, `kcadm`, `vpn`, `welcome`, `pwd`) | internal wiring | workspace-owned wrappers that dispatch into boot-contained tools |

## Violation Classes (Fixed)

Historical escapes eliminated by this program:

- **A. uv interpreter pool in `$HOME`** -- fixed by exporting
  `UV_PYTHON_INSTALL_DIR` in all project Makefiles and bootstrap
  scripts (`bootstrap_python.sh`, `bootstrap_ansible`,
  `bootstrap_certbot`).
- **B. venvs linking into `$HOME` pool** -- fixed by (A) plus recreating
  venvs after the pool is seeded.
- **C. tool CLIs from project `.venv`** -- `playwright` and `opencode`
  now install into the boot dir (`uv tool install` with `UV_TOOL_DIR`,
  `npm install --prefix .boot-linux`); operational scripts reference
  `.boot-<platform>/bin/<tool>` only.
- **D. SDK at workspace root** -- gcloud installs into
  `.boot-<platform>/gcloud` instead of `./.gcloud`.

## Cross-References

- [SPEC-BOOT-LAYOUT](SPEC-BOOT-LAYOUT.md): platform-aware boot dir layout
- [`scripts/deploy-ci`](../../scripts/deploy-ci): promotion pipeline (root tool installs, agent deps)
- [`scripts/bootstrap-ansible`](../../scripts/bootstrap-ansible): uv tool install with `UV_TOOL_DIR`/`UV_PYTHON_INSTALL_DIR` defaults
- [`scripts/bootstrap-certbot`](../../scripts/bootstrap-certbot): boot-contained defaults, fail-fast on non-writable bin
