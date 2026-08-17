"""Pure, offline validation for explicit npm package declarations."""

from __future__ import annotations

import json
import re
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError

_SECTIONS = (
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
)
_VERSION = re.compile(
    r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)"
    r"(?:-((?:0|[1-9]\d*|[0-9A-Za-z-]+)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]+))*))?"
    r"(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$"
)
_COMPARATOR = re.compile(r"(>=|>|<=|<)\s*([^\s,]+)")


class _PackageDocument(BaseModel):
    """Typed boundary for supported package.json dependency sections."""

    model_config = ConfigDict(extra="ignore", strict=True)

    dependencies: dict[str, str] = Field(default_factory=dict)
    dev_dependencies: dict[str, str] = Field(
        default_factory=dict, alias="devDependencies"
    )
    optional_dependencies: dict[str, str] = Field(
        default_factory=dict, alias="optionalDependencies"
    )
    peer_dependencies: dict[str, str] = Field(
        default_factory=dict, alias="peerDependencies"
    )


type _Semver = tuple[int, int, int, bool, tuple[tuple[int, int | str], ...]]


def _parse_version(value: str) -> _Semver | None:
    match = _VERSION.fullmatch(value)
    if match is None:
        return None
    prerelease = (
        tuple(
            (0, int(part)) if part.isdigit() else (1, part)
            for part in match.group(4).split(".")
        )
        if match.group(4)
        else ()
    )
    return (
        int(match.group(1)),
        int(match.group(2)),
        int(match.group(3)),
        not bool(prerelease),
        prerelease,
    )


def _separator_end(value: str, position: int) -> int | None:
    whitespace = False
    while position < len(value) and value[position].isspace():
        whitespace = True
        position += 1
    if position == len(value):
        return position
    if value[position] == ",":
        position += 1
        while position < len(value) and value[position].isspace():
            position += 1
        return position if position < len(value) else None
    return position if whitespace else None


def _strict_specifier(value: str) -> bool:
    if _parse_version(value) is not None:
        return True
    if "||" in value or any(token in value for token in ("*", "x", "X", ":", "~", "^")):
        return False
    position = 0
    lower: list[_Semver] = []
    upper: list[_Semver] = []
    comparators: set[tuple[str, str]] = set()
    while position < len(value):
        match = _COMPARATOR.match(value, position)
        if match is None:
            return False
        comparator = (match.group(1), match.group(2))
        version = _parse_version(match.group(2))
        if version is None or comparator in comparators:
            return False
        comparators.add(comparator)
        if match.group(1) in {">", ">="}:
            lower.append(version)
        else:
            upper.append(version)
        next_position = _separator_end(value, match.end())
        if next_position is None:
            return False
        position = next_position
        if position == len(value):
            break
    return bool(lower and upper and max(lower) < min(upper))


def _pointer_part(value: str) -> str:
    return value.replace("~", "~0").replace("/", "~1")


def _sections(document: _PackageDocument) -> tuple[tuple[str, dict[str, str]], ...]:
    return (
        ("dependencies", document.dependencies),
        ("devDependencies", document.dev_dependencies),
        ("optionalDependencies", document.optional_dependencies),
        ("peerDependencies", document.peer_dependencies),
    )


def _workspace_specifier(value: str, members: set[str], name: str) -> bool:
    """Accept only supported local workspace protocol forms with exact-name proof."""
    suffix = value.removeprefix("workspace:")
    version = suffix[1:] if suffix.startswith(("^", "~")) else suffix
    return name in members and (
        suffix in {"*", "^", "~"} or _parse_version(version) is not None
    )


def validate_package_json_bytes(
    data: bytes,
    display_path: str,
    workspace_members: set[str] | None = None,
    exclusions: frozenset[str] = frozenset(),
) -> list[str]:
    """Validate supported dependency sections from descriptor-bound JSON bytes."""
    try:
        document: Any = json.loads(data.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        return [f"DV-NPM-001 {display_path}: invalid JSON: {error}"]
    try:
        parsed = _PackageDocument.model_validate(document)
    except ValidationError as error:
        type_diagnostics: list[str] = []
        for issue in error.errors(include_url=False):
            error_location = tuple(str(part) for part in issue["loc"])
            if not error_location:
                rule, subject, message = "DV-NPM-002", "$", "expected an object"
            elif len(error_location) == 1:
                rule, subject, message = (
                    "DV-NPM-003",
                    f"/{error_location[0]}",
                    "expected an object",
                )
            else:
                section, name = error_location
                rule = "DV-NPM-004"
                subject = f"/{section}/{_pointer_part(name)}"
                message = "expected a string"
            type_diagnostics.append(f"{rule} {display_path}:{subject}: {message}")
        return sorted(type_diagnostics)

    diagnostics: list[str] = []
    occurrences: dict[str, list[str]] = {}
    for section, values in _sections(parsed):
        for name, specifier in values.items():
            occurrence_location = f"{display_path}:/{section}/{_pointer_part(name)}"
            occurrences.setdefault(name, []).append(occurrence_location)
            valid = _strict_specifier(specifier)
            if specifier.startswith("workspace:") and workspace_members is not None:
                valid = _workspace_specifier(specifier, workspace_members, name)
            if name not in exclusions and not valid:
                diagnostics.append(
                    f"DV-NPM-005 {occurrence_location}: "
                    "dependency must be exactly pinned "
                    "or bounded"
                )
    diagnostics.extend(
        f"DV-NPM-006 {display_path}: duplicate {name} at {', '.join(locations)}"
        for name, locations in occurrences.items()
        if len(locations) > 1
    )
    return sorted(diagnostics)
