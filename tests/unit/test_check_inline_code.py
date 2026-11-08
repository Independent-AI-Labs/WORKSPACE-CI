"""Tests for the inline-code consumer (ci/check_inline_code.py)."""

from __future__ import annotations

import runpy
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from ci import check_inline_code as check
from ci import inline_scanner, verify_runtime

SCANNER = Path("/usr/lib/workspace-guard/sealed/inline-scan")


def _write(root: Path, name: str, text: str) -> str:
    path = root / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return name


def _finding(
    root: Path, rel: str, exemptible: bool = True
) -> inline_scanner.ScanFinding:
    return {
        "path": str(root / rel),
        "rule": "r",
        "category": "c",
        "line": 1,
        "column": 1,
        "matched": "x",
        "view": "raw",
        "reason": "why",
        "exemptible": exemptible,
    }


def test_detect_language_by_extension():
    assert check.detect_language("doc.md") == "markdown"
    assert check.detect_language("run.sh") == "shell"
    assert check.detect_language("data.yaml") == "yaml"


def test_detect_language_by_shebang():
    assert check.detect_language("hook", "#!/bin/bash\necho hi\n") == "shell"


def test_detect_language_unknown():
    assert check.detect_language("notes.txt", "hello\n") is None


def test_load_policy_reads_exemptions(tmp_path):
    config = tmp_path / "config"
    config.mkdir()
    (config / "inline_code.yaml").write_text(
        "exemptions:\n  - rule: r\n    path: p\n", encoding="utf-8"
    )
    assert check.load_policy(config).exemptions == {("r", "p")}


def test_load_policy_missing_file(tmp_path):
    with pytest.raises(check.PolicyError):
        check.load_policy(tmp_path)


def test_load_policy_rejects_non_mapping(tmp_path):
    config = tmp_path / "config"
    config.mkdir()
    (config / "inline_code.yaml").write_text("- item\n", encoding="utf-8")
    with pytest.raises(check.PolicyError):
        check.load_policy(config)


def test_policy_dir_ignores_hostile_environment(tmp_path, monkeypatch):
    hostile = tmp_path / "hostile"
    hostile.mkdir()
    (hostile / "inline_code.yaml").write_text("version: 1.0.0\n", encoding="utf-8")
    monkeypatch.setenv("CI_CONFIG_PATH_INLINE_CODE", str(hostile / "inline_code.yaml"))
    monkeypatch.setenv("CI_CONFIG_DIR", str(hostile))
    expected = Path(check.__file__).resolve().parent.joinpath("..").resolve() / "config"
    assert check._policy_dir() == expected


def test_load_project_exemptions_reads_entries(tmp_path):
    config = tmp_path / "config"
    config.mkdir()
    (config / "inline_code_exceptions.yaml").write_text(
        "exemptions:\n  - rule: r\n    path: p\n", encoding="utf-8"
    )
    assert check.load_project_exemptions(tmp_path) == {("r", "p")}


def test_load_project_exemptions_rejects_non_mapping(tmp_path):
    config = tmp_path / "config"
    config.mkdir()
    (config / "inline_code_exceptions.yaml").write_text(
        "- not a mapping\n", encoding="utf-8"
    )
    with pytest.raises(check.PolicyError):
        check.load_project_exemptions(tmp_path)


def test_load_project_exemptions_rejects_invalid_yaml(tmp_path):
    config = tmp_path / "config"
    config.mkdir()
    (config / "inline_code_exceptions.yaml").write_text(
        "exemptions: [\n", encoding="utf-8"
    )
    with pytest.raises(check.PolicyError):
        check.load_project_exemptions(tmp_path)


def test_load_project_exemptions_empty_is_empty(tmp_path):
    config = tmp_path / "config"
    config.mkdir()
    (config / "inline_code_exceptions.yaml").write_text("", encoding="utf-8")
    assert check.load_project_exemptions(tmp_path) == set()


def test_consumer_maps_findings(monkeypatch, tmp_path):
    _write(tmp_path, "a.txt", "x")
    monkeypatch.setattr(
        inline_scanner, "scan", lambda entries: [_finding(tmp_path, "a.txt")]
    )
    findings = check._scan_all_guard(["a.txt"], tmp_path, check.Policy(set()), None)
    assert [f.rule.id for f in findings] == ["r"]


def test_consumer_applies_exemption(monkeypatch, tmp_path):
    _write(tmp_path, "a.txt", "x")
    monkeypatch.setattr(
        inline_scanner, "scan", lambda entries: [_finding(tmp_path, "a.txt")]
    )
    policy = check.Policy({("r", "a.txt")})
    assert check._scan_all_guard(["a.txt"], tmp_path, policy, None) == []


