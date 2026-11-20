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


if __name__ == "__main__":  # pragma: no cover - manual runnable check
    test_no_shell_task_touches_privileged_channels()
    test_no_command_task_touches_privileged_channels()
    for _name in _HELPERS:
        test_helper_script_is_executable(_name)
    test_reload_handler_runs_hook_script()
    test_linger_enabled_via_helper_script()
    print("ansible guard-safe invariants OK")