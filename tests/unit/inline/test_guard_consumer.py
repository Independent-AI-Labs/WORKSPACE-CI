"""Tests for the sealed scanner client and the CI consumer mapping."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from ci import inline_scanner


def _fake_scanner(tmp_path: Path, response: str) -> Path:
    path = tmp_path / "scan"
    path.write_text(
        "#!/usr/bin/env python3\n"
        "import json, sys\n"
        "json.load(sys.stdin)\n"
        f"print({response!r})\n",
        encoding="utf-8",
    )
    path.chmod(0o755)
    return path


def test_scan_returns_findings(monkeypatch, tmp_path):
    payload = '{"schema":1,"findings":[{"rule":"r"}]}'
    monkeypatch.setattr(inline_scanner, "SCANNER", _fake_scanner(tmp_path, payload))
    monkeypatch.setattr(inline_scanner, "verify_scanner", lambda: None)
    assert inline_scanner.scan([{"path": "a", "language": "text"}]) == [{"rule": "r"}]


def test_missing_scanner_fails(monkeypatch, tmp_path):
    monkeypatch.setattr(inline_scanner, "SCANNER", tmp_path / "missing")
    with pytest.raises(inline_scanner.ScannerError):
        inline_scanner.verify_scanner()


def test_schema_mismatch_fails(monkeypatch, tmp_path):
    payload = '{"schema":2,"findings":[]}'
    monkeypatch.setattr(inline_scanner, "SCANNER", _fake_scanner(tmp_path, payload))
    monkeypatch.setattr(inline_scanner, "verify_scanner", lambda: None)
    with pytest.raises(inline_scanner.ScannerError):
        inline_scanner.scan([])


def test_scan_views_returns_views(monkeypatch, tmp_path):
    payload = (
        '{"schema":2,"files":[{"path":"a","views":'
        '[{"name":"raw","text":"x","offsets":[0]}]}]}'
    )
    monkeypatch.setattr(inline_scanner, "SCANNER", _fake_scanner(tmp_path, payload))
    monkeypatch.setattr(inline_scanner, "verify_scanner", lambda: None)
    files = inline_scanner.scan_views([{"path": "a", "language": "text"}], 0)
    assert files[0]["views"][0]["text"] == "x"


def test_scan_views_schema_mismatch_fails(monkeypatch, tmp_path):
    payload = '{"schema":1,"findings":[]}'
    monkeypatch.setattr(inline_scanner, "SCANNER", _fake_scanner(tmp_path, payload))
    monkeypatch.setattr(inline_scanner, "verify_scanner", lambda: None)
    with pytest.raises(inline_scanner.ScannerError):
        inline_scanner.scan_views([], 0)


def test_scan_views_missing_files_fails(monkeypatch, tmp_path):
    payload = '{"schema":2}'
    monkeypatch.setattr(inline_scanner, "SCANNER", _fake_scanner(tmp_path, payload))
    monkeypatch.setattr(inline_scanner, "verify_scanner", lambda: None)
    with pytest.raises(inline_scanner.ScannerError):
        inline_scanner.scan_views([], 0)
