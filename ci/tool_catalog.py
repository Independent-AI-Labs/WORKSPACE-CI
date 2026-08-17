"""Closed, duplicate-aware parser for version-one tool catalogs."""

from __future__ import annotations

import json
from collections.abc import Mapping
from pathlib import Path
from typing import Any, Literal

import yaml
from packaging.version import InvalidVersion, Version
from pydantic import BaseModel, ConfigDict

SHA256_LENGTH = 64
CATALOG_SCHEMA_VERSION = 1
ARCHIVE_FORMATS = {".tar.gz": "tar.gz", ".tar.xz": "tar.xz", ".zip": "zip"}


class CatalogError(ValueError):
    """The catalog has no consumable typed representation."""


class _CatalogModel(BaseModel):
    """Strict immutable base for canonical catalog values."""

    model_config = ConfigDict(
        arbitrary_types_allowed=True, extra="forbid", frozen=True, strict=True
    )


class ArchiveIdentity(_CatalogModel):
    """The expected format and executable member of an archive asset."""

    format: Literal["tar.gz", "tar.xz", "zip"]
    member: str


class ToolArtifact(_CatalogModel):
    """A downloadable release asset for one supported platform tuple."""

    asset: str
    os: Literal["any", "linux", "macos", "windows"]
    architecture: Literal["any", "x86_64", "aarch64"]
    sha256: str
    archive: ArchiveIdentity | None


class VersionedToolPin(_CatalogModel):
    """Canonical declaration for a versioned release tool."""

    name: str
    source_kind: Literal[
        "github_release", "node_release", "rust_toolchain", "rustup_release"
    ]
    version: Version
    channel: str | None
    source: str
    minimum_version: Version | None
    artifacts: tuple[ToolArtifact, ...]


type ToolPin = VersionedToolPin
type SourceKind = Literal[
    "github_release", "node_release", "rust_toolchain", "rustup_release"
]


class ToolCatalog(_CatalogModel):
    """A complete canonical catalog and its source identity."""

    path: Path
    tools: tuple[ToolPin, ...]


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
                errors.append(f"DV-CAT-001 {key_location}: duplicate key")
            seen.add(key)
            errors.extend(_duplicates(value_node, key_location))
    elif isinstance(node, yaml.SequenceNode):
        for index, item in enumerate(node.value):
            errors.extend(_duplicates(item, f"{location}[{index}]"))
    return errors


def _version(value: object, location: str, errors: list[str]) -> Version | None:
    if not isinstance(value, str) or not value:
        errors.append(f"DV-CAT-006 {location}: expected a nonempty string version")
        return None
    try:
        return Version(value)
    except InvalidVersion:
        errors.append(f"DV-CAT-007 {location}: invalid version {value!r}")
        return None


def _source_kind(value: object) -> SourceKind | None:
    if value == "github_release":
        return "github_release"
    if value == "node_release":
        return "node_release"
    if value == "rust_toolchain":
        return "rust_toolchain"
    if value == "rustup_release":
        return "rustup_release"
    return None


def _tool_fields(kind: SourceKind) -> tuple[set[str], set[str]]:
    allowed = {
        "source_kind",
        "version",
        "source",
        "minimum_version",
        "artifacts",
        "channel",
    }
    required = {
        "source_kind",
        "version",
        "source",
        "artifacts",
    }
    if kind == "rust_toolchain":
        required.add("channel")
    return allowed, required


def _sha256(value: object, location: str, errors: list[str]) -> str | None:
    if (
        not isinstance(value, str)
        or len(value) != SHA256_LENGTH
        or any(character not in "0123456789abcdef" for character in value)
    ):
        errors.append(
            f"DV-CAT-012 {location}: expected a {SHA256_LENGTH}-character "
            "lowercase hexadecimal SHA-256"
        )
        return None
    return value


