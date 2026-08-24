"""Unit tests for the deterministic bootstrap-tool catalog parser."""

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from ci.tool_catalog import (
    CatalogError,
    VersionedToolPin,
    canonical_catalog_json,
    load_catalog,
    lookup_tool,
    validate_catalog,
)

ARTIFACT = (
    "  artifacts:\n"
    "    - asset: uv-x86_64-unknown-linux-gnu.tar.gz\n"
    "      os: linux\n"
    "      architecture: x86_64\n"
    "      sha256: "
    "bf59272455172108072a0a106379f7509fd4349bdcfd85203bac038ccd286d83\n"
    "      archive:\n"
    "        format: tar.gz\n"
    "        member: uv-x86_64-unknown-linux-gnu/uv\n"
)


def test_load_catalog_returns_typed_tool_pin(tmp_path: Path) -> None:
    catalog = tmp_path / "dependency-pins.yaml"
    catalog.write_text(
        "schema_version: 1\n"
        "uv:\n"
        "  version: '0.12.3'\n"
        "  source: astral-sh/uv\n"
        "  source_kind: github_release\n" + ARTIFACT
    )

    loaded = load_catalog(catalog)

    assert loaded.path == catalog.resolve()
    assert loaded.tools[0].name == "uv"
    assert str(loaded.tools[0].version) == "0.12.3"
    assert loaded.tools[0].artifacts[0].archive is not None
    with pytest.raises(ValidationError):
        loaded.tools[0].name = "other"


def test_canonical_catalog_json_is_versioned_and_stably_ordered(tmp_path: Path) -> None:
    catalog = tmp_path / "dependency-pins.yaml"
    catalog.write_text(
        "schema_version: 1\n"
        "zebra:\n"
        "  version: '1.0'\n"
        "  source: owner/zebra\n"
        "  source_kind: github_release\n"
        "  artifacts:\n"
        "    - asset: zebra-macos\n"
        "      os: macos\n"
        "      architecture: aarch64\n"
        "      sha256: "
        "bf59272455172108072a0a106379f7509fd4349bdcfd85203bac038ccd286d83\n"
        "alpha:\n"
        "  version: '2.0'\n"
        "  source: owner/alpha\n"
        "  source_kind: github_release\n" + ARTIFACT
    )

    serialized = canonical_catalog_json(catalog)

    decoded = json.loads(serialized)
    assert serialized == json.dumps(
        decoded, ensure_ascii=True, separators=(",", ":"), sort_keys=True
    )
    assert decoded["schema_version"] == 1
    assert [tool["name"] for tool in decoded["tools"]] == ["alpha", "zebra"]
    assert decoded["tools"][0]["artifacts"][0]["archive"] == {
        "format": "tar.gz",
        "member": "uv-x86_64-unknown-linux-gnu/uv",
    }


def test_lookup_tool_is_typed_and_rejects_invalid_catalogs(tmp_path: Path) -> None:
    catalog = tmp_path / "dependency-pins.yaml"
    catalog.write_text(
        "schema_version: 1\nuv_tool:\n  version: '0.12.3'\n"
        "  source: astral-sh/uv\n  source_kind: github_release\n" + ARTIFACT
    )

    pin = lookup_tool(catalog, "uv-tool")

    assert isinstance(pin, VersionedToolPin)
    assert lookup_tool(catalog, "missing") is None
    catalog.write_text("schema_version: 2\n")
    with pytest.raises(CatalogError):
        lookup_tool(catalog, "uv-tool")
    with pytest.raises(CatalogError):
        canonical_catalog_json(catalog)


def test_validate_catalog_reports_invalid_schema(tmp_path: Path) -> None:
    catalog = tmp_path / "dependency-pins.yaml"
    catalog.write_text("schema_version: 2\n")

    assert validate_catalog(catalog) == [
        "DV-CAT-003 $.schema_version: expected integer 1",
        "DV-CAT-008 $: at least one tool is required",
    ]


def test_validate_catalog_rejects_boolean_schema_version(tmp_path: Path) -> None:
    catalog = tmp_path / "dependency-pins.yaml"
    catalog.write_text(
        "schema_version: true\nuv:\n  version: '0.12.2'\n"
        "  source: astral-sh/uv\n  source_kind: github_release\n" + ARTIFACT
    )

    assert validate_catalog(catalog) == [
        "DV-CAT-003 $.schema_version: expected integer 1"
    ]


