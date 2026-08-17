"""Failure-injection tests for descriptor-safe npm workspace traversal."""

import errno
import os
from pathlib import Path

import pytest

from ci import dependency_workspaces


def _root_data() -> bytes:
    return b'{"workspaces":["packages/*"]}'


def _read_file(path: str) -> tuple[bytes | None, str | None, bool]:
    return b'{"name":"@scope/member"}', None, False


def _resolve(root: Path) -> list[str]:
    root_fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY)
    try:
        _, _, _, diagnostics = dependency_workspaces.resolve_npm_workspaces(
            root_fd, _root_data(), "package.json", _read_file
        )
    finally:
        os.close(root_fd)
    return diagnostics


def test_workspace_reports_directory_enumeration_failure(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    (tmp_path / "packages").mkdir()
    original_listdir = dependency_workspaces.os.listdir

    def fail_root_enumeration(fd: int) -> list[str]:
        if fd == root_fd:
            raise OSError(errno.EACCES, "denied")
        return original_listdir(fd)

    root_fd = os.open(tmp_path, os.O_RDONLY | os.O_DIRECTORY)
    monkeypatch.setattr(dependency_workspaces.os, "listdir", fail_root_enumeration)
    try:
        _, _, _, diagnostics = dependency_workspaces.resolve_npm_workspaces(
            root_fd, _root_data(), "package.json", _read_file
        )
    finally:
        os.close(root_fd)

    assert diagnostics == [
        "DV-NPM-012 package.json:/workspaces: cannot enumerate workspace directory ."
    ]


def test_workspace_reports_entry_stat_failure(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    packages = tmp_path / "packages"
    packages.mkdir()
    original_stat = dependency_workspaces.os.stat

    def fail_packages_stat(name: str, **kwargs: object) -> os.stat_result:
        if name == "packages":
            raise OSError(errno.EIO, "injected")
        return original_stat(name, **kwargs)

    monkeypatch.setattr(dependency_workspaces.os, "stat", fail_packages_stat)

    assert _resolve(tmp_path) == [
        "DV-NPM-012 package.json:/workspaces: cannot inspect workspace directory "
        "packages"
    ]


def test_workspace_reports_child_descriptor_open_failure(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    packages = tmp_path / "packages"
    packages.mkdir()
    original_open = dependency_workspaces.os.open

    def fail_packages_open(path: str, flags: int, **kwargs: object) -> int:
        if path == "packages":
            raise OSError(errno.EACCES, "denied")
        return original_open(path, flags, **kwargs)

    monkeypatch.setattr(dependency_workspaces.os, "open", fail_packages_open)

    assert _resolve(tmp_path) == [
        "DV-NPM-012 package.json:/workspaces: cannot open workspace directory packages"
    ]


def test_workspace_does_not_follow_a_symlink_when_enumeration_is_adversarial(
    tmp_path: Path,
) -> None:
    packages = tmp_path / "packages"
    packages.mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    (packages / "member").symlink_to(outside, target_is_directory=True)

    assert _resolve(tmp_path) == [
        "DV-NPM-009 package.json:/workspaces: symlinked member packages/member"
    ]


def test_workspace_star_matches_only_one_path_segment(tmp_path: Path) -> None:
    packages = tmp_path / "packages"
    (packages / "direct").mkdir(parents=True)
    (packages / "nested" / "member").mkdir(parents=True)

    def read_manifest(path: str) -> tuple[bytes, None, bool]:
        return f'{{"name":"{path}"}}'.encode(), None, False

    root_fd = os.open(tmp_path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        _, _, records, diagnostics = dependency_workspaces.resolve_npm_workspaces(
            root_fd,
            _root_data(),
            "package.json",
            read_manifest,
        )
    finally:
        os.close(root_fd)

    assert diagnostics == []
    assert [record[0] for record in records] == ["packages/direct", "packages/nested"]


def test_workspace_double_star_matches_nested_segments(tmp_path: Path) -> None:
    packages = tmp_path / "packages"
    (packages / "nested" / "member").mkdir(parents=True)

    def read_manifest(path: str) -> tuple[bytes, None, bool]:
        return f'{{"name":"{path}"}}'.encode(), None, False

    root_fd = os.open(tmp_path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        _, _, records, diagnostics = dependency_workspaces.resolve_npm_workspaces(
            root_fd,
            b'{"workspaces":["packages/**"]}',
            "package.json",
            read_manifest,
        )
    finally:
        os.close(root_fd)

    assert diagnostics == []
    assert [record[0] for record in records] == [
        "packages",
        "packages/nested",
        "packages/nested/member",
    ]


def test_workspace_non_mapping_manifest_has_stable_diagnostic(tmp_path: Path) -> None:
    (tmp_path / "packages" / "member").mkdir(parents=True)

    root_fd = os.open(tmp_path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        _, _, _, diagnostics = dependency_workspaces.resolve_npm_workspaces(
            root_fd,
            _root_data(),
            "package.json",
            lambda path: (b"[]", None, False),
        )
    finally:
        os.close(root_fd)

    assert diagnostics == [
        "DV-NPM-002 packages/member/package.json: expected an object"
    ]
