"""Pure deterministic dependency-validation entry point."""

from __future__ import annotations

import argparse
import json
import os
import stat
from pathlib import Path

from ci.compose_images import validate_compose_bytes
from ci.dependency_declarations import validate_pyproject_bytes
from ci.dependency_exclusions import parse_exclusions_text
from ci.dependency_locks import (
    validate_npm_lock_bytes,
    validate_npm_workspace_lock_bytes,
    validate_uv_lock_bytes,
)
from ci.dependency_npm import validate_package_json_bytes
from ci.dependency_result import (
    ConsumerRootIdentity,
    InputKind,
    InputResult,
    input_result,
    validation_result,
)
from ci.dependency_workspaces import resolve_npm_workspaces, validate_npm_workspaces
from ci.dockerfile_images import validate_dockerfile_bytes
from ci.tool_catalog import validate_catalog_text


def _path_parts(value: str) -> tuple[tuple[str, ...] | None, str | None]:
    path = Path(value)
    if (
        path.is_absolute()
        or not value
        or "\x00" in value
        or any(part in {"", ".", ".."} for part in value.split("/"))
    ):
        return None, f"DV-IN-002 {value!r}: input must be a normalized relative path"
    return tuple(value.split("/")), None


def _read_explicit_file(
    root_fd: int,
    value: str,
    inputs: list[InputResult],
    kind: InputKind,
    *,
    applicable_if_absent: bool = True,
) -> tuple[bytes | None, str | None, bool]:
    parts, path_error = _path_parts(value)
    if path_error:
        inputs.append(
            input_result(value, None, kind=kind, applicable=True, status="unreadable")
        )
        return None, path_error, False
    assert parts is not None
    current_fd = os.dup(root_fd)
    try:
        for index, part in enumerate(parts):
            final = index == len(parts) - 1
            flags = os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW
            if not final:
                flags |= os.O_DIRECTORY
            try:
                next_fd = os.open(part, flags, dir_fd=current_fd)
            except FileNotFoundError:
                detail = "missing" if final else "unreadable"
                inputs.append(
                    input_result(
                        value,
                        None,
                        kind=kind,
                        applicable=applicable_if_absent if final else True,
                        status="absent" if final else "unreadable",
                    )
                )
                return None, f"DV-IN-003 {value}: explicit input is {detail}", final
            except OSError:
                inputs.append(
                    input_result(
                        value, None, kind=kind, applicable=True, status="unreadable"
                    )
                )
                return None, f"DV-IN-003 {value}: explicit input is unreadable", False
            previous_fd = current_fd
            current_fd = next_fd
            os.close(previous_fd)
        if not stat.S_ISREG(os.fstat(current_fd).st_mode):
            inputs.append(
                input_result(
                    value, None, kind=kind, applicable=True, status="unreadable"
                )
            )
            return (
                None,
                f"DV-IN-002 {value}: input must be a regular file "
                "beneath consumer root",
                False,
            )
        try:
            with os.fdopen(current_fd, "rb", closefd=False) as source:
                data = source.read()
                inputs.append(
                    input_result(value, data, kind=kind, applicable=True, status="read")
                )
                return data, None, False
        except OSError:
            inputs.append(
                input_result(
                    value, None, kind=kind, applicable=True, status="unreadable"
                )
            )
            return None, f"DV-IN-003 {value}: explicit input is unreadable", False
    finally:
        os.close(current_fd)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Validate declared dependency inputs offline"
    )
    parser.add_argument("--consumer-root", required=True, type=Path)
    parser.add_argument("--catalog", action="append", default=[])
    parser.add_argument("--catalog-if-present", action="append", default=[])
    parser.add_argument("--npm-lock", action="append", nargs=2, default=[])
    parser.add_argument("--npm-workspace-lock", action="append", nargs=2, default=[])
    parser.add_argument("--uv-lock", action="append", nargs=2, default=[])
    parser.add_argument("--npm-workspaces", action="append", default=[])
    parser.add_argument("--dockerfile", action="append", default=[])
    parser.add_argument("--compose", action="append", default=[])
    parser.add_argument("--exclusions")
    parser.add_argument("--json-result", action="store_true")
    parser.add_argument("declarations", nargs="*")
    return parser


def _catalog_diagnostics(
    root_fd: int,
    values: list[str],
    optional: bool,
    inputs: list[InputResult],
    notices: list[str],
) -> list[str]:
    diagnostics: list[str] = []
    for value in values:
        data, error, missing = _read_explicit_file(
            root_fd, value, inputs, "catalog", applicable_if_absent=not optional
        )
        if optional and missing:
            notices.append(f"DV-IN-004-CATALOG-ABSENT {value}: not applicable")
        elif error:
            diagnostics.append(error)
        elif data is not None:
            try:
                text = data.decode("utf-8")
            except UnicodeDecodeError as decode_error:
                diagnostics.append(f"DV-CAT-000 $: cannot read catalog: {decode_error}")
            else:
                diagnostics.extend(validate_catalog_text(text, Path(value)))
    return diagnostics