def _archive(value: object, location: str, errors: list[str]) -> ArchiveIdentity | None:
    if value is None:
        return None
    if not isinstance(value, Mapping):
        errors.append(f"DV-CAT-017 {location}: archive must be a mapping")
        return None
    allowed = {"format", "member"}
    errors.extend(
        f"DV-CAT-002 {location}.{key}: unknown field"
        for key in sorted(str(key) for key in set(value) - allowed)
    )
    errors.extend(
        f"DV-CAT-008 {location}.{key}: required field is missing"
        for key in sorted(allowed - set(value))
    )
    archive_format = value.get("format")
    member = value.get("member")
    if archive_format not in {"tar.gz", "tar.xz", "zip"}:
        errors.append(f"DV-CAT-018 {location}.format: unsupported archive format")
        return None
    if not isinstance(member, str) or not member:
        errors.append(f"DV-CAT-006 {location}.member: expected a nonempty string")
        return None
    return ArchiveIdentity(format=archive_format, member=member)


def _artifact(value: object, location: str, errors: list[str]) -> ToolArtifact | None:
    if not isinstance(value, Mapping):
        errors.append(f"DV-CAT-014 {location}: artifact must be a mapping")
        return None
    allowed = {"asset", "os", "architecture", "sha256", "archive"}
    required = {"asset", "os", "architecture", "sha256"}
    errors.extend(
        f"DV-CAT-002 {location}.{key}: unknown field"
        for key in sorted(str(key) for key in set(value) - allowed)
    )
    errors.extend(
        f"DV-CAT-008 {location}.{key}: required field is missing"
        for key in sorted(required - set(value))
    )
    asset = value.get("asset")
    if not isinstance(asset, str) or not asset:
        errors.append(f"DV-CAT-006 {location}.asset: expected a nonempty string")
        return None
    os_name = value.get("os")
    if os_name not in {"any", "linux", "macos", "windows"}:
        errors.append(f"DV-CAT-015 {location}.os: unsupported operating system")
        return None
    architecture = value.get("architecture")
    if architecture not in {"any", "x86_64", "aarch64"}:
        errors.append(f"DV-CAT-016 {location}.architecture: unsupported architecture")
        return None
    sha256 = _sha256(value.get("sha256"), f"{location}.sha256", errors)
    archive_raw = value.get("archive")
    archive = _archive(archive_raw, f"{location}.archive", errors)
    expected_format = next(
        (fmt for suffix, fmt in ARCHIVE_FORMATS.items() if asset.endswith(suffix)), None
    )
    if expected_format is not None and archive is None:
        errors.append(
            f"DV-CAT-021 {location}.archive: archive assets require format and member"
        )
    elif archive is not None and archive.format != expected_format:
        errors.append(
            f"DV-CAT-022 {location}.archive.format: does not match asset extension"
        )
    if (
        sha256 is None
        or (archive_raw is not None and archive is None)
        or (expected_format is not None and archive is None)
        or (archive is not None and archive.format != expected_format)
    ):
        return None
    return ToolArtifact(
        asset=asset,
        os=os_name,
        architecture=architecture,
        sha256=sha256,
        archive=archive,
    )


def _artifacts(
    value: object, location: str, errors: list[str]
) -> tuple[ToolArtifact, ...]:
    if not isinstance(value, list) or not value:
        errors.append(f"DV-CAT-013 {location}: at least one artifact is required")
        return ()
    artifacts: list[ToolArtifact] = []
    tuples: set[tuple[str, str]] = set()
    for index, item in enumerate(value):
        artifact = _artifact(item, f"{location}[{index}]", errors)
        if artifact is not None:
            platform = (artifact.os, artifact.architecture)
            if platform in tuples:
                errors.append(
                    f"DV-CAT-019 {location}[{index}]: duplicate OS/architecture tuple"
                )
            tuples.add(platform)
            artifacts.append(artifact)
    return tuple(artifacts)


