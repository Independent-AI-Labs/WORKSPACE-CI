#!/usr/bin/env python3
"""Self-check that validates the CI hook infrastructure of the invoking
project across three invariants. Ensures every check_*.py module is
registered in required_hooks.yaml and quality_exceptions.yaml is schema-valid.

Exit codes: 0 = all invariants hold, 1 = violation, 2 = infrastructure error.
"""

from __future__ import annotations

import argparse
import functools
import re
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
    boot_candidate: Path | None = None
    while cur != cur.parent:
        has_boot_dir = (cur / ".boot-linux").is_dir() or (cur / ".boot-macos").is_dir()
        if has_boot_dir:
            boot_candidate = cur
        if (cur / "config" / "required_hooks.yaml").is_file():
            return cur
        cur = cur.parent
    return boot_candidate


def _load_manifest(workspace_root: Path) -> HooksManifest | None:
    path = workspace_root / "config" / "required_hooks.yaml"
    if not path.is_file():
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
    ci_dir = workspace_root / "ci"
    if not ci_dir.is_dir():
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


def _emit(level: str, msg: str) -> None:
    colour = {"OK": GREEN, "WARN": YELLOW, "FAIL": RED}.get(level, "")
    print(f"  {colour}[{level}]{RESET} {msg}")


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


def _hook_applies(hook: HookEntry, languages: set[str]) -> bool:
    if not hook.mandatory:
        return False
    if "any" in hook.applicable_to:
        return True
    return bool(languages & set(hook.applicable_to))


def _check_hooks_rendered(
    project_dir: Path,
    manifest: HooksManifest,
) -> list[str]:
    """Invariant 3: applicable mandatory hooks and built-in compliance
    blocks are present in the rendered .git/hooks/ scripts.

    The b4210cf generator rewrite dropped both the emissions and this
    check; restored 2026-08-21 after the regression surfaced as missing
    markers in regenerated consumer hooks (gateway incident).
    """
    hooks_dir = _resolve_gitdir(project_dir) / "hooks"
    if not hooks_dir.is_dir():
        return [f".git/hooks not found at {hooks_dir}"]
    rendered = _read_rendered_hooks(hooks_dir)
    required_markers = [
        "CI-BUILTIN-EXEMPTION-COMPLIANCE",
        "quality_exceptions.yaml preflight",
    ]
    if (project_dir / "scripts" / "generate-hooks").is_file():
        required_markers.append("CI-BUILTIN-CATALOG-PROVENANCE")
    issues = [
        f"built-in block '{marker}' missing from .git/hooks/{stage}"
        for stage, content in rendered.items()
        for marker in required_markers
        if marker not in content
    ]
    languages = _detect_languages(project_dir)
    issues += [
        f"hook '{hook.id}' (stage={hook.stage}) not present in .git/hooks/{hook.stage}"
        for hook in manifest.hooks
        if _hook_applies(hook, languages)
        and _hook_marker(hook.id) not in rendered.get(hook.stage, "")
    ]
    return issues


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
    if not (workspace_root / "scripts" / "generate-hooks").is_file():
        return []
    issues = _check_manifest_completeness(workspace_root, manifest)
    if not issues and not quiet:
        _emit("OK", "manifest registers every check_*.py")
    return issues


def _run_invariant_2_exceptions(
    project_dir: Path,
    manifest: HooksManifest,
    *,
    quiet: bool,
) -> list[str]:
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


class LibReadError(RuntimeError):
    """A lib/*.sh module could not be read for entry resolution."""


@functools.lru_cache(maxsize=1)
def _shell_fn_re() -> re.Pattern[str]:
    return re.compile(
        r"^\s*(?:function\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\(\)",
        re.MULTILINE,
    )


@functools.cache
def _shell_function_names(lib_dir: Path) -> frozenset[str]:
    """Function names defined across the lib/*.sh modules next to this
    checker's package (works identically in the source checkout and the
    deployed artifact: ci/ sits beside lib/)."""
    names: set[str] = set()
    if not lib_dir.is_dir():
        return frozenset(names)
    pattern = _shell_fn_re()
    for lib_file in sorted(lib_dir.glob("*.sh")):
        try:
            text = lib_file.read_text(encoding="utf-8", errors="replace")
        except OSError as exc:
            raise LibReadError(lib_file) from exc
        names.update(m.group(1) for m in pattern.finditer(text))
    return frozenset(names)


def _run_invariant_4_entries(
    manifest: HooksManifest,
    *,
    quiet: bool,
    package_root: Path | None = None,
) -> list[str]:
    """Invariant 4: every manifest entry resolves in the shipping lib.

    The 2026-08-24 portable_shell incident: ci_check_portable_shell was
    dropped from lib/checks_files.sh while required_hooks.yaml kept the
    entry; the deployed hook failed with "command not found" on every
    commit, deadlocking the fix. This invariant runs in source pre-commit
    and in candidate check-push (deploy-time), so a tree that drops an
    implementation while keeping its catalog entry can neither commit
    nor publish.
    """
    if package_root is None:
        # Anchor to the checker's own tree: ci/ sits beside lib/ in both
        # the source checkout and the deployed artifact, so the invariant
        # always validates the lib that will actually be shipped.
        ci_dir = Path(__file__).resolve().parent
        package_root = ci_dir.parent
    lib_dir = package_root / "lib"
    issues: list[str] = []
    if not lib_dir.is_dir():
        # Consumer invocation without a shipping lib (checker imported
        # from a source checkout elsewhere); generation-time refusal and
        # the CI-repo self-check own this invariant.
        return issues
    defined = _shell_function_names(lib_dir)
    for hook in manifest.hooks:
        if hook.kind == "shell":
            issues.extend(
                f"hook '{hook.id}' entry references shell function"
                f" '{fn}' but no lib/*.sh module defines it"
                for fn in sorted(
                    set(re.findall(r"\bci_[a-z_][a-z0-9_]*\b", hook.entry))
                )
                if fn not in defined
            )
        elif hook.kind == "python_module":
            module_path = hook.entry.replace("ci.", "ci/", 1)
            if not (
                (package_root / f"{module_path}.py").is_file()
                or (package_root / module_path).is_dir()
            ):
                issues.append(
                    f"hook '{hook.id}' entry references python module"
                    f" '{hook.entry}' but it does not exist"
                )
    if not issues and not quiet:
        _emit("OK", "every manifest entry resolves in the shipping lib")
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

    project_name = project_dir.name

    print(f"Self-check: {project_name}")

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
            manifest,
            quiet=args.quiet,
        ),
    )
    rendered_issues = _check_hooks_rendered(project_dir, manifest)
    issues.extend(rendered_issues)
    if not rendered_issues and not args.quiet:
        _emit("OK", "rendered hooks carry required markers")

    entry_issues = _run_invariant_4_entries(manifest, quiet=args.quiet)
    issues.extend(entry_issues)

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
