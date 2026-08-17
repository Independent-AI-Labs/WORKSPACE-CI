"""Pure offline validation of explicitly supplied Compose image declarations."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

import yaml

from ci.dockerfile_images import validate_image_reference


def _key_name(node: yaml.Node) -> str:
    return node.value if isinstance(node, yaml.ScalarNode) else "<non-scalar>"


def _duplicates(
    node: yaml.Node, location: str = "$", visited: set[int] | None = None
) -> list[str]:
    if visited is None:
        visited = set()
    if id(node) in visited:
        return []
    visited.add(id(node))
    errors: list[str] = []
    if isinstance(node, yaml.MappingNode):
        seen: set[str] = set()
        for key_node, value_node in node.value:
            key = _key_name(key_node)
            key_location = f"{location}.{key}"
            if key in seen:
                errors.append(f"DV-COMPOSE-001 {key_location}: duplicate key")
            seen.add(key)
            errors.extend(_duplicates(value_node, key_location, visited))
    elif isinstance(node, yaml.SequenceNode):
        for index, item in enumerate(node.value):
            errors.extend(_duplicates(item, f"{location}[{index}]", visited))
    return errors


def _mapping(value: object) -> Mapping[Any, Any] | None:
    return value if isinstance(value, Mapping) else None


def validate_compose_bytes(data: bytes, display_path: str) -> list[str]:
    """Validate Compose service images from descriptor-bound bytes only."""
    try:
        text = data.decode("utf-8")
        node = yaml.compose(text)
        raw: object = yaml.safe_load(text)
    except (UnicodeDecodeError, yaml.YAMLError) as error:
        return [f"DV-COMPOSE-000 {display_path}: invalid YAML: {error}"]

    diagnostics = _duplicates(node) if node is not None else []
    root = _mapping(raw)
    if root is None:
        diagnostics.append(f"DV-COMPOSE-002 {display_path}:$: root must be a mapping")
        return sorted(diagnostics)
    services = _mapping(root.get("services"))
    if services is None:
        diagnostics.append(
            f"DV-COMPOSE-003 {display_path}:$.services: services must be a mapping"
        )
        return sorted(diagnostics)
    for service_name, service in services.items():
        location = f"{display_path}:$.services.{service_name}"
        service_mapping = _mapping(service)
        if service_mapping is None:
            diagnostics.append(f"DV-COMPOSE-004 {location}: service must be a mapping")
            continue
        if "image" not in service_mapping:
            continue
        image = service_mapping["image"]
        if type(image) is not str:
            diagnostics.append(
                f"DV-COMPOSE-005 {location}.image: image must be a string"
            )
            continue
        diagnostics.extend(
            validate_image_reference(image, f"{location}.image", "Compose image")
        )
    return sorted(diagnostics)
