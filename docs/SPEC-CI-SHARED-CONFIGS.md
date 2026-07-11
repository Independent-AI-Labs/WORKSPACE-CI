# INSTRUCTIONS FOR NEXT AGENT, CI: Ansible Bootstrap + Shared mypy.toml + ruff.toml Unification

## CROSS-REPO OVERVIEW

This refactor spans 3 repos. Each has its own spec doc:

| # | Repo | Spec doc | What happens there | Depends on |
|---|------|-----------------|-------------------|------------|
| 1 | `projects/CI` | this file | Create bootstrap-ansible, add install-ansible target, create mypy.toml, unify ruff.toml | nothing (prerequisite) |
| 2 | VM root (`.`) | `docs/SPEC-VM-ROOT-REFACTOR.md` | Delete 6 obsolete files, rewire 7+ files to CI configs, delete dead functions+tests in config_utils.py, fix broken _-impl moon.yml targets | this file |
| 3 | `projects/DATAOPS` | `../DATAOPS/docs/SPEC-DATAOPS-CI-ONLY.md` | Rewrite Makefile (CI-only), fix .pre-commit-config.yaml paths, fix moon.yml, install hooks | this file |

**Execution order**: CI must be done FIRST. After CI is committed, DATAOPS
and VM-root can proceed in parallel (they are independent of each
other).

## SITUATION

CI already bootstraps `uv`, `rust`, `gitleaks`, and `cloc` into its own
`.boot-macos/` (or `.boot-linux/`) directory. Sibling repos inherit
these tools via `moon.yml::inherited_boot_dirs: ['../CI']` and
`ci_resolve_boot_path()`.

DATAOPS additionally needs `ansible-playbook` for its compose/serve/
intake targets. Currently ansible is bootstrapped by a VM-root script
(`workspace/scripts/bootstrap/bootstrap_ansible.sh`) that hardcodes
`.boot-linux` and installs into a VM-root env directory. This
must move to CI so DATAOPS has zero VM dependencies.

CI has `ruff.toml` at its root (shared linter config) but NO
`mypy.toml`. Sibling repos and VM-root currently reference
`res/config/mypy.toml` and `res/config/ruff.toml` (VM root), VM
dependencies that must be eliminated. CI needs its own `mypy.toml` and
its `ruff.toml` must be unified (add `"projects"` to exclude list, for
VM-root which has a `projects/` subdir).

## WHAT TO DO

### 1. Create `scripts/bootstrap-ansible`

Mirror the `bootstrap-gitleaks` / `bootstrap-cloc` pattern exactly:

- Source `lib/ci.sh` for `$CI_PROJECT_ROOT`, `$CI_BOOT_NAME`.
- Verify `$CI_PROJECT_ROOT/$CI_BOOT_NAME/bin/uv` exists (ansible is a
  Python package; uv installs it).
- Install target: `$CI_PROJECT_ROOT/$CI_BOOT_NAME/bin/` (same as
  gitleaks/cloc).
- Use `uv tool install` with `UV_TOOL_BIN_DIR` env var to place
  executables in the boot bin dir:

  ```bash
  # ansible-core provides the executables (ansible-playbook, ansible, etc.).
  # `ansible` (the meta-package) only provides `ansible-community`.
  # Installing ansible-core as the tool and adding `ansible --with passlib`
  # as extras includes the collections and passlib in the same environment.
  UV_TOOL_BIN_DIR="$target_dir" "$uv_bin" tool install ansible-core --with ansible --with passlib --force
  ```

  `--force` ensures re-install if the tool is already installed but
  broken. The idempotency check (below) skips the install entirely if
  ansible-playbook is already present and working.

- Idempotency: if `$target_dir/ansible-playbook` exists and
  `ansible-playbook --version` succeeds, log "already installed" and
  exit 0.
- Post-install: verify `ansible-playbook --version` succeeds.
- `set -euo pipefail`. No `2>/dev/null`, no `|| true`.
- Log prefix: `[bootstrap-ansible]`.
- `ANSIBLE_VERSION` env override is NOT needed, `uv tool install
  ansible` resolves the latest compatible version from PyPI. If pinning
  is needed later, add `ANSIBLE_VERSION` support.

Full script structure (follow `bootstrap-gitleaks` for the exact
header/footer pattern):

