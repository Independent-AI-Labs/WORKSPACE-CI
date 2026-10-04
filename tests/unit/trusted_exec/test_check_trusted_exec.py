"""Tests for ci/check_trusted_exec.py (trusted-code service-killing scan)."""

import base64
import sys
from pathlib import Path

import pytest
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

import check_trusted_exec as check

ALL_CARRIERS = [
    "shell",
    "yaml",
    "systemd",
    "makefile",
    "javascript",
    "python",
    "lua",
]


def _rule(rule_id, pattern, category="service-manager", mode="raw-regex"):
    return {
        "id": rule_id,
        "mode": mode,
        "category": category,
        "flags": ["i"],
        "carriers": ALL_CARRIERS,
        "pattern": pattern,
        "reason": "test rule",
    }


POLICY = {
    "version": "1.0.0",
    "decode": {"max_depth": 2},
    "rules": [
        _rule("port-kill", r"\bfuser\b[^\x3b|&\n]*\s-[^\x3b|&\n\s]*k\b", "port-kill"),
        _rule(
            "port-pipeline-kill",
            r"\b(lsof|ss|netstat)\b[^\x3b|&\n]*\|[^\x3b|&\n]*\bkill\b",
            "port-kill",
        ),
        _rule(
            "process-name-kill", r"\b(pkill|killall|skill|snice)\b", "process-name-kill"
        ),
        _rule(
            "orphan-remove",
            r"\b(podman-compose|podman[ \t]+compose|docker[ \t]+compose)\b"
            r"(?![^\x3b|&\n]*(?:--project-name[ \t]+|-p[ \t]+|--file[ \t]+|-f[ \t]+))"
            r"[^\x3b|&\n]*--remove-orphans\b",
            "orphan-remove",
        ),
        _rule(
            "network-remove",
            r"\bnetwork\b[^\x3b|&\n]*\b(rm|remove)\b[^\x3b|&\n]*\s-f\b",
            "network-remove",
        ),
        _rule(
            "compose-run-no-deps",
            r"\bcompose\b[^\x3b|&\n]*\brun\b(?![^\x3b|&\n]*--no-deps)",
            "compose-run",
        ),
    ],
}


def _load(tmp_path: Path, doc=POLICY):
    cfg = tmp_path / "config"
    cfg.mkdir(exist_ok=True)
    (cfg / "trusted_exec.yaml").write_text(yaml.safe_dump(doc), encoding="utf-8")
    return check.load_policy(cfg)


def _write(tmp_path: Path, name: str, text: str) -> str:
    path = tmp_path / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return name


def _ids(tmp_path, name, text):
    policy = _load(tmp_path)
    _write(tmp_path, name, text)
    return [f.rule.id for f in check.scan_file(name, tmp_path, policy)]


def test_load_rejects_exemptions(tmp_path):
    doc = {"version": "1.0.0", "decode": {"max_depth": 2}, "rules": POLICY["rules"]}
    doc["exemptions"] = []
    with pytest.raises(check.PolicyError):
        _load(tmp_path, doc)


def test_load_rejects_allowed_constructs(tmp_path):
    doc = {"version": "1.0.0", "decode": {"max_depth": 2}, "rules": POLICY["rules"]}
    doc["allowed_constructs"] = []
    with pytest.raises(check.PolicyError):
        _load(tmp_path, doc)


def test_load_rejects_empty_rules(tmp_path):
    with pytest.raises(check.PolicyError):
        _load(tmp_path, {"version": "1.0.0", "decode": {"max_depth": 2}, "rules": []})


def test_load_rejects_unknown_carrier(tmp_path):
    rule = _rule("port-kill", r"\bfuser\b[^\x3b|&\n]*\s-k\b", "port-kill")
    rule["carriers"] = ["cobol"]
    with pytest.raises(check.PolicyError):
        _load(tmp_path, {"version": "1.0.0", "rules": [rule]})


def test_shell_port_kill_detected(tmp_path):
    assert _ids(tmp_path, "dev.sh", "fuser -k 3000/tcp\n") == ["port-kill"]


def test_ansible_shell_body_detected(tmp_path):
    name = _write(
        tmp_path,
        "res/ansible/dev.yml",
        "- name: stop\n  shell: fuser -k {{ dev_port }}/tcp\n",
    )
    assert [f.rule.id for f in check.scan_file(name, tmp_path, _load(tmp_path))] == [
        "port-kill"
    ]


