"""Tests for ci/check_inline_code.py (inline-code detection)."""

import base64
import os
import subprocess
import sys
from pathlib import Path

import pytest
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from ci import check_inline_code as check

SQL_SELECT = (
    r"\bselect\s+(?:distinct\s+|all\s+)?(?:\*|(?:[a-z_][a-z0-9_]*"
    r"(?:\.[a-z0-9_*]+)?|\d+)(?:\s*,\s*(?:[a-z_][a-z0-9_]*"
    r"(?:\.[a-z0-9_*]+)?|\d+))*|(?:count|sum|avg|min|max)"
    r"\s*\(\s*(?:\*|[a-z_][a-z0-9_.]*|\d+)\s*\))\s+from\s+[a-z_][a-z0-9_.]*"
)

POLICY = {
    "version": "1.0.0",
    "decode": {"max_depth": 2},
    "rules": [
        {
            "id": "sql-select-from",
            "mode": "raw-regex",
            "category": "sql",
            "flags": ["i"],
            "pattern": SQL_SELECT,
            "reason": "query text",
        },
        {
            "id": "interp-python",
            "mode": "raw-regex",
            "category": "interpreter",
            "flags": ["i"],
            "pattern": r"\bpython[0-9.]*\s+-c\b",
            "reason": "inline interpreter",
        },
        {
            "id": "interp-shell",
            "mode": "raw-regex",
            "category": "interpreter",
            "flags": ["i"],
            "pattern": r"\b(?:bash|sh|zsh|dash)\s+-c\b",
            "reason": "inline shell",
        },
    ],
    "allowed_constructs": [
        {
            "id": "markdown-fenced-code",
            "language": "markdown",
            "level": 1,
            "open": r"^[ \t]{0,3}```",
            "close": r"^[ \t]{0,3}```",
            "reason": "markdown fence",
        },
        {
            "id": "markdown-inline-code-span",
            "language": "markdown",
            "level": 1,
            "pattern": r"`[^`\n]+`",
            "reason": "markdown inline code span",
        },
        {
            "id": "shell-interpreter-invocation",
            "language": "shell",
            "level": 1,
            "pattern": r"(?i)\b(?:bash|sh|zsh|dash)\s+-c\b",
            "reason": "shell carries its interpreter",
        },
        {
            "id": "yaml-declared-command",
            "language": "yaml",
            "level": 1,
            "pattern": (
                r"(?i)(?:entry|command|run|shell)\s*:[^\n]*?"
                r"\b(?:bash|sh|zsh|dash)\s+-c\b"
            ),
            "reason": "yaml command field",
        },
    ],
    "exemptions": [],
}


def _load(tmp_path: Path, doc=POLICY):
    cfg = tmp_path / "config"
    cfg.mkdir(exist_ok=True)
    (cfg / "inline_code.yaml").write_text(yaml.safe_dump(doc), encoding="utf-8")
    return check.load_policy(cfg)


def _write(tmp_path: Path, name: str, text: str) -> str:
    path = tmp_path / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return name


def test_sql_in_markdown_fence_allowed(tmp_path):
    policy = _load(tmp_path)
    name = _write(tmp_path, "doc.md", "Example:\n\n```sql\nSELECT a FROM t;\n```\n")
    assert check.scan_file(name, tmp_path, policy) == []


def test_sql_outside_markdown_fence_detected(tmp_path):
    policy = _load(tmp_path)
    name = _write(tmp_path, "doc.md", "Run SELECT a FROM t; now.\n")
    assert [f.rule.id for f in check.scan_file(name, tmp_path, policy)] == [
        "sql-select-from"
    ]


def test_multiline_sql_detected(tmp_path):
    policy = _load(tmp_path)
    name = _write(tmp_path, "run.sh", 'q="SELECT a,\n b\n FROM t"\n')
    assert [f.rule.id for f in check.scan_file(name, tmp_path, policy)] == [
        "sql-select-from"
    ]


def test_zero_width_evasion_detected(tmp_path):
    policy = _load(tmp_path)
    name = _write(tmp_path, "run.sh", 'q="sel\u200bect a from t"\n')
    assert [f.rule.id for f in check.scan_file(name, tmp_path, policy)] == [
        "sql-select-from"
    ]


def test_base64_encoded_sql_detected(tmp_path):
    policy = _load(tmp_path)
    payload = base64.b64encode(b"SELECT a FROM t WHERE x=1").decode()
    name = _write(tmp_path, "run.sh", f'q="{payload}"\n')
    assert [f.rule.id for f in check.scan_file(name, tmp_path, policy)] == [
        "sql-select-from"
    ]


def test_interpreter_inline_detected(tmp_path):
    policy = _load(tmp_path)
    name = _write(tmp_path, "run.sh", 'python3 -c "print(1)"\n')
    ids = {f.rule.id for f in check.scan_file(name, tmp_path, policy)}
    assert "interp-python" in ids


def test_exemption_suppresses(tmp_path):
    doc = yaml.safe_load(yaml.safe_dump(POLICY))
    doc["exemptions"] = [{"rule": "sql-select-from", "path": "doc.md"}]
    policy = _load(tmp_path, doc)
    name = _write(tmp_path, "doc.md", "Run `SELECT a FROM t;` now.\n")
    assert check.scan_file(name, tmp_path, policy) == []


def test_unterminated_fence_fails(tmp_path):
    policy = _load(tmp_path)
    name = _write(tmp_path, "doc.md", "```sql\nSELECT a FROM t;\n")
    with pytest.raises(check.PolicyError):
        check.scan_file(name, tmp_path, policy)


