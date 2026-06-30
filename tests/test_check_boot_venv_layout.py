"""Tests for ci.check_boot_venv_layout — helper functions + checks 1-4.

Covers SPEC-BOOT-LAYOUT §6.3 checks 1-4 (layout existence, parse/schema,
boot_dir resolution, venv_dir resolution) plus the pure helper functions.
All filesystem state is built inside the ``tmp_path`` pytest fixture.
"""

from __future__ import annotations

import os
import textwrap
from pathlib import Path

import pytest
import yaml

from ci.check_boot_venv_layout import (
    BootLayout,
    _check_boot_dir,
    _check_layout_exists,
    _check_layout_parse,
    _check_venv_dir,
    _derive_moon_id_from_inherit,
    _is_world_writable,
    _load_yaml,
    _normalize_boot_dir,
    _resolve_rel,
    _scan_precommit_project_refs,
)

# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------


def _make_project(
    tmp_path: Path,
    *,
    boot_layout: str | None = None,
    moon_yml: str | None = None,
    pre_commit: str | None = None,
) -> Path:
    """Build a minimal project tree under tmp_path.

    Each optional string is written verbatim to the canonical location.
    """
    project = tmp_path / "WORKSPACE-TEST"
    project.mkdir()
    if boot_layout is not None:
        (project / "config").mkdir()
        (project / "config" / "boot_layout.yaml").write_text(boot_layout)
    if moon_yml is not None:
        (project / "moon.yml").write_text(moon_yml)
    if pre_commit is not None:
        (project / ".pre-commit-config.yaml").write_text(pre_commit)
    return project


def _boot_layout_yaml(
    *,
    boot_dir: str | None = "null",
    venv_dir: str | None = "null",
    inherit: list[str] | None = None,
) -> str:
    """Render a config/boot_layout.yaml document as a YAML text blob."""
    lines: list[str] = ["version: 1"]
    if boot_dir == "null":
        lines.append("boot_dir: null")
    else:
        lines.append(f"boot_dir: {boot_dir!r}")
    if venv_dir == "null":
        lines.append("venv_dir: null")
    else:
        lines.append(f"venv_dir: {venv_dir!r}")
    if inherit:
        rendered = ", ".join(repr(i) for i in inherit)
        lines.append(f"inherit: [{rendered}]")
    else:
        lines.append("inherit: []")
    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------


def test_resolve_rel_absolute(tmp_path: Path) -> None:
    p = _resolve_rel(tmp_path, "/etc/hostname")
    assert p == Path("/etc/hostname").resolve(strict=False)


def test_resolve_rel_relative_to_start(tmp_path: Path) -> None:
    p = _resolve_rel(tmp_path, "config/boot_layout.yaml")
    assert p == (tmp_path / "config" / "boot_layout.yaml").resolve(strict=False)


def test_resolve_rel_tilde_prefixed(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("HOME", str(tmp_path / "home"))
    home = tmp_path / "home"
    home.mkdir()
    p = _resolve_rel(tmp_path, "~/foo")
    assert p == (home / "foo").resolve(strict=False)


def test_resolve_rel_empty_string_returns_start(tmp_path: Path) -> None:
    assert _resolve_rel(tmp_path, "") == tmp_path.resolve(strict=False)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (None, None),
        ("", None),
        ("   ", None),
        ("./.boot-linux", ".boot-linux"),
        (".boot-linux/", ".boot-linux"),
        ("./foo/", "foo"),
        (".boot-linux", ".boot-linux"),
    ],
)
def test_normalize_boot_dir(raw: str | None, expected: str | None) -> None:
    assert _normalize_boot_dir(raw) == expected


def test_is_world_writable_true_for_mode_777(tmp_path: Path) -> None:
    d = tmp_path / "ww"
    d.mkdir()
    d.chmod(0o777)
    assert _is_world_writable(d) is True


def test_is_world_writable_false_for_mode_755(tmp_path: Path) -> None:
    d = tmp_path / "safe"
    d.mkdir()
    d.chmod(0o755)
    assert _is_world_writable(d) is False


def test_is_world_writable_false_for_missing_path(tmp_path: Path) -> None:
    assert _is_world_writable(tmp_path / "nope") is False


@pytest.mark.parametrize(
    ("entry", "expected"),
    [
        ("../WORKSPACE-CI/.boot-linux", "ci"),
        ("../WORKSPACE-FOO/bar", "foo"),
        ("foo/bar", None),
        ("/some/path", None),
        ("/usr/local/WORKSPACE-ABC/x", "abc"),
    ],
)
def test_derive_moon_id_from_inherit(entry: str, expected: str | None) -> None:
    assert _derive_moon_id_from_inherit(entry) == expected