def test_systemd_exec_start_detected(tmp_path):
    name = _write(
        tmp_path,
        "x.service",
        "[Service]\nExecStartPre=/usr/bin/fuser -k 3000/tcp\n",
    )
    assert [f.rule.id for f in check.scan_file(name, tmp_path, _load(tmp_path))] == [
        "port-kill"
    ]


def test_port_pipeline_detected(tmp_path):
    assert _ids(tmp_path, "dev.sh", "ss -ltnp 'sport = :3000' | xargs kill\n") == [
        "port-pipeline-kill"
    ]


def test_process_name_kill_detected(tmp_path):
    assert _ids(tmp_path, "dev.sh", "pkill -f 'next dev'\n") == ["process-name-kill"]


def test_orphan_remove_detected(tmp_path):
    assert _ids(tmp_path, "compose.sh", "podman-compose down --remove-orphans\n") == [
        "orphan-remove"
    ]


def test_orphan_remove_with_project_pin_allowed(tmp_path):
    text = "podman-compose -f compose.yml up --remove-orphans\n"
    assert _ids(tmp_path, "compose.sh", text) == []


def test_network_remove_detected(tmp_path):
    assert _ids(tmp_path, "cleanup.sh", "podman network rm -f docker_default\n") == [
        "network-remove"
    ]


def test_compose_run_without_no_deps_detected(tmp_path):
    assert _ids(tmp_path, "m.sh", "podman-compose run --rm dataops x\n") == [
        "compose-run-no-deps"
    ]


def test_compose_run_with_no_deps_allowed(tmp_path):
    assert _ids(tmp_path, "m.sh", "podman-compose run --no-deps --rm dataops x\n") == []


def test_javascript_detected(tmp_path):
    text = "execSync(`fuser -k ${port}/tcp`);\n"
    assert _ids(tmp_path, "scripts/server.mjs", text) == ["port-kill"]


def test_python_detected(tmp_path):
    text = 'subprocess.run("fuser -k 3000/tcp", shell=True)\n'
    assert _ids(tmp_path, "run.py", text) == ["port-kill"]


def test_lua_detected(tmp_path):
    assert _ids(tmp_path, "run.lua", 'os.execute("pkill -f next")\n') == [
        "process-name-kill"
    ]


def test_makefile_detected(tmp_path):
    name = _write(tmp_path, "Makefile", "stop:\n\tfuser -k 3000/tcp\n")
    assert [f.rule.id for f in check.scan_file(name, tmp_path, _load(tmp_path))] == [
        "port-kill"
    ]


def test_extensionless_shebang_detected(tmp_path):
    name = _write(tmp_path, "dev-runner", "#!/bin/sh\nfuser -k 3000/tcp\n")
    assert [f.rule.id for f in check.scan_file(name, tmp_path, _load(tmp_path))] == [
        "port-kill"
    ]


def test_markdown_not_scanned(tmp_path):
    name = _write(tmp_path, "doc.md", "Run `fuser -k 3000/tcp` to stop it.\n")
    assert check.scan_file(name, tmp_path, _load(tmp_path)) == []


def test_encoded_pattern_detected(tmp_path):
    payload = base64.b64encode(b"fuser -k 3000/tcp").decode()
    assert _ids(tmp_path, "blob.sh", f"payload={payload}\n") == ["port-kill"]


def test_self_skip_excludes_definitional_files(tmp_path):
    policy = _load(tmp_path)
    name = _write(tmp_path, "config/trusted_exec.yaml", "fuser -k 3000/tcp\n")
    assert name in check.SELF_SKIP
    assert check._scan_all([name], tmp_path, policy, None) == []


def test_path_independence(tmp_path):
    policy = _load(tmp_path)
    body = "fuser -k 3000/tcp\n"
    results = []
    for rel in ("a.sh", "deep/nested/b.sh", "renamed.txt", "noext"):
        _write(tmp_path, rel, body)
        results.append([f.rule.id for f in check.scan_file(rel, tmp_path, policy)])
    assert results == [["port-kill"]] * 4


def test_shipped_policy_loads_when_present():
    real = Path(__file__).resolve().parents[3] / "config" / "trusted_exec.yaml"
    if not real.is_file():
        pytest.skip("config/trusted_exec.yaml not yet activated")
    policy = check.load_policy(real.parent)
    assert policy.rules
