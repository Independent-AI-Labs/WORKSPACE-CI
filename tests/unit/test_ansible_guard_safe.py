"""Guard-safety invariants for the Ansible roles under res/ansible.

The sealed shell guard scans any command string that passes through a shell.
Tasks that touch operator-only channels (podman, systemctl, loginctl) must
therefore run as argv via ``ansible.builtin.command`` (execve, no shell) or
an Ansible module that execs directly, never wrapped in a ``shell`` task.

These tests fail if a shell task reintroduces one of those tokens, which is
exactly how the wiki TLS reload/linger tasks were silently blocked.
"""

from __future__ import annotations

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


def test_reload_handler_runs_as_argv() -> None:
    handlers = _ANSIBLE_DIR / "roles" / "letsencrypt_dns" / "handlers" / "main.yml"
    tasks = list(_iter_tasks(handlers))
    reload_tasks = [node for key, node in tasks if key in _COMMAND_KEYS]
    assert reload_tasks, "reload handler must use ansible.builtin.command"
    assert all("argv" in node[key] for key, node in tasks if key in _COMMAND_KEYS)
    assert not [node for key, node in tasks if key in _SHELL_KEYS], (
        "reload handler must not use a shell task"
    )


def test_linger_enabled_via_command_argv() -> None:
    linger_dir = _ANSIBLE_DIR / "roles" / "letsencrypt_dns" / "tasks" / "deploy_timer.yml"
    argv_tasks = []
    for key, node in _iter_tasks(linger_dir):
        if key not in _COMMAND_KEYS:
            continue
        spec = node[key]
        if isinstance(spec, dict) and spec.get("argv"):
            argv_tasks.append(spec["argv"])
    assert any(argv[0] == "loginctl" for argv in argv_tasks), (
        "linger must be enabled via ansible.builtin.command argv: [loginctl, ...]"
    )


if __name__ == "__main__":  # pragma: no cover - manual runnable check
    test_no_shell_task_touches_privileged_channels()
    test_reload_handler_runs_as_argv()
    test_linger_enabled_via_command_argv()
    print("ansible guard-safe invariants OK")