```bash
#!/usr/bin/env bash
# bootstrap-ansible: install ansible + passlib executables into the boot bin dir.
#
# This script uses `uv tool install` to create an isolated Python
# environment for ansible, exposing only the executables (ansible,
# ansible-playbook, ansible-galaxy, ansible-vault, etc.) into
# $CI_BOOT_NAME/bin/ via UV_TOOL_BIN_DIR.
#
# Default install location:
#   $CI_PROJECT_ROOT/$CI_BOOT_NAME/bin/
# where $CI_BOOT_NAME is platform-aware (.boot-linux on Linux,
# .boot-macos on macOS), set at source-time by lib/ci.sh.
#
# Override $UV_TOOL_BIN_DIR to install elsewhere.
#
# CI_PROJECT_ROOT (this repo's own root) is delegated to lib/ci.sh.
# Sibling repos reach these executables via ci_resolve_boot_path().
# See: docs/specifications/SPEC-BOOT-LAYOUT.md

set -euo pipefail

_ci_lib="$(cd "$(dirname "${BASH_SOURCE[0]}")/../lib" && pwd)"
# shellcheck source=lib/ci.sh
if ! source "$_ci_lib/ci.sh"; then
    echo "ERROR: failed to source $_ci_lib/ci.sh" >&2
    exit 2
fi
if [[ -z "${CI_PROJECT_ROOT:-}" ]]; then
    echo "ERROR: CI_PROJECT_ROOT not set after sourcing ci.sh" >&2
    exit 2
fi

_log() { printf '[bootstrap-ansible] %s\n' "$*" >&2; }

main() {
    local target_dir uv_bin
    target_dir="${UV_TOOL_BIN_DIR:-${CI_PROJECT_ROOT}/${CI_BOOT_NAME}/bin}"
    uv_bin="${CI_PROJECT_ROOT}/${CI_BOOT_NAME}/bin/uv"

    if [[ ! -x "$uv_bin" ]]; then
        _log "ERROR: uv not found at $uv_bin, run 'make install-boot-tools' first"
        return 1
    fi

    # Idempotency: skip if ansible-playbook already works.
    if [[ -x "$target_dir/ansible-playbook" ]]; then
        if "$target_dir/ansible-playbook" --version > /dev/null 2>&1; then
            local v
            v="$("$target_dir/ansible-playbook" --version 2>&1)"
            v="${v%%$'\n'*}"
            _log "ansible already installed: $v"
            return 0
        fi
        _log "existing ansible-playbook at $target_dir is broken; re-installing"
    fi

    _log "installing ansible + passlib via uv tool..."
    if ! mkdir -p "$target_dir"; then
        _log "mkdir failed for $target_dir"
        return 1
    fi

    UV_TOOL_BIN_DIR="$target_dir" "$uv_bin" tool install ansible --with passlib --force

    # Post-install verification.
    local v_out v_rc=0
    v_out="$("$target_dir/ansible-playbook" --version 2>&1)" || v_rc=$?
    if [[ "$v_rc" -ne 0 ]]; then
        _log "post-install verification failed: ansible-playbook --version returned rc=$v_rc"
        _log "$v_out"
        return 1
    fi
    _log "installed: ${v_out%%$'\n'*} => $target_dir/ansible-playbook"
}

main "$@"
```

### 2. Add `install-ansible` target to `Makefile`

After `install-cloc` (line 104), add:

```makefile
.PHONY: install-ansible
install-ansible: install-boot-tools ## Bootstrap ansible + passlib into $(BOOT_NAME)/bin
	bash scripts/bootstrap-ansible
```

NOTE: `install-ansible` depends on `install-boot-tools` because
`bootstrap-ansible` needs `uv` to be present. This matches the pattern
of `install-python-deps`, which also depends on `install-boot-tools`.

Update `install-deps` (line 87) to include `install-ansible`:

```makefile
install-deps: install-boot-tools install-python-deps install-gitleaks install-cloc install-ansible ## Install boot tools, deps, gitleaks, cloc, and ansible
```

### 3. Unify `ruff.toml`, add `"projects"` to exclude

The VM-root `res/config/ruff.toml` excludes `"projects"` (VM has a
`projects/` subdir). CI's `ruff.toml` excludes `".boot-macos"` but NOT
`"projects"`. CI has no `projects/` subdir, so adding `"projects"` is a
no-op for CI itself and harmless for DATAOPS (no `projects/` subdir
either). But it is REQUIRED for VM-root to use `CI/ruff.toml` as its
single source of truth.