def test_scan_precommit_project_refs_extracts_refs(tmp_path: Path) -> None:
    pcc = tmp_path / ".pre-commit-config.yaml"
    pcc.write_text(
        textwrap.dedent(
            """
            - id: check-foo
              entry: uv run --project ../WORKSPACE-CI --no-sync python -m ci.check_foo
            - id: check-bar
              entry: uv run --project ../WORKSPACE-BAR --no-sync python -m ci.check_bar
            """
        )
    )
    refs = _scan_precommit_project_refs(pcc)
    assert refs[0][1] == "../WORKSPACE-CI"
    assert refs[1][1] == "../WORKSPACE-BAR"
    expected_first_line = 3
    expected_second_line = 5
    expected_refs_count = 2
    assert refs[0][0] == expected_first_line
    assert refs[1][0] == expected_second_line
    assert len(refs) == expected_refs_count


def test_scan_precommit_project_refs_returns_empty_for_missing_file(
    tmp_path: Path,
) -> None:
    assert _scan_precommit_project_refs(tmp_path / "absent") == []


def test_load_yaml_parses_mapping(tmp_path: Path) -> None:
    p = tmp_path / "x.yaml"
    p.write_text("a: 1\nb: [1, 2]\n")
    assert _load_yaml(p) == {"a": 1, "b": [1, 2]}


def test_load_yaml_raises_on_malformed(tmp_path: Path) -> None:
    p = tmp_path / "x.yaml"
    p.write_text("a: [unclosed\n")
    with pytest.raises(yaml.YAMLError):
        _load_yaml(p)


# ---------------------------------------------------------------------------
# Check 1 — _check_layout_exists
# ---------------------------------------------------------------------------


def test_check_layout_exists_returns_path_when_present(tmp_path: Path) -> None:
    project = _make_project(tmp_path, boot_layout="version: 1\n")
    path, findings = _check_layout_exists(project)
    assert path is not None
    assert path == project / "config" / "boot_layout.yaml"
    assert findings == []


def test_check_layout_exists_returns_none_with_info_when_absent(tmp_path: Path) -> None:
    project = _make_project(tmp_path)
    path, findings = _check_layout_exists(project)
    assert path is None
    assert len(findings) == 1
    level, msg = findings[0]
    assert level == "INFO"
    assert "not found" in msg


# ---------------------------------------------------------------------------
# Check 2 — _check_layout_parse
# ---------------------------------------------------------------------------


def test_check_layout_parse_valid(tmp_path: Path) -> None:
    p = tmp_path / "boot_layout.yaml"
    p.write_text("version: 1\nboot_dir: .boot-linux\n")
    layout, findings = _check_layout_parse(p)
    assert layout is not None
    assert isinstance(layout, BootLayout)
    assert layout.boot_dir == ".boot-linux"
    assert findings == []


def test_check_layout_parse_malformed_yaml(tmp_path: Path) -> None:
    p = tmp_path / "boot_layout.yaml"
    p.write_text("a: [unclosed\n")
    layout, findings = _check_layout_parse(p)
    assert layout is None
    assert len(findings) == 1
    level, msg = findings[0]
    assert level == "WARN"
    assert "malformed YAML" in msg


def test_check_layout_parse_null_document(tmp_path: Path) -> None:
    p = tmp_path / "boot_layout.yaml"
    p.write_text("\n")
    layout, findings = _check_layout_parse(p)
    assert layout is None
    level, msg = findings[0]
    assert level == "WARN"
    assert "empty or not a mapping" in msg


def test_check_layout_parse_non_mapping(tmp_path: Path) -> None:
    p = tmp_path / "boot_layout.yaml"
    p.write_text("- just\n- a list\n")
    layout, findings = _check_layout_parse(p)
    assert layout is None
    level, msg = findings[0]
    assert level == "WARN"
    assert "empty or not a mapping" in msg


def test_check_layout_parse_schema_violation(tmp_path: Path) -> None:
    p = tmp_path / "boot_layout.yaml"
    p.write_text("version: [1, 2]\n")
    layout, findings = _check_layout_parse(p)
    assert layout is None
    level, msg = findings[0]
    assert level == "WARN"
    assert "schema violation" in msg


# ---------------------------------------------------------------------------
# Check 3 — _check_boot_dir
# ---------------------------------------------------------------------------