def test_load_catalog_rejects_invalid_minimum_version(tmp_path: Path) -> None:
    catalog = tmp_path / "dependency-pins.yaml"
    catalog.write_text(
        "schema_version: 1\n"
        "ruff:\n"
        "  version: '0.16.1'\n"
        "  minimum_version: '0.16.2'\n"
        "  source: astral-sh/ruff\n"
        "  source_kind: github_release\n" + ARTIFACT
    )

    with pytest.raises(CatalogError, match="version must be >= minimum_version"):
        load_catalog(catalog)


def test_catalog_reports_duplicate_keys_and_unknown_fields(tmp_path: Path) -> None:
    catalog = tmp_path / "dependency-pins.yaml"
    catalog.write_text(
        "schema_version: 1\nuv:\n  source_kind: github_release\n"
        "  source: astral-sh/uv\n  version: '0.1'\n  version: '0.2'\n"
        "  extra: no\n" + ARTIFACT
    )

    diagnostics = validate_catalog(catalog)

    assert any("duplicate key" in diagnostic for diagnostic in diagnostics)
    assert any("unknown field" in diagnostic for diagnostic in diagnostics)


def test_catalog_reports_mixed_key_types_without_a_traceback(tmp_path: Path) -> None:
    catalog = tmp_path / "dependency-pins.yaml"
    catalog.write_text(
        "schema_version: 1\nuv:\n  source_kind: github_release\n"
        "  source: astral-sh/uv\n  version: '0.1'\n  1: invalid\n" + ARTIFACT
    )

    diagnostics = validate_catalog(catalog)

    assert "DV-CAT-002 $.uv.1: unknown field" in diagnostics


def test_load_catalog_preserves_artifact_metadata(tmp_path: Path) -> None:
    catalog = tmp_path / "dependency-pins.yaml"
    digest = "bf59272455172108072a0a106379f7509fd4349bdcfd85203bac038ccd286d83"
    catalog.write_text(
        "schema_version: 1\ncloc:\n  version: '2.10'\n"
        "  source: AlDanial/cloc\n  source_kind: github_release\n"
        "  artifacts:\n"
        "    - asset: cloc-2.10.pl\n"
        "      os: any\n"
        "      architecture: any\n"
        f"      sha256: '{digest}'\n"
    )

    pin = load_catalog(catalog).tools[0]

    assert isinstance(pin, VersionedToolPin)
    assert pin.artifacts[0].asset == "cloc-2.10.pl"
    assert pin.artifacts[0].sha256 == digest


def test_catalog_rejects_invalid_artifact_sha256(tmp_path: Path) -> None:
    catalog = tmp_path / "dependency-pins.yaml"
    catalog.write_text(
        "schema_version: 1\ncloc:\n  version: '2.10'\n"
        "  source: AlDanial/cloc\n  source_kind: github_release\n"
        "  artifacts:\n    - asset: cloc.pl\n      os: any\n"
        "      architecture: any\n      sha256: invalid\n"
    )

    assert any("DV-CAT-012" in error for error in validate_catalog(catalog))


def test_catalog_rejects_legacy_tools_wrapper(tmp_path: Path) -> None:
    catalog = tmp_path / "dependency-pins.yaml"
    catalog.write_text(
        "schema_version: 1\ntools:\n  uv:\n    version: '0.12.2'\n"
        "    source: astral-sh/uv\n    source_kind: github_release\n"
        "    artifacts: []\n"
    )

    assert validate_catalog(catalog) == [
        "DV-CAT-002 $.tools: unknown field",
        "DV-CAT-008 $: at least one tool is required",
    ]


def test_catalog_requires_artifacts_for_each_versioned_tool(tmp_path: Path) -> None:
    catalog = tmp_path / "dependency-pins.yaml"
    catalog.write_text(
        "schema_version: 1\nuv:\n  version: '0.12.2'\n"
        "  source: astral-sh/uv\n  source_kind: github_release\n"
    )

    assert validate_catalog(catalog) == [
        "DV-CAT-008 $.uv.artifacts: required field is missing",
        "DV-CAT-013 $.uv.artifacts: at least one artifact is required",
    ]


