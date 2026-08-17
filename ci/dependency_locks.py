"""Pure structural validation for explicitly associated dependency lockfiles."""

from __future__ import annotations

import json
from collections.abc import Mapping

import tomllib
from packaging.requirements import InvalidRequirement, Requirement
from packaging.utils import canonicalize_name
from packaging.version import InvalidVersion, Version

_SECTIONS = (
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
)
_LOCKFILE_VERSION = 3
_UV_LOCK_VERSION = 1
_UV_LOCK_REVISION = 3


def _document(
    data: bytes, display_path: str
) -> tuple[Mapping[str, object] | None, list[str]]:
    try:
        value: object = json.loads(data.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        return None, [f"DV-LOCK-001 {display_path}: invalid JSON: {error}"]
    if not isinstance(value, dict):
        return None, [f"DV-LOCK-002 {display_path}: expected an object"]
    return value, []


def _dependency_sections(
    document: Mapping[str, object], display_path: str
) -> tuple[dict[str, dict[str, str]] | None, list[str]]:
    sections: dict[str, dict[str, str]] = {}
    diagnostics: list[str] = []
    for section in _SECTIONS:
        value = document.get(section, {})
        if not isinstance(value, dict):
            diagnostics.append(
                f"DV-LOCK-005 {display_path}:/{section}: expected an object"
            )
        else:
            entries: dict[str, str] = {}
            for name, specifier in value.items():
                if not isinstance(name, str) or not isinstance(specifier, str):
                    diagnostics.append(
                        f"DV-LOCK-006 {display_path}:/{section}: expected string "
                        "dependency entries"
                    )
                    break
                entries[name] = specifier
            else:
                sections[section] = entries
    return (sections if not diagnostics else None), diagnostics


def validate_npm_lock_bytes(
    package_data: bytes,
    package_path: str,
    lock_data: bytes,
    lock_path: str,
) -> list[str]:
    """Compare an explicit package.json with its npm v3 root lock entry."""
    package, diagnostics = _document(package_data, package_path)
    lock, lock_diagnostics = _document(lock_data, lock_path)
    diagnostics.extend(lock_diagnostics)
    if package is None or lock is None:
        return sorted(diagnostics)

    package_sections, package_diagnostics = _dependency_sections(package, package_path)
    diagnostics.extend(package_diagnostics)
    version = lock.get("lockfileVersion")
    if version != _LOCKFILE_VERSION:
        diagnostics.append(
            f"DV-LOCK-003 {lock_path}:/lockfileVersion: unsupported lockfileVersion "
            f"{version!r}; expected {_LOCKFILE_VERSION}"
        )
        return sorted(diagnostics)
    packages = lock.get("packages")
    if not isinstance(packages, dict):
        diagnostics.append(f"DV-LOCK-004 {lock_path}:/packages: expected an object")
        return sorted(diagnostics)
    root = packages.get("")
    if not isinstance(root, dict):
        diagnostics.append(f"DV-LOCK-004 {lock_path}:/packages/: expected an object")
        return sorted(diagnostics)
    lock_sections, lock_diagnostics = _dependency_sections(
        root, f"{lock_path}:/packages/"
    )
    diagnostics.extend(lock_diagnostics)
    if package_sections is None or lock_sections is None:
        return sorted(diagnostics)
    for section in _SECTIONS:
        names = sorted(package_sections[section].keys() | lock_sections[section].keys())
        for name in names:
            package_value = package_sections[section].get(name)
            lock_value = lock_sections[section].get(name)
            if package_value != lock_value:
                diagnostics.append(
                    f"DV-LOCK-007 {package_path}:/{section}/{name}: "
                    f"does not match {lock_path}:/packages//{section}/{name} "
                    f"({package_value!r} != {lock_value!r})"
                )
    return sorted(diagnostics)


def validate_npm_workspace_lock_bytes(
    root_data: bytes,
    root_path: str,
    members: list[tuple[str, str, bytes, str]],
    lock_data: bytes,
    lock_path: str,
) -> list[str]:
    """Bind an explicit workspace root and members to npm v3 lock entries."""
    root, diagnostics = _document(root_data, root_path)
    lock, lock_diagnostics = _document(lock_data, lock_path)
    diagnostics.extend(lock_diagnostics)
    if root is None or lock is None:
        return sorted(diagnostics)
    if lock.get("lockfileVersion") != _LOCKFILE_VERSION:
        diagnostics.append(
            f"DV-LOCK-003 {lock_path}:/lockfileVersion: unsupported lockfileVersion "
            f"{lock.get('lockfileVersion')!r}; expected {_LOCKFILE_VERSION}"
        )
        return sorted(diagnostics)
    packages = lock.get("packages")
    if not isinstance(packages, dict):
        diagnostics.append(f"DV-LOCK-004 {lock_path}:/packages: expected an object")
        return sorted(diagnostics)

    manifests = [("", root_path, root_data)] + [
        (directory, path, data) for directory, path, data, _ in members
    ]
    for key, path, data in manifests:
        manifest, manifest_diagnostics = _document(data, path)
        diagnostics.extend(manifest_diagnostics)
        entry = packages.get(key)
        location = f"{lock_path}:/packages/{key}"
        if not isinstance(entry, dict):
            diagnostics.append(f"DV-LOCK-008 {location}: missing workspace entry")
            continue
        if manifest is None:
            continue
        manifest_sections, section_diagnostics = _dependency_sections(manifest, path)
        lock_sections, lock_section_diagnostics = _dependency_sections(entry, location)
        diagnostics.extend(section_diagnostics)
        diagnostics.extend(lock_section_diagnostics)
        if manifest_sections is None or lock_sections is None:
            continue
        for section in _SECTIONS:
            for name in sorted(
                manifest_sections[section].keys() | lock_sections[section].keys()
            ):
                manifest_value = manifest_sections[section].get(name)
                lock_value = lock_sections[section].get(name)
                if manifest_value != lock_value:
                    diagnostics.append(
                        f"DV-LOCK-007 {path}:/{section}/{name}: does not match "
                        f"{location}/{section}/{name} "
                        f"({manifest_value!r} != {lock_value!r})"
                    )
    for directory, _, _, name in members:
        link_path = f"node_modules/{name}"
        link = packages.get(link_path)
        if (
            not isinstance(link, dict)
            or link.get("resolved") != directory
            or link.get("link") is not True
        ):
            diagnostics.append(
                f"DV-LOCK-009 {lock_path}:/packages/{link_path}: expected local link "
                f"to {directory!r}"
            )
    return sorted(diagnostics)


def _toml_document(
    data: bytes, display_path: str, rule: str
) -> tuple[Mapping[str, object] | None, list[str]]:
    try:
        value: object = tomllib.loads(data.decode("utf-8"))
    except (UnicodeDecodeError, tomllib.TOMLDecodeError) as error:
        return None, [f"{rule} {display_path}: invalid TOML: {error}"]
    if not isinstance(value, dict):
        return None, [f"{rule} {display_path}: expected a TOML table"]
    return value, []


def _requirements(
    values: object, location: str, diagnostics: list[str]
) -> list[Requirement]:
    if not isinstance(values, list):
        diagnostics.append(f"DV-UVL-005 {location}: expected an array")
        return []
    requirements: list[Requirement] = []
    for index, value in enumerate(values):
        if not isinstance(value, str):
            diagnostics.append(f"DV-UVL-005 {location}[{index}]: expected a string")
            continue
        try:
            requirements.append(Requirement(value))
        except InvalidRequirement:
            diagnostics.append(
                f"DV-UVL-005 {location}[{index}]: invalid PEP 508 requirement"
            )
    return requirements


def _lock_dependency_names(value: object) -> set[str] | None:
    if not isinstance(value, list):
        return None
    names: set[str] = set()
    for item in value:
        if not isinstance(item, dict) or not isinstance(item.get("name"), str):
            return None
        names.add(str(canonicalize_name(item["name"])))
    return names


def _metadata_requirements(value: object) -> set[tuple[str, str, str]] | None:
    if not isinstance(value, list):
        return None
    requirements: set[tuple[str, str, str]] = set()
    for item in value:
        if not isinstance(item, dict) or not isinstance(item.get("name"), str):
            return None
        specifier = item.get("specifier", "")
        marker = item.get("marker", "")
        if not isinstance(specifier, str) or not isinstance(marker, str):
            return None
        requirements.add((str(canonicalize_name(item["name"])), specifier, marker))
    return requirements


def _expected_metadata(
    requirements: list[Requirement], extra: str | None = None
) -> set[tuple[str, str, str]]:
    expected: set[tuple[str, str, str]] = set()
    for requirement in requirements:
        marker = str(requirement.marker) if requirement.marker is not None else ""
        if extra is not None:
            extra_marker = f"extra == '{extra}'"
            marker = f"{extra_marker} and ({marker})" if marker else extra_marker
        expected.add(
            (
                str(canonicalize_name(requirement.name)),
                str(requirement.specifier),
                marker,
            )
        )
    return expected


def _validate_locked_requirement_versions(
    requirements: list[tuple[str, Requirement]],
    records: Mapping[str, Mapping[str, object]],
    lock_path: str,
    diagnostics: list[str],
) -> None:
    """Ensure each declaration's specifier admits its locked package version."""
    for location, requirement in requirements:
        dependency_name = str(canonicalize_name(requirement.name))
        record = records.get(dependency_name)
        if record is None:
            continue
        version = record.get("version")
        if not isinstance(version, str):
            diagnostics.append(
                f"DV-UVL-004 {lock_path}:package[{dependency_name}].version: "
                "expected a PEP 440 version"
            )
            continue
        try:
            locked_version = Version(version)
        except InvalidVersion:
            diagnostics.append(
                f"DV-UVL-004 {lock_path}:package[{dependency_name}].version: "
                "expected a PEP 440 version"
            )
            continue
        if requirement.specifier and not requirement.specifier.contains(
            locked_version, prereleases=True
        ):
            diagnostics.append(
                f"DV-UVL-009 {location}: {requirement.name} {requirement.specifier} "
                f"does not admit {lock_path}:package[{dependency_name}].version "
                f"{version!r}"
            )


def validate_uv_lock_bytes(
    pyproject_data: bytes,
    pyproject_path: str,
    lock_data: bytes,
    lock_path: str,
) -> list[str]:
    """Compare an explicit pyproject.toml with a uv v1/revision 3 lockfile."""
    pyproject, diagnostics = _toml_document(
        pyproject_data, pyproject_path, "DV-UVL-001"
    )
    lock, lock_diagnostics = _toml_document(lock_data, lock_path, "DV-UVL-002")
    diagnostics.extend(lock_diagnostics)
    if pyproject is None or lock is None:
        return sorted(diagnostics)

    if (
        lock.get("version") != _UV_LOCK_VERSION
        or lock.get("revision") != _UV_LOCK_REVISION
    ):
        diagnostics.append(
            f"DV-UVL-003 {lock_path}: unsupported uv.lock schema "
            f"version={lock.get('version')!r}, revision={lock.get('revision')!r}; "
            f"expected version={_UV_LOCK_VERSION}, revision={_UV_LOCK_REVISION}"
        )
        return sorted(diagnostics)
    packages = lock.get("package")
    if not isinstance(packages, list):
        diagnostics.append(f"DV-UVL-004 {lock_path}:package: expected an array")
        return sorted(diagnostics)

    project = pyproject.get("project")
    build_system = pyproject.get("build-system")
    if not isinstance(project, dict):
        diagnostics.append(
            f"DV-UVL-005 {pyproject_path}:project: expected a TOML table"
        )
        return sorted(diagnostics)
    if build_system is not None and not isinstance(build_system, dict):
        diagnostics.append(
            f"DV-UVL-005 {pyproject_path}:build-system: expected a TOML table"
        )
    name = project.get("name")
    version = project.get("version")
    if not isinstance(name, str) or not isinstance(version, str):
        diagnostics.append(
            f"DV-UVL-005 {pyproject_path}:project: name and version must be strings"
        )
        return sorted(diagnostics)
    main = _requirements(
        project.get("dependencies", []),
        f"{pyproject_path}:project.dependencies",
        diagnostics,
    )
    optional_value = project.get("optional-dependencies", {})
    optional: dict[str, list[Requirement]] = {}
    if not isinstance(optional_value, dict):
        diagnostics.append(
            f"DV-UVL-005 {pyproject_path}:project.optional-dependencies: "
            "expected a TOML table"
        )
    else:
        for extra, values in optional_value.items():
            if not isinstance(extra, str):
                diagnostics.append(
                    f"DV-UVL-005 {pyproject_path}:project.optional-dependencies: "
                    "expected string names"
                )
                continue
            optional[extra] = _requirements(
                values,
                f"{pyproject_path}:project.optional-dependencies.{extra}",
                diagnostics,
            )
    if diagnostics:
        return sorted(diagnostics)

    records = {}
    for index, package in enumerate(packages):
        if not isinstance(package, dict) or not isinstance(package.get("name"), str):
            diagnostics.append(
                f"DV-UVL-004 {lock_path}:package[{index}]: expected a package name"
            )
            continue
        records[str(canonicalize_name(package["name"]))] = package
    root_name = str(canonicalize_name(name))
    root = records.get(root_name)
    if root is None:
        diagnostics.append(
            f"DV-UVL-006 {lock_path}:package: missing project root {root_name}"
        )
        return sorted(diagnostics)
    if root.get("version") != version or root.get("source") != {"editable": "."}:
        diagnostics.append(
            f"DV-UVL-007 {lock_path}:package[{root_name}]: project metadata drift"
        )

    declared_requirements = [
        (f"{pyproject_path}:project.dependencies", requirement) for requirement in main
    ]
    declared_requirements.extend(
        (f"{pyproject_path}:project.optional-dependencies.{extra}", requirement)
        for extra, requirements in optional.items()
        for requirement in requirements
    )
    for _, requirement in declared_requirements:
        dependency_name = str(canonicalize_name(requirement.name))
        if dependency_name not in records:
            diagnostics.append(
                f"DV-UVL-006 {lock_path}:package: missing locked root {dependency_name}"
            )
    _validate_locked_requirement_versions(
        declared_requirements, records, lock_path, diagnostics
    )

    root_dependencies = _lock_dependency_names(root.get("dependencies", []))
    if root_dependencies is None:
        diagnostics.append(
            f"DV-UVL-004 {lock_path}:package[{root_name}].dependencies: invalid entries"
        )
    else:
        for requirement in main:
            dependency_name = str(canonicalize_name(requirement.name))
            if dependency_name not in root_dependencies:
                diagnostics.append(
                    f"DV-UVL-006 {lock_path}:package[{root_name}].dependencies: "
                    f"missing {dependency_name}"
                )
    lock_optional = root.get("optional-dependencies", {})
    optional_location = f"{lock_path}:package[{root_name}].optional-dependencies"
    if not isinstance(lock_optional, dict):
        diagnostics.append(f"DV-UVL-004 {optional_location}: expected a table")
    else:
        for extra, requirements in optional.items():
            names = _lock_dependency_names(lock_optional.get(extra, []))
            if names is None:
                diagnostics.append(f"DV-UVL-006 {optional_location}: missing {extra}")
                continue
            for requirement in requirements:
                dependency_name = str(canonicalize_name(requirement.name))
                if dependency_name not in names:
                    diagnostics.append(
                        f"DV-UVL-006 {optional_location}.{extra}: "
                        f"missing {dependency_name}"
                    )

    metadata = root.get("metadata")
    recorded = (
        _metadata_requirements(metadata.get("requires-dist"))
        if isinstance(metadata, dict)
        else None
    )
    expected = _expected_metadata(main)
    for extra, requirements in optional.items():
        expected.update(_expected_metadata(requirements, extra))
    if recorded is None or recorded != expected:
        diagnostics.append(
            f"DV-UVL-008 {lock_path}:package[{root_name}].metadata.requires-dist: "
            "declaration drift"
        )
    provided = metadata.get("provides-extras") if isinstance(metadata, dict) else None
    if not isinstance(provided, list) or set(provided) != set(optional):
        diagnostics.append(
            f"DV-UVL-008 {lock_path}:package[{root_name}].metadata.provides-extras: "
            "declaration drift"
        )
    return sorted(diagnostics)
