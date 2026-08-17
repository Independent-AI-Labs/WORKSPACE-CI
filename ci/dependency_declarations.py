"""Pure typed parsing of supported dependency declarations."""

from __future__ import annotations

from pathlib import Path

import tomllib
from packaging.requirements import InvalidRequirement, Requirement
from packaging.utils import canonicalize_name
from packaging.version import InvalidVersion, Version
from pydantic import BaseModel, ConfigDict, Field, ValidationError


class _ProjectSection(BaseModel):
    """Supported project table values, retaining array validation diagnostics."""

    model_config = ConfigDict(extra="ignore")

    dependencies: object = Field(default_factory=list)
    optional_dependencies: object = Field(
        default_factory=dict, alias="optional-dependencies"
    )


class _BuildSystemSection(BaseModel):
    """Supported build-system table values."""

    model_config = ConfigDict(extra="ignore")

    requires: object = Field(default_factory=list)


class _PyprojectDocument(BaseModel):
    """Typed boundary for the top-level TOML sections this validator supports."""

    model_config = ConfigDict(extra="ignore")

    project: _ProjectSection | None = None
    build_system: _BuildSystemSection | None = Field(default=None, alias="build-system")


def _strict(requirement: Requirement) -> bool:
    specs = tuple(requirement.specifier)
    if len(specs) == 1 and specs[0].operator == "==" and "*" not in specs[0].version:
        return True
    lower = {">", ">="}
    upper = {"<", "<="}
    if not specs or any(spec.operator not in lower | upper for spec in specs):
        return False
    try:
        lower_versions = [
            Version(spec.version) for spec in specs if spec.operator in lower
        ]
        upper_versions = [
            Version(spec.version) for spec in specs if spec.operator in upper
        ]
    except InvalidVersion:
        return False
    if not lower_versions or not upper_versions:
        return False
    return max(lower_versions) < min(upper_versions)


def _groups(document: _PyprojectDocument) -> list[tuple[str, object]]:
    groups: list[tuple[str, object]] = []
    if document.project is not None:
        groups.append(("project.dependencies", document.project.dependencies))
        optional = document.project.optional_dependencies
        if isinstance(optional, dict):
            groups.extend(
                (f"project.optional-dependencies.{name}", values)
                for name, values in optional.items()
            )
        elif optional is not None:
            groups.append(("project.optional-dependencies", optional))
    if document.build_system is not None:
        groups.append(("build-system.requires", document.build_system.requires))
    return groups


def _validate_group(
    group: str,
    values: object,
    display_path: str,
    occurrences: dict[str, list[str]],
    exclusions: frozenset[str],
) -> list[str]:
    if not isinstance(values, list):
        return [f"DV-DECL-002 {display_path}:{group}: expected an array"]
    diagnostics: list[str] = []
    for index, value in enumerate(values):
        location = f"{display_path}:{group}[{index}]"
        if not isinstance(value, str):
            diagnostics.append(f"DV-DECL-003 {location}: expected a PEP 508 string")
            continue
        try:
            requirement = Requirement(value)
        except InvalidRequirement:
            diagnostics.append(f"DV-DECL-004 {location}: invalid PEP 508 requirement")
            continue
        name = str(canonicalize_name(requirement.name))
        occurrences.setdefault(name, []).append(location)
        if requirement.url is not None:
            diagnostics.append(
                f"DV-DECL-005 {location}: direct references are unsupported"
            )
        elif name not in exclusions and not _strict(requirement):
            diagnostics.append(
                f"DV-DECL-006 {location}: dependency must be exactly pinned or bounded"
            )
    return diagnostics


def _duplicate_diagnostics(
    display_path: str, occurrences: dict[str, list[str]]
) -> list[str]:
    return [
        f"DV-DECL-007 {display_path}: duplicate {name} at {', '.join(locations)}"
        for name, locations in occurrences.items()
        if len(locations) > 1
    ]


def validate_pyproject_bytes(
    data: bytes, display_path: str, exclusions: frozenset[str] = frozenset()
) -> list[str]:
    """Validate a pyproject document already read from a trusted descriptor."""
    try:
        document = tomllib.loads(data.decode("utf-8"))
    except (tomllib.TOMLDecodeError, UnicodeDecodeError) as error:
        return [f"DV-DECL-001 {display_path}: invalid TOML: {error}"]
    try:
        parsed = _PyprojectDocument.model_validate(document)
    except ValidationError as error:
        return sorted(
            "DV-DECL-008 "
            f"{display_path}:{'.'.join(str(part) for part in issue['loc'])}: "
            "expected a TOML table"
            for issue in error.errors(include_url=False)
        )
    diagnostics: list[str] = []
    occurrences: dict[str, list[str]] = {}
    for group, values in _groups(parsed):
        diagnostics.extend(
            _validate_group(group, values, display_path, occurrences, exclusions)
        )
    diagnostics.extend(_duplicate_diagnostics(display_path, occurrences))
    return sorted(diagnostics)


def validate_pyproject(path: Path, display_path: str) -> list[str]:
    """Validate all supported PEP 508 arrays without resolving dependencies."""
    try:
        data = path.read_bytes()
    except OSError as error:
        return [f"DV-DECL-001 {display_path}: invalid TOML: {error}"]
    return validate_pyproject_bytes(data, display_path)
