"""Provisioning code must use the documented sealed guard paths."""

from __future__ import annotations

from pathlib import Path

LEGACY_TOKEN = "bash" + ".real"
SEALED_SHELL = "/usr/lib/workspace-guard/sealed/bash"


def test_provisioning_has_no_legacy_shell_path() -> None:
    root = Path(__file__).parents[3]
    candidates = [
        *sorted((root / "scripts").rglob("*")),
        *sorted((root / "templates").rglob("*")),
        root / "Makefile",
    ]
    hits = [
        str(path.relative_to(root))
        for path in candidates
        if path.is_file()
        and LEGACY_TOKEN
        in path.read_text(encoding="utf-8", errors="ignore")
    ]
    assert hits == []


def test_provisioning_uses_the_documented_sealed_shell() -> None:
    root = Path(__file__).parents[3]
    helper = (root / "scripts" / "enter-candidate-namespace.sh").read_text(
        encoding="utf-8"
    )
    spec = (root / "docs" / "specifications" / "SPEC-HITL-GUARD.md").read_text(
        encoding="utf-8"
    )
    assert SEALED_SHELL in helper
    assert SEALED_SHELL in spec