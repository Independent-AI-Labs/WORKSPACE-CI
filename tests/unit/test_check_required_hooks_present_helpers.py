"""Loading tests for the required-hooks self-check."""

from __future__ import annotations

import textwrap
from pathlib import Path

import yaml

from ci.check_required_hooks_present import (
    _find_workspace_root,
    _load_manifest,
    _load_quality_exceptions,
)


def _make_workspace(tmp_path: Path) -> Path:
    root = tmp_path / "workspace"
    (root / "ci").mkdir(parents=True)
    (root / "config").mkdir()
    return root


def test_find_workspace_root_finds_manifest(tmp_path: Path) -> None:
    root = _make_workspace(tmp_path)
    (root / "config" / "required_hooks.yaml").write_text("hooks: []\n")
    project = root / "projects" / "project"
    project.mkdir(parents=True)
    assert _find_workspace_root(project) == root


def test_find_workspace_root_returns_none_when_missing(tmp_path: Path) -> None:
    assert _find_workspace_root(tmp_path) is None


def test_load_manifest_parses(tmp_path: Path) -> None:
    root = _make_workspace(tmp_path)
    (root / "config" / "required_hooks.yaml").write_text(
        yaml.safe_dump(
            {
                "hooks": [
                    {"id": "h1", "kind": "shell", "entry": "x", "stage": "pre-commit"}
                ]
            }
        )
    )
    manifest = _load_manifest(root)
    assert manifest is not None
    assert [hook.id for hook in manifest.hooks] == ["h1"]


def test_load_manifest_returns_none_when_missing(tmp_path: Path) -> None:
    assert _load_manifest(_make_workspace(tmp_path)) is None


def test_load_quality_exceptions_returns_none_when_missing(tmp_path: Path) -> None:
    assert _load_quality_exceptions(tmp_path) is None


def test_load_quality_exceptions_parses(tmp_path: Path) -> None:
    (tmp_path / "quality_exceptions.yaml").write_text(
        textwrap.dedent("""
            version: 1
            project: TEST
            exceptions:
              - hook: check-dead-code
                reason: "Vendored adapters with dynamic imports: unanalysable."
                paths: [vendor/]
                added_by: dev@example.com
        """),
    )
    exceptions = _load_quality_exceptions(tmp_path)
    assert exceptions is not None
    assert exceptions.project == "TEST"
    assert len(exceptions.exceptions) == 1