def _declaration_diagnostics(
    root_fd: int,
    values: list[str],
    exclusions: frozenset[str],
    inputs: list[InputResult],
) -> list[str]:
    diagnostics: list[str] = []
    for value in values:
        data, error, _ = _read_explicit_file(root_fd, value, inputs, "declaration")
        if error:
            diagnostics.append(error)
        elif data is not None:
            if Path(value).name == "pyproject.toml":
                if exclusions:
                    diagnostics.extend(
                        validate_pyproject_bytes(data, value, exclusions)
                    )
                else:
                    diagnostics.extend(validate_pyproject_bytes(data, value))
            elif Path(value).name == "package.json":
                if exclusions:
                    diagnostics.extend(
                        validate_package_json_bytes(data, value, exclusions=exclusions)
                    )
                else:
                    diagnostics.extend(validate_package_json_bytes(data, value))
            else:
                diagnostics.append(f"DV-IN-005 {value}: unsupported declaration kind")
    return diagnostics


def _npm_lock_diagnostics(
    root_fd: int, values: list[list[str]], inputs: list[InputResult]
) -> list[str]:
    diagnostics: list[str] = []
    for package_path, lock_path in values:
        package_data, package_error, _ = _read_explicit_file(
            root_fd, package_path, inputs, "npm-lock-declaration"
        )
        lock_data, lock_error, _ = _read_explicit_file(
            root_fd, lock_path, inputs, "npm-lock"
        )
        if package_error:
            diagnostics.append(package_error)
        if lock_error:
            diagnostics.append(lock_error)
        if package_data is not None and lock_data is not None:
            diagnostics.extend(
                validate_npm_lock_bytes(
                    package_data, package_path, lock_data, lock_path
                )
            )
    return diagnostics


def _npm_workspace_lock_diagnostics(
    root_fd: int,
    values: list[list[str]],
    exclusions: frozenset[str],
    inputs: list[InputResult],
) -> list[str]:
    diagnostics: list[str] = []
    for root_path, lock_path in values:
        root_data, root_error, _ = _read_explicit_file(
            root_fd, root_path, inputs, "npm-workspace-root"
        )
        lock_data, lock_error, _ = _read_explicit_file(
            root_fd, lock_path, inputs, "npm-workspace-lock"
        )
        if root_error:
            diagnostics.append(root_error)
        if lock_error:
            diagnostics.append(lock_error)
        if root_data is None or lock_data is None:
            continue
        members, member_data, records, workspace_diagnostics = resolve_npm_workspaces(
            root_fd,
            root_data,
            root_path,
            lambda path: _read_explicit_file(
                root_fd, path, inputs, "npm-workspace-member"
            ),
        )
        diagnostics.extend(workspace_diagnostics)
        diagnostics.extend(
            validate_package_json_bytes(root_data, root_path, members, exclusions)
        )
        for manifest_path, data in member_data:
            diagnostics.extend(
                validate_package_json_bytes(data, manifest_path, members, exclusions)
            )
        diagnostics.extend(
            validate_npm_workspace_lock_bytes(
                root_data, root_path, records, lock_data, lock_path
            )
        )
    return diagnostics


def _uv_lock_diagnostics(
    root_fd: int, values: list[list[str]], inputs: list[InputResult]
) -> list[str]:
    diagnostics: list[str] = []
    for pyproject_path, lock_path in values:
        pyproject_data, pyproject_error, _ = _read_explicit_file(
            root_fd, pyproject_path, inputs, "uv-lock-declaration"
        )
        lock_data, lock_error, _ = _read_explicit_file(
            root_fd, lock_path, inputs, "uv-lock"
        )
        if pyproject_error:
            diagnostics.append(pyproject_error)
        if lock_error:
            diagnostics.append(lock_error)
        if pyproject_data is not None and lock_data is not None:
            diagnostics.extend(
                validate_uv_lock_bytes(
                    pyproject_data, pyproject_path, lock_data, lock_path
                )
            )
    return diagnostics


