"""Tests for ci/effective_exemptions.py (report, violations, drift)."""

import json
import subprocess
import sys
from pathlib import Path

import pytest
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from ci import effective_exemptions as cee
from ci.banned_scan import model

RULE = {
    "id": "sample-rule",
    "mode": "raw-regex",
    "case": "sensitive",
    "pattern": "\\bzonk\\b",
    "reason": "Banned token.",
}


def _write_repo(tmp_path: Path, *, rules=None, exceptions=(), project=()):
    if not (tmp_path / ".git").exists():
        subprocess.run(["git", "-C", str(tmp_path), "init", "-q"], check=True)
    config = tmp_path / "config"
    config.mkdir(exist_ok=True)
    (config / "banned_words.yaml").write_text(
        yaml.safe_dump(
            {
                "version": "5.0.0",
                "rules": rules or [RULE],
                "exceptions": list(exceptions),
            }
        ),
        encoding="utf-8",
    )
    (config / "banned_words_exceptions_v5.yaml").write_text(
        yaml.safe_dump({"exceptions": list(project)}), encoding="utf-8"
    )


def _exc(rule="sample-rule", path="^README\\.md$", **over):
    entry = {
        "rule": rule,
        "path": path,
        "rationale": "quoted data required",
        "owner": "workspace-ci",
        "review_date": "2026-09-07",
        "removal": "when no longer quoted",
    }
    entry.update(over)
    return entry


def test_build_resolves_exact_file(tmp_path: Path, monkeypatch):
    _write_repo(tmp_path, exceptions=[_exc()])
    (tmp_path / "README.md").write_text("# r\n")
    subprocess.run(["git", "-C", str(tmp_path), "add", "README.md"], check=True)
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("CI_CONFIG_DIR", str(tmp_path / "config"))
    report = cee.build(tmp_path)
    entry = report["exemptions"][0]
    assert entry["file"] == "README.md"
    assert entry["match_count"] == 1


def test_violations_flag_unused(tmp_path: Path, monkeypatch):
    _write_repo(tmp_path, exceptions=[_exc(path="^no-such\\.md$")])
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("CI_CONFIG_DIR", str(tmp_path / "config"))
    bad = cee.violations(cee.build(tmp_path))
    assert len(bad) > 0
    assert "unused exemption" in bad[0]


def test_drift_detects_target_change():
    old = {
        "exemptions": [{"source": "universal", "rule": "r", "path": "^a$", "file": "a"}]
    }
    new = {
        "exemptions": [{"source": "universal", "rule": "r", "path": "^a$", "file": "b"}]
    }
    d = cee.drift(old, new)
    assert any("target changed" in x for x in d)


def test_drift_detects_add_and_remove():
    old = {
        "exemptions": [{"source": "universal", "rule": "r", "path": "^a$", "file": "a"}]
    }
    d = cee.drift(old, {"exemptions": []})
    assert any("removed" in x for x in d)
    d2 = cee.drift(
        {"exemptions": []}, old["exemptions"] and {"exemptions": old["exemptions"]}
    )
    assert any("added" in x for x in d2)


def test_check_mode_fails_without_artifact(tmp_path: Path, monkeypatch, capsys):
    _write_repo(tmp_path, exceptions=[])
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("CI_CONFIG_DIR", str(tmp_path / "config"))
    monkeypatch.setenv("CI_SCAN_ROOT", str(tmp_path))
    rc = cee.main([])
    assert rc == 1
    assert "absent" in capsys.readouterr().err


def test_regen_writes_artifact(tmp_path: Path, monkeypatch):
    _write_repo(tmp_path, exceptions=[_exc()])
    (tmp_path / "README.md").write_text("# r\n")
    subprocess.run(["git", "-C", str(tmp_path), "add", "README.md"], check=True)
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("CI_CONFIG_DIR", str(tmp_path / "config"))
    monkeypatch.setattr(cee, "ARTIFACT", tmp_path / "reports" / "ee.json")
    rc = cee.main(["--regen"])
    assert rc == 0
    data = json.loads((tmp_path / "reports" / "ee.json").read_text())
    assert data["exemption_count"] == 1


