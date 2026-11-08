"""Tests for invariant 4 of ci.check_required_hooks_present: catalog
entries resolve in the shipping lib, and safety-marked catalog fields
are coherent."""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from ci.check_required_hooks_present import (
    EXIT_INFRA_ERROR,
    EXIT_OK,
    EXIT_VIOLATION,
    HookEntry,
    HooksManifest,
    _run_invariant_4_entries,
    main,
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
                    "source lib/checks.sh && ci_check_ghost_function"
                ),
                "stage": "pre-commit",
            },
            {
                "id": "baseline-safety",
                "kind": "shell",
                "entry": (
                    "source lib/checks.sh && ci_check_present"
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
                    "source lib/checks.sh && ci_check_portable_shell"
                ),
                "stage": "pre-commit",
            },
            {
                "id": "baseline-safety",
                "kind": "shell",
                "entry": (
                    "source lib/checks.sh && ci_check_portable_shell"
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
        "hook 'ghostmod' entry references python-module"
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
                "entry": "ci_check_ghost_function",
                "stage": "pre-commit",
            },
            {
                "id": "baseline-safety",
                "kind": "shell",
                "entry": "ci_check_ghost_function",
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
                "entry": "source lib/checks.sh && ci_check_present",
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
                "entry": "source lib/checks.sh && ci_check_present",
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
                "entry": "ci_scan_secrets",
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
                "entry": "ci_x",
                "stage": "pre-commit",
                "safty": True,
            },
        )


def test_invariant4_accepts_renamed_shell_entry(tmp_path: Path) -> None:
    """A renamed registry entry resolves when the shipping lib defines the
    new name. The 2026-09-27 deadlock was a manifest/lib artifact
    mismatch, never a missing implementation."""
    (tmp_path / "lib").mkdir()
    (tmp_path / "lib" / "checks_core.sh").write_text(
        "#!/usr/bin/env bash\nci_check_resolution_shapes() { :; }\n"
    )
    manifest = _manifest_of(
        [
            {
                "id": "check-resolution-shapes",
                "kind": "shell",
                "entry": (
                    "source lib/checks.sh && ci_check_resolution_shapes"
                ),
                "stage": "pre-commit",
            },
            {
                "id": "baseline-safety",
                "kind": "shell",
                "entry": (
                    "source lib/checks.sh && ci_check_resolution_shapes"
                ),
                "stage": "pre-commit",
                "mandatory": True,
                "safety": True,
            },
        ],
    )
    assert _run_invariant_4_entries(manifest, quiet=True, package_root=tmp_path) == []


_SAFETY_HOOK: dict[str, object] = {
    "id": "baseline-safety",
    "kind": "makefile_target",
    "entry": "check-safety",
    "stage": "pre-commit",
    "mandatory": True,
    "safety": True,
}


def _make_candidate(tmp_path: Path) -> Path:
    candidate = tmp_path / "candidate"
    (candidate / "ci").mkdir(parents=True)
    (candidate / "config").mkdir()
    (candidate / "lib").mkdir()
    return candidate


def _write_manifest(candidate: Path, hooks: list[dict[str, object]]) -> None:
    (candidate / "config" / "required_hooks.yaml").write_text(
        yaml.safe_dump({"version": 1, "hooks": hooks}),
    )


def _candidate_manifest() -> list[dict[str, object]]:
    return [
        {
            "id": "check-foo",
            "kind": "python_module",
            "entry": "ci.check_foo",
            "stage": "pre-commit",
            "mandatory": True,
        },
        dict(_SAFETY_HOOK),
    ]


def test_producer_mode_passes_for_registered_checker(tmp_path: Path) -> None:
    candidate = _make_candidate(tmp_path)
    (candidate / "ci" / "check_foo.py").write_text("")
    _write_manifest(candidate, _candidate_manifest())
    assert main(["--producer", "--project", str(candidate), "--quiet"]) == EXIT_OK


def test_producer_mode_fails_for_unregistered_checker(tmp_path: Path) -> None:
    candidate = _make_candidate(tmp_path)
    (candidate / "ci" / "check_foo.py").write_text("")
    _write_manifest(candidate, [dict(_SAFETY_HOOK)])
    assert (
        main(["--producer", "--project", str(candidate), "--quiet"]) == EXIT_VIOLATION
    )


def test_producer_mode_fails_when_registered_entry_is_missing(
    tmp_path: Path,
) -> None:
    candidate = _make_candidate(tmp_path)
    _write_manifest(candidate, _candidate_manifest())
    assert (
        main(["--producer", "--project", str(candidate), "--quiet"]) == EXIT_VIOLATION
    )


def test_producer_mode_fails_without_manifest(tmp_path: Path) -> None:
    candidate = _make_candidate(tmp_path)
    assert (
        main(["--producer", "--project", str(candidate), "--quiet"]) == EXIT_INFRA_ERROR
    )


def test_producer_mode_uses_project_manifest_not_sealed(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    candidate = _make_candidate(tmp_path)
    (candidate / "ci" / "check_foo.py").write_text("")
    _write_manifest(candidate, _candidate_manifest())
    sealed = tmp_path / "sealed"
    sealed.mkdir()
    monkeypatch.setattr(
        "ci.check_required_hooks_present._ci_root",
        lambda: sealed,
    )
    assert main(["--producer", "--project", str(candidate), "--quiet"]) == EXIT_OK


def test_producer_mode_requires_lib(tmp_path: Path) -> None:
    candidate = _make_candidate(tmp_path)
    (candidate / "lib").rmdir()
    (candidate / "ci" / "check_foo.py").write_text("")
    _write_manifest(candidate, _candidate_manifest())
    assert (
        main(["--producer", "--project", str(candidate), "--quiet"]) == EXIT_VIOLATION
    )