def test_consumer_keeps_non_exemptible_finding(monkeypatch, tmp_path):
    _write(tmp_path, "a.txt", "x")
    monkeypatch.setattr(
        inline_scanner,
        "scan",
        lambda entries: [_finding(tmp_path, "a.txt", exemptible=False)],
    )
    policy = check.Policy({("r", "a.txt")})
    assert len(check._scan_all_guard(["a.txt"], tmp_path, policy, None)) == 1


def test_consumer_skips_self_and_missing(monkeypatch, tmp_path):
    monitor: list[str] = []
    monkeypatch.setattr(
        inline_scanner,
        "scan",
        lambda entries: monitor.extend(entry["path"] for entry in entries) or [],
    )
    check._scan_all_guard(
        ["ci/check_inline_code.py", "missing.txt"], tmp_path, check.Policy(set()), None
    )
    assert monitor == []


def _patch_discovery(monkeypatch, root: Path, files: list[str]) -> None:
    monkeypatch.setattr(check.discover, "scan_root", lambda: root)
    monkeypatch.setattr(check.discover, "tracked_files", lambda argv, root: files)
    monkeypatch.setattr(check.classify, "load", lambda root: None)
    monkeypatch.setattr(check, "load_project_exemptions", lambda root: set())


def test_main_reports_violation(monkeypatch, tmp_path, capsys):
    _write(tmp_path, "bad.sh", "x")
    _patch_discovery(monkeypatch, tmp_path, ["bad.sh"])
    monkeypatch.setattr(check, "load_policy", lambda config_dir: check.Policy(set()))
    monkeypatch.setattr(
        inline_scanner, "scan", lambda entries: [_finding(tmp_path, "bad.sh")]
    )
    assert check.main(["bad.sh"]) == 1
    out = capsys.readouterr().out
    assert "bad.sh" in out
    assert "r" in out


def test_main_reports_clean_tree(monkeypatch, tmp_path, capsys):
    _write(tmp_path, "ok.sh", "echo hi\n")
    _patch_discovery(monkeypatch, tmp_path, ["ok.sh"])
    monkeypatch.setattr(check, "load_policy", lambda config_dir: check.Policy(set()))
    monkeypatch.setattr(inline_scanner, "scan", lambda entries: [])
    assert check.main(["ok.sh"]) == 0
    assert "No inline code" in capsys.readouterr().out


def test_main_fails_closed_on_policy_error(monkeypatch, capsys):
    def _boom(_config_dir):
        error = check.PolicyError("bad policy")
        raise error

    monkeypatch.setattr(check, "load_policy", _boom)
    assert check.main([]) == 1
    assert "bad policy" in capsys.readouterr().err


def test_main_fails_closed_on_exemption_error(monkeypatch, tmp_path, capsys):
    _write(tmp_path, "x.sh", "echo hi\n")
    monkeypatch.setattr(check.discover, "scan_root", lambda: tmp_path)
    monkeypatch.setattr(check.discover, "tracked_files", lambda argv, root: ["x.sh"])
    monkeypatch.setattr(check, "load_policy", lambda config_dir: check.Policy(set()))

    def _boom(_root):
        error = check.PolicyError("bad exemptions")
        raise error

    monkeypatch.setattr(check, "load_project_exemptions", _boom)
    assert check.main(["x.sh"]) == 1
    assert "bad exemptions" in capsys.readouterr().err


def test_main_fails_closed_on_scanner_error(monkeypatch, tmp_path, capsys):
    _write(tmp_path, "x.sh", "echo hi\n")
    _patch_discovery(monkeypatch, tmp_path, ["x.sh"])
    monkeypatch.setattr(check, "load_policy", lambda config_dir: check.Policy(set()))

    def _boom(_entries):
        error = inline_scanner.ScannerError("scanner failed")
        raise error

    monkeypatch.setattr(inline_scanner, "scan", _boom)
    assert check.main(["x.sh"]) == 1
    assert "scanner failed" in capsys.readouterr().err


@pytest.mark.skipif(not SCANNER.is_file(), reason="sealed inline scanner not installed")
def test_sealed_scanner_detects_inline_code(tmp_path):
    payload = "value=$(" + "python" + "3" + " -c 'print(1)')\n"
    rel = _write(tmp_path, "bad.sh", payload)
    findings = check._scan_all_guard([rel], tmp_path, check.Policy(set()), None)
    assert [finding.rule.id for finding in findings] == ["interp-inline-code"]


def test_verify_runtime_reports_runtime(capsys):
    assert verify_runtime.main() == 0
    assert "runtime ok" in capsys.readouterr().out


def test_verify_runtime_main_guard():
    with pytest.raises(SystemExit) as exc:
        runpy.run_module("ci.verify_runtime", run_name="__main__")
    assert exc.value.code == 0
