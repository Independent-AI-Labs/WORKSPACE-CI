"""Live freshness validation for typed CI bootstrap-tool pins."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from pathlib import Path

from packaging.version import InvalidVersion, Version

from ci import _registry_common, tool_catalog
from ci.paths import find_project_root


def get_latest_github_release(repository: str) -> str | None:
    """Return the latest GitHub release tag without an optional v prefix."""
    try:
        with urllib.request.urlopen(
            f"https://api.github.com/repos/{repository}/releases/latest", timeout=15
        ) as response:
            payload = json.loads(response.read())
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        _registry_common.QUERY_RESULTS["failures"] += 1
        return None
    tag = payload.get("tag_name") if isinstance(payload, dict) else None
    if not isinstance(tag, str) or not tag:
        _registry_common.QUERY_RESULTS["failures"] += 1
        return None
    _registry_common.QUERY_RESULTS["successes"] += 1
    return tag.removeprefix("v")


def get_latest_node_release(major: int) -> str | None:
    """Return the latest Node release in the supplied major stream."""
    try:
        with urllib.request.urlopen(
            "https://nodejs.org/dist/index.json", timeout=15
        ) as response:
            payload = json.loads(response.read())
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        _registry_common.QUERY_RESULTS["failures"] += 1
        return None
    if not isinstance(payload, list):
        _registry_common.QUERY_RESULTS["failures"] += 1
        return None
    versions = [
        entry["version"].removeprefix("v")
        for entry in payload
        if isinstance(entry, dict)
        and isinstance(entry.get("version"), str)
        and entry["version"].startswith(f"v{major}.")
    ]
    if not versions:
        _registry_common.QUERY_RESULTS["failures"] += 1
        return None
    _registry_common.QUERY_RESULTS["successes"] += 1
    return str(max(Version(version) for version in versions))


def _latest_tool_release(pin: tool_catalog.ToolPin) -> str | None:
    if pin.source_kind == "node_release":
        return get_latest_node_release(pin.version.major)
    if pin.source_kind in {"rust_toolchain", "rustup_release"}:
        return None
    return get_latest_github_release(pin.source)


def _catalog_path() -> Path:
    return find_project_root() / "res" / "dependency-pins.yaml"


def check_tool_versions() -> bool:
    """Return whether a typed bootstrap-tool catalog has freshness errors."""
    try:
        catalog = tool_catalog.load_catalog(_catalog_path())
    except (OSError, tool_catalog.CatalogError) as error:
        print(f"ERROR: Invalid tool version catalog: {error}")
        return True

    errors = False
    for pin in catalog.tools:
        latest = _latest_tool_release(pin)
        if latest is None:
            print(f"WARNING: Could not query release source for {pin.name}")
            continue
        try:
            outdated = pin.version < Version(latest)
        except InvalidVersion:
            print(f"ERROR: Invalid latest release for {pin.name}: {latest}")
            errors = True
            continue
        if outdated:
            print(f"OUTDATED TOOL: {pin.name} {pin.version} -> {latest}")
            errors = True
    return errors
