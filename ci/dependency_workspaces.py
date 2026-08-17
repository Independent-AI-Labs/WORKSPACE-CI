"""Descriptor-safe, offline npm workspace validation."""

from __future__ import annotations

import fnmatch
import json
import os
import stat
from collections.abc import Callable

from ci.dependency_npm import validate_package_json_bytes

_ReadFile = Callable[[str], tuple[bytes | None, str | None, bool]]
_WorkspaceMember = tuple[str, str, bytes, str]


def _patterns(data: bytes, display_path: str) -> tuple[list[str] | None, list[str]]:
    try:
        document: object = json.loads(data.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        return None, [f"DV-NPM-001 {display_path}: invalid JSON: {error}"]
    if not isinstance(document, dict):
        return None, [f"DV-NPM-002 {display_path}: expected an object"]
    value = document.get("workspaces", [])
    if isinstance(value, dict):
        value = value.get("packages")
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        return None, [
            f"DV-NPM-007 {display_path}:/workspaces: expected string patterns"
        ]
    diagnostics: list[str] = []
    for pattern in value:
        target = pattern.removeprefix("!")
        if (
            not target
            or target.startswith("/")
            or "\\" in target
            or any(part in {"", ".", ".."} for part in target.split("/"))
        ):
            diagnostics.append(
                f"DV-NPM-008 {display_path}:/workspaces: invalid workspace "
                f"pattern {pattern!r}"
            )
    return (value if not diagnostics else None), diagnostics


def _directories(
    root_fd: int, root_path: str
) -> tuple[list[str], list[str], list[str]]:
    """List relative directories without following symlinks."""
    directories: list[str] = []
    symlinks: list[str] = []
    diagnostics: list[str] = []

    def failure(operation: str, relative: str) -> None:
        diagnostics.append(
            f"DV-NPM-012 {root_path}:/workspaces: cannot {operation} "
            f"workspace directory {relative or '.'}"
        )

    def visit(directory_fd: int, prefix: str) -> None:
        try:
            names = sorted(os.listdir(directory_fd))
        except OSError:
            failure("enumerate", prefix)
            return
        for name in names:
            relative = f"{prefix}/{name}" if prefix else name
            try:
                mode = os.stat(name, dir_fd=directory_fd, follow_symlinks=False).st_mode
            except OSError:
                failure("inspect", relative)
                continue
            if stat.S_ISLNK(mode):
                symlinks.append(relative)
            elif stat.S_ISDIR(mode):
                directories.append(relative)
                try:
                    child_fd = os.open(
                        name,
                        os.O_RDONLY | os.O_CLOEXEC | os.O_DIRECTORY | os.O_NOFOLLOW,
                        dir_fd=directory_fd,
                    )
                except OSError:
                    failure("open", relative)
                    continue
                try:
                    visit(child_fd, relative)
                finally:
                    os.close(child_fd)

    visit(root_fd, "")
    return directories, symlinks, diagnostics


def _matches(path: str, pattern: str) -> bool:
    path_parts = path.split("/")
    pattern_parts = pattern.split("/")

    def match(path_index: int, pattern_index: int) -> bool:
        if pattern_index == len(pattern_parts):
            return path_index == len(path_parts)
        part = pattern_parts[pattern_index]
        if part == "**":
            return match(path_index, pattern_index + 1) or (
                path_index < len(path_parts) and match(path_index + 1, pattern_index)
            )
        return (
            path_index < len(path_parts)
            and fnmatch.fnmatchcase(path_parts[path_index], part)
            and match(path_index + 1, pattern_index + 1)
        )

    return match(0, 0)


def _selected_paths(
    root_fd: int, patterns: list[str], root_path: str
) -> tuple[list[str], list[str]]:
    directories, symlinks, diagnostics = _directories(root_fd, root_path)
    selected: list[str] = []
    for pattern in patterns:
        negated = pattern.startswith("!")
        target = pattern.removeprefix("!")
        matches = [path for path in directories if _matches(path, target)]
        if not negated:
            diagnostics.extend(
                f"DV-NPM-009 {root_path}:/workspaces: symlinked member {path}"
                for path in symlinks
                if _matches(path, target)
            )
        if negated:
            selected = [path for path in selected if path not in matches]
        else:
            selected.extend(path for path in matches if path not in selected)
    return selected, diagnostics


def _members(
    selected: list[str], read_file: _ReadFile
) -> tuple[set[str], list[tuple[str, bytes]], list[_WorkspaceMember], list[str]]:
    names: dict[str, str] = {}
    data_by_path: list[tuple[str, bytes]] = []
    records: list[_WorkspaceMember] = []
    diagnostics: list[str] = []
    for directory in selected:
        manifest_path = f"{directory}/package.json"
        data, error, _ = read_file(manifest_path)
        if error:
            diagnostics.append(error)
            continue
        assert data is not None
        try:
            document: object = json.loads(data.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            diagnostics.append(f"DV-NPM-001 {manifest_path}: invalid JSON: {error}")
            continue
        if not isinstance(document, dict):
            diagnostics.append(f"DV-NPM-002 {manifest_path}: expected an object")
            continue
        name = document.get("name")
        if not isinstance(name, str) or not name:
            diagnostics.append(
                f"DV-NPM-010 {manifest_path}:/name: expected a non-empty string"
            )
            continue
        data_by_path.append((manifest_path, data))
        if name in names:
            diagnostics.append(
                f"DV-NPM-011 {manifest_path}:/name: duplicate package name {name!r}; "
                f"already declared by {names[name]}/package.json"
            )
            continue
        names[name] = directory
        records.append((directory, manifest_path, data, name))
    return set(names), data_by_path, records, diagnostics


def resolve_npm_workspaces(
    root_fd: int,
    root_data: bytes,
    root_path: str,
    read_file: _ReadFile,
) -> tuple[set[str], list[tuple[str, bytes]], list[_WorkspaceMember], list[str]]:
    """Resolve selected workspace manifests from an explicit root descriptor."""
    patterns, diagnostics = _patterns(root_data, root_path)
    if patterns is None:
        return set(), [], [], diagnostics
    selected, selection_diagnostics = _selected_paths(root_fd, patterns, root_path)
    diagnostics.extend(selection_diagnostics)
    members, member_data, records, member_diagnostics = _members(selected, read_file)
    diagnostics.extend(member_diagnostics)
    return members, member_data, records, diagnostics


def validate_npm_workspaces(
    root_fd: int,
    root_data: bytes,
    root_path: str,
    read_file: _ReadFile,
    exclusions: frozenset[str] = frozenset(),
) -> list[str]:
    """Validate selected npm workspaces and local workspace dependencies."""
    members, member_data, _, diagnostics = resolve_npm_workspaces(
        root_fd, root_data, root_path, read_file
    )
    diagnostics.extend(
        validate_package_json_bytes(root_data, root_path, members, exclusions)
    )
    for manifest_path, data in member_data:
        diagnostics.extend(
            validate_package_json_bytes(data, manifest_path, members, exclusions)
        )
    return sorted(diagnostics)
