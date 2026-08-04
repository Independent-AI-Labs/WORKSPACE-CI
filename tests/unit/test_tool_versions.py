"""Unit tests for CI bootstrap-tool version validation."""

from pathlib import Path
from unittest.mock import MagicMock, patch

from ci._tool_versions import (
    _check_tool_entry,
    check_tool_versions,
    get_latest_github_release,
    get_latest_node_release,
)


@patch("ci._tool_versions.get_latest_github_release")
@patch("ci._tool_versions.find_project_root")
def test_catalog_rejects_stale_github_release(
    mock_root, mock_latest, tmp_path: Path
) -> None:
    catalog = tmp_path / "res"
    catalog.mkdir()
    (catalog / "dependency-pins.yaml").write_text(
        "schema_version: 1\n"
        "gitleaks:\n"
        "  version: '8.21.2'\n"
        "  source: gitleaks/gitleaks\n"
        "  source_kind: github_release\n"
    )
    mock_root.return_value = tmp_path
    mock_latest.return_value = "8.22.0"

    assert check_tool_versions()


@patch("ci._tool_versions.urllib.request.urlopen")
def test_latest_github_release_removes_v_prefix(mock_urlopen) -> None:
    response = MagicMock()
    response.read.return_value = b'{"tag_name":"v8.30.1"}'
    response.__enter__ = lambda value: value
    response.__exit__ = MagicMock(return_value=False)
    mock_urlopen.return_value = response

    assert get_latest_github_release("gitleaks/gitleaks") == "8.30.1"


@patch("ci._tool_versions.urllib.request.urlopen")
def test_latest_node_release_stays_in_selected_major(mock_urlopen) -> None:
    response = MagicMock()
    response.read.return_value = (
        b'[{"version":"v25.1.0"},{"version":"v24.19.0"},{"version":"v24.18.1"}]'
    )
    response.__enter__ = lambda value: value
    response.__exit__ = MagicMock(return_value=False)
    mock_urlopen.return_value = response

    assert get_latest_node_release(24) == "24.19.0"


@patch("ci._tool_versions.urllib.request.urlopen")
def test_latest_node_release_rejects_non_list_payload(mock_urlopen) -> None:
    response = MagicMock()
    response.read.return_value = b"{}"
    response.__enter__ = lambda value: value
    response.__exit__ = MagicMock(return_value=False)
    mock_urlopen.return_value = response

    assert get_latest_node_release(24) is None


def test_catalog_rejects_unknown_source_kind() -> None:
    assert _check_tool_entry(
        "example", {"version": "1.0.0", "source_kind": "untrusted_registry"}
    )


def test_catalog_enforces_feature_floor_without_release_query() -> None:
    assert _check_tool_entry(
        "gitleaks",
        {
            "version": "8.21.2",
            "minimum_version": "8.22.0",
            "source": "gitleaks/gitleaks",
            "source_kind": "github_release",
        },
    )