def _validate_source(
    kind: str, source: object, location: str, errors: list[str]
) -> str | None:
    if not isinstance(source, str) or not source:
        errors.append(f"DV-CAT-006 {location}.source: expected a nonempty string")
        return None
    if kind == "github_release" and (
        source.count("/") != 1 or any(not part for part in source.split("/"))
    ):
        errors.append(f"DV-CAT-009 {location}.source: expected owner/repository")
        return None
    if kind == "node_release" and source != "https://nodejs.org/dist":
        errors.append(f"DV-CAT-009 {location}.source: unsupported release origin")
        return None
    if kind == "rust_toolchain" and source != "https://static.rust-lang.org/dist":
        errors.append(f"DV-CAT-009 {location}.source: unsupported release origin")
        return None
    if (
        kind == "rustup_release"
        and source != "https://static.rust-lang.org/rustup/archive"
    ):
        errors.append(f"DV-CAT-009 {location}.source: unsupported release origin")
        return None
    return source


def _versioned_tool(
    name: str,
    kind: SourceKind,
    value: Mapping[Any, Any],
    location: str,
    errors: list[str],
) -> ToolPin | None:
    version = _version(value.get("version"), f"{location}.version", errors)
    minimum_raw = value.get("minimum_version")
    minimum = (
        _version(minimum_raw, f"{location}.minimum_version", errors)
        if minimum_raw is not None
        else None
    )
    if version is not None and minimum is not None and version < minimum:
        errors.append(f"DV-CAT-011 {location}: version must be >= minimum_version")
    source = _validate_source(kind, value.get("source"), location, errors)
    artifacts = _artifacts(value.get("artifacts"), f"{location}.artifacts", errors)
    channel = value.get("channel")
    if kind == "rust_toolchain" and (not isinstance(channel, str) or not channel):
        errors.append(f"DV-CAT-006 {location}.channel: expected a nonempty string")
        channel = None
    if kind != "rust_toolchain" and "channel" in value:
        errors.append(f"DV-CAT-002 {location}.channel: unknown field")
    if (
        version is None
        or source is None
        or not artifacts
        or (kind == "rust_toolchain" and channel is None)
    ):
        return None
    return VersionedToolPin(
        name=name,
        source_kind=kind,
        version=version,
        channel=channel,
        source=source,
        minimum_version=minimum,
        artifacts=artifacts,
    )


def _tool(name: object, value: object, errors: list[str]) -> ToolPin | None:
    location = f"$.{name}"
    if not isinstance(name, str) or not name:
        errors.append(f"DV-CAT-003 {location}: tool name must be a nonempty string")
        return None
    if not isinstance(value, Mapping):
        errors.append(f"DV-CAT-004 {location}: tool must be a mapping")
        return None
    raw_kind = value.get("source_kind")
    if raw_kind == "rust_channel":
        errors.append(
            f"DV-CAT-020 {location}: rust_channel is unsupported because "
            "channels are dynamic"
        )
        return None
    kind = _source_kind(raw_kind)
    if kind is None:
        errors.append(
            f"DV-CAT-005 {location}.source_kind: unsupported source kind {raw_kind!r}"
        )
        return None
    fields = _tool_fields(kind)
    allowed, required = fields
    errors.extend(
        f"DV-CAT-002 {location}.{key}: unknown field"
        for key in sorted(str(key) for key in set(value) - allowed)
    )
    errors.extend(
        f"DV-CAT-008 {location}.{key}: required field is missing"
        for key in sorted(required - set(value))
    )
    return _versioned_tool(name, kind, value, location, errors)


def _read_catalog_text(text: str) -> tuple[yaml.Node | None, object | None, list[str]]:
    try:
        node = yaml.compose(text)
        raw = yaml.safe_load(text)
    except yaml.YAMLError as error:
        return None, None, [f"DV-CAT-000 $: cannot read catalog: {error}"]
    return node, raw, []


def _root_errors(raw: Mapping[Any, Any], errors: list[str]) -> Mapping[Any, Any] | None:
    if (
        raw.get("schema_version") != CATALOG_SCHEMA_VERSION
        or type(raw.get("schema_version")) is not int
    ):
        errors.append("DV-CAT-003 $.schema_version: expected integer 1")
    if "tools" in raw:
        errors.append("DV-CAT-002 $.tools: unknown field")
    return {
        key: value
        for key, value in raw.items()
        if key not in {"schema_version", "tools"}
    }


