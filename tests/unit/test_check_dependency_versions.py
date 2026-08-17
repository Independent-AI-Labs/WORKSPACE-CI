"""Tests for the dependency-validation dispatcher envelope."""

import runpy
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

from ci.check_dependency_versions import _mode, _normalize_transition_arguments

USAGE_ERROR = 2


def test_module_entrypoint_dispatches_validate(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        sys,
        "argv",
        ["check_dependency_versions", "validate", "--consumer-root", "/tmp"],
    )
    monkeypatch.delitem(sys.modules, "ci.check_dependency_versions")
    with (
        patch("ci.dependency_policy.main", return_value=7) as validate,
        pytest.raises(SystemExit, match="7"),
    ):
        runpy.run_module("ci.check_dependency_versions", run_name="__main__")
    validate.assert_called_once_with(["--consumer-root", "/tmp"])


def test_validate_mode_is_accepted_without_importing_its_implementation() -> None:
    assert _mode(["validate", "--catalog", "catalog.yaml"]) == "validate"


def test_predecessor_hook_invocation_maps_to_offline_validation() -> None:
    arguments = _normalize_transition_arguments(
        ["--deterministic-only", "--catalog", "res/dependency-pins.yaml"]
    )
    assert arguments[:5] == [
        "validate",
        "--consumer-root",
        str(Path.cwd()),
        "--exclusions",
        "config/dependency_excludes.yaml",
    ]
    assert arguments[-3:] == [
        "--compose",
        "web/compose.prod.yaml",
        "pyproject.toml",
    ]


def test_rejects_missing_or_unknown_mode(capsys) -> None:
    assert _mode([]) is None
    assert "usage:" in capsys.readouterr().err


@pytest.mark.parametrize(
    "arguments",
    [
        ["--upgrade"],
        ["validate", "--upgrade"],
        ["validate", "--upgrade=true"],
        ["validate", "--unknown"],
        ["validate", "--network"],
        ["validate", "--freshness"],
        ["validate", "--fix"],
    ],
)
def test_rejects_mutation_network_unknown_and_ambiguous_requests(
    arguments: list[str], capsys
) -> None:
    assert _mode(arguments) is None
    assert "usage:" in capsys.readouterr().err


@pytest.mark.parametrize("mode", ["freshness", "upgrade"])
def test_unavailable_modes_are_not_public(capsys, mode: str) -> None:
    assert _mode([mode]) is None
    assert "usage: check_dependency_versions.py validate ..." in capsys.readouterr().err