def test_binary_file_skipped(tmp_path):
    policy = _load(tmp_path)
    path = tmp_path / "blob.bin"
    path.write_bytes(b"\x00\x01\x02select a from t")
    assert check.scan_file("blob.bin", tmp_path, policy) == []


def test_markdown_inline_code_span_allowed(tmp_path):
    policy = _load(tmp_path)
    name = _write(tmp_path, "doc.md", "Run `SELECT a FROM t;` now.\n")
    assert check.scan_file(name, tmp_path, policy) == []


def test_markdown_prose_select_not_detected(tmp_path):
    policy = _load(tmp_path)
    text = "Select the active allowed\nconstructs from policy.\n"
    name = _write(tmp_path, "doc.md", text)
    assert check.scan_file(name, tmp_path, policy) == []


def test_shell_interpreter_invocation_allowed(tmp_path):
    policy = _load(tmp_path)
    name = _write(tmp_path, "run.sh", "bash -c 'echo hi'\n")
    assert check.scan_file(name, tmp_path, policy) == []


def test_yaml_declared_command_allowed(tmp_path):
    policy = _load(tmp_path)
    name = _write(tmp_path, "ci.yml", "steps:\n  - run: bash -c 'echo hi'\n")
    assert check.scan_file(name, tmp_path, policy) == []


def test_extensionless_shebang_selects_shell(tmp_path):
    policy = _load(tmp_path)
    name = _write(tmp_path, "extless", "#!/usr/bin/env bash\nbash -c 'echo hi'\n")
    assert check.scan_file(name, tmp_path, policy) == []


def test_extensionless_without_shebang_still_detected(tmp_path):
    policy = _load(tmp_path)
    name = _write(tmp_path, "extless", "bash -c 'echo hi'\n")
    assert [f.rule.id for f in check.scan_file(name, tmp_path, policy)] == [
        "interp-shell"
    ]


def test_policy_dir_ignores_hostile_environment(tmp_path, monkeypatch):
    hostile = tmp_path / "hostile"
    hostile.mkdir()
    (hostile / "inline_code.yaml").write_text("version: 1.0.0\n", encoding="utf-8")
    monkeypatch.setenv("CI_CONFIG_PATH_INLINE_CODE", str(hostile / "inline_code.yaml"))
    monkeypatch.setenv("CI_CONFIG_DIR", str(hostile))
    expected = (
        Path(check.__file__).resolve().parent.joinpath("..").resolve() / "config"
    )
    assert check._policy_dir() == expected


TRUST_ROOT = Path(__file__).resolve().parents[2]
PYTHON_RULE = "interp-python-inline"


def _hostile_env(work: Path, config_dir: Path) -> dict[str, str]:
    env = dict(os.environ)
    env["PYTHONPATH"] = str(TRUST_ROOT)
    env["CI_CONFIG_DIR"] = str(config_dir)
    env["CI_CONFIG_PATH_INLINE_CODE"] = str(config_dir / "inline_code.yaml")
    env["CI_CONFIG_OVERRIDES"] = "planted-overrides.yaml"
    env["CI_GUARD_CONFIG_OVERRIDES"] = "planted-guard-overrides.yaml"
    env["CI_SCAN_ROOT"] = str(work)
    return env


def _plant_trust_case(work: Path) -> Path:
    payload = "value=$(" + "python" + "3" + " -c 'print(1)')\n"
    (work / "bad.sh").write_text(payload, encoding="utf-8")
    hostile = work / "hostile-config"
    hostile.mkdir()
    (hostile / "inline_code.yaml").write_text(
        "version: 1.0.0\nrules: []\n", encoding="utf-8"
    )
    return hostile


def _plant_shadow_package(work: Path) -> Path:
    sentinel = work / "shadow-ran"
    shadow = work / "ci"
    shadow.mkdir()
    (shadow / "__init__.py").write_text("", encoding="utf-8")
    (shadow / "check_inline_code.py").write_text(
        "from pathlib import Path\n"
        f"Path({str(sentinel)!r}).write_text('shadow', encoding='utf-8')\n"
        "raise SystemExit(0)\n",
        encoding="utf-8",
    )
    return sentinel


def _run_module(work: Path, config_dir: Path, use_safe_path: bool):
    args = [sys.executable]
    if use_safe_path:
        args.append("-P")
    args += ["-m", "ci.check_inline_code", "bad.sh"]
    proc = subprocess.run(
        args,
        cwd=work,
        env=_hostile_env(work, config_dir),
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        sys.stderr.write(proc.stdout)
        sys.stderr.write(proc.stderr)
    return proc


def test_shadow_package_runs_without_safe_path(tmp_path):
    """Without -P the working directory shadows the sealed package.

    This documents the vulnerability the generator closes: the shadow module
    runs and the process reports success.
    """
    hostile = _plant_trust_case(tmp_path)
    sentinel = _plant_shadow_package(tmp_path)
    proc = _run_module(tmp_path, hostile, use_safe_path=False)
    assert sentinel.is_file()
    assert proc.returncode == 0, proc.stderr
    assert proc.stdout == ""


def test_safe_path_and_anchored_policy_defeat_hostile_environment(tmp_path):
    hostile = _plant_trust_case(tmp_path)
    sentinel = _plant_shadow_package(tmp_path)
    proc = _run_module(tmp_path, hostile, use_safe_path=True)
    assert not sentinel.exists()
    assert proc.returncode != 0, proc.stderr
    assert "bad.sh" in proc.stdout
    assert PYTHON_RULE in proc.stdout