def test_catalog_rejects_duplicate_platform_tuple(tmp_path: Path) -> None:
    catalog = tmp_path / "dependency-pins.yaml"
    catalog.write_text(
        "schema_version: 1\nuv:\n  version: '0.12.2'\n"
        "  source: astral-sh/uv\n  source_kind: github_release\n"
        + ARTIFACT
        + "    - asset: uv-alt.tar.gz\n"
        "      os: linux\n"
        "      architecture: x86_64\n"
        "      sha256: "
        "bf59272455172108072a0a106379f7509fd4349bdcfd85203bac038ccd286d83\n"
        "      archive:\n        format: tar.gz\n        member: uv-alt/uv\n"
    )

    expected = "DV-CAT-019 $.uv.artifacts[1]: duplicate OS/architecture tuple"
    assert expected in validate_catalog(catalog)


def test_catalog_requires_archive_member_identity(tmp_path: Path) -> None:
    catalog = tmp_path / "dependency-pins.yaml"
    catalog.write_text(
        "schema_version: 1\nuv:\n  version: '0.12.2'\n"
        "  source: astral-sh/uv\n  source_kind: github_release\n"
        "  artifacts:\n    - asset: uv.tar.gz\n      os: linux\n"
        "      architecture: x86_64\n      sha256: "
        "bf59272455172108072a0a106379f7509fd4349bdcfd85203bac038ccd286d83\n"
    )

    assert validate_catalog(catalog) == [
        "DV-CAT-021 $.uv.artifacts[0].archive: archive assets require format and member"
    ]


def test_catalog_rejects_dynamic_rust_channel(tmp_path: Path) -> None:
    catalog = tmp_path / "dependency-pins.yaml"
    catalog.write_text(
        "schema_version: 1\nrust:\n  channel: stable\n"
        "  source: rust-lang/rust\n  source_kind: rust_channel\n"
    )

    assert validate_catalog(catalog) == [
        "DV-CAT-020 $.rust: rust_channel is unsupported because channels are dynamic"
    ]


def test_shipped_catalog_is_fully_reviewed() -> None:
    catalog = Path(__file__).parents[2] / "res" / "dependency-pins.yaml"

    diagnostics = validate_catalog(catalog)

    assert diagnostics == []


def test_catalog_accepts_fixed_rust_toolchain(tmp_path: Path) -> None:
    catalog = tmp_path / "dependency-pins.yaml"
    catalog.write_text(
        "schema_version: 1\nrust:\n  channel: '1.89.0'\n"
        "  version: '1.89.0'\n"
        "  source: https://static.rust-lang.org/dist\n"
        "  source_kind: rust_toolchain\n"
        "  artifacts:\n    - asset: channel-rust-1.89.0.toml\n"
        "      os: any\n      architecture: any\n"
        "      sha256: "
        "fbd1662e100e7b305908ece23b441cb7534eadfa6336c5f173ff08d1cec174a1\n"
    )

    assert validate_catalog(catalog) == []


DIGEST = "bf59272455172108072a0a106379f7509fd4349bdcfd85203bac038ccd286d83"


def _tool_block(overrides: str, artifacts: str) -> str:
    return (
        "schema_version: 1\nuv:\n  source: astral-sh/uv\n"
        "  source_kind: github_release\n" + overrides + artifacts
    )


def test_catalog_rejects_non_string_version(tmp_path: Path) -> None:
    catalog = tmp_path / "dependency-pins.yaml"
    catalog.write_text(_tool_block("  version: 12\n", ARTIFACT))

    assert any(
        "DV-CAT-006 $.uv.version: expected a nonempty string version"
        in diagnostic
        for diagnostic in validate_catalog(catalog)
    )


def test_catalog_rejects_invalid_version_string(tmp_path: Path) -> None:
    catalog = tmp_path / "dependency-pins.yaml"
    catalog.write_text(_tool_block("  version: 'not-a-version'\n", ARTIFACT))

    assert any(
        "DV-CAT-007 $.uv.version: invalid version" in diagnostic
        for diagnostic in validate_catalog(catalog)
    )