Change line 1 of `CI/ruff.toml`:

```diff
-exclude = ["__pycache__", "*.egg-info", ".venv", ".git", "node_modules", ".pytest_cache", ".boot-linux", ".boot-macos"]
+exclude = ["__pycache__", "*.egg-info", ".venv", ".git", "node_modules", ".pytest_cache", ".boot-linux", ".boot-macos", "projects"]
```

This makes `CI/ruff.toml` the unified ruff config for ALL repos: CI,
DATAOPS, GUARD, and VM-root.

### 4. Create `mypy.toml` at CI root

This is the **shared strict mypy config** for all sibling repos AND
VM-root. It lives at `projects/CI/mypy.toml`, next to the existing
`projects/CI/ruff.toml`.

**Allowlist**: ONLY `ignore_missing_imports = true` for third-party
libraries that genuinely lack type hint packages. NO exemptions on project code.
NO `disallow_subclassing_any = false`, NO `disallow_untyped_calls =
false`, NO `disallow_untyped_decorators = false`, NO `warn_return_any =
false` on any project module.

```toml
[tool.mypy]
strict = true
plugins = ["pydantic.mypy"]
warn_unused_configs = true
namespace_packages = true
explicit_package_bases = true
exclude = [
    "(?x)(^tmp/|^.venv/|^venv/|^dist/|^build/|^.eggs/|^__pycache__/|.*\\.egg-info/|^.pytest_cache/|^.git/|^\\.boot-linux/|^\\.boot-macos/)"
]

# Third-party libraries without type hint packages.
# Only ignore_missing_imports is allowed here. No disallow_* relaxations.

[[tool.mypy.overrides]]
module = "sklearn.*"
ignore_missing_imports = true

[[tool.mypy.overrides]]
module = "scipy.*"
ignore_missing_imports = true

[[tool.mypy.overrides]]
module = "matplotlib.*"
ignore_missing_imports = true

[[tool.mypy.overrides]]
module = "seaborn.*"
ignore_missing_imports = true

[[tool.mypy.overrides]]
module = "tqdm.*"
ignore_missing_imports = true

[[tool.mypy.overrides]]
module = "fitz.*"
ignore_missing_imports = true

[[tool.mypy.overrides]]
module = "psutil.*"
ignore_missing_imports = true

[[tool.mypy.overrides]]
module = "boto3.*"
ignore_missing_imports = true

[[tool.mypy.overrides]]
module = "botocore.*"
ignore_missing_imports = true

[[tool.mypy.overrides]]
module = "questionary"
ignore_missing_imports = true

[[tool.mypy.overrides]]
module = "questionary.*"
ignore_missing_imports = true

[[tool.mypy.overrides]]
module = "rich.*"
ignore_missing_imports = true

[[tool.mypy.overrides]]
module = "transformers.*"
ignore_missing_imports = true

[[tool.mypy.overrides]]
module = "datasets.*"
ignore_missing_imports = true

[[tool.mypy.overrides]]
module = "accelerate.*"
ignore_missing_imports = true

[[tool.mypy.overrides]]
module = ["googleapiclient", "googleapiclient.*"]
ignore_missing_imports = true

[[tool.mypy.overrides]]
module = ["google_auth_oauthlib", "google_auth_oauthlib.*"]
ignore_missing_imports = true

[[tool.mypy.overrides]]
module = ["google.auth", "google.auth.*"]
ignore_missing_imports = true

[[tool.mypy.overrides]]
module = ["google.oauth2", "google.oauth2.*"]
ignore_missing_imports = true

[[tool.mypy.overrides]]
module = ["rust_ta", "rust_ta.*"]
ignore_missing_imports = true

[[tool.mypy.overrides]]
module = "mlflow.*"
ignore_missing_imports = true

[[tool.mypy.overrides]]
module = "uuid_utils.*"
ignore_missing_imports = true

[[tool.mypy.overrides]]
module = "ahocorasick"
ignore_missing_imports = true

[[tool.mypy.overrides]]
module = "ahocorasick.*"
ignore_missing_imports = true

[[tool.mypy.overrides]]
module = "torch"
ignore_missing_imports = true

[[tool.mypy.overrides]]
module = "torch.*"
ignore_missing_imports = true

[[tool.mypy.overrides]]
module = "torch.xpu.*"
ignore_missing_imports = true

[[tool.mypy.overrides]]
module = "intel_extension_for_pytorch"
ignore_missing_imports = true

[[tool.mypy.overrides]]
module = ["optimum", "optimum.*"]
ignore_missing_imports = true

[[tool.mypy.overrides]]
module = ["pydgraph", "pydgraph.*"]
ignore_missing_imports = true

[[tool.mypy.overrides]]
module = ["asyncpg", "asyncpg.*"]
ignore_missing_imports = true

[[tool.mypy.overrides]]
module = "yaml"
ignore_missing_imports = true

[[tool.mypy.overrides]]
module = ["hvac", "hvac.*"]
ignore_missing_imports = true

[[tool.mypy.overrides]]
module = ["fastapi", "fastapi.*"]
ignore_missing_imports = true

[[tool.mypy.overrides]]
module = ["prefect", "prefect.*"]
ignore_missing_imports = true

[[tool.mypy.overrides]]
module = ["httpx", "httpx.*"]
ignore_missing_imports = true

[[tool.mypy.overrides]]
module = ["aiohttp", "aiohttp.*"]
ignore_missing_imports = true

[[tool.mypy.overrides]]
module = ["pandas", "pandas.*"]
ignore_missing_imports = true

[[tool.mypy.overrides]]
module = "tabulate"
ignore_missing_imports = true

[[tool.mypy.overrides]]
module = ["sqlalchemy", "sqlalchemy.*"]
ignore_missing_imports = true

[[tool.mypy.overrides]]
module = ["bcrypt", "jwt", "jwt.*"]
ignore_missing_imports = true

[[tool.mypy.overrides]]
module = ["pydantic", "pydantic.*"]
ignore_missing_imports = true

[[tool.mypy.overrides]]
module = "loguru"
ignore_missing_imports = true

[[tool.mypy.overrides]]
module = "art"
ignore_missing_imports = true
```

