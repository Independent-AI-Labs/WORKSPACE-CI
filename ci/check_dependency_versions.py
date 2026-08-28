#!/usr/bin/env python3
"""Command entry point for dependency validation modes."""

from __future__ import annotations

import sys
from pathlib import Path

MODES = frozenset({"validate"})
REJECTED_MODE_FLAGS = frozenset({"--upgrade"})
VALIDATE_FLAGS = frozenset(
    {
        "--consumer-root",
        "--catalog",
        "--catalog-if-present",
        "--npm-lock",
        "--npm-workspace-lock",
        "--uv-lock",
        "--npm-workspaces",
        "--dockerfile",
        "--compose",
        "--exclusions",
        "--json-result",
    }
)


def _default_validation_arguments(root: Path) -> list[str]:
    arguments = ["validate", "--consumer-root", str(root)]
    optional_files = (
        ("--catalog", "res/dependency-pins.yaml"),
        ("--dockerfile", "web/Containerfile"),
        ("--dockerfile", "Containerfile"),
        ("--dockerfile", "Dockerfile"),
        ("--compose", "web/compose.prod.yaml"),
        ("--compose", "compose.yml"),
        ("--compose", "compose.yaml"),
        ("--compose", "docker-compose.yml"),
        ("--compose", "docker-compose.yaml"),
    )
    for flag, path in optional_files:
        if (root / path).exists():
            arguments.extend((flag, path))
    dependency_arguments: list[str] = []
    for flag, declaration, lock in (
        ("--npm-workspace-lock", "package.json", "package-lock.json"),
        ("--uv-lock", "pyproject.toml", "uv.lock"),
    ):
        if (root / declaration).exists() and (root / lock).exists():
            dependency_arguments.extend((flag, declaration, lock))
    if dependency_arguments and (root / "config/dependency_excludes.yaml").exists():
        arguments.extend(("--exclusions", "config/dependency_excludes.yaml"))
    arguments.extend(dependency_arguments)
    return arguments


def _normalize_transition_arguments(arguments: list[str]) -> list[str]:
    """Translate the exact invocation installed by the predecessor hook."""
    match arguments:
        case []:
            return _default_validation_arguments(Path.cwd())
        case ["--deterministic-only", "--catalog", _]:
            return [
                "validate",
                "--consumer-root",
                str(Path.cwd()),
                "--exclusions",
                "config/dependency_excludes.yaml",
                "--catalog",
                "res/dependency-pins.yaml",
                "--npm-workspace-lock",
                "package.json",
                "package-lock.json",
                "--uv-lock",
                "pyproject.toml",
                "uv.lock",
                "--dockerfile",
                "web/Containerfile",
                "--compose",
                "web/compose.prod.yaml",
                "pyproject.toml",
            ]
    return arguments


def _usage() -> int:
    print(
        "usage: check_dependency_versions.py validate ...",
        file=sys.stderr,
    )
    return 2


def _mode(arguments: list[str]) -> str | None:
    """Validate the entire dispatcher envelope before implementation import."""
    if not arguments or arguments[0] not in MODES:
        _usage()
        return None
    if any(
        argument.split("=", maxsplit=1)[0] in REJECTED_MODE_FLAGS
        for argument in arguments[1:]
    ):
        _usage()
        return None
    if any(
        argument.startswith("--")
        and argument.split("=", maxsplit=1)[0] not in VALIDATE_FLAGS
        for argument in arguments[1:]
    ):
        _usage()
        return None
    return arguments[0]


def _validation_arguments(arguments: list[str]) -> list[str]:
    return arguments[1:]


if __name__ == "__main__":
    arguments = _normalize_transition_arguments(sys.argv[1:])
    mode = _mode(arguments)
    if mode is None:
        sys.exit(2)
    if mode == "validate":
        from ci.dependency_policy import main as validate_dependencies

        sys.exit(validate_dependencies(_validation_arguments(arguments)))
