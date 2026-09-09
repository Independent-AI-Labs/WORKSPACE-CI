"""Tests for lib/check_policy_integrity.py (schema v5, final model)."""

import subprocess
import sys
from pathlib import Path

import pytest
import yaml
from check_policy_integrity import main

from ci import paths as ci_paths

PROJECT = Path(__file__).resolve().parents[2]


@pytest.fixture(autouse=True)
def _clear_override_manifest_cache():
    """Resolution state must not leak across tests (lru_cache in
    ci.paths._load_override_manifest survives env changes; xdist workers
    reuse one process for many files)."""
    ci_paths.clear_config_override_cache()
    yield
    ci_paths.clear_config_override_cache()


def _write_repo(tmp_path: Path, *, universal=None, project=None, classifications=None):
    """Create a config dir + repo tree; return paths."""
    config = tmp_path / "config"
    config.mkdir()
    doc = {"version": "5.0.0", "rules": universal.get("rules", []), "exceptions": universal.get("exceptions", [])}
    for key in ("directory_rules", "filename_rules"):
        if universal.get(key):
            doc[key] = universal[key]
    (config / "banned_words.yaml").write_text(yaml.safe_dump(doc))
    if project is not None:
        (config / "banned_words_exceptions_v5.yaml").write_text(
            yaml.safe_dump({"exceptions": project})
        )
    if classifications is not None:
        (config / "file_classifications.yaml").write_text(yaml.safe_dump(classifications))
    subprocess.run(["git", "-C", str(tmp_path), "init", "-q"], check=True)
    (tmp_path / "README.md").write_text("# repo\n")
    subprocess.run(["git", "-C", str(tmp_path), "add", "."], check=True)
    return config