NOTE: The VM-root `res/config/mypy.toml` had `mypy_path = ".:projects/CI:projects/DATAOPS"`
and `exclude` entries for `"^projects/"` and `"^tests/"`. These are
VM-specific (VM-root scans its own `workspace/` package, not `projects/`
or `tests/`). The VM-root docs/SPEC-VM-ROOT-REFACTOR.md handles adding these
VM-specific settings to the VM-root `pyproject.toml` `[tool.mypy]`
section (which mypy auto-discovers), NOT to `CI/mypy.toml`.

### DELETED OVERRIDES (security violations, NOT in the new file)

These were found in the VM-root `res/config/mypy.toml` and are
ILLEGITIMATE project-code exemptions. They must NOT appear in
`CI/mypy.toml`:

| Module(s) | Illegitimate relaxation | Why it's a violation |
|-----------|------------------------|---------------------|
| `ami.scripts.backup.common.auth`, `dataops.backup.common.auth` | `disallow_untyped_calls = false` | Project code exempted from typed-call enforcement |
| `src.models.*`, `src.training.loss`, `src.data.processing.loader`, `src.types.data` | `disallow_subclassing_any = false`, `disallow_untyped_decorators = false`, `disallow_untyped_calls = false` | Project code exempted from subclass/decorator/call typing |
| `src.delivery.api.*`, `src.core.tasks` | `disallow_untyped_decorators = false` | Project code exempted from decorator typing |
| `src.core.security`, `src.utils.device`, `src.evaluation.autoregressive`, `src.training.trainer`, `src.data.execution.worker` | `warn_return_any = false` | Project code allowed to return untyped values |

Also removed from `google.auth` and `google.oauth2` overrides:
`disallow_untyped_calls = false` (kept their `ignore_missing_imports`).

## EXACT STEPS TO EXECUTE

### Step 1: Create `scripts/bootstrap-ansible`

Use the `write` tool. Make it executable:

```bash
chmod +x projects/CI/scripts/bootstrap-ansible
```

### Step 2: Modify `Makefile`, add `install-ansible`

- Add `.PHONY: install-ansible` + target after `install-cloc` (line 104).
- Add `install-ansible` to `install-deps` deps (line 87).

### Step 3: Modify `ruff.toml`, add `"projects"` to exclude

Change line 1: append `"projects"` to the exclude list (before closing
bracket).

