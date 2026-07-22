"""Tests for ci.exemption_files: manifest loading, ensure, report, CLI."""

from __future__ import annotations

from pathlib import Path

import pytest

from ci import exemption_files
from ci.exemption_files import (
    ensure_exemption_files,
    load_manifest,
    lock_report,
    main,
)

MANIFEST_ENTRIES = [
    {"path": "alpha_exceptions.yaml", "default_content": "exceptions: []\n"},
    {"path": "sub/dir/beta.yaml", "default_content": "name: __PROJECT_NAME__\n"},
]


def _patch_manifest(monkeypatch: pytest.MonkeyPatch, entries: list[dict[str, str]]) -> None:
    monkeypatch.setattr(exemption_files, "load_manifest", lambda: entries)


# load_manifest (real config)


def test_load_manifest_returns_entries_with_path() -> None:
    entries = load_manifest()
    assert entries
    assert all(e.get("path") for e in entries)


# ensure_exemption_files


def test_ensure_creates_missing_files_with_defaults(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_manifest(monkeypatch, MANIFEST_ENTRIES)
    created = ensure_exemption_files(tmp_path)
    assert set(created) == {tmp_path / "alpha_exceptions.yaml", tmp_path / "sub/dir/beta.yaml"}
    assert (tmp_path / "alpha_exceptions.yaml").read_text(encoding="utf-8") == "exceptions: []\n"
    assert (tmp_path / "sub/dir/beta.yaml").read_text(encoding="utf-8") == f"name: {tmp_path.name}\n"


def test_ensure_never_overwrites_existing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_manifest(monkeypatch, MANIFEST_ENTRIES)
    existing = tmp_path / "alpha_exceptions.yaml"
    existing.write_text("custom: true\n", encoding="utf-8")
    created = ensure_exemption_files(tmp_path)
    assert created == [tmp_path / "sub/dir/beta.yaml"]
    assert existing.read_text(encoding="utf-8") == "custom: true\n"


def test_ensure_empty_manifest_creates_nothing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_manifest(monkeypatch, [])
    assert ensure_exemption_files(tmp_path) == []


def test_ensure_default_source_reads_project_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    source = tmp_path / "templates/tpl.yaml"
    source.parent.mkdir(parents=True)
    source.write_text("from: source\n", encoding="utf-8")
    _patch_manifest(monkeypatch, [{"path": "out.yaml", "default_source": "templates/tpl.yaml"}])
    monkeypatch.setattr(exemption_files, "find_project_root", lambda: tmp_path)
    created = ensure_exemption_files(tmp_path)
    assert created == [tmp_path / "out.yaml"]
    assert (tmp_path / "out.yaml").read_text(encoding="utf-8") == "from: source\n"


def test_ensure_missing_default_content_writes_empty(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_manifest(monkeypatch, [{"path": "empty.yaml"}])
    ensure_exemption_files(tmp_path)
    assert (tmp_path / "empty.yaml").read_text(encoding="utf-8") == ""


# lock_report


def test_lock_report_reports_state_per_entry(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _patch_manifest(monkeypatch, MANIFEST_ENTRIES)
    (tmp_path / "alpha_exceptions.yaml").write_text("x\n", encoding="utf-8")
    report = lock_report(tmp_path)
    assert [p for p, _ in report] == [
        tmp_path / "alpha_exceptions.yaml",
        tmp_path / "sub/dir/beta.yaml",
    ]
    states = dict((p.name, s) for p, s in report)
    assert states["alpha_exceptions.yaml"] == "not-root-owned"
    assert states["beta.yaml"] == "missing"


# CLI


def test_main_ensure_prints_created(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    _patch_manifest(monkeypatch, MANIFEST_ENTRIES[:1])
    assert main(["ensure", str(tmp_path)]) == 0
    out = capsys.readouterr().out
    assert f"created: {tmp_path / 'alpha_exceptions.yaml'}" in out


def test_main_report_prints_states(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    _patch_manifest(monkeypatch, MANIFEST_ENTRIES[:1])
    assert main(["report", str(tmp_path)]) == 0
    out = capsys.readouterr().out
    assert f"missing\t{tmp_path / 'alpha_exceptions.yaml'}" in out


def test_main_report_rejects_unsafe_paths(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    evil = tmp_path / "evil\tname.yaml"
    _patch_manifest(monkeypatch, [{"path": str(evil), "description": "evil"}])
    with pytest.raises(ValueError, match="TAB/newline"):
        main(["report", str(tmp_path)])


def test_main_requires_subcommand() -> None:
    with pytest.raises(SystemExit):
        main([])
