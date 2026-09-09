"""Shell-guard coverage tests (ledger 139-151, CI side).

The guard-side proposals live in
docs/proposals/PROPOSAL-SHELL-GUARD-INTERPRETER-COVERAGE-2026-09-06.md;
these tests pin the CI-side contract: the banned-pattern layer must
catch absolute interpreter invocations of every family, through
wrappers, command contexts, and separator/normalization tricks,
anywhere in a tracked file.
"""

import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from ci.banned_scan import classify, engine, model

RULE = {
    "id": "protected-system-interpreter",
    "mode": "raw-regex",
    "case": "fold",
    "pattern": (
        r"(?:^|[;&|]|\$\(|`|\b(?:if|elif|while|until|then|do)\s+)\s*!?\s*"
        r"(?:(?:sudo|env|exec|nice|nohup|setsid|stdbuf|timeout|xargs)\s+)*"
        r"(?:[A-Za-z_][A-Za-z0-9_]*=\S+\s+)*"
        r"/(?:usr/)?bin/(?:python[0-9.]*|perl[0-9.]*|ruby[0-9.]*|node|nodejs|"
        r"lua[0-9.]*|php[0-9.]*)\b"
    ),
    "reason": "Hermetic tooling only.",
    "non_exemptible": True,
}


def _policy(tmp_path: Path) -> model.Policy:
    (tmp_path / "banned_words.yaml").write_text(
        yaml.safe_dump({"version": "5.0.0", "rules": [RULE]}), encoding="utf-8"
    )
    return model.load_universal(tmp_path)


def _hits(tmp_path: Path, text: str) -> int:
    policy = _policy(tmp_path)
    (tmp_path / "untrusted.sh").write_text(text, encoding="utf-8")
    classes = classify.Classifications({}, (), (), ())
    return len(engine.scan_file("untrusted.sh", tmp_path, policy, {}, classes))


INTERPRETERS = [
    "/usr/bin/python3 script.py",
    "/bin/python script.py",
    "/usr/bin/perl script.pl",
    "/usr/bin/ruby script.rb",
    "/usr/bin/node script.js",
    "/usr/bin/nodejs script.js",
    "/usr/bin/lua script.lua",
    "/usr/bin/php script.php",
    "/usr/bin/python3.13 script.py",
]


def test_absolute_interpreter_families_blocked(tmp_path: Path):
    for inv in INTERPRETERS:
        assert _hits(tmp_path, f"{inv}\n") == 1, inv


def test_inside_untrusted_script_and_command_contexts(tmp_path: Path):
    contexts = [
        "if ! {USR_PY}; then exit 1; fi\n",
        "while {USR_PERL}; do break; done\n",
        "value=$({USR_NODE})\n",
        "safe && {BIN_RUBY}\n",
        "sudo {USR_PY}\n",
        "env MODE=1 timeout 5 {USR_PY}\n",
    ]
    subs = {
        "{USR_PY}": "/usr/bin/python3 s.py",
        "{USR_PERL}": "/usr/bin/perl s.pl",
        "{USR_NODE}": "/usr/bin/node s.js",
        "{BIN_RUBY}": "/bin/ruby s.rb",
    }
    # Interleaved wrapper/assignment forms route through the
    # normalized-path engine, whose wrappers stage strips both.
    norm_rule = {
        "id": "path-bin-zonk",
        "mode": "normalized-path",
        "case": "fold",
        "pattern": "usr/bin/zonk",
        "reason": "test",
    }
    for tpl in contexts:
        raw = tpl.format(**subs) if all(k in tpl for k in subs) else None
        if raw is not None:
            assert _hits(tmp_path, raw) == 1, raw
        ztpl = (
            tpl.replace("{USR_PY}", "/usr/bin/zonk s.z")
            .replace("{USR_PERL}", "/usr/bin/zonk s.z")
            .replace("{USR_NODE}", "/usr/bin/zonk s.z")
            .replace("{BIN_RUBY}", "/bin/zonk s.z")
        )
        (tmp_path / "banned_words.yaml").write_text(
            yaml.safe_dump({"version": "5.0.0", "rules": [norm_rule]}), encoding="utf-8"
        )
        policy = model.load_universal(tmp_path)
        (tmp_path / "untrusted.sh").write_text(ztpl, encoding="utf-8")
        classes = classify.Classifications({}, (), (), ())
        assert (
            len(engine.scan_file("untrusted.sh", tmp_path, policy, {}, classes)) == 1
        ), ztpl


def test_case_folded_and_uppercase_paths_blocked(tmp_path: Path):
    assert _hits(tmp_path, "env MODE=check /USR/BIN/PYTHON3.13 s.py\n") == 1


def test_repeated_separator_forms_detected_by_path_rule(tmp_path: Path):
    rule = {
        "id": "path-bin-zonk",
        "mode": "normalized-path",
        "case": "fold",
        "pattern": "usr/bin/zonk",
        "reason": "test",
    }
    (tmp_path / "banned_words.yaml").write_text(
        yaml.safe_dump({"version": "5.0.0", "rules": [rule]}), encoding="utf-8"
    )
    policy = model.load_universal(tmp_path)
    classes = classify.Classifications({}, (), (), ())
    for text in ("/usr//bin/zonk x\n", "/usr/./bin/zonk x\n", "/usr/x/../bin/zonk x\n"):
        (tmp_path / "z.sh").write_text(text, encoding="utf-8")
        assert len(engine.scan_file("z.sh", tmp_path, policy, {}, classes)) == 1, text


def test_hermetic_deployed_uv_still_passes(tmp_path: Path):
    ok = "/opt/workspace-ci/.boot-linux/bin/uv run --project /opt/workspace-ci --no-sync python -m ci.x\n"
    assert _hits(tmp_path, ok) == 0
