"""Tests for ci.check_boot_venv_layout: checks 3-5 (inherited_boot_dirs + dependsOn).

Covers SPEC-BOOT-LAYOUT §6.3 checks 3-4 (inherited_boot_dirs entry
resolution + world-writable) and check 5 (dependsOn alignment with
inherited_boot_dirs owners).
"""

from __future__ import annotations

from pathlib import Path

from ci._boot_layout_helpers import MoonProject, MoonYml
from ci.check_boot_venv_layout import (
    _check_dependson_alignment,
    _check_inherited_boot_dirs,
)

# ---------------------------------------------------------------------------
# Check 3+4: _check_inherited_boot_dirs
# ---------------------------------------------------------------------------


def test_check_inherited_boot_dirs_empty_returns_info(tmp_path: Path) -> None:
    project = tmp_path / "p"
    project.mkdir()
    moon = MoonYml(project=MoonProject(inherited_boot_dirs=[]))
    findings = _check_inherited_boot_dirs(moon, project)
    level, msg = findings[0]
    assert level == "INFO"
    assert "no inherited boot dirs" in msg


def test_check_inherited_boot_dirs_project_none_returns_info(tmp_path: Path) -> None:
    project = tmp_path / "p"
    project.mkdir()
    moon = MoonYml(project=None)
    findings = _check_inherited_boot_dirs(moon, project)
    level, msg = findings[0]
    assert level == "INFO"
    assert "no project: block" in msg


def test_check_inherited_boot_dirs_nonexistent_path_is_info(tmp_path: Path) -> None:
    project = tmp_path / "p"
    project.mkdir()
    moon = MoonYml(project=MoonProject(inherited_boot_dirs=["../CI"]))
    findings = _check_inherited_boot_dirs(moon, project)
    level, msg = findings[0]
    assert level == "INFO"
    assert "does not exist on disk" in msg
    assert "soft-optional" in msg


def test_check_inherited_boot_dirs_existing_dir_with_boot_linux_ok(
    tmp_path: Path,
) -> None:
    project = tmp_path / "p"
    project.mkdir()
    sibling = tmp_path / "CI" / ".boot-linux" / "bin"
    sibling.mkdir(parents=True)
    sibling.chmod(0o755)
    moon = MoonYml(project=MoonProject(inherited_boot_dirs=["../CI"]))
    findings = _check_inherited_boot_dirs(moon, project)
    level, msg = findings[0]
    assert level == "OK"
    assert "resolves to" in msg
    assert ".boot-linux" in msg


def test_check_inherited_boot_dirs_existing_dir_with_boot_macos_ok(
    tmp_path: Path,
) -> None:
    project = tmp_path / "p"
    project.mkdir()
    sibling = tmp_path / "CI" / ".boot-macos" / "bin"
    sibling.mkdir(parents=True)
    sibling.chmod(0o755)
    moon = MoonYml(project=MoonProject(inherited_boot_dirs=["../CI"]))
    findings = _check_inherited_boot_dirs(moon, project)
    level, msg = findings[0]
    assert level == "OK"
    assert "resolves to" in msg
    assert ".boot-macos" in msg


def test_check_inherited_boot_dirs_no_boot_dir_is_info(tmp_path: Path) -> None:
    project = tmp_path / "p"
    project.mkdir()
    sibling = tmp_path / "CI"
    sibling.mkdir()
    moon = MoonYml(project=MoonProject(inherited_boot_dirs=["../CI"]))
    findings = _check_inherited_boot_dirs(moon, project)
    level, msg = findings[0]
    assert level == "INFO"
    assert "no .boot-*/bin" in msg


def test_check_inherited_boot_dirs_exists_as_file(tmp_path: Path) -> None:
    project = tmp_path / "p"
    project.mkdir()
    sibling = tmp_path / "CI"
    sibling.write_text("not a dir")
    moon = MoonYml(project=MoonProject(inherited_boot_dirs=["../CI"]))
    findings = _check_inherited_boot_dirs(moon, project)
    level, msg = findings[0]
    assert level == "WARN"
    assert "exists as a file" in msg


