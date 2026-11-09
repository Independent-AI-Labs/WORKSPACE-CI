"""Entry-shape rules shared by the hook manifest self-check."""

from __future__ import annotations

import itertools
import re
import shlex
from collections.abc import Sequence
from pathlib import Path, PurePosixPath
from typing import Protocol

RUNNER = "/opt/workspace-ci/scripts/run-hook"
SHELL_KINDS = frozenset({"shell", "shell_with_arg"})
_INTERPRETERS = frozenset(
    {
        "bash",
        "sh",
        "dash",
        "zsh",
        "ksh",
        "python",
        "python3",
        "perl",
        "ruby",
        "node",
        "php",
        "lua",
        "awk",
    }
)


class HookLike(Protocol):
    id: str
    kind: str
    entry: str
    stage: str
    mandatory: bool
    applicable_to: list[str]


def _hook_applies(hook: HookLike, languages: set[str]) -> bool:
    if not hook.mandatory:
        return False
    if "any" in hook.applicable_to:
        return True
    return bool(languages & set(hook.applicable_to))


def has_inline_interpreter(command: str) -> bool:
    """True when a command invokes an interpreter with an inline program flag."""
    try:
        tokens = shlex.split(command)
    except ValueError:
        return True
    for previous, current in itertools.pairwise(tokens):
        if PurePosixPath(previous).name in _INTERPRETERS and current in {
            "-c",
            "-e",
        }:
            return True
    return False


def manifest_entry_issues(
    hook: HookLike,
    defined: frozenset[str],
    package_root: Path,
) -> list[str]:
    """Entry-resolution issues for one manifest hook."""
    if hook.kind == "shell_inline":
        return [
            f"hook '{hook.id}' uses removed kind shell_inline; no inline"
            " command is executed",
        ]
    if hook.kind in SHELL_KINDS:
        return [
            f"hook '{hook.id}' entry references shell function"
            f" '{fn}' but no lib/*.sh module defines it"
            for fn in sorted(set(re.findall(r"\bci_[a-z_][a-z0-9_]*\b", hook.entry)))
            if fn not in defined
        ]
    if hook.kind == "python_module":
        module_path = hook.entry.replace("ci.", "ci/", 1)
        if not (
            (package_root / f"{module_path}.py").is_file()
            or (package_root / module_path).is_dir()
        ):
            return [
                f"hook '{hook.id}' entry references python-module"
                f" '{hook.entry}' but it does not exist",
            ]
    return []


def rendered_entry_issues(
    hooks: Sequence[HookLike],
    rendered: dict[str, str],
    languages: set[str],
) -> list[str]:
    """Reject inline entries and applicable shell hooks missing the runner."""
    issues: list[str] = []
    for hook in hooks:
        if hook.kind == "shell_inline":
            issues.append(
                f"hook '{hook.id}' uses removed kind shell_inline; no inline"
                " command is executed",
            )
            continue
        if has_inline_interpreter(hook.entry):
            issues.append(f"hook '{hook.id}' entry invokes an inline interpreter")
        if hook.kind in SHELL_KINDS and _hook_applies(hook, languages):
            function = hook.entry.split()[0] if hook.entry else ""
            expected = f"{RUNNER} {function}"
            if function and expected not in rendered.get(hook.stage, ""):
                issues.append(
                    f"hook '{hook.id}' is not rendered through the sealed runner",
                )
    return issues
