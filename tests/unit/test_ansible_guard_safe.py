"""Guard-safety invariants for the Ansible roles under res/ansible.

The sealed shell guard scans any command string that passes through a shell.
Tasks that touch operator-only channels (podman, systemctl, loginctl) must
therefore call a helper script under res/ansible/files from a shell task
with a ``>>`` log redirect. The script body is not a scanned command string,
and the redirect satisfies the silent-swallow gate (a registered
``ansible.builtin.command`` task cannot redirect, so that gate rejects it).

These tests fail if a task reintroduces one of those tokens in its own text,
which is exactly how the wiki TLS reload/linger tasks were silently blocked.
"""

from __future__ import annotations

import ast
import re
from pathlib import Path
from typing import Any

import pytest
import yaml

_REPO_ROOT = Path(__file__).resolve().parents[2]
_ANSIBLE_DIR = _REPO_ROOT / "res" / "ansible"

_SHELL_KEYS = ("ansible.builtin.shell", "shell")
_COMMAND_KEYS = ("ansible.builtin.command", "command")

# Mirrors the sealed shell guard's blocked set: any podman invocation, and
# systemctl/loginctl with a state-mutating verb. Read-only queries such as
# `systemctl is-active` are permitted and must not be flagged.
_PODMAN = re.compile(r"\b(real-)?podman\b")
_SYSTEMCTL = re.compile(
    r"\bsystemctl\b[^\n]*?\b("
    r"start|stop|restart|reload|reload-or-restart|try-restart|"
    r"try-reload-or-restart|isolate|kill|clean|freeze|thaw|daemon-reload|"
    r"daemon-reexec|mask|unmask|link|revert|enable|disable|preset|preset-all|"
    r"edit|reset-failed|switch-root|set-property|set-environment|"
    r"unset-environment|import-environment)\b"
)
_LOGINCTL = re.compile(
    r"\bloginctl\b[^\n]*?\b("
    r"terminate-session|kill-session|terminate-user|kill-user|(un)?lock-sessions?|"
    r"flush-devices|attach|terminate-seat|set-user-linger|enable-linger|"
    r"disable-linger)\b"
)


def _blocked(command: str) -> bool:
    return bool(
        _PODMAN.search(command)
        or _SYSTEMCTL.search(command)
        or _LOGINCTL.search(command)
    )


def _ansible_files() -> list[Path]:
    return sorted(_ANSIBLE_DIR.rglob("*.yml")) + sorted(_ANSIBLE_DIR.rglob("*.yaml"))


def _walk(node: Any):
    if isinstance(node, dict):
        yield node
        for value in node.values():
            yield from _walk(value)
    elif isinstance(node, list):
        for item in node:
            yield from _walk(item)


def _iter_tasks(path: Path):
    for node in _walk(yaml.safe_load(path.read_text(encoding="utf-8"))):
        for key in _SHELL_KEYS + _COMMAND_KEYS:
            if key in node:
                yield key, node


def test_no_shell_task_touches_privileged_channels() -> None:
    files = _ansible_files()
    assert files, "no ansible files discovered under res/ansible"

    offenders: list[str] = []
    for path in files:
        for key, node in _iter_tasks(path):
            if key not in _SHELL_KEYS:
                continue
            command = node[key]
            if isinstance(command, str) and _blocked(command):
                offenders.append(f"{path.relative_to(_REPO_ROOT)}: {command.strip()}")

    assert not offenders, (
        "shell tasks must not wrap privileged commands; run them as argv via "
        "ansible.builtin.command:\n" + "\n".join(offenders)
    )


_FILES_DIR = _ANSIBLE_DIR / "files"
_HELPERS = ("user-linger-enable", "tls-consumer-reload", "wiki-stack-check")


def _shell_commands(path: Path) -> list[str]:
    return [
        node[key]
        for key, node in _iter_tasks(path)
        if key in _SHELL_KEYS and isinstance(node[key], str)
    ]


def test_no_command_task_touches_privileged_channels() -> None:
    # Registered command tasks cannot redirect output, so the silent-swallow
    # gate rejects them; privileged calls belong in the helper scripts.
    offenders: list[str] = []
    for path in _ansible_files():
        for key, node in _iter_tasks(path):
            if key not in _COMMAND_KEYS:
                continue
            spec = node[key]
            argv = spec.get("argv") if isinstance(spec, dict) else None
            text = " ".join(map(str, argv)) if argv else str(spec)
            if _blocked(text):
                offenders.append(f"{path.relative_to(_REPO_ROOT)}: {text}")
    assert not offenders, (
        "command tasks must not run privileged commands; use a helper script "
        "under res/ansible/files:\n" + "\n".join(offenders)
    )


@pytest.mark.parametrize("name", _HELPERS)
def test_helper_script_is_executable(name: str) -> None:
    script = _FILES_DIR / name
    assert script.is_file(), f"missing helper {script}"
    assert script.stat().st_mode & 0o111, f"helper not executable: {script}"
    assert script.read_text(encoding="utf-8").startswith("#!/bin/sh\n")