def test_catalog_rejects_unknown_source_kind(tmp_path: Path) -> None:
    catalog = tmp_path / "dependency-pins.yaml"
    catalog.write_text(_tool_block("  version: '0.12.2'\n", ARTIFACT).replace(
        "source_kind: github_release", "source_kind: mystery"
    ))

    assert any(
        "DV-CAT-005 $.uv.source_kind: unsupported source kind 'mystery'"
        in diagnostic
        for diagnostic in validate_catalog(catalog)
    )


def test_catalog_rejects_source_without_owner_repo(tmp_path: Path) -> None:
    catalog = tmp_path / "dependency-pins.yaml"
    catalog.write_text(_tool_block("  version: '0.12.2'\n", ARTIFACT).replace(
        "  source: astral-sh/uv\n", "  source: no-slash\n"
    ))

    assert any(
        "DV-CAT-009 $.uv.source: expected owner/repository" in diagnostic
        for diagnostic in validate_catalog(catalog)
    )


def test_catalog_rejects_non_string_archive_member(tmp_path: Path) -> None:
    catalog = tmp_path / "dependency-pins.yaml"
    catalog.write_text(_tool_block("  version: '0.12.2'\n", ARTIFACT).replace(
        "        format: tar.gz\n        member: uv-x86_64-unknown-linux-gnu/uv\n",
        "        format: tar.gz\n        member: [not, a, string]\n",
    ))

    assert any(
        "DV-CAT-006 $.uv.artifacts[0].archive.member: expected a nonempty string"
        in diagnostic
        for diagnostic in validate_catalog(catalog)
    )


def test_catalog_rejects_non_mapping_archive(tmp_path: Path) -> None:
    catalog = tmp_path / "dependency-pins.yaml"
    catalog.write_text(_tool_block("  version: '0.12.2'\n", ARTIFACT).replace(
        "      archive:\n        format: tar.gz\n"
        "        member: uv-x86_64-unknown-linux-gnu/uv\n",
        "      archive: not-a-mapping\n",
    ))

    assert any(
        "DV-CAT-017 $.uv.artifacts[0].archive: archive must be a mapping"
        in diagnostic
        for diagnostic in validate_catalog(catalog)
    )


def test_catalog_rejects_unsupported_archive_format(tmp_path: Path) -> None:
    catalog = tmp_path / "dependency-pins.yaml"
    catalog.write_text(_tool_block("  version: '0.12.2'\n", ARTIFACT).replace(
        "        format: tar.gz\n", "        format: tar.bz2\n"
    ))

    assert any(
        "DV-CAT-018 $.uv.artifacts[0].archive.format: unsupported archive format"
        in diagnostic
        for diagnostic in validate_catalog(catalog)
    )


def test_catalog_rejects_unsupported_os(tmp_path: Path) -> None:
    catalog = tmp_path / "dependency-pins.yaml"
    catalog.write_text(_tool_block("  version: '0.12.2'\n", ARTIFACT).replace(
        "      os: linux\n", "      os: plan9\n"
    ))

    assert any(
        "DV-CAT-015 $.uv.artifacts[0].os: unsupported operating system"
        in diagnostic
        for diagnostic in validate_catalog(catalog)
    )


def test_catalog_rejects_unsupported_architecture(tmp_path: Path) -> None:
    catalog = tmp_path / "dependency-pins.yaml"
    catalog.write_text(_tool_block("  version: '0.12.2'\n", ARTIFACT).replace(
        "      architecture: x86_64\n", "      architecture: m68k\n"
    ))

    assert any(
        "DV-CAT-016 $.uv.artifacts[0].architecture: unsupported architecture"
        in diagnostic
        for diagnostic in validate_catalog(catalog)
    )


def test_catalog_rejects_archive_format_mismatch(tmp_path: Path) -> None:
    catalog = tmp_path / "dependency-pins.yaml"
    catalog.write_text(_tool_block("  version: '0.12.2'\n", ARTIFACT).replace(
        "        format: tar.gz\n", "        format: zip\n"
    ))

    assert any(
        "DV-CAT-022 $.uv.artifacts[0].archive.format: does not match asset extension"
        in diagnostic
        for diagnostic in validate_catalog(catalog)
    )