### Step 4: Create `mypy.toml`

Use the `write` tool to create `projects/CI/mypy.toml` with the exact
content from section 4 above.

### Step 5: Run `make install-ansible`

```bash
cd /Users/vladislavdonchev/WORKSPACE-VM/projects/CI
make install-ansible
```

Verify ansible-playbook is bootstrapped:

```bash
ls .boot-macos/bin/ansible-playbook
.boot-macos/bin/ansible-playbook --version
```

### Step 6: Commit

```bash
git add -A
git commit -m "feat: bootstrap-ansible + shared mypy.toml + unified ruff.toml"
```

### Step 7: Signal downstream repos can proceed

After CI is committed, the VM-root docs/SPEC-VM-ROOT-REFACTOR.md and
DATAOPS/docs/SPEC-DATAOPS-CI-ONLY.md can both be executed in parallel. They depend
on CI having `mypy.toml`, `ruff.toml` (with "projects"), and
`scripts/bootstrap-ansible` committed.

## CRITICAL RULES

1. **NO project-code exemptions in mypy.toml.** Only `ignore_missing_imports`
   for third-party libs without type hint packages. No `disallow_* = false`, no
   `warn_return_any = false` on project modules.
2. **No `2>/dev/null`, `|| true`** in bootstrap-ansible or Makefile.
3. **`bootstrap-ansible` mirrors `bootstrap-gitleaks` pattern**: sources
   `ci.sh`, uses `$CI_BOOT_NAME`, idempotent, post-install verification.
4. **`install-ansible` depends on `install-boot-tools`** (needs uv).
5. **mypy.toml lives at CI root** (next to ruff.toml), not in a
   `res/config/` subdirectory.
6. **ruff.toml must include `"projects"` in exclude**, harmless for
   CI/DATAOPS/GUARD (no `projects/` subdir), required for VM-root.
7. **CI is the prerequisite for both VM-root and DATAOPS**, those
   repos repoint their configs to `CI/ruff.toml` and `CI/mypy.toml`. If
   CI's files do not exist and are not committed first, those repos
   will have broken linter/type-checker configs.

## REFERENCE FILES

- `projects/CI/scripts/bootstrap-gitleaks`, pattern to mirror (sources
  ci.sh, idempotency check, post-install verify).
- `projects/CI/scripts/bootstrap-cloc`, same pattern, Perl single-file
  variant.
- `projects/CI/scripts/bootstrap-uv`, shows how uv itself is
  bootstrapped (used by bootstrap-ansible to install ansible).
- `projects/CI/Makefile`, lines 86-104 show `install-deps`,
  `install-gitleaks`, `install-cloc` targets.
- `projects/CI/ruff.toml`, existing shared linter config at CI root
  (being modified in this task).
- `projects/CI/docs/specifications/SPEC-BOOT-LAYOUT.md`, boot layout
  spec: "A repo writes only to its own boot directory."
- `../docs/SPEC-VM-ROOT-REFACTOR.md`, VM-root cleanup
  plan: deletes 6 obsolete files, rewires 7 files to CI configs, removes
  dead functions+tests, fixes broken `_-impl` targets.
- `../DATAOPS/docs/SPEC-DATAOPS-CI-ONLY.md`, DATAOPS Makefile rewrite,
  config repointing, hook installation.

## EXPECTED END STATE

- `CI/scripts/bootstrap-ansible` exists, is executable, sources `ci.sh`,
  installs `ansible` + `passlib` into `$CI_BOOT_NAME/bin/` via
  `uv tool install`.
- `CI/Makefile` has `install-ansible` target (depends on
  `install-boot-tools`), included in `install-deps`.
- `CI/ruff.toml` has `"projects"` in its exclude list (unified for all
  repos including VM-root).
- `CI/mypy.toml` exists at CI root with strict config and only
  third-party `ignore_missing_imports` overrides. Zero project-code
  exemptions.
- `make install-ansible` bootstraps ansible into `.boot-macos/bin/`.
- `ansible-playbook --version` works from CI's boot dir.
- Sibling repos (DATAOPS, GUARD) and VM-root inherit ansible via
  `ci_resolve_boot_path()` reading `inherited_boot_dirs: ['../CI']`.
- VM-root and DATAOPS can now repoint their linter configs to
  `CI/ruff.toml` and `CI/mypy.toml`, eliminating all `res/config/`
  references.