def test_regen_refuses_violations(tmp_path: Path, monkeypatch, capsys):
    _write_repo(tmp_path, exceptions=[_exc(path="^gone\\.md$")])
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("CI_CONFIG_DIR", str(tmp_path / "config"))
    monkeypatch.setattr(cee, "ARTIFACT", tmp_path / "reports" / "ee.json")
    rc = cee.main(["--regen"])
    assert rc == 1
    assert "unused" in capsys.readouterr().err


INVALID_RULES = [
    {"mode": "raw-regex", "case": "sensitive", "pattern": "x", "reason": "r"},  # no id
    {"id": "x", "case": "sensitive", "pattern": "x", "reason": "r"},  # no mode
    {"id": "x", "mode": "raw-regex", "pattern": "x", "reason": "r"},  # no case
    {"id": "x", "mode": "raw-regex", "case": "sensitive", "reason": "r"},  # no pattern
    {"id": "x", "mode": "raw-regex", "case": "sensitive", "pattern": "x"},  # no reason
    {
        "id": "X!",
        "mode": "raw-regex",
        "case": "sensitive",
        "pattern": "x",
        "reason": "r",
    },
    {"id": "x", "mode": "raw-regex", "case": "weird", "pattern": "x", "reason": "r"},
    {
        "id": "x",
        "mode": "raw-regex",
        "case": "sensitive",
        "pattern": "x",
        "reason": "r",
        "bogus": 1,
    },
    {
        "id": "x",
        "mode": "raw-regex",
        "case": "sensitive",
        "pattern": "((",
        "reason": "r",
    },
    {
        "id": "x",
        "mode": "raw-regex",
        "case": "sensitive",
        "pattern": "a" * 500,
        "reason": "r",
    },
    {
        "id": "x",
        "mode": "raw-regex",
        "case": "sensitive",
        "pattern": "x",
        "reason": "r",
        "scope": "wide",
    },
    {
        "id": "strict",
        "mode": "raw-regex",
        "case": "sensitive",
        "pattern": "x",
        "reason": "r",
        "non_exemptible": True,
        "scope": "docs",
    },
]


@pytest.mark.parametrize("rule", INVALID_RULES)
def test_invalid_rules_fail_closed(tmp_path: Path, rule):
    (tmp_path / "banned_words.yaml").write_text(
        yaml.safe_dump({"version": "5.0.0", "rules": [rule]}), encoding="utf-8"
    )
    with pytest.raises(model.PolicyError):
        model.load_universal(tmp_path)


def test_bad_version_rejected(tmp_path: Path):
    (tmp_path / "banned_words.yaml").write_text(
        yaml.safe_dump({"version": "4.0.0", "rules": []}), encoding="utf-8"
    )
    with pytest.raises(model.PolicyError, match="version"):
        model.load_universal(tmp_path)


def test_non_mapping_document_rejected(tmp_path: Path):
    (tmp_path / "banned_words.yaml").write_text("- a\n- b\n", encoding="utf-8")
    with pytest.raises(model.PolicyError, match="mapping"):
        model.load_universal(tmp_path)


def test_unreadable_policy_rejected(tmp_path: Path):
    (tmp_path / "banned_words.yaml").write_text("rules: [unclosed", encoding="utf-8")
    with pytest.raises(model.PolicyError, match="cannot load"):
        model.load_universal(tmp_path)


def test_directory_rules_and_filename_sections(tmp_path: Path):
    doc = {
        "version": "5.0.0",
        "rules": [RULE],
        "directory_rules": {
            "tests": [
                {
                    "id": "tests-x",
                    "mode": "raw-regex",
                    "case": "sensitive",
                    "pattern": "x",
                    "reason": "r",
                }
            ]
        },
        "filename_rules": [
            {
                "id": "filename-y",
                "mode": "filename",
                "case": "fold",
                "pattern": "_old",
                "reason": "r",
            }
        ],
        "exceptions": [],
    }
    (tmp_path / "banned_words.yaml").write_text(yaml.safe_dump(doc), encoding="utf-8")
    policy = model.load_universal(tmp_path)
    assert "tests-x" in policy.rules
    assert policy.rules["tests-x"].directory == "tests"
    assert policy.filename_rules[0].id == "filename-y"
    assert "tests-x" in policy.order
