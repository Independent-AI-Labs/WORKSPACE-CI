"""Tests for invariant 4 of ci.check_required_hooks_present: catalog
entries resolve in the shipping lib, and safety-marked catalog fields
are coherent."""

from __future__ import annotations

from pathlib import Path

import pytest

from ci.check_required_hooks_present import (
    HookEntry,
    HooksManifest,
    _run_invariant_4_entries,
)


def _manifest_of(hooks: list[dict[str, object]]) -> HooksManifest:
    return HooksManifest.model_validate({"version": 1, "hooks": hooks})


def test_invariant4_flags_shell_entry_without_definition(
    tmp_path: Path,
) -> None:
    """The 2026-08-24 portable_shell class: catalog entry survives, the
    implementing function does not."""
    (tmp_path / "lib").mkdir()
    (tmp_path / "lib" / "checks_core.sh").write_text(
        "#!/usr/bin/env bash\nci_check_present() { :; }\n"
    )
    manifest = _manifest_of(
        [
            {
                "id": "ghost-gate",
                "kind": "shell",
                "entry": (
                    "bash -c 'source lib/checks.sh && ci_check_ghost_function'"
                ),
                "stage": "pre-commit",
            },
            {
                "id": "baseline-safety",
                "kind": "shell",
                "entry": (
                    "bash -c 'source lib/checks.sh && ci_check_present'"
                ),
                "stage": "pre-commit",
                "mandatory": True,
                "safety": True,
            },
        ],
    )
    issues = _run_invariant_4_entries(manifest, quiet=True, package_root=tmp_path)
    assert issues == [
        "hook 'ghost-gate' entry references shell function"
        " 'ci_check_ghost_function' but no lib/*.sh module defines it"
    ]


def test_invariant4_accepts_defined_shell_entry(tmp_path: Path) -> None:
    (tmp_path / "lib").mkdir()
    (tmp_path / "lib" / "checks_files.sh").write_text(
        "#!/usr/bin/env bash\n"
        "# comment mentioning ci_check_ghost_function in prose only\n"
        "function ci_check_portable_shell() { :; }\n"
    )
    manifest = _manifest_of(
        [
            {
                "id": "portable",
                "kind": "shell",
                "entry": (
                    "bash -c 'source lib/checks.sh && ci_check_portable_shell'"
                ),
                "stage": "pre-commit",
            },
            {
                "id": "baseline-safety",
                "kind": "shell",
                "entry": (
                    "bash -c 'source lib/checks.sh && ci_check_portable_shell'"
                ),
                "stage": "pre-commit",
                "mandatory": True,
                "safety": True,
            },
        ],
    )
    assert _run_invariant_4_entries(manifest, quiet=True, package_root=tmp_path) == []


def test_invariant4_flags_missing_python_module(tmp_path: Path) -> None:
    (tmp_path / "lib").mkdir()
    (tmp_path / "ci").mkdir()
    (tmp_path / "ci" / "check_real_thing.py").write_text("def main() -> None\n")
    manifest = _manifest_of(
        [
            {
                "id": "ghostmod",
                "kind": "python_module",
                "entry": "ci.check_ghost_module",
                "stage": "pre-commit",
            },
            {
                "id": "baseline-safety",
                "kind": "python_module",
                "entry": "ci.check_real_thing",
                "stage": "pre-commit",
                "mandatory": True,
                "safety": True,
            },
        ],
    )
    issues = _run_invariant_4_entries(manifest, quiet=True, package_root=tmp_path)
    assert issues == [
        "hook 'ghostmod' entry references python module"
        " 'ci.check_ghost_module' but it does not exist"
    ]


