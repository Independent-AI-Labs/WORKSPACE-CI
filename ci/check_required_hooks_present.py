#!/usr/bin/env python3
"""Self-check that validates the CI hook infrastructure of the invoking
project across three invariants. Ensures every check_*.py module is
registered in required_hooks.yaml, quality_exceptions.yaml is schema-valid,
and all applicable mandatory hooks are rendered in .git/hooks. Tier-aware
so POC tier checks only the safety subset while vendored tier passes trivially.

Exit codes: 0 = all invariants hold, 1 = violation, 2 = infrastructure error.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import yaml
from pydantic import BaseModel, ConfigDict, Field

EXIT_OK = 0
EXIT_VIOLATION = 1
EXIT_INFRA_ERROR = 2

REASON_MIN_LEN = 20
WORKSPACE_MARKERS = (".boot-linux", ".boot-macos")

RED = "\033[91m"
YELLOW = "\033[93m"
GREEN = "\033[92m"
DIM = "\033[2m"
RESET = "\033[0m"


class HookEntry(BaseModel):
    """One entry in required_hooks.yaml."""

    model_config = ConfigDict(extra="allow")
    id: str
    kind: str
    entry: str
    stage: str
    mandatory: bool = False
    safety: bool = False
    applicable_to: list[str] = Field(default_factory=lambda: ["any"])


class HooksManifest(BaseModel):
    """Top-level shape of required_hooks.yaml."""

    model_config = ConfigDict(extra="ignore")
    version: int = 1
    hooks: list[HookEntry] = Field(default_factory=list)


class ExceptionEntry(BaseModel):
    """One entry in quality_exceptions.yaml."""

    model_config = ConfigDict(extra="allow")
    hook: str
    reason: str
    paths: list[str] = Field(default_factory=list)
    added_by: str = ""
    ticket: str | None = None


class QualityExceptions(BaseModel):
    """Top-level shape of quality_exceptions.yaml."""

    model_config = ConfigDict(extra="ignore")
    version: int = 1
    project: str = ""
    exceptions: list[ExceptionEntry] = Field(default_factory=list)


def _find_workspace_root(start: Path) -> Path | None:
    """Walk up from start looking for workspace markers.

    Recognized markers (any one suffices):
    - ``.boot-linux/`` directory (original workspace layout)
    - ``config/required_hooks.yaml`` file (flat single-repo layout where
      the project directory IS the workspace root)
    """
    cur = start.resolve()
    while cur != cur.parent:
        if (cur / ".boot-linux").is_dir() or (cur / ".boot-macos").is_dir():
            return cur
        if (cur / "config" / "required_hooks.yaml").is_file():
            return cur
        cur = cur.parent
    return None


def _project_path_relative(workspace_root: Path, project_dir: Path) -> str:
    try:
        return str(project_dir.resolve().relative_to(workspace_root))
    except ValueError:
        return ""


def _registry_source(workspace_root: Path) -> Path | None:
    """Return path to the live registry, or the template if no live file."""
    live = workspace_root / "workspace" / "config" / "project_enforcement.yaml"
    if live.is_file():
        return live
    candidates = [
        workspace_root
        / "projects"
        / "CI"
        / "templates"
        / "project_enforcement.template.yaml",
        workspace_root / "templates" / "project_enforcement.template.yaml",
    ]
    return next((p for p in candidates if p.is_file()), None)


def _load_registry(src: Path) -> dict[str, RegistryValue] | None:
    try:
        loaded = yaml.safe_load(src.read_text(encoding="utf-8"))
    except yaml.YAMLError:
        sys.stderr.write(
            f"Warning: malformed YAML in {src}, using default resolution\n"
        )
        return None
    return loaded if isinstance(loaded, dict) else None


RegistryValue = (
    str | int | float | bool | None | list["RegistryValue"] | dict[str, "RegistryValue"]
)


def _longest_prefix_tier(rel: str, exemptions: RegistryValue) -> str:
    if not isinstance(exemptions, list):
        return ""
    best_path = ""
    best_tier = ""
    for entry in exemptions:
        if not isinstance(entry, dict):
            continue
        ep = str(entry.get("path", "")).rstrip("/")
        if ep and (rel == ep or rel.startswith(ep + "/")) and len(ep) > len(best_path):
            best_path = ep
            best_tier = str(entry.get("tier", ""))
    return best_tier


_VALID_ENFORCEMENT_MODES = frozenset({"warn", "enforce"})


def _resolve_enforcement_mode(workspace_root: Path) -> str:
    """Mirror of lib/checks_quality.sh::ci_resolve_enforcement_mode in Python.

    Returns 'warn' or 'enforce'. Default 'warn' when registry/template
    is missing or the field is absent.
    """
    src = _registry_source(workspace_root)
    if src is None:
        return "warn"
    loaded = _load_registry(src)
    if loaded is None:
        return "warn"
    raw = loaded.get("enforcement_mode")
    if not isinstance(raw, str):
        return "warn"
    mode = raw.strip()
    return mode if mode in _VALID_ENFORCEMENT_MODES else "warn"


def _resolve_tier(workspace_root: Path, project_rel: str) -> str:
    """Mirror of lib/checks_quality.sh::ci_resolve_tier in Python."""
    src = _registry_source(workspace_root)
    if src is None:
        return "strict"
    loaded = _load_registry(src)
    if loaded is None:
        return "strict"
    rel = project_rel.rstrip("/")
    matched = _longest_prefix_tier(rel, loaded.get("exemptions"))
    if matched:
        return matched
    defaults = loaded.get("defaults")
    if isinstance(defaults, dict):
        return str(defaults.get("tier", "strict"))
    return "strict"


def _load_manifest(workspace_root: Path) -> HooksManifest | None:
    candidates = [
        workspace_root / "projects" / "CI" / "config" / "required_hooks.yaml",
        workspace_root / "config" / "required_hooks.yaml",
    ]
    path = next((p for p in candidates if p.is_file()), None)
    if path is None:
        return None
    loaded = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    if not isinstance(loaded, dict):
        return None
    return HooksManifest.model_validate(loaded)


def _load_quality_exceptions(project_dir: Path) -> QualityExceptions | None:
    path = project_dir / "quality_exceptions.yaml"
    if not path.is_file():
        return None
    loaded = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    if not isinstance(loaded, dict):
        return QualityExceptions()
    return QualityExceptions.model_validate(loaded)


_PYTHON_HOOK_KINDS = frozenset({"python_module", "python_module_files"})


def _check_manifest_completeness(
    workspace_root: Path,
    manifest: HooksManifest,
) -> list[str]:
    """Every check_*.py in ci/ must be registered in the manifest."""
    candidates = [
        workspace_root / "projects" / "CI" / "ci",
        workspace_root / "ci",
    ]
    ci_dir = next((p for p in candidates if p.is_dir()), None)
    if ci_dir is None:
        return [f"ci/ directory not found under {workspace_root}"]

    expected_modules = {f"ci.{p.stem}" for p in ci_dir.glob("check_*.py")}
    registered_modules = {
        h.entry.split()[0] for h in manifest.hooks if h.kind in _PYTHON_HOOK_KINDS
    }
    missing = expected_modules - registered_modules
    return [
        f"ci/{m.split('.')[-1]}.py exists but is not in required_hooks.yaml"
        for m in sorted(missing)
    ]


def _check_quality_exceptions(
    excs: QualityExceptions,
    manifest: HooksManifest,
) -> list[str]:
    """Validate quality_exceptions.yaml schema against the manifest."""
    issues: list[str] = []
    mandatory_ids = {h.id for h in manifest.hooks if h.mandatory}
    valid_ids = {h.id for h in manifest.hooks}

    for i, exc in enumerate(excs.exceptions):
        ctx = f"exceptions[{i}] (hook={exc.hook})"
        if exc.hook not in valid_ids:
            issues.append(f"{ctx}: hook id is not in required_hooks.yaml")
        if exc.hook in mandatory_ids:
            issues.append(f"{ctx}: hook is mandatory; cannot be exempted")
        if not exc.paths:
            issues.append(
                f"{ctx}: paths must be non-empty (whole-hook skip not allowed)",
            )
        if len(exc.reason) < REASON_MIN_LEN:
            issues.append(
                f"{ctx}: reason ({len(exc.reason)} chars) is shorter "
                f"than required minimum {REASON_MIN_LEN}",
            )
        if not exc.added_by:
            issues.append(f"{ctx}: added_by is required")

    return issues


def _hook_marker(hook_id: str) -> str:
    return f"# === Hook: {hook_id} ==="


def _resolve_gitdir(project_dir: Path) -> Path:
    """Resolve .git directory, including worktree-style gitdir pointers."""
    gitdir = project_dir / ".git"
    if not gitdir.is_file():
        return gitdir
    content = gitdir.read_text(encoding="utf-8").strip()
    if not content.startswith("gitdir:"):
        return gitdir
    target = Path(content.split(":", 1)[1].strip())
    return target if target.is_absolute() else (project_dir / target).resolve()


def _read_rendered_hooks(hooks_dir: Path) -> dict[str, str]:
    rendered: dict[str, str] = {}
    for stage in ("pre-commit", "commit-msg", "pre-push"):
        path = hooks_dir / stage
        if path.is_file():
            rendered[stage] = path.read_text(encoding="utf-8")
    return rendered


def _detect_languages(project_dir: Path) -> set[str]:
    """Detect project languages from file markers."""
    langs: set[str] = set()
    if (project_dir / "Cargo.toml").is_file():
        langs.add("rust")
    if (project_dir / "pyproject.toml").is_file():
        langs.add("python")
    if (project_dir / "package.json").is_file():
        langs.add("node")
    return langs


def _hook_applies(hook: HookEntry, tier: str, languages: set[str]) -> bool:
    if not hook.mandatory:
        return False
    if tier == "poc" and not hook.safety:
        return False
    if "any" in hook.applicable_to:
        return True
    return bool(languages & set(hook.applicable_to))


def _check_hooks_rendered(
    project_dir: Path,
    manifest: HooksManifest,
    tier: str,
) -> list[str]:
    """Check applicable mandatory hooks are present in rendered .git/hooks/."""
    if tier == "vendored":
        return []
    hooks_dir = _resolve_gitdir(project_dir) / "hooks"
    if not hooks_dir.is_dir():
        return [f".git/hooks not found at {hooks_dir}"]
    rendered = _read_rendered_hooks(hooks_dir)
    issues = [
        f"built-in block '{marker}' missing from .git/hooks/{stage}"
        for stage, content in rendered.items()
        for marker in (
            "CI-BUILTIN-EXEMPTION-COMPLIANCE",
            "quality_exceptions.yaml preflight",
        )
        if marker not in content
    ]
    languages = _detect_languages(project_dir)
    issues += [
        f"hook '{hook.id}' (stage={hook.stage}) not present in .git/hooks/{hook.stage}"
        for hook in manifest.hooks
        if _hook_applies(hook, tier, languages)
        and _hook_marker(hook.id) not in rendered.get(hook.stage, "")
    ]
    return issues


def _emit(level: str, msg: str) -> None:
    colour = {"OK": GREEN, "WARN": YELLOW, "FAIL": RED}.get(level, "")
    print(f"  {colour}[{level}]{RESET} {msg}")


def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--project",
        type=Path,
        default=Path.cwd(),
        help="Project directory to validate (default: cwd)",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Suppress per-check OK lines",
    )
    return parser


def _run_invariant_1_manifest(
    project_name: str,
    workspace_root: Path,
    manifest: HooksManifest,
    *,
    quiet: bool,
) -> list[str]:
    if project_name != "CI":
        return []
    issues = _check_manifest_completeness(workspace_root, manifest)
    if not issues and not quiet:
        _emit("OK", "manifest registers every check_*.py")
    return issues


def _run_invariant_2_exceptions(
    project_dir: Path,
    tier: str,
    manifest: HooksManifest,
    *,
    quiet: bool,
) -> list[str]:
    if tier != "strict":
        return []
    excs = _load_quality_exceptions(project_dir)
    if excs is None:
        return ["quality_exceptions.yaml missing at project root"]
    issues = _check_quality_exceptions(excs, manifest)
    if not issues and not quiet:
        _emit(
            "OK",
            f"quality_exceptions.yaml valid ({len(excs.exceptions)} exceptions)",
        )
    return issues


def main(argv: list[str] | None = None) -> int:
    args = _build_arg_parser().parse_args(argv)

    project_dir = args.project.resolve()
    workspace_root = _find_workspace_root(project_dir)
    if workspace_root is None:
        print(
            f"{RED}error:{RESET} cannot find workspace root from {project_dir}",
        )
        return EXIT_INFRA_ERROR

    manifest = _load_manifest(workspace_root)
    if manifest is None:
        print(f"{RED}error:{RESET} required_hooks.yaml not found in workspace")
        return EXIT_INFRA_ERROR

    rel = _project_path_relative(workspace_root, project_dir) or "."
    tier = "strict" if rel == "." else _resolve_tier(workspace_root, rel)
    project_name = project_dir.name

    print(f"Self-check: {project_name} (tier={tier})")
    if tier == "vendored":
        if not args.quiet:
            _emit("OK", "vendored tier: wrapper passthrough, no contract")
        return EXIT_OK

    issues: list[str] = []
    issues.extend(
        _run_invariant_1_manifest(
            project_name,
            workspace_root,
            manifest,
            quiet=args.quiet,
        ),
    )
    issues.extend(
        _run_invariant_2_exceptions(
            project_dir,
            tier,
            manifest,
            quiet=args.quiet,
        ),
    )

    hook_issues = _check_hooks_rendered(project_dir, manifest, tier)
    if hook_issues:
        issues.extend(hook_issues)
    elif not args.quiet:
        _emit("OK", f"all applicable mandatory hooks rendered ({tier} tier)")

    if issues:
        print()
        for issue in issues:
            _emit("FAIL", issue)
        print()
        print(f"{RED}{len(issues)} violation(s){RESET}: see fix instructions above.")
        return EXIT_VIOLATION

    if not args.quiet:
        print(f"{GREEN}OK{RESET} {project_name}: contract satisfied.")
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
