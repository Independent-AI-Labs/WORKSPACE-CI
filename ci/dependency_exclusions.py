"""Closed, descriptor-safe parser for dependency-validation exclusions."""

from __future__ import annotations

from collections.abc import Mapping
from pathlib import Path
from typing import Any

import yaml

_FIELDS = frozenset({"schema_version", "excludes", "npm_excludes"})


class DependencyExclusions:
    """Canonical exclusions from a validated version-one document."""

    def __init__(
        self, path: Path, excludes: frozenset[str], npm_excludes: frozenset[str]
    ):
        self.path = path
        self.excludes = excludes
        self.npm_excludes = npm_excludes


def _duplicates(node: yaml.Node, location: str = "$") -> list[str]:
    errors: list[str] = []
    if isinstance(node, yaml.MappingNode):
        seen: set[str] = set()
        for key_node, value_node in node.value:
            key = (
                key_node.value
                if isinstance(key_node, yaml.ScalarNode)
                else "<non-scalar>"
            )
            key_location = f"{location}.{key}"
            if key in seen:
                errors.append(f"DV-EXC-001 {key_location}: duplicate key")
            seen.add(key)
            errors.extend(_duplicates(value_node, key_location))
    elif isinstance(node, yaml.SequenceNode):
        for index, item in enumerate(node.value):
            errors.extend(_duplicates(item, f"{location}[{index}]"))
    return errors


def _strings(raw: Mapping[Any, Any], field: str, errors: list[str]) -> frozenset[str]:
    value = raw.get(field, [])
    if not isinstance(value, list):
        errors.append(f"DV-EXC-005 $.{field}: expected an array")
        return frozenset()
    values: set[str] = set()
    for index, item in enumerate(value):
        if not isinstance(item, str):
            errors.append(f"DV-EXC-006 $.{field}[{index}]: expected a string")
        elif not item:
            errors.append(f"DV-EXC-007 $.{field}[{index}]: expected a nonempty string")
        else:
            values.add(item)
    return frozenset(values)


def parse_exclusions_text(
    text: str, path: Path
) -> tuple[DependencyExclusions | None, list[str]]:
    """Parse descriptor-bound YAML into exclusions, returning stable diagnostics."""
    try:
        node = yaml.compose(text)
        raw = yaml.safe_load(text)
    except yaml.YAMLError as error:
        return None, [f"DV-EXC-000 $: invalid YAML: {error}"]
    errors = _duplicates(node) if node is not None else []
    if not isinstance(raw, Mapping):
        return None, sorted([*errors, "DV-EXC-003 $: expected a mapping"])
    errors.extend(
        f"DV-EXC-002 $.{key}: unknown field"
        for key in sorted(str(key) for key in set(raw) - _FIELDS)
    )
    if raw.get("schema_version") != 1 or type(raw.get("schema_version")) is not int:
        errors.append("DV-EXC-004 $.schema_version: expected integer 1")
    excludes = _strings(raw, "excludes", errors)
    npm_excludes = _strings(raw, "npm_excludes", errors)
    if errors:
        return None, sorted(errors)
    return DependencyExclusions(path, excludes, npm_excludes), []


def validate_exclusions_text(text: str, path: Path) -> list[str]:
    """Validate descriptor-bound YAML without reading from the filesystem."""
    _, errors = parse_exclusions_text(text, path)
    return errors