def _pins(tools_raw: Mapping[Any, Any], errors: list[str]) -> list[ToolPin]:
    pins: list[ToolPin] = []
    names: set[str] = set()
    for name, value in tools_raw.items():
        normalized = name.lower().replace("_", "-") if isinstance(name, str) else ""
        if normalized in names:
            errors.append(f"DV-CAT-001 $.{name}: duplicate normalized tool name")
        names.add(normalized)
        pin = _tool(name, value, errors)
        if pin is not None:
            pins.append(pin)
    if not tools_raw:
        errors.append("DV-CAT-008 $: at least one tool is required")
    return pins


def _parse_text(text: str, path: Path) -> tuple[ToolCatalog | None, list[str]]:
    node, raw, read_errors = _read_catalog_text(text)
    if read_errors:
        return None, read_errors
    errors = _duplicates(node) if node is not None else []
    if not isinstance(raw, Mapping):
        return None, sorted([*errors, "DV-CAT-003 $: catalog must be a mapping"])
    tools_raw = _root_errors(raw, errors)
    if tools_raw is None:
        return None, sorted(errors)
    pins = _pins(tools_raw, errors)
    if errors:
        return None, sorted(errors)
    return ToolCatalog(path=path.resolve(), tools=tuple(pins)), []


def _parse(path: Path) -> tuple[ToolCatalog | None, list[str]]:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as error:
        return None, [f"DV-CAT-000 $: cannot read catalog: {error}"]
    return _parse_text(text, path)


def load_catalog(path: Path) -> ToolCatalog:
    """Return a typed catalog or raise with every deterministic diagnostic."""
    catalog, errors = _parse(path)
    if errors:
        raise CatalogError("\n".join(errors))
    assert catalog is not None
    return catalog


def lookup_tool(path: Path, name: str) -> ToolPin | None:
    """Return the named validated tool pin, if present."""
    normalized_name = name.lower().replace("_", "-")
    return next(
        (
            tool
            for tool in load_catalog(path).tools
            if tool.name.lower().replace("_", "-") == normalized_name
        ),
        None,
    )


def canonical_catalog_json(path: Path) -> str:
    """Serialize a validated catalog as deterministic schema-versioned JSON."""
    tools = sorted(load_catalog(path).tools, key=lambda tool: tool.name)
    payload = {
        "schema_version": CATALOG_SCHEMA_VERSION,
        "tools": [
            {
                "name": tool.name,
                "source_kind": tool.source_kind,
                "version": str(tool.version),
                "channel": tool.channel,
                "source": tool.source,
                "minimum_version": (
                    str(tool.minimum_version)
                    if tool.minimum_version is not None
                    else None
                ),
                "artifacts": [
                    {
                        "asset": artifact.asset,
                        "os": artifact.os,
                        "architecture": artifact.architecture,
                        "sha256": artifact.sha256,
                        "archive": (
                            {
                                "format": artifact.archive.format,
                                "member": artifact.archive.member,
                            }
                            if artifact.archive is not None
                            else None
                        ),
                    }
                    for artifact in sorted(
                        tool.artifacts,
                        key=lambda artifact: (
                            artifact.os,
                            artifact.architecture,
                            artifact.asset,
                        ),
                    )
                ],
            }
            for tool in tools
        ],
    }
    return json.dumps(payload, ensure_ascii=True, separators=(",", ":"), sort_keys=True)


def validate_catalog(path: Path) -> list[str]:
    """Return complete stable diagnostics without contacting a registry."""
    _, errors = _parse(path)
    return errors


def validate_catalog_text(text: str, path: Path) -> list[str]:
    """Validate catalog text already read from a trusted descriptor."""
    _, errors = _parse_text(text, path)
    return errors
