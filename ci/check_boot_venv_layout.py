#!/usr/bin/env python3
"""Non-blocking audit of the platform-aware boot-layout contract.

Validates that moon.yml::project.inherited_boot_dirs entries resolve to
existing project roots with accessible boot directories, and that
.pre-commit-config.yaml --project refs resolve to valid venvs.
Always exits 0 as an advisory check, with infrastructure errors
returning 2.

Checks performed:
1. moon.yml exists (INFO + early-exit if absent).
2. Parse + validate moon.yml::project.inherited_boot_dirs.
3. Each inherited_boot_dirs entry resolves to a project root (OK/INFO/WARN).
4. Existing inherited boot dirs checked for world-writable mode (WARN).
5. moon.yml::dependsOn contains the moon project id for each
   inherited_boot_dirs entry (WARN).
6. .pre-commit-config.yaml entry refs resolve to pyproject.toml + venv.
7. Print summary line with ok/warn/info counts. Exit 0.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import yaml
from pydantic import ValidationError

from ci._boot_layout_helpers import (
    EXIT_OK,
    MoonYml,
)
from ci._boot_layout_helpers import (
    derive_moon_id_from_inherited as _derive_moon_id_from_inherited,
)
from ci._boot_layout_helpers import (
    emit as _emit,
)
from ci._boot_layout_helpers import (
    emit_summary as _emit_summary,
)
from ci._boot_layout_helpers import (
    is_world_writable as _is_world_writable,
)
from ci._boot_layout_helpers import (
    load_yaml as _load_yaml,
)
from ci._boot_layout_helpers import (
    resolve_rel as _resolve_rel,
)
from ci._boot_layout_helpers import (
    scan_precommit_project_refs as _scan_precommit_project_refs,
)
from ci._boot_layout_helpers import (
    scan_precommit_venv_python_refs as _scan_precommit_venv_python_refs,
)

# ---------------------------------------------------------------------------
# Check functions
# ---------------------------------------------------------------------------


def _check_moon_exists(
    project_dir: Path,
) -> tuple[Path | None, MoonYml | None, list[tuple[str, str]]]:
    """Check 1+2: moon.yml exists and parses validly."""
    moon_path = project_dir / "moon.yml"
    if not moon_path.is_file():
        return (
            None,
            None,
            [("INFO", "moon.yml not found: repo has no boot-layout declaration")],
        )
    try:
        raw = _load_yaml(moon_path)
    except yaml.YAMLError as e:
        return None, None, [("WARN", f"moon.yml malformed YAML: {e}")]
    if raw is None or not isinstance(raw, dict):
        return None, None, [("WARN", "moon.yml is empty or not a mapping")]
    try:
        moon = MoonYml.model_validate(raw)
    except ValidationError as e:
        return None, None, [("WARN", f"moon.yml schema violation: {e}")]
    return moon_path, moon, []


def _check_inherited_boot_dirs(
    moon: MoonYml, project_dir: Path
) -> list[tuple[str, str]]:
    """Checks 3+4: inherited_boot_dirs resolution + world-writable."""
    findings: list[tuple[str, str]] = []
    proj = moon.project
    if proj is None:
        return [("INFO", "moon.yml has no project: block")]
    entries = proj.inherited_boot_dirs
    if not entries:
        return [
            ("INFO", "inherited_boot_dirs is empty: repo has no inherited boot dirs")
        ]
    for entry in entries:
        e = entry.strip().rstrip("/")
        if not e:
            findings.append(("WARN", "inherited_boot_dirs contains an empty entry"))
            continue
        resolved_project = _resolve_rel(project_dir, e)
        if not resolved_project.exists():
            findings.append(
                (
                    "INFO",
                    f"inherited_boot_dirs entry {entry!r} does not exist"
                    " on disk (soft-optional)",
                )
            )
            continue
        if not resolved_project.is_dir():
            findings.append(
                (
                    "WARN",
                    f"inherited_boot_dirs entry {entry!r} exists as a"
                    " file (not a directory)",
                )
            )
            continue
        boot_bin = resolved_project / ".boot-linux" / "bin"
        # Accept both .boot-linux and .boot-macos as valid boot dir names
        if not boot_bin.is_dir():
            boot_bin = resolved_project / ".boot-macos" / "bin"
        if not boot_bin.is_dir():
            findings.append(
                (
                    "INFO",
                    f"inherited_boot_dirs entry {entry!r}:"
                    " no .boot-*/bin at project root",
                )
            )
            continue
        if _is_world_writable(boot_bin):
            findings.append(
                (
                    "WARN",
                    f"inherited_boot_dirs entry {entry!r}: boot bin dir"
                    " is world-writable (security risk per NFR-3.2)",
                )
            )
            continue
        findings.append(
            ("OK", f"inherited_boot_dirs entry {entry!r} resolves to {boot_bin}")
        )
    return findings


def _check_dependson_alignment(
    moon: MoonYml | None,
) -> list[tuple[str, str]]:
    """Check 5: dependsOn has the moon id from each inherited_boot_dirs entry."""
    findings: list[tuple[str, str]] = []
    if moon is None:
        return findings
    proj = moon.project
    if proj is None:
        return findings
    depends = moon.dependsOn
    for entry in proj.inherited_boot_dirs:
        moon_id = _derive_moon_id_from_inherited(entry)
        if moon_id is None:
            continue
        if moon_id in depends:
            findings.append(
                (
                    "OK",
                    f"inherited_boot_dirs entry {entry!r}: dependsOn"
                    f" includes {moon_id!r}",
                )
            )
        else:
            findings.append(
                (
                    "WARN",
                    f"inherited_boot_dirs entry {entry!r}: dependsOn"
                    f" MISSING {moon_id!r} (add {moon_id!r} to dependsOn"
                    " or remove the entry; per §8.2)",
                )
            )
    return findings


def _check_precommit_venv_python_refs(project_dir: Path) -> list[tuple[str, str]]:
    """Check 6b: warn on deprecated .venv/bin/python -m ci.* hook entries."""
    findings: list[tuple[str, str]] = []
    pcc_path = project_dir / ".pre-commit-config.yaml"
    if not pcc_path.is_file():
        return findings
    findings.extend(
        (
            "WARN",
            f".pre-commit-config.yaml line {line_no}:"
            " use uv run python or uv run --project <path> --no-sync"
            " python -m ci.<check> (not .venv/bin/python)",
        )
        for line_no in _scan_precommit_venv_python_refs(pcc_path)
    )
    return findings


def _check_precommit_project_refs(project_dir: Path) -> list[tuple[str, str]]:
    """Check 6: .pre-commit-config.yaml --project refs resolve."""
    findings: list[tuple[str, str]] = []
    pcc_path = project_dir / ".pre-commit-config.yaml"
    if not pcc_path.is_file():
        return findings
    refs = _scan_precommit_project_refs(pcc_path)
    seen: set[tuple[str, bool, bool]] = set()
    for line_no, ref in refs:
        target = _resolve_rel(project_dir, ref)
        ok_pyproject = (target / "pyproject.toml").is_file()
        ok_venv = (target / ".venv" / "bin" / "python").is_file()
        key = (str(target), ok_pyproject, ok_venv)
        if key in seen:
            continue
        seen.add(key)
        if ok_pyproject and ok_venv:
            findings.append(
                (
                    "OK",
                    f".pre-commit-config.yaml --project {ref!r} →"
                    f" pyproject.toml + .venv/bin/python at {target}",
                )
            )
        elif not ok_pyproject:
            findings.append(
                (
                    "WARN",
                    f".pre-commit-config.yaml --project {ref!r}"
                    f" (line {line_no}) → {target} missing pyproject.toml",
                )
            )
        else:
            findings.append(
                (
                    "WARN",
                    f".pre-commit-config.yaml --project {ref!r}"
                    f" (line {line_no}) → {target} has pyproject.toml"
                    " but no .venv/bin/python (run `uv sync` there)",
                )
            )
    return findings


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(
        prog="check-boot-venv-layout",
        description=(
            "Non-blocking audit of the boot-layout contract (SPEC-BOOT-LAYOUT)."
        ),
    )
    parser.add_argument(
        "project_dir",
        nargs="?",
        default=".",
        help="Project dir to audit (default: current dir).",
    )
    args = parser.parse_args()
    project_dir = Path(args.project_dir).resolve(strict=False)

    findings: list[tuple[str, str]] = []

    # Checks 1+2: moon.yml existence + parse
    moon_path, moon, found = _check_moon_exists(project_dir)
    findings.extend(found)
    if moon_path is None or moon is None:
        _emit_and_exit(findings)
        return EXIT_OK

    # Checks 3+4: inherited_boot_dirs resolution + world-writable
    findings.extend(_check_inherited_boot_dirs(moon, project_dir))

    # Check 5: dependsOn alignment
    findings.extend(_check_dependson_alignment(moon))

    # Check 6: .pre-commit-config.yaml --project refs
    findings.extend(_check_precommit_venv_python_refs(project_dir))
    findings.extend(_check_precommit_project_refs(project_dir))

    # Check 7: summary
    _emit_and_exit(findings)
    return EXIT_OK  # unreachable


def _emit_and_exit(findings: list[tuple[str, str]]) -> None:
    """Print all findings + summary line, then exit 0."""
    n_ok = n_warn = n_info = 0
    for level, msg in findings:
        if level == "OK":
            n_ok += 1
        elif level == "WARN":
            n_warn += 1
        else:
            n_info += 1
        _emit(level, msg)
    _emit_summary(n_ok, n_warn, n_info)
    sys.exit(EXIT_OK)


if __name__ == "__main__":
    sys.exit(main())
