"""Tests for ci.check_boot_venv_layout: helper functions + checks 1-2.

Covers the pure helper functions in ci._boot_layout_helpers (resolve_rel,
is_world_writable, derive_moon_id_from_inherited, scan_precommit_project_refs,
load_yaml) and SPEC-BOOT-LAYOUT §6.3 checks 1-2 (moon.yml existence +
parse/schema validation).
All filesystem state is built inside the ``tmp_path`` pytest fixture.
"""

from __future__ import annotations

import textwrap
from pathlib import Path

import pytest
import yaml

from ci._boot_layout_helpers import (
    derive_moon_id_from_inherited,
    is_world_writable,
    load_yaml,
    resolve_rel,
    scan_precommit_project_refs,
)
from ci.check_boot_venv_layout import _check_moon_exists

# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------


def _make_project(
    tmp_path: Path,
    *,
    moon_yml: str | None = None,
    pre_commit: str | None = None,
) -> Path:
    """Build a minimal project tree under tmp_path."""
    project = tmp_path / "WORKSPACE-TEST"
    project.mkdir()
    if moon_yml is not None:
        (project / "moon.yml").write_text(moon_yml)
    if pre_commit is not None:
        (project / ".pre-commit-config.yaml").write_text(pre_commit)
    return project


# ---------------------------------------------------------------------------
# Helper: resolve_rel
# ---------------------------------------------------------------------------


def test_resolve_rel_absolute(tmp_path: Path) -> None:
    p = resolve_rel(tmp_path, "/etc/hostname")
    assert p == Path("/etc/hostname").resolve(strict=False)


def test_resolve_rel_relative_to_start(tmp_path: Path) -> None:
    p = resolve_rel(tmp_path, "moon.yml")
    assert p == (tmp_path / "moon.yml").resolve(strict=False)


def test_resolve_rel_tilde_prefixed(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("HOME", str(tmp_path / "home"))
    home = tmp_path / "home"
    home.mkdir()
    p = resolve_rel(tmp_path, "~/foo")
    assert p == (home / "foo").resolve(strict=False)


def test_resolve_rel_empty_string_returns_start(tmp_path: Path) -> None:
    assert resolve_rel(tmp_path, "") == tmp_path.resolve(strict=False)


# ---------------------------------------------------------------------------
# Helper: is_world_writable
# ---------------------------------------------------------------------------


def test_is_world_writable_true_for_mode_777(tmp_path: Path) -> None:
    d = tmp_path / "ww"
    d.mkdir()
    d.chmod(0o777)
    assert is_world_writable(d) is True


def test_is_world_writable_false_for_mode_755(tmp_path: Path) -> None:
    d = tmp_path / "safe"
    d.mkdir()
    d.chmod(0o755)
    assert is_world_writable(d) is False


def test_is_world_writable_false_for_missing_path(tmp_path: Path) -> None:
    assert is_world_writable(tmp_path / "nope") is False


# ---------------------------------------------------------------------------
# Helper: derive_moon_id_from_inherited
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("entry", "expected"),
    [
        ("../CI", "ci"),
        ("../DATAOPS", "dataops"),
        ("../WORKSPACE-GUARD", "workspace-guard"),
        ("foo/bar", "bar"),
        (".", None),
        ("..", None),
        ("/some/abs/path", None),
        ("", None),
        ("   ", None),
    ],
)
def test_derive_moon_id_from_inherited(entry: str, expected: str | None) -> None:
    assert derive_moon_id_from_inherited(entry) == expected


def test_derive_moon_id_with_workspace_yml_mapping(tmp_path: Path) -> None:
    ws = {"ci": "projects/CI", "guard": "projects/WORKSPACE-GUARD"}
    assert derive_moon_id_from_inherited("../CI", ws) == "ci"
    assert derive_moon_id_from_inherited("../WORKSPACE-GUARD", ws) == "guard"


# ---------------------------------------------------------------------------
# Helper: scan_precommit_project_refs
# ---------------------------------------------------------------------------


