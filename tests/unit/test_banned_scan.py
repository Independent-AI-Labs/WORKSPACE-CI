"""Contract tests for ci/banned_scan (schema v5 engine)."""

import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from ci.banned_scan import classify, engine, model

RULE = {
    "id": "sample-rule",
    "mode": "raw-regex",
    "case": "sensitive",
    "pattern": "\\bzonk\\b",
    "reason": "Banned token.",
}


def _policy(tmp_path: Path, rules, exceptions=(), filename_rules=()):
    doc = {
        "version": "5.0.0",
        "rules": list(rules),
        "filename_rules": list(filename_rules),
        "exceptions": list(exceptions),
    }
    (tmp_path / "banned_words.yaml").write_text(
        __import__("yaml").safe_dump(doc), encoding="utf-8"
    )
    return model.load_universal(tmp_path)


def _exc(path="^target\\.txt$", rule="sample-rule"):
    return {
        "rule": rule,
        "path": path,
        "rationale": "quoted data required",
        "owner": "workspace-ci",
        "review_date": "2026-09-05",
        "removal": "when no longer quoted",
    }


def _classes(tmp_path: Path, **manifest):
    path = tmp_path / "file_classifications.yaml"
    import yaml

    path.write_text(yaml.safe_dump(manifest), encoding="utf-8")
    return classify.load_from(path)


def test_all_matches_reported_with_line_and_col(tmp_path: Path):
    policy = _policy(tmp_path, [RULE])
    (tmp_path / "a.txt").write_text("ok\nzonk\nzonk here\n", encoding="utf-8")
    findings = engine.scan_file("a.txt", tmp_path, policy, {}, classify.Classifications({}, (), (), ()))
    assert [(f.line, f.col) for f in findings] == [(2, 1), (3, 1)]
    assert all(f.rule.id == "sample-rule" for f in findings)


def test_multiline_rule_matches_whole_content(tmp_path: Path):
    rule = dict(RULE, id="two-line", pattern="start\\nend")
    policy = _policy(tmp_path, [rule])
    (tmp_path / "a.txt").write_text("x\nstart\nend\n", encoding="utf-8")
    findings = engine.scan_file("a.txt", tmp_path, policy, {}, classify.Classifications({}, (), (), ()))
    assert len(findings) == 1
    assert findings[0].line == 2


def test_invalid_utf8_fails_closed(tmp_path: Path):
    policy = _policy(tmp_path, [RULE])
    (tmp_path / "bad.txt").write_bytes(b"ok \xff\xfe\n")
    with pytest.raises(engine.InputError):
        engine.read_text(tmp_path / "bad.txt")


def test_nul_byte_fails_closed(tmp_path: Path):
    (tmp_path / "nul.txt").write_bytes(b"ok\x00zonk\n")
    with pytest.raises(engine.InputError):
        engine.read_text(tmp_path / "nul.txt")


def test_binary_classification_skips_decode(tmp_path: Path):
    policy = _policy(tmp_path, [RULE])
    (tmp_path / "logo.png").write_bytes(b"\x89PNG\r\n\x1a\n zonk")
    classes = _classes(tmp_path, files={"logo.png": {"class": "binary"}})
    findings = engine.scan_file("logo.png", tmp_path, policy, {}, classes)
    assert findings == []


def test_exact_exception_resolves_by_rule_id(tmp_path: Path):
    policy = _policy(tmp_path, [RULE], exceptions=[_exc()])
    (tmp_path / "target.txt").write_text("zonk\n", encoding="utf-8")
    classes = classify.Classifications({}, (), (), ())
    assert engine.scan_file("target.txt", tmp_path, policy, {}, classes) == []
    (tmp_path / "other.txt").write_text("zonk\n", encoding="utf-8")
    assert len(engine.scan_file("other.txt", tmp_path, policy, {}, classes)) == 1


def test_non_exemptible_rule_ignores_exceptions(tmp_path: Path):
    strict = dict(RULE, non_exemptible=True)
    with pytest.raises(model.PolicyError):
        _policy(tmp_path, [strict], exceptions=[_exc()])


def test_wildcard_exception_unrepresentable(tmp_path: Path):
    with pytest.raises(model.PolicyError):
        _policy(tmp_path, [RULE], exceptions=[_exc(path="^.*$")])


def test_unanchored_exception_rejected(tmp_path: Path):
    with pytest.raises(model.PolicyError):
        _policy(tmp_path, [RULE], exceptions=[_exc(path="target\\.txt")])