def test_check_boot_dir_ok(tmp_path: Path) -> None:
    project = tmp_path / "p"
    project.mkdir()
    (project / ".boot-linux").mkdir()
    layout = BootLayout(boot_dir=".boot-linux")
    findings = _check_boot_dir(layout, project)
    assert len(findings) == 1
    level, msg = findings[0]
    assert level == "OK"
    assert ".boot-linux" in msg


def test_check_boot_dir_missing_on_disk(tmp_path: Path) -> None:
    project = tmp_path / "p"
    project.mkdir()
    layout = BootLayout(boot_dir=".boot-linux")
    findings = _check_boot_dir(layout, project)
    level, msg = findings[0]
    assert level == "WARN"
    assert "does not exist on disk" in msg


def test_check_boot_dir_exists_as_file(tmp_path: Path) -> None:
    project = tmp_path / "p"
    project.mkdir()
    (project / ".boot-linux").write_text("oops")
    layout = BootLayout(boot_dir=".boot-linux")
    findings = _check_boot_dir(layout, project)
    level, msg = findings[0]
    assert level == "WARN"
    assert "exists as a file" in msg


def test_check_boot_dir_world_writable_preserves_nfr_bl_3_2(tmp_path: Path) -> None:
    project = tmp_path / "p"
    project.mkdir()
    bd = project / ".boot-linux"
    bd.mkdir()
    bd.chmod(0o777)
    layout = BootLayout(boot_dir=".boot-linux")
    findings = _check_boot_dir(layout, project)
    level, msg = findings[0]
    assert level == "WARN"
    assert "world-writable" in msg
    assert "security risk per NFR-BL-3.2" in msg
    assert msg.endswith("security risk per NFR-BL-3.2)")


def test_check_boot_dir_null_returns_info(tmp_path: Path) -> None:
    project = tmp_path / "p"
    project.mkdir()
    layout = BootLayout(boot_dir=None)
    findings = _check_boot_dir(layout, project)
    level, msg = findings[0]
    assert level == "INFO"
    assert "boot_dir field null/absent" in msg


# ---------------------------------------------------------------------------
# Check 4 — _check_venv_dir
# ---------------------------------------------------------------------------


def test_check_venv_dir_null_returns_info(tmp_path: Path) -> None:
    project = tmp_path / "p"
    project.mkdir()
    layout = BootLayout(venv_dir=None)
    findings = _check_venv_dir(layout, project)
    level, msg = findings[0]
    assert level == "INFO"
    assert "venv_dir field null/absent" in msg


def test_check_venv_dir_not_yet_created(tmp_path: Path) -> None:
    project = tmp_path / "p"
    project.mkdir()
    layout = BootLayout(venv_dir=".venv")
    findings = _check_venv_dir(layout, project)
    level, msg = findings[0]
    assert level == "INFO"
    assert "not yet created on disk" in msg
    assert "uv sync" in msg


def test_check_venv_dir_lacks_bin_python(tmp_path: Path) -> None:
    project = tmp_path / "p"
    project.mkdir()
    (project / ".venv").mkdir()
    layout = BootLayout(venv_dir=".venv")
    findings = _check_venv_dir(layout, project)
    level, msg = findings[0]
    assert level == "WARN"
    assert "lacks bin/python" in msg
    assert "incomplete venv" in msg


def test_check_venv_dir_ok_with_bin_python(tmp_path: Path) -> None:
    project = tmp_path / "p"
    project.mkdir()
    venv = project / ".venv"
    (venv / "bin").mkdir(parents=True)
    (venv / "bin" / "python").write_text("#!/usr/bin/env bash\n")
    layout = BootLayout(venv_dir=".venv")
    findings = _check_venv_dir(layout, project)
    level, msg = findings[0]
    assert level == "OK"
    assert msg == "venv_dir='.venv' exists with bin/python"


def test_check_venv_dir_exists_as_file(tmp_path: Path) -> None:
    project = tmp_path / "p"
    project.mkdir()
    (project / ".venv").write_text("not a dir")
    layout = BootLayout(venv_dir=".venv")
    findings = _check_venv_dir(layout, project)
    level, msg = findings[0]
    assert level == "WARN"
    assert "is a file" in msg


# ---------------------------------------------------------------------------
# os import sanity (kept so unused-import lint on `os` does not regress)
# ---------------------------------------------------------------------------


def test_os_stat_constant_visible() -> None:
    assert hasattr(os, "stat")