def test_scan_precommit_project_refs_extracts_refs(tmp_path: Path) -> None:
    pcc = tmp_path / ".pre-commit-config.yaml"
    pcc.write_text(
        textwrap.dedent(
            """
            - id: check-foo
              entry: uv run --project ../CI --no-sync python -m ci.check_foo
            - id: check-bar
              entry: uv run --project ../WORKSPACE-BAR --no-sync python -m ci.check_bar
            """
        )
    )
    refs = scan_precommit_project_refs(pcc)
    expected_first_line = 3
    expected_second_line = 5
    expected_refs_count = 2
    assert refs[0][1] == "../CI"
    assert refs[1][1] == "../WORKSPACE-BAR"
    assert refs[0][0] == expected_first_line
    assert refs[1][0] == expected_second_line
    assert len(refs) == expected_refs_count


def test_scan_precommit_project_refs_returns_empty_for_missing_file(
    tmp_path: Path,
) -> None:
    assert scan_precommit_project_refs(tmp_path / "absent") == []


# ---------------------------------------------------------------------------
# Helper: load_yaml
# ---------------------------------------------------------------------------


def test_load_yaml_parses_mapping(tmp_path: Path) -> None:
    p = tmp_path / "x.yaml"
    p.write_text("a: 1\nb: [1, 2]\n")
    assert load_yaml(p) == {"a": 1, "b": [1, 2]}


def test_load_yaml_raises_on_malformed(tmp_path: Path) -> None:
    p = tmp_path / "x.yaml"
    p.write_text("a: [unclosed\n")
    with pytest.raises(yaml.YAMLError):
        load_yaml(p)


# ---------------------------------------------------------------------------
# Check 1+2: _check_moon_exists
# ---------------------------------------------------------------------------


def test_check_moon_exists_valid(tmp_path: Path) -> None:
    project = _make_project(
        tmp_path,
        moon_yml=textwrap.dedent(
            """
            project:
              name: test
              inherited_boot_dirs: []
            dependsOn: []
            """
        ),
    )
    path, moon, findings = _check_moon_exists(project)
    assert path is not None
    assert path == project / "moon.yml"
    assert moon is not None
    assert moon.project is not None
    assert moon.project.inherited_boot_dirs == []
    assert findings == []


def test_check_moon_exists_valid_with_inherited(tmp_path: Path) -> None:
    project = _make_project(
        tmp_path,
        moon_yml=textwrap.dedent(
            """
            project:
              inherited_boot_dirs: ['../CI']
            dependsOn: ['ci']
            """
        ),
    )
    path, moon, findings = _check_moon_exists(project)
    assert path is not None
    assert moon is not None
    assert moon.project is not None
    assert moon.project.inherited_boot_dirs == ["../CI"]
    assert moon.dependsOn == ["ci"]
    assert findings == []


def test_check_moon_exists_absent_returns_info(tmp_path: Path) -> None:
    project = _make_project(tmp_path)
    path, moon, findings = _check_moon_exists(project)
    assert path is None
    assert moon is None
    assert len(findings) == 1
    level, msg = findings[0]
    assert level == "INFO"
    assert "not found" in msg


def test_check_moon_exists_malformed_yaml(tmp_path: Path) -> None:
    project = _make_project(tmp_path, moon_yml="a: [unclosed\n")
    path, moon, findings = _check_moon_exists(project)
    assert path is None
    assert moon is None
    assert len(findings) == 1
    level, msg = findings[0]
    assert level == "WARN"
    assert "malformed YAML" in msg


def test_check_moon_exists_empty_document(tmp_path: Path) -> None:
    project = _make_project(tmp_path, moon_yml="\n")
    path, moon, findings = _check_moon_exists(project)
    assert path is None
    assert moon is None
    level, msg = findings[0]
    assert level == "WARN"
    assert "empty or not a mapping" in msg


def test_check_moon_exists_non_mapping(tmp_path: Path) -> None:
    project = _make_project(tmp_path, moon_yml="- just\n- a list\n")
    path, moon, findings = _check_moon_exists(project)
    assert path is None
    assert moon is None
    level, msg = findings[0]
    assert level == "WARN"
    assert "empty or not a mapping" in msg


def test_check_moon_exists_schema_violation(tmp_path: Path) -> None:
    project = _make_project(
        tmp_path,
        moon_yml="project:\n  inherited_boot_dirs: 42\n",
    )
    path, moon, findings = _check_moon_exists(project)
    assert path is None
    assert moon is None
    level, msg = findings[0]
    assert level == "WARN"
    assert "schema violation" in msg