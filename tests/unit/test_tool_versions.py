"""Unit tests for typed CI bootstrap-tool version validation."""

import urllib.error
from pathlib import Path
from typing import Self
from unittest.mock import patch

import pytest

from ci import _registry_common
from ci._tool_versions import (
    check_tool_versions,
    get_latest_github_release,
    get_latest_node_release,
)

ARTIFACT = (
    "  artifacts:\n"
    "    - asset: tool\n"
    "      os: any\n"
    "      architecture: any\n"
    "      sha256: "
    "bf59272455172108072a0a106379f7509fd4349bdcfd85203bac038ccd286d83\n"
)


class Response:
    def __init__(self, payload: bytes) -> None:
        self.payload = payload

    def __enter__(self) -> Self:
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def read(self) -> bytes:
        return self.payload


@pytest.fixture(autouse=True)
def reset_query_results() -> None:
    _registry_common.QUERY_RESULTS.update(successes=0, failures=0)


def test_github_latest_parses_tag() -> None:
    with patch(
        "urllib.request.urlopen", return_value=Response(b'{"tag_name":"v2.3.4"}')
    ):
        assert get_latest_github_release("owner/repo") == "2.3.4"
    assert _registry_common.QUERY_RESULTS["successes"] == 1


@pytest.mark.parametrize("payload", [b"[]", b'{"tag_name":""}', b"bad"])
def test_github_latest_rejects_invalid_results(payload: bytes) -> None:
    with patch("urllib.request.urlopen", return_value=Response(payload)):
        assert get_latest_github_release("owner/repo") is None
    assert _registry_common.QUERY_RESULTS["failures"] == 1


def test_github_latest_handles_network_failure() -> None:
    with patch("urllib.request.urlopen", side_effect=urllib.error.URLError("down")):
        assert get_latest_github_release("owner/repo") is None


def test_node_latest_selects_requested_major() -> None:
    payload = b'[{"version":"v24.2.0"},{"version":"v24.10.0"},{"version":"v22.1.0"}]'
    with patch("urllib.request.urlopen", return_value=Response(payload)):
        assert get_latest_node_release(24) == "24.10.0"


def test_node_latest_handles_network_failure() -> None:
    with patch("urllib.request.urlopen", side_effect=urllib.error.URLError("down")):
        assert get_latest_node_release(24) is None


@pytest.mark.parametrize("payload", [b"{}", b"[]", b"bad"])
def test_node_latest_rejects_invalid_results(payload: bytes) -> None:
    with patch("urllib.request.urlopen", return_value=Response(payload)):
        assert get_latest_node_release(24) is None


def test_invalid_catalog_rejects_before_live_query(tmp_path: Path) -> None:
    catalog = tmp_path / "dependency-pins.yaml"
    catalog.write_text("schema_version: 2\n")

    with (
        patch("ci._tool_versions._catalog_path", return_value=catalog),
        patch("ci._tool_versions._latest_tool_release") as latest,
    ):
        assert check_tool_versions()

    latest.assert_not_called()


def test_github_pin_detects_newer_release(tmp_path: Path) -> None:
    catalog = tmp_path / "dependency-pins.yaml"
    catalog.write_text(
        "schema_version: 1\n"
        "gitleaks:\n"
        "  version: '8.21.2'\n"
        "  source: gitleaks/gitleaks\n"
        "  source_kind: github_release\n" + ARTIFACT
    )

    with (
        patch("ci._tool_versions._catalog_path", return_value=catalog),
        patch(
            "ci._tool_versions.get_latest_github_release", return_value="8.22.0"
        ) as latest,
    ):
        assert check_tool_versions()

    latest.assert_called_once_with("gitleaks/gitleaks")


def test_node_pin_queries_its_major_stream(tmp_path: Path) -> None:
    catalog = tmp_path / "dependency-pins.yaml"
    catalog.write_text(
        "schema_version: 1\n"
        "node:\n"
        "  version: '24.19.0'\n"
        "  source: https://nodejs.org/dist\n"
        "  source_kind: node_release\n" + ARTIFACT
    )

    with (
        patch("ci._tool_versions._catalog_path", return_value=catalog),
        patch(
            "ci._tool_versions.get_latest_node_release", return_value="24.19.0"
        ) as latest,
    ):
        assert not check_tool_versions()

    latest.assert_called_once_with(24)


def test_freshness_warns_for_unknown_and_rejects_invalid_latest(
    tmp_path: Path, capsys
) -> None:
    catalog = tmp_path / "dependency-pins.yaml"
    catalog.write_text(
        "schema_version: 1\n"
        "one:\n  version: '1.0.0'\n  source: owner/one\n"
        "  source_kind: github_release\n"
        + ARTIFACT
        + "two:\n  version: '1.0.0'\n  source: owner/two\n"
        "  source_kind: github_release\n" + ARTIFACT
    )
    with (
        patch("ci._tool_versions._catalog_path", return_value=catalog),
        patch("ci._tool_versions._latest_tool_release", side_effect=[None, "bad"]),
    ):
        assert check_tool_versions()
    output = capsys.readouterr().out
    assert "Could not query" in output
    assert "Invalid latest release" in output