def test_invariant4_accepts_existing_python_module(tmp_path: Path) -> None:
    (tmp_path / "lib").mkdir()
    (tmp_path / "ci").mkdir()
    (tmp_path / "ci" / "check_boot_venv_layout.py").write_text(
        "def main() -> None\n"
    )
    manifest = _manifest_of(
        [
            {
                "id": "bootlayout",
                "kind": "python_module",
                "entry": "ci.check_boot_venv_layout",
                "stage": "pre-commit",
            },
            {
                "id": "baseline-safety",
                "kind": "python_module",
                "entry": "ci.check_boot_venv_layout",
                "stage": "pre-commit",
                "mandatory": True,
                "safety": True,
            },
        ],
    )
    assert _run_invariant_4_entries(manifest, quiet=True, package_root=tmp_path) == []


def test_invariant4_skips_when_no_shipping_lib(tmp_path: Path) -> None:
    manifest = _manifest_of(
        [
            {
                "id": "ghost-gate",
                "kind": "shell",
                "entry": "bash -c 'ci_check_ghost_function'",
                "stage": "pre-commit",
            },
            {
                "id": "baseline-safety",
                "kind": "shell",
                "entry": "bash -c 'ci_check_ghost_function'",
                "stage": "pre-commit",
                "mandatory": True,
                "safety": True,
            },
        ],
    )
    assert _run_invariant_4_entries(manifest, quiet=True, package_root=tmp_path) == []


# ── unit: invariant 4: safety-marked catalog-field coherence ──────────────────


def test_invariant4_flags_safety_hook_that_is_not_mandatory(
    tmp_path: Path,
) -> None:
    (tmp_path / "lib").mkdir()
    (tmp_path / "lib" / "checks_core.sh").write_text(
        "#!/usr/bin/env bash\nci_check_present() { :; }\n"
    )
    manifest = _manifest_of(
        [
            {
                "id": "baseline-safety",
                "kind": "shell",
                "entry": "bash -c 'source lib/checks.sh && ci_check_present'",
                "stage": "pre-commit",
                "mandatory": False,
                "safety": True,
            },
        ],
    )
    issues = _run_invariant_4_entries(manifest, quiet=True, package_root=tmp_path)
    assert issues == [
        "hook 'baseline-safety' is safety-marked but not mandatory; safety"
        " hooks must be mandatory (they run even at poc tier)"
    ]


def test_invariant4_flags_wholesale_safety_marker_deletion(
    tmp_path: Path,
) -> None:
    """The 2026-08-24 incident class: every safety: true field deleted
    from required_hooks.yaml; the poc tier then emits no hooks at all."""
    (tmp_path / "lib").mkdir()
    (tmp_path / "lib" / "checks_core.sh").write_text(
        "#!/usr/bin/env bash\nci_check_present() { :; }\n"
    )
    manifest = _manifest_of(
        [
            {
                "id": "gitleaks",
                "kind": "shell",
                "entry": "bash -c 'source lib/checks.sh && ci_check_present'",
                "stage": "pre-commit",
                "mandatory": True,
            },
        ],
    )
    issues = _run_invariant_4_entries(manifest, quiet=True, package_root=tmp_path)
    assert issues == [
        "no hook in required_hooks.yaml carries safety: true; the"
        " poc tier filters to safety hooks only and would emit none"
        " (wholesale safety-marker deletion, 2026-08-24 incident)",
    ]


def test_safety_coherence_fires_without_shipping_lib(tmp_path: Path) -> None:
    """Consumer invocation without a lib: entry resolution is skipped,
    but catalog-data coherence still holds."""
    manifest = _manifest_of(
        [
            {
                "id": "gitleaks",
                "kind": "shell",
                "entry": "bash -c 'ci_scan_secrets'",
                "stage": "pre-commit",
                "mandatory": True,
            },
        ],
    )
    issues = _run_invariant_4_entries(manifest, quiet=True, package_root=tmp_path)
    assert any("safety: true" in i for i in issues)


def test_hook_entry_rejects_unknown_field() -> None:
    """extra='forbid': a misspelled or renamed catalog field is a
    load-time violation, not a hook that quietly loses a property."""
    with pytest.raises(Exception):
        HookEntry.model_validate(
            {
                "id": "x",
                "kind": "shell",
                "entry": "bash -c 'ci_x'",
                "stage": "pre-commit",
                "safty": True,
            },
        )