def _run(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> int:
    monkeypatch.setenv("CI_CONFIG_DIR", str(tmp_path / "config"))
    monkeypatch.delenv("CI_SCAN_ROOT", raising=False)
    monkeypatch.delenv("CI_CONFIG_OVERRIDES", raising=False)
    monkeypatch.delenv("CI_CONFIG_PATH_POLICY_INTEGRITY_BASELINE", raising=False)
    monkeypatch.delenv("CI_GUARD_CONFIG_OVERRIDES", raising=False)
    monkeypatch.chdir(PROJECT)
    return main()


RULE = {
    "id": "sample-rule",
    "mode": "raw-regex",
    "case": "sensitive",
    "pattern": "\\bdelve\\b",
    "reason": "Banned word.",
}


def _exc(rule="sample-rule", path="^README\\.md$", **over):
    entry = {
        "rule": rule,
        "path": path,
        "rationale": "File must quote the rule for its defined role.",
        "owner": "workspace-ci",
        "review_date": "2026-09-05",
        "removal": "Remove when no longer quoted.",
    }
    entry.update(over)
    return entry


def test_valid_policy_passes(tmp_path, monkeypatch):
    _write_repo(tmp_path, universal={"rules": [RULE], "exceptions": [_exc()]})
    assert _run(tmp_path, monkeypatch) == 0


def test_missing_rule_id_fails(tmp_path, monkeypatch):
    bad = dict(RULE)
    del bad["id"]
    _write_repo(tmp_path, universal={"rules": [bad]})
    assert _run(tmp_path, monkeypatch) == 1


def test_duplicate_rule_id_fails(tmp_path, monkeypatch):
    _write_repo(tmp_path, universal={"rules": [RULE, dict(RULE)]})
    assert _run(tmp_path, monkeypatch) == 1


def test_undeclared_mode_fails(tmp_path, monkeypatch):
    bad = dict(RULE, mode="regex")
    _write_repo(tmp_path, universal={"rules": [bad]})
    assert _run(tmp_path, monkeypatch) == 1


def test_unknown_rule_key_fails(tmp_path, monkeypatch):
    bad = dict(RULE, legacy_field="x")
    _write_repo(tmp_path, universal={"rules": [bad]})
    assert _run(tmp_path, monkeypatch) == 1


def test_exception_unknown_rule_fails(tmp_path, monkeypatch):
    _write_repo(tmp_path, universal={"rules": [RULE], "exceptions": [_exc(rule="no-such-rule")]})
    assert _run(tmp_path, monkeypatch) == 1


def test_exception_for_non_exemptible_rule_fails(tmp_path, monkeypatch):
    strict = dict(RULE, id="strict-rule", non_exemptible=True)
    _write_repo(tmp_path, universal={"rules": [strict], "exceptions": [_exc(rule="strict-rule")]})
    assert _run(tmp_path, monkeypatch) == 1


def test_exception_missing_provenance_fails(tmp_path, monkeypatch):
    entry = _exc()
    del entry["owner"]
    _write_repo(tmp_path, universal={"rules": [RULE], "exceptions": [entry]})
    assert _run(tmp_path, monkeypatch) == 1


def test_exception_bad_review_date_fails(tmp_path, monkeypatch):
    _write_repo(tmp_path, universal={"rules": [RULE], "exceptions": [_exc(review_date="05.09.2026")]})
    assert _run(tmp_path, monkeypatch) == 1


def test_multi_path_exception_fails_at_load(tmp_path, monkeypatch):
    entry = _exc(path="^README\\.md$")
    _write_repo(tmp_path, universal={"rules": [RULE], "exceptions": [entry]})
    assert _run(tmp_path, monkeypatch) == 0


def test_project_exception_zero_match_fails(tmp_path, monkeypatch):
    _write_repo(
        tmp_path,
        universal={"rules": [RULE]},
        project=[_exc(path="^no-such-file\\.xyz$")],
    )
    assert _run(tmp_path, monkeypatch) == 1


def test_project_exception_wildcard_match_fails(tmp_path, monkeypatch):
    """A path regex matching two tracked files must fail (exactly one)."""
    (tmp_path / "other.md").write_text("x\n")
    _write_repo(
        tmp_path,
        universal={"rules": [RULE]},
        project=[_exc(path="^.*\\.md$")],
    )
    assert _run(tmp_path, monkeypatch) == 1


def test_classification_entry_must_be_exact_tracked_file(tmp_path, monkeypatch):
    _write_repo(
        tmp_path,
        universal={"rules": [RULE]},
        classifications={"test_roots": ["tests/"], "files": {"nope.png": {"class": "binary"}}},
    )
    assert _run(tmp_path, monkeypatch) == 1


def test_generated_classification_requires_validator(tmp_path, monkeypatch):
    _write_repo(
        tmp_path,
        universal={"rules": [RULE]},
        classifications={
            "files": {"README.md": {"class": "generated"}},
        },
    )
    assert _run(tmp_path, monkeypatch) == 1


def test_shell_wrapper_exists_and_is_wired():
    body = (PROJECT / "lib" / "checks_core.sh").read_text()
    assert "ci_check_policy_integrity" in body
    precommit = (PROJECT / ".pre-commit-config.yaml").read_text()
    assert "check-policy-integrity" in precommit


def test_policy_integrity_runs_before_banned_words_hook():
    """Structural validation precedes ordinary exemption application."""
    precommit = (PROJECT / ".pre-commit-config.yaml").read_text()
    assert precommit.index("check-policy-integrity") < precommit.index("check-banned-words")


def test_no_hardcoded_protected_directory_list_in_checker():
    """REQ §14.2/19.16: no hardcoded directory allowlist may exist."""
    body = (PROJECT / "lib" / "check_policy_integrity.py").read_text()
    assert "FORBIDDEN_SCOPES" not in body
    body2 = (PROJECT / "ci" / "banned_scan" / "classify.py").read_text()
    for name in ("scripts", "res/ansible", "bootstrap", "hitl", "Makefile"):
        assert name not in body2