def test_check_inherited_boot_dirs_empty_entry_is_warn(tmp_path: Path) -> None:
    project = tmp_path / "p"
    project.mkdir()
    moon = MoonYml(project=MoonProject(inherited_boot_dirs=["  "]))
    findings = _check_inherited_boot_dirs(moon, project)
    level, msg = findings[0]
    assert level == "WARN"
    assert "empty entry" in msg


def test_check_inherited_boot_dirs_world_writable_bin_preserves_nfr(
    tmp_path: Path,
) -> None:
    project = tmp_path / "p"
    project.mkdir()
    bin_dir = tmp_path / "CI" / ".boot-linux" / "bin"
    bin_dir.mkdir(parents=True)
    bin_dir.chmod(0o777)
    moon = MoonYml(project=MoonProject(inherited_boot_dirs=["../CI"]))
    findings = _check_inherited_boot_dirs(moon, project)
    level, msg = findings[0]
    assert level == "WARN"
    assert "world-writable" in msg
    assert "NFR-3.2" in msg


def test_check_inherited_boot_dirs_multiple_entries(tmp_path: Path) -> None:
    project = tmp_path / "p"
    project.mkdir()
    ci_bin = tmp_path / "CI" / ".boot-linux" / "bin"
    ci_bin.mkdir(parents=True)
    ci_bin.chmod(0o755)
    guard_bin = tmp_path / "WORKSPACE-GUARD" / ".boot-macos" / "bin"
    guard_bin.mkdir(parents=True)
    guard_bin.chmod(0o755)
    moon = MoonYml(
        project=MoonProject(inherited_boot_dirs=["../CI", "../WORKSPACE-GUARD"])
    )
    findings = _check_inherited_boot_dirs(moon, project)
    assert len(findings) == 2
    assert all(lvl == "OK" for lvl, _ in findings)


# ---------------------------------------------------------------------------
# Check 5: _check_dependson_alignment
# ---------------------------------------------------------------------------


def test_check_dependson_moon_none_returns_empty() -> None:
    assert _check_dependson_alignment(None) == []


def test_check_dependson_project_none_returns_empty() -> None:
    moon = MoonYml(project=None)
    assert _check_dependson_alignment(moon) == []


def test_check_dependson_included_is_ok() -> None:
    moon = MoonYml(
        project=MoonProject(inherited_boot_dirs=["../CI"]),
        dependsOn=["ci"],
    )
    findings = _check_dependson_alignment(moon)
    level, msg = findings[0]
    assert level == "OK"
    assert "dependsOn includes 'ci'" in msg


def test_check_dependson_missing_is_warn() -> None:
    moon = MoonYml(
        project=MoonProject(inherited_boot_dirs=["../DATAOPS"]),
        dependsOn=["bar"],
    )
    findings = _check_dependson_alignment(moon)
    level, msg = findings[0]
    assert level == "WARN"
    assert "MISSING 'dataops'" in msg


def test_check_dependson_multiple_entries(tmp_path: Path) -> None:
    moon = MoonYml(
        project=MoonProject(
            inherited_boot_dirs=["../CI", "../DATAOPS"]
        ),
        dependsOn=["ci", "dataops"],
    )
    findings = _check_dependson_alignment(moon)
    assert len(findings) == 2
    assert all(lvl == "OK" for lvl, _ in findings)


def test_check_dependson_ancestor_only_entry_skipped() -> None:
    moon = MoonYml(
        project=MoonProject(inherited_boot_dirs=["/etc/some-ancestor"]),
        dependsOn=[],
    )
    assert _check_dependson_alignment(moon) == []


def test_check_dependson_empty_inherited_returns_empty() -> None:
    moon = MoonYml(
        project=MoonProject(inherited_boot_dirs=[]),
        dependsOn=[],
    )
    assert _check_dependson_alignment(moon) == []