def test_production_scope_skips_test_segment_paths(tmp_path: Path):
    scoped = dict(RULE, id="prod-only", scope="production")
    policy = _policy(tmp_path, [scoped])
    classes = _classes(tmp_path, test_roots=["tests/"])
    (tmp_path / "lib_x.ts").write_text("zonk\n", encoding="utf-8")
    (tmp_path / "tests" / "unit").mkdir(parents=True)
    (tmp_path / "tests" / "unit" / "a.test.ts").write_text("zonk\n", encoding="utf-8")
    (tmp_path / "web-components" / "tests").mkdir(parents=True)
    (tmp_path / "web-components" / "tests" / "b.test.tsx").write_text("zonk\n", encoding="utf-8")
    flagged = {
        f.path
        for f in [
            *engine.scan_file("lib_x.ts", tmp_path, policy, {}, classes),
            *engine.scan_file("tests/unit/a.test.ts", tmp_path, policy, {}, classes),
            *engine.scan_file("web-components/tests/b.test.tsx", tmp_path, policy, {}, classes),
        ]
    }
    assert flagged == {"lib_x.ts"}


def test_non_exemptible_rule_applies_to_test_paths(tmp_path: Path):
    strict = dict(RULE, id="strict", non_exemptible=True)
    policy = _policy(tmp_path, [strict])
    classes = _classes(tmp_path, test_roots=["tests/"])
    (tmp_path / "tests").mkdir()
    (tmp_path / "tests" / "a.sh").write_text("zonk\n", encoding="utf-8")
    assert len(engine.scan_file("tests/a.sh", tmp_path, policy, {}, classes)) == 1


def test_filename_rule_matches_basename_and_path(tmp_path: Path):
    fn = {"id": "filename-backup", "mode": "filename", "case": "fold",
          "pattern": "_v[0-9]+", "reason": "versioned file"}
    policy = _policy(tmp_path, [], filename_rules=[fn])
    classes = classify.Classifications({}, (), (), ())
    (tmp_path / "doc_v2.md").write_text("x\n", encoding="utf-8")
    (tmp_path / "plain.md").write_text("x\n", encoding="utf-8")
    hits = [f.path for group in [
        engine.scan_file("doc_v2.md", tmp_path, policy, {}, classes),
        engine.scan_file("plain.md", tmp_path, policy, {}, classes),
    ] for f in group]
    assert hits == ["doc_v2.md"]


def test_filename_rule_skips_classified_files(tmp_path: Path):
    """Classified files (fixture/policy-definition/...) own their names."""
    fn = {"id": "filename-backup", "mode": "filename", "case": "fold",
          "pattern": "_v[0-9]+", "reason": "versioned file"}
    policy = _policy(tmp_path, [], filename_rules=[fn])
    classes = classify.Classifications(
        {"policy/exceptions_v5.yaml": classify.FileClass(
            "policy/exceptions_v5.yaml", "policy-definition", "", "workspace-ci")},
        (), (), (),
    )
    (tmp_path / "policy").mkdir()
    (tmp_path / "policy" / "exceptions_v5.yaml").write_text("x\n", encoding="utf-8")
    (tmp_path / "doc_v2.md").write_text("x\n", encoding="utf-8")
    hits = [f.path for group in [
        engine.scan_file("policy/exceptions_v5.yaml", tmp_path, policy, {}, classes),
        engine.scan_file("doc_v2.md", tmp_path, policy, {}, classes),
    ] for f in group]
    assert hits == ["doc_v2.md"]


def test_nul_delimited_discovery_handles_spaces(tmp_path: Path):
    proc = subprocess.run(
        ["git", "-C", str(tmp_path), "init", "-q"], check=True, capture_output=True
    )
    name = "file with spaces.txt"
    (tmp_path / name).write_text("x\n", encoding="utf-8")
    subprocess.run(["git", "-C", str(tmp_path), "add", name], check=True, capture_output=True)
    from ci.banned_scan import discover

    files = discover.tracked_files([], tmp_path)
    assert name in files


def test_project_exception_file_repo_wins_over_sealed(tmp_path: Path):
    from ci.banned_scan import discover

    repo = tmp_path / "repo"
    sealed = tmp_path / "sealed-config"
    (repo / "config").mkdir(parents=True)
    sealed.mkdir()
    repo_file = repo / "config" / "banned_words_exceptions_v5.yaml"
    sealed_file = sealed / "banned_words_exceptions_v5.yaml"

    assert discover.project_exception_file(sealed, repo) is None
    sealed_file.write_text("exceptions: []\n", encoding="utf-8")
    assert discover.project_exception_file(sealed, repo) == sealed_file
    repo_file.write_text("exceptions: []\n", encoding="utf-8")
    assert discover.project_exception_file(sealed, repo) == repo_file
    assert discover.project_exception_file(repo / "config", repo) == repo_file


def test_unknown_key_fails_closed(tmp_path: Path):
    import yaml

    (tmp_path / "banned_words.yaml").write_text(
        yaml.safe_dump({"version": "5.0.0", "rules": [dict(RULE, oops=1)]}),
        encoding="utf-8",
    )
    with pytest.raises(model.PolicyError):
        model.load_universal(tmp_path)


def test_old_format_rejected_entirely(tmp_path: Path):
    import yaml

    (tmp_path / "banned_words.yaml").write_text(
        yaml.safe_dump({"version": "4.0.0", "banned": [RULE]}), encoding="utf-8"
    )
    with pytest.raises(model.PolicyError):
        model.load_universal(tmp_path)
