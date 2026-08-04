"""Validation for CI bootstrap-tool release pins."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from collections.abc import Mapping
from typing import Any

import yaml
from packaging.version import InvalidVersion, Version

from ci import _registry_common
from ci.paths import find_project_root


def get_latest_github_release(repository: str) -> str | None:
    """Return the newest stable GitHub release tag without its optional v prefix."""
    url = f"https://api.github.com/repos/{repository}/releases/latest"
    try:
        with urllib.request.urlopen(url, timeout=15) as response:
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
    """Return the newest Node release in the pinned major stream."""
    try:
        with urllib.request.urlopen(
            "https://nodejs.org/dist/index.json", timeout=15
        ) as response:
            releases = json.loads(response.read())
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        _registry_common.QUERY_RESULTS["failures"] += 1
        return None
    if not isinstance(releases, list):
        _registry_common.QUERY_RESULTS["failures"] += 1
        return None
    versions = [
        entry["version"].removeprefix("v")
        for entry in releases
        if isinstance(entry, dict)
        and isinstance(entry.get("version"), str)
        and entry["version"].startswith(f"v{major}.")
    ]
    if not versions:
        _registry_common.QUERY_RESULTS["failures"] += 1
        return None
    _registry_common.QUERY_RESULTS["successes"] += 1
    return str(max(Version(version) for version in versions))


def _latest_tool_release(entry: Mapping[str, Any], version: Version) -> str | None:
    kind = entry.get("source_kind")
    if kind == "node_release":
        return get_latest_node_release(version.major)
    if kind != "github_release":
        return None
    source = entry.get("source")
    if not isinstance(source, str) or source.count("/") != 1:
        return None
    return get_latest_github_release(source)


def _catalog_tool_version(name: str, entry: Mapping[str, Any]) -> Version | None:
    version = entry.get("version")
    if not isinstance(version, str) or not version:
        print(f"ERROR: Tool catalog entry {name} has no version")
        return None
    try:
        return Version(version)
    except InvalidVersion:
        print(f"ERROR: Tool catalog entry {name} has an invalid version: {version}")
        return None


def _check_rust_channel(name: str, entry: Mapping[str, Any]) -> bool:
    channel = entry.get("channel")
    if channel in {"stable", "beta", "nightly"}:
        return False
    print(f"ERROR: Tool catalog entry {name} has an invalid Rust channel")
    return True


def _tool_source_kind(name: str, entry: Mapping[str, Any]) -> str | None:
    kind = entry.get("source_kind")
    if kind not in {"github_release", "node_release"}:
        print(f"ERROR: Unsupported source kind for {name}: {kind}")
        return None
    if kind == "github_release":
        source = entry.get("source")
        if not isinstance(source, str) or source.count("/") != 1:
            print(f"ERROR: Tool catalog entry {name} has an invalid GitHub source")
            return None
    return kind


def _valid_minimum_version(
    name: str, entry: Mapping[str, Any], version: Version
) -> bool:
    minimum = entry.get("minimum_version")
    try:
        minimum_version = Version(minimum) if isinstance(minimum, str) else None
    except InvalidVersion:
        print(f"ERROR: Tool {name} has an invalid minimum version: {minimum}")
        return False
    if minimum_version and version < minimum_version:
        print(f"ERROR: Tool {name} requires >= {minimum} for configured features")
        return False
    return True


def _check_tool_entry(name: str, entry: object) -> bool:
    if not isinstance(entry, dict):
        print(f"ERROR: Tool catalog entry {name} must be a mapping")
        return True
    if entry.get("source_kind") == "rust_channel":
        return _check_rust_channel(name, entry)
    if _tool_source_kind(name, entry) is None:
        return True
    parsed_version = _catalog_tool_version(name, entry)
    if parsed_version is None or not _valid_minimum_version(
        name, entry, parsed_version
    ):
        return True
    latest = _latest_tool_release(entry, parsed_version)
    if latest is None:
        print(f"WARNING: Could not query release source for {name}")
        return False
    errors = parsed_version < Version(latest)
    if errors:
        print(f"OUTDATED TOOL: {name} {parsed_version} -> {latest}")
    return errors


def check_tool_versions() -> bool:
    """Validate tracked bootstrap-tool pins against their declared sources."""
    catalog = find_project_root() / "res" / "dependency-pins.yaml"
    if not catalog.is_file():
        print(f"ERROR: Tool version catalog not found: {catalog}")
        return True
    try:
        raw = yaml.safe_load(catalog.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as error:
        print(f"ERROR: Could not read tool version catalog: {error}")
        return True
    if not isinstance(raw, dict):
        print("ERROR: Tool version catalog must be a mapping")
        return True
    if raw.get("schema_version") != 1:
        print("ERROR: Unsupported tool version catalog schema")
        return True
    return any(
        _check_tool_entry(name, entry)
        for name, entry in raw.items()
        if name != "schema_version"
    )