def _npm_workspace_diagnostics(
    root_fd: int,
    values: list[str],
    exclusions: frozenset[str],
    inputs: list[InputResult],
) -> list[str]:
    diagnostics: list[str] = []
    for value in values:
        data, error, _ = _read_explicit_file(
            root_fd, value, inputs, "npm-workspaces-root"
        )
        if error:
            diagnostics.append(error)
        elif data is not None:
            if exclusions:
                diagnostics.extend(
                    validate_npm_workspaces(
                        root_fd,
                        data,
                        value,
                        lambda path: _read_explicit_file(
                            root_fd, path, inputs, "npm-workspace-member"
                        ),
                        exclusions,
                    )
                )
            else:
                diagnostics.extend(
                    validate_npm_workspaces(
                        root_fd,
                        data,
                        value,
                        lambda path: _read_explicit_file(
                            root_fd, path, inputs, "npm-workspace-member"
                        ),
                    )
                )
    return diagnostics


def _dockerfile_diagnostics(
    root_fd: int, values: list[str], inputs: list[InputResult]
) -> list[str]:
    diagnostics: list[str] = []
    for value in values:
        data, error, _ = _read_explicit_file(root_fd, value, inputs, "dockerfile")
        if error:
            diagnostics.append(error)
        elif data is not None:
            diagnostics.extend(validate_dockerfile_bytes(data, value))
    return diagnostics


def _compose_diagnostics(
    root_fd: int, values: list[str], inputs: list[InputResult]
) -> list[str]:
    diagnostics: list[str] = []
    for value in values:
        data, error, _ = _read_explicit_file(root_fd, value, inputs, "compose")
        if error:
            diagnostics.append(error)
        elif data is not None:
            diagnostics.extend(validate_compose_bytes(data, value))
    return diagnostics


def _exclusions_diagnostics(
    root_fd: int, value: str | None, inputs: list[InputResult]
) -> tuple[frozenset[str], frozenset[str], list[str]]:
    if value is None:
        return frozenset(), frozenset(), []
    data, error, _ = _read_explicit_file(root_fd, value, inputs, "exclusions")
    if error:
        return frozenset(), frozenset(), [error]
    assert data is not None
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError as error:
        return frozenset(), frozenset(), [f"DV-EXC-000 $: invalid YAML: {error}"]
    exclusions, diagnostics = parse_exclusions_text(text, Path(value))
    if exclusions is None:
        return frozenset(), frozenset(), diagnostics
    return exclusions.excludes, exclusions.npm_excludes, []


def main(argv: list[str] | None = None) -> int:
    """Validate explicit dependency declarations beneath a consumer root."""
    parser = _parser()
    args = parser.parse_args(argv)
    if not args.consumer_root.is_absolute():
        parser.error("--consumer-root must be an absolute path")
    try:
        root_fd = os.open(
            args.consumer_root,
            os.O_RDONLY | os.O_CLOEXEC | os.O_DIRECTORY | os.O_NOFOLLOW,
        )
    except OSError:
        parser.error("--consumer-root must be a readable directory")
    try:
        inputs: list[InputResult] = []
        notices: list[str] = []
        root_stat = os.fstat(root_fd)
        python_exclusions, npm_exclusions, diagnostics = _exclusions_diagnostics(
            root_fd, args.exclusions, inputs
        )
        diagnostics.extend(
            _catalog_diagnostics(root_fd, args.catalog, False, inputs, notices)
        )
        diagnostics.extend(
            _catalog_diagnostics(
                root_fd, args.catalog_if_present, True, inputs, notices
            )
        )
        diagnostics.extend(
            _declaration_diagnostics(
                root_fd, args.declarations, python_exclusions, inputs
            )
        )
        diagnostics.extend(_npm_lock_diagnostics(root_fd, args.npm_lock, inputs))
        diagnostics.extend(
            _npm_workspace_lock_diagnostics(
                root_fd, args.npm_workspace_lock, npm_exclusions, inputs
            )
        )
        diagnostics.extend(_uv_lock_diagnostics(root_fd, args.uv_lock, inputs))
        diagnostics.extend(
            _npm_workspace_diagnostics(
                root_fd, args.npm_workspaces, npm_exclusions, inputs
            )
        )
        diagnostics.extend(_dockerfile_diagnostics(root_fd, args.dockerfile, inputs))
        diagnostics.extend(_compose_diagnostics(root_fd, args.compose, inputs))
    finally:
        os.close(root_fd)
    result = validation_result(
        ConsumerRootIdentity(device=root_stat.st_dev, inode=root_stat.st_ino),
        tuple(inputs),
        diagnostics,
    )
    if args.json_result:
        print(json.dumps(result.model_dump(), sort_keys=True, separators=(",", ":")))
    else:
        for notice in notices:
            print(notice)
        for diagnostic in sorted(diagnostics):
            print(diagnostic)
    return int(bool(diagnostics))
