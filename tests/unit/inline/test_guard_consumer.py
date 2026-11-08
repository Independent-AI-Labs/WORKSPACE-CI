"""Tests for the sealed scanner client and the CI consumer mapping."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from ci import check_inline_code as check
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


def _finding(root: Path, exemptible: bool) -> dict[str, object]:
    return {
        "path": str(root / "a.txt"),
        "rule": "r",
        "category": "c",
        "line": 1,
        "column": 1,
        "matched": "x",
        "view": "raw",
        "reason": "why",
        "exemptible": exemptible,
    }


def test_consumer_applies_exemption(monkeypatch, tmp_path):
    (tmp_path / "a.txt").write_text("x", encoding="utf-8")
    policy = check.Policy([], [], 2, {("r", "a.txt")})
    monkeypatch.setattr(
        inline_scanner, "scan", lambda entries: [_finding(tmp_path, True)]
    )
    assert check._scan_all_guard(["a.txt"], tmp_path, policy, None) == []


def test_consumer_keeps_non_exemptible_finding(monkeypatch, tmp_path):
    (tmp_path / "a.txt").write_text("x", encoding="utf-8")
    policy = check.Policy([], [], 2, {("r", "a.txt")})
    monkeypatch.setattr(
        inline_scanner, "scan", lambda entries: [_finding(tmp_path, False)]
    )
    findings = check._scan_all_guard(["a.txt"], tmp_path, policy, None)
    assert [finding.rule.id for finding in findings] == ["r"]