"""Tests for lib/check_policy_integrity.py."""

import os
import subprocess
import sys
from pathlib import Path

import yaml
from check_policy_integrity import _entry_digest, _is_broad, main

PROJECT = Path(__file__).resolve().parents[2]

BROAD_ENTRY = {"paths": [".*"], "patterns": ["\\bdelve\\b"]}
EXACT_ENTRY = {"paths": ["^README\\.md$"], "patterns": ["protected-system-interpreter"]}


def _write_config(tmp_path, entries, baseline_digests):
    (tmp_path / "banned_words.yaml").write_text(
        yaml.safe_dump(
            {"version": "4.0.0", "universal_exceptions": entries, "banned": []}
        )
    )
    (tmp_path / "policy_integrity_baseline.yaml").write_text(
        yaml.safe_dump({"universal": baseline_digests, "project": []})
    )


def _run(tmp_path, monkeypatch):
    monkeypatch.setenv("CI_CONFIG_DIR", str(tmp_path))
    monkeypatch.chdir(PROJECT)
    return main()


def test_exact_single_file_entry_passes(tmp_path, monkeypatch):
    _write_config(tmp_path, [EXACT_ENTRY], [])
    assert _run(tmp_path, monkeypatch) == 0


def test_new_catchall_entry_fails(tmp_path, monkeypatch):
    _write_config(tmp_path, [BROAD_ENTRY], [])
    assert _run(tmp_path, monkeypatch) == 1


def test_baselined_broad_entry_passes(tmp_path, monkeypatch):
    _write_config(tmp_path, [BROAD_ENTRY], [_entry_digest(BROAD_ENTRY)])
    assert _run(tmp_path, monkeypatch) == 0


def test_directory_wide_entry_fails(tmp_path, monkeypatch):
    entry = {"paths": ["scripts/"], "patterns": ["\\bpython3?\\b"]}
    _write_config(tmp_path, [entry], [])
    assert _run(tmp_path, monkeypatch) == 1


def test_extension_wide_entry_fails(tmp_path, monkeypatch):
    entry = {"paths": ["\\.sh$"], "patterns": ["\\bpython3?\\b"]}
    _write_config(tmp_path, [entry], [])
    assert _run(tmp_path, monkeypatch) == 1


def test_unanchored_path_fails(tmp_path, monkeypatch):
    entry = {"paths": ["README\\.md"], "patterns": ["\\bpython3?\\b"]}
    _write_config(tmp_path, [entry], [])
    assert _run(tmp_path, monkeypatch) == 1


def test_multi_path_entry_fails(tmp_path, monkeypatch):
    entry = {
        "paths": ["^README\\.md$", "^Makefile$"],
        "patterns": ["\\bpython3?\\b"],
    }
    _write_config(tmp_path, [entry], [])
    assert _run(tmp_path, monkeypatch) == 1


def test_exact_entry_matching_two_files_fails(tmp_path, monkeypatch):
    entry = {"paths": ["^.*\\.md$"], "patterns": ["\\bpython3?\\b"]}
    _write_config(tmp_path, [entry], [])
    assert _run(tmp_path, monkeypatch) == 1


def test_exact_entry_matching_zero_files_fails(tmp_path, monkeypatch):
    entry = {"paths": ["^no-such-file\\.xyz$"], "patterns": ["\\bpython3?\\b"]}
    _write_config(tmp_path, [entry], [])
    assert _run(tmp_path, monkeypatch) == 1


def test_modified_baselined_entry_fails(tmp_path, monkeypatch):
    variant = dict(BROAD_ENTRY, patterns=["\\btapestry\\b"])
    _write_config(tmp_path, [variant], [_entry_digest(BROAD_ENTRY)])
    assert _run(tmp_path, monkeypatch) == 1


def test_current_repo_policy_passes_with_generated_baseline(tmp_path, monkeypatch):
    bw = yaml.safe_load((PROJECT / "config" / "banned_words.yaml").read_text())
    digests = [
        _entry_digest(e)
        for e in bw.get("universal_exceptions") or []
        if _is_broad(e)
    ]
    (tmp_path / "banned_words.yaml").write_text(
        (PROJECT / "config" / "banned_words.yaml").read_text()
    )
    (tmp_path / "policy_integrity_baseline.yaml").write_text(
        yaml.safe_dump({"universal": sorted(digests), "project": []})
    )
    assert _run(tmp_path, monkeypatch) == 0


def test_shell_wrapper_exists_and_is_wired():
    body = (PROJECT / "lib" / "checks_core.sh").read_text()
    assert "ci_check_policy_integrity" in body
    precommit = (PROJECT / ".pre-commit-config.yaml").read_text()
    assert "check-policy-integrity" in precommit


def test_generator_and_checker_agree(tmp_path, monkeypatch):
    (tmp_path / "banned_words.yaml").write_text(
        (PROJECT / "config" / "banned_words.yaml").read_text()
    )
    gen = subprocess.run(
        [sys.executable, str(PROJECT / "lib" / "gen_policy_baseline.py")],
        capture_output=True,
        text=True,
        cwd=PROJECT,
        check=False,
        env={**os.environ, "CI_CONFIG_DIR": str(tmp_path)},
    )
    assert gen.returncode == 0, gen.stderr
    baseline = yaml.safe_load(
        (tmp_path / "policy_integrity_baseline.yaml").read_text()
    )
    bw = yaml.safe_load((PROJECT / "config" / "banned_words.yaml").read_text())
    expected = sum(1 for e in bw["universal_exceptions"] if _is_broad(e))
    assert len(baseline["universal"]) == expected
    monkeypatch.setenv("CI_CONFIG_DIR", str(tmp_path))
    monkeypatch.chdir(PROJECT)
    assert main() == 0