def test_reload_handler_runs_hook_script() -> None:
    handlers = _ANSIBLE_DIR / "roles" / "letsencrypt_dns" / "handlers" / "main.yml"
    commands = _shell_commands(handlers)
    assert commands, "reload handler must be a shell task"
    assert all("letsencrypt_reload_script" in c and ">>" in c for c in commands)


def test_linger_enabled_via_helper_script() -> None:
    deploy_timer = _ANSIBLE_DIR / "roles" / "letsencrypt_dns" / "tasks" / "deploy_timer.yml"
    commands = _shell_commands(deploy_timer)
    assert any("letsencrypt_linger_script" in c and ">>" in c for c in commands), (
        "linger must be enabled via the user-linger-enable helper with a log redirect"
    )


# The guarded /bin/sh blocks a nested shell invocation (inline-shell) and a
# `> /dev/null` suffix (suppress-null). Ansible's default local execution
# produces both, so every play must select the guarded_sh plugin and drop the
# nested executable wrap, and every shell task must exec /bin/sh directly
# (with an empty play executable the shell module would exec "").
_SHELL_PLUGIN = _ANSIBLE_DIR / "shell_plugins" / "guarded_sh.py"


def _plays() -> list[tuple[Path, dict]]:
    plays: list[tuple[Path, dict]] = []
    for path in sorted(_ANSIBLE_DIR.glob("*.yml")):
        doc = yaml.safe_load(path.read_text(encoding="utf-8"))
        if isinstance(doc, list):
            plays.extend((path, p) for p in doc if isinstance(p, dict) and "hosts" in p)
    return plays


def test_playbooks_discovered() -> None:
    names = {path.name for path, _ in _plays()}
    expected = {"advisory-db.yml", "deploy-ci.yml", "letsencrypt.yml", "prod.yml", "tunnel.yml"}
    assert expected <= names, f"missing playbooks: {sorted(expected - names)}"


@pytest.mark.parametrize(
    "path,play", _plays(), ids=lambda v: v.name if isinstance(v, Path) else v.get("name")
)
def test_play_uses_guard_safe_shell(path: Path, play: dict) -> None:
    where = f"{path.relative_to(_REPO_ROOT)}: {play.get('name')}"
    play_vars = play.get("vars") or {}
    assert play_vars.get("ansible_shell_type") == "guarded_sh", where
    assert play_vars.get("ansible_shell_executable") == "", where


def test_shell_tasks_exec_bin_sh_directly() -> None:
    offenders = [
        f"{path.relative_to(_REPO_ROOT)}: {node.get('name')}"
        for path in _ansible_files()
        for key, node in _iter_tasks(path)
        if key in _SHELL_KEYS and (node.get("args") or {}).get("executable") != "/bin/sh"
    ]
    assert not offenders, "shell tasks need args.executable: /bin/sh:\n" + "\n".join(offenders)


def test_guarded_shell_plugin_keeps_cleanup_output() -> None:
    tree = ast.parse(_SHELL_PLUGIN.read_text(encoding="utf-8"))
    doc = next(
        node.value.value
        for node in tree.body
        if isinstance(node, ast.Assign)
        and any(isinstance(t, ast.Name) and t.id == "DOCUMENTATION" for t in node.targets)
    )
    assert yaml.safe_load(doc)["name"] == "guarded_sh"
    cls = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == "ShellModule")
    values = {
        t.id: n.value.value
        for n in cls.body
        if isinstance(n, ast.Assign) and isinstance(n.value, ast.Constant)
        for t in n.targets
        if isinstance(t, ast.Name)
    }
    assert values.get("_SHELL_REDIRECT_ALLNULL") == ""


# Make echoes every recipe line, so a secret expanded inline as $(VAR) lands
# in terminal output and logs. The Ansible recipes get secrets via `export`
# only; recipes reference them as $$VAR (expanded by the shell).
_SECRETS = ("CLOUDFLARE_API_TOKEN", "TUNNEL_TOKEN")
_INLINE_SECRET = re.compile(r"\$[({](" + "|".join(_SECRETS) + r")[)}]")


def test_makefiles_never_expand_secrets_inline() -> None:
    makefiles = [_REPO_ROOT / "Makefile", *_REPO_ROOT.glob("*.mk")]
    offenders = [
        f"{path.name}:{lineno}: {line.strip()}"
        for path in makefiles
        if path.is_file()
        for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1)
        if _INLINE_SECRET.search(line)
    ]
    assert not offenders, "secret expanded inline (make echoes it):\n" + "\n".join(offenders)


if __name__ == "__main__":  # pragma: no cover - manual runnable check
    test_no_shell_task_touches_privileged_channels()
    test_no_command_task_touches_privileged_channels()
    for _name in _HELPERS:
        test_helper_script_is_executable(_name)
    test_reload_handler_runs_hook_script()
    test_linger_enabled_via_helper_script()
    test_playbooks_discovered()
    for _path, _play in _plays():
        test_play_uses_guard_safe_shell(_path, _play)
    test_shell_tasks_exec_bin_sh_directly()
    test_guarded_shell_plugin_keeps_cleanup_output()
    print("ansible guard-safe invariants OK")