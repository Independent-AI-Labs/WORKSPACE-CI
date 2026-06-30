#!/usr/bin/env python3
"""Non-blocking audit of the hierarchical `.boot-linux/` + `.venv/` contract.

Implements SPEC-BOOT-LAYOUT §6. Validates the boot-layout declarations of
the invoking repo against the filesystem state and its own `moon.yml` +
`.pre-commit-config.yaml`. Always exits 0 (advisory; per FR-BL-7.7).

Checks performed (numbered per SPEC §6.3):

1.  `config/boot_layout.yaml` exists? INFO + early-exit if absent.
2.  Parse + validate against schema. WARN + early-exit if malformed.
3.  `boot_dir` resolves against project root. OK/INFO/WARN.
4.  `venv_dir` resolves against project root. OK/INFO/WARN.
5.  Each `inherit:` entry resolves against project root. OK/INFO/WARN.
6.  Existing inherit leaves checked for world-writable mode. WARN.
7.  `moon.yml::project.bootDir`/`parentBoot` match `boot_layout.yaml`.
    WARN on mismatch.
8.  `moon.yml::dependsOn` contains the moon project id derivable from each
    inherit entry's owning repo directory (per SPEC §8.2). WARN on missing.
9.  `.pre-commit-config.yaml` `entry: uv run --project <X> --no-sync python -m
    ci.<check>` refs resolve to `<X>/pyproject.toml` + `<X>/.venv/bin/python`.
    WARN on missing.
10. Print summary line (ok/warn/info counts). Exit 0.

Exit codes: always 0 (non-blocking). The only hard failure mode is an
infrastructure error (e.g. unreadable YAML containing an EmbeddedNull): those
return 2 per the canon, mirroring `ci/check_required_hooks_present.py`.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import yaml
from pydantic import ValidationError

from ci._boot_layout_helpers import (
    EXIT_OK,
    BootLayout,
    MoonYml,
)
from ci._boot_layout_helpers import (
    derive_moon_id_from_inherit as _derive_moon_id_from_inherit,
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
    normalize_boot_dir as _normalize_boot_dir,
)
from ci._boot_layout_helpers import (
    resolve_rel as _resolve_rel,
)
from ci._boot_layout_helpers import (
    scan_precommit_project_refs as _scan_precommit_project_refs,
)

# ---------------------------------------------------------------------------
# Check functions: each appends to findings as (level, message) tuples.
# ---------------------------------------------------------------------------


def _check_layout_exists(
    project_dir: Path,
) -> tuple[Path | None, list[tuple[str, str]]]:
    """SPEC §6.3 check 1. Returns (layout_path_or_None, findings)."""
    layout_path = project_dir / "config" / "boot_layout.yaml"
    if not layout_path.is_file():
        return None, [
            ("INFO", "config/boot_layout.yaml not found: repo has no own boot dir")
        ]
    return layout_path, []


def _check_layout_parse(
    layout_path: Path,
) -> tuple[BootLayout | None, list[tuple[str, str]]]:
    """SPEC §6.3 check 2. Returns (parsed_or_None, findings)."""
    try:
        raw = _load_yaml(layout_path)
    except yaml.YAMLError as e:
        return None, [("WARN", f"config/boot_layout.yaml malformed YAML: {e}")]
    if raw is None or not isinstance(raw, dict):
        return None, [("WARN", "config/boot_layout.yaml is empty or not a mapping")]
    try:
        layout = BootLayout.model_validate(raw)
    except ValidationError as e:
        return None, [("WARN", f"config/boot_layout.yaml schema violation: {e}")]
    return layout, []


def _check_boot_dir(layout: BootLayout, project_dir: Path) -> list[tuple[str, str]]:
    """SPEC §6.3 check 3. boot_dir resolves against project root."""
    bd = _normalize_boot_dir(layout.boot_dir)
    if bd is None:
        return [("INFO", "boot_dir field null/absent: repo has no own boot_dir")]
    resolved = (project_dir / bd).resolve(strict=False)
    if not resolved.exists():
        return [
            ("WARN", f"boot_dir={bd!r} does not exist on disk (resolved: {resolved})")
        ]
    if not resolved.is_dir():
        return [("WARN", f"boot_dir={bd!r} exists as a file (not a directory)")]
    if _is_world_writable(resolved):
        return [
            (
                "WARN",
                f"boot_dir={bd!r} leaf is world-writable "
                f"(security risk per NFR-BL-3.2)",
            )
        ]
    return [("OK", f"boot_dir={bd!r} resolves to existing directory ({resolved})")]


def _check_venv_dir(layout: BootLayout, project_dir: Path) -> list[tuple[str, str]]:
    """SPEC §6.3 check 4. venv_dir resolves against project root."""
    vd = _normalize_boot_dir(layout.venv_dir)
    if vd is None:
        return [("INFO", "venv_dir field null/absent: repo declares no .venv")]
    resolved = (project_dir / vd).resolve(strict=False)
    if not resolved.exists():
        return [("INFO", f"venv_dir={vd!r} not yet created on disk (run `uv sync`)")]
    if not resolved.is_dir():
        return [("WARN", f"venv_dir={vd!r} exists but is a file (not a directory)")]
    py_bin = resolved / "bin" / "python"
    if py_bin.is_file():
        return [("OK", f"venv_dir={vd!r} exists with bin/python")]
    return [("WARN", f"venv_dir={vd!r} exists but lacks bin/python (incomplete venv)")]


def _check_inherit_entries(
    layout: BootLayout, project_dir: Path
) -> list[tuple[str, str]]:
    """SPEC §6.3 checks 5 + 6 (combined).
    Per-entry resolution + world-writable check.
    """
    findings: list[tuple[str, str]] = []
    for entry in layout.inherit:
        e = entry.strip().rstrip("/")
        if not e:
            findings.append(("WARN", "inherit: contains an empty entry"))
            continue
        resolved = _resolve_rel(project_dir, e)
        if not resolved.exists():
            # SPEC §6.3 check 5: INFO (soft-optional per FR-BL-3.3)
            findings.append(
                (
                    "INFO",
                    f"inherit entry {entry!r} does not exist on disk (soft-optional)",
                )
            )
            continue
        if not resolved.is_dir():
            findings.append(
                ("WARN", f"inherit entry {entry!r} exists as a file (not a directory)")
            )
            continue
        # SPEC §6.3 check 6: world-writable leaf check
        # Per NFR-BL-3.2 scope: check the leaf .boot-linux/ dir AND its bin/ subdir.
        leaf_world_writable = _is_world_writable(resolved)
        bin_dir = resolved / "bin"
        bin_world_writable = bin_dir.is_dir() and _is_world_writable(bin_dir)
        if leaf_world_writable or bin_world_writable:
            which = []
            if leaf_world_writable:
                which.append("leaf")
            if bin_world_writable:
                which.append("bin/")
            findings.append(
                (
                    "WARN",
                    f"inherit entry {entry!r} is world-writable "
                    f"({'+'.join(which)}) per NFR-BL-3.2",
                )
            )
            continue
        findings.append(
            (
                "OK",
                f"inherit entry {entry!r} resolves to existing directory ({resolved})",
            )
        )
    return findings


# ---------------------------------------------------------------------------
# moon.yml consistency (SPEC §6.3 checks 7 + 8)
# ---------------------------------------------------------------------------


def _load_moon_yml(project_dir: Path) -> MoonYml | None:
    p = project_dir / "moon.yml"
    if not p.is_file():
        return None
    try:
        raw = _load_yaml(p)
    except yaml.YAMLError as exc:
        sys.stderr.write(f"WARN: moon.yml YAML parse error: {exc}\n")
        return None
    if not isinstance(raw, dict):
        return None
    try:
        return MoonYml.model_validate(raw)
    except ValidationError as exc:
        sys.stderr.write(f"WARN: moon.yml validation error: {exc}\n")
        return None


def _check_moon_metadata_consistency(
    layout: BootLayout, moon: MoonYml | None
) -> list[tuple[str, str]]:
    """SPEC §6.3 check 7. project.bootDir/parentBoot match boot_layout.yaml."""
    findings: list[tuple[str, str]] = []
    if moon is None:
        return findings  # moon.yml absence is OK; not audited here
    proj = moon.project
    if proj is None:
        return findings

    bd = _normalize_boot_dir(layout.boot_dir)
    if bd is not None:
        if proj.bootDir is None:
            findings.append(
                (
                    "INFO",
                    "moon.yml::project.bootDir absent "
                    "(descriptive only: no contract violation)",
                )
            )
        elif proj.bootDir.strip().rstrip("/") != bd:
            findings.append(
                (
                    "WARN",
                    f"moon.yml::project.bootDir={proj.bootDir!r} does not match "
                    f"boot_layout.yaml::boot_dir={bd!r}",
                )
            )
        else:
            findings.append(
                (
                    "OK",
                    f"moon.yml::project.bootDir={proj.bootDir!r} "
                    "matches boot_layout.yaml",
                )
            )

    if layout.inherit:
        parent_boot_sorted = sorted(
            p.strip().rstrip("/") for p in proj.parentBoot if p.strip()
        )
        inherit_sorted = sorted(
            e.strip().rstrip("/") for e in layout.inherit if e.strip()
        )
        if parent_boot_sorted != inherit_sorted:
            findings.append(
                (
                    "WARN",
                    f"moon.yml::project.parentBoot={proj.parentBoot!r} does not match "
                    f"boot_layout.yaml::inherit={layout.inherit!r}",
                )
            )
        else:
            findings.append(
                (
                    "OK",
                    f"moon.yml::project.parentBoot matches "
                    f"boot_layout.yaml::inherit ({len(layout.inherit)} entries)",
                )
            )
    elif proj.parentBoot:
        findings.append(
            (
                "WARN",
                f"moon.yml::project.parentBoot={proj.parentBoot!r} declared "
                "but boot_layout.yaml::inherit is empty",
            )
        )
    return findings


def _check_moon_dependson_alignment(
    layout: BootLayout, moon: MoonYml | None
) -> list[tuple[str, str]]:
    """SPEC §6.3 check 8. dependsOn contains inherit-owner moon id."""
    findings: list[tuple[str, str]] = []
    if moon is None:
        return findings
    depends = moon.dependsOn
    for entry in layout.inherit:
        moon_id = _derive_moon_id_from_inherit(entry)
        if moon_id is None:
            continue  # ancestor-only inherit (no sibling owner to verify)
        if moon_id in depends:
            findings.append(
                (
                    "OK",
                    f"inherit entry {entry!r}: moon.yml::dependsOn "
                    f"includes {moon_id!r}",
                )
            )
        else:
            findings.append(
                (
                    "WARN",
                    f"inherit entry {entry!r}: moon.yml::dependsOn "
                    f"MISSING {moon_id!r} "
                    f"(add {moon_id!r} to dependsOn "
                    f"or remove the inherit entry; per §8.2)",
                )
            )
    return findings


# ---------------------------------------------------------------------------
# .pre-commit-config.yaml --project refs (SPEC §6.3 check 9)
# ---------------------------------------------------------------------------


def _check_precommit_project_refs(project_dir: Path) -> list[tuple[str, str]]:
    """SPEC §6.3 check 9. `uv run --project X --no-sync python -m ci.<check>`
    refs resolve."""
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
                    f".pre-commit-config.yaml --project {ref!r} → "
                    f"pyproject.toml + .venv/bin/python present at {target}",
                )
            )
        elif not ok_pyproject:
            findings.append(
                (
                    "WARN",
                    f".pre-commit-config.yaml --project {ref!r} (line {line_no}) → "
                    f"target {target} missing pyproject.toml",
                )
            )
        else:
            findings.append(
                (
                    "WARN",
                    f".pre-commit-config.yaml --project {ref!r} (line {line_no}) → "
                    f"target {target} has pyproject.toml but no .venv/bin/python "
                    f"(run `uv sync` in that repo)",
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
            "Non-blocking audit of the boot-layout contract (SPEC-BOOT-LAYOUT §6)."
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

    # Check 1: existence
    layout_path, found = _check_layout_exists(project_dir)
    findings.extend(found)
    if layout_path is None:
        # No boot_layout.yaml → emit summary and exit 0 (per §6.3 check 1).
        _emit_and_exit(findings)
        return EXIT_OK  # unreachable: _emit_and_exit always exits

    # Check 2: parse + schema
    layout, parse_findings = _check_layout_parse(layout_path)
    findings.extend(parse_findings)
    if layout is None:
        _emit_and_exit(findings)
        return EXIT_OK

    # Checks 3-6: filesystem state
    findings.extend(_check_boot_dir(layout, project_dir))
    findings.extend(_check_venv_dir(layout, project_dir))
    findings.extend(_check_inherit_entries(layout, project_dir))

    # Check 7-8: moon.yml consistency
    moon = _load_moon_yml(project_dir)
    findings.extend(_check_moon_metadata_consistency(layout, moon))
    findings.extend(_check_moon_dependson_alignment(layout, moon))

    # Check 9: .pre-commit-config.yaml --project refs
    findings.extend(_check_precommit_project_refs(project_dir))

    # Check 10: summary
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
