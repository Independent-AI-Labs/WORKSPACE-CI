"""Tests for ci.check_required_hooks_present: auto-enforcement self-check."""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from ci.check_required_hooks_present import (
    EXIT_INFRA_ERROR,
    EXIT_OK,
    EXIT_VIOLATION,
    REASON_MIN_LEN,
    ExceptionEntry,
    HookEntry,
    HooksManifest,
    QualityExceptions,
    _check_hooks_rendered,
    _check_manifest_completeness,
    _check_quality_exceptions,
    _hook_applies,
    _hook_marker,
    _read_rendered_hooks,
    _resolve_gitdir,
    main,
)


def _make_workspace(tmp_path: Path) -> Path:
    """Create a minimal workspace tree with workspace marker."""
    root = tmp_path / "workspace"
    (root / ".boot-linux").mkdir(parents=True)
    (root / "projects" / "CI" / "ci").mkdir(parents=True)
    (root / "projects" / "CI" / "config").mkdir(parents=True)
    (root / "projects" / "CI" / "templates").mkdir(parents=True)
    return root


def _write_manifest(workspace: Path, hooks: list[dict[str, object]]) -> None:
    cfg = workspace / "projects" / "CI" / "config" / "required_hooks.yaml"
    cfg.write_text(yaml.safe_dump({"version": 1, "hooks": hooks}))


def _write_registry(workspace: Path, content: dict[str, object]) -> None:
    cfg_dir = workspace / "workspace" / "config"
    cfg_dir.mkdir(parents=True, exist_ok=True)
    (cfg_dir / "project_enforcement.yaml").write_text(yaml.safe_dump(content))


def _write_template_registry(workspace: Path, content: dict[str, object]) -> None:
    tpl = (
        workspace
        / "projects"
        / "CI"
        / "templates"
        / "project_enforcement.template.yaml"
    )
    tpl.write_text(yaml.safe_dump(content))


def _make_repo_with_hooks(
    parent: Path,
    name: str,
    *,
    pre_commit_markers: list[str] | None = None,
    pre_push_markers: list[str] | None = None,
) -> Path:
    repo = parent / name
    (repo / ".git" / "hooks").mkdir(parents=True)
    pre_commit = "#!/usr/bin/env bash\n"
    for m in pre_commit_markers or []:
        pre_commit += f"# === Hook: {m} ===\n"
    (repo / ".git" / "hooks" / "pre-commit").write_text(pre_commit)
    pre_push = "#!/usr/bin/env bash\n"
    for m in pre_push_markers or []:
        pre_push += f"# === Hook: {m} ===\n"
    (repo / ".git" / "hooks" / "pre-push").write_text(pre_push)
    return repo


# ── unit: invariant 1: manifest completeness ─────────────────────────────────


def test_manifest_completeness_passes_when_all_registered(tmp_path: Path) -> None:
    root = _make_workspace(tmp_path)
    (root / "projects" / "CI" / "ci" / "check_foo.py").write_text("")
    manifest = HooksManifest(
        hooks=[
            HookEntry(
                id="check-foo",
                kind="python_module",
                entry="ci.check_foo",
                stage="pre-commit",
            ),
        ],
    )
    assert _check_manifest_completeness(root, manifest) == []


def test_manifest_completeness_flags_missing(tmp_path: Path) -> None:
    root = _make_workspace(tmp_path)
    (root / "projects" / "CI" / "ci" / "check_foo.py").write_text("")
    manifest = HooksManifest(hooks=[])
    issues = _check_manifest_completeness(root, manifest)
    assert len(issues) == 1
    assert "check_foo.py" in issues[0]


def test_manifest_completeness_handles_missing_dir(tmp_path: Path) -> None:
    issues = _check_manifest_completeness(tmp_path, HooksManifest())
    assert len(issues) == 1
    assert "not found" in issues[0]


# ── unit: invariant 2: quality_exceptions schema ─────────────────────────────


def _manifest_with_one_exemptable() -> HooksManifest:
    return HooksManifest(
        hooks=[
            HookEntry(
                id="check-dead-code",
                kind="python_module",
                entry="ci.check_dead_code",
                stage="pre-push",
                mandatory=False,
            ),
            HookEntry(
                id="ci-lint",
                kind="makefile_target",
                entry="lint",
                stage="pre-commit",
                mandatory=True,
            ),
        ],
    )


def test_quality_exceptions_passes_for_valid_entry() -> None:
    manifest = _manifest_with_one_exemptable()
    excs = QualityExceptions(
        exceptions=[
            ExceptionEntry(
                hook="check-dead-code",
                reason="Vendored adapters with dynamic imports: unanalysable.",
                paths=["vendor/"],
                added_by="dev@example.com",
            ),
        ],
    )
    assert _check_quality_exceptions(excs, manifest) == []


def test_quality_exceptions_rejects_unknown_hook() -> None:
    excs = QualityExceptions(
        exceptions=[
            ExceptionEntry(
                hook="bogus",
                reason="some reason that is at least twenty chars long",
                paths=["x/"],
                added_by="d@e.com",
            ),
        ],
    )
    issues = _check_quality_exceptions(excs, _manifest_with_one_exemptable())
    assert any("not in required_hooks.yaml" in i for i in issues)


def test_quality_exceptions_rejects_mandatory_hook() -> None:
    excs = QualityExceptions(
        exceptions=[
            ExceptionEntry(
                hook="ci-lint",
                reason="some reason that is at least twenty chars long",
                paths=["x/"],
                added_by="d@e.com",
            ),
        ],
    )
    issues = _check_quality_exceptions(excs, _manifest_with_one_exemptable())
    assert any("mandatory" in i for i in issues)


def test_quality_exceptions_rejects_empty_paths() -> None:
    excs = QualityExceptions(
        exceptions=[
            ExceptionEntry(
                hook="check-dead-code",
                reason="some reason that is at least twenty chars long",
                paths=[],
                added_by="d@e.com",
            ),
        ],
    )
    issues = _check_quality_exceptions(excs, _manifest_with_one_exemptable())
    assert any("non-empty" in i for i in issues)


def test_quality_exceptions_rejects_short_reason() -> None:
    excs = QualityExceptions(
        exceptions=[
            ExceptionEntry(
                hook="check-dead-code",
                reason="short",
                paths=["x/"],
                added_by="d@e.com",
            ),
        ],
    )
    issues = _check_quality_exceptions(excs, _manifest_with_one_exemptable())
    assert any("shorter than required" in i for i in issues)
    assert REASON_MIN_LEN > 0


def test_quality_exceptions_rejects_missing_added_by() -> None:
    excs = QualityExceptions(
        exceptions=[
            ExceptionEntry(
                hook="check-dead-code",
                reason="some reason that is at least twenty chars long",
                paths=["x/"],
                added_by="",
            ),
        ],
    )
    issues = _check_quality_exceptions(excs, _manifest_with_one_exemptable())
    assert any("added_by" in i for i in issues)


# ── unit: invariant 3: rendered hooks ────────────────────────────────────────


def test_hook_marker_format() -> None:
    assert _hook_marker("ci-lint") == "# === Hook: ci-lint ==="


def test_hook_applies_skips_non_mandatory() -> None:
    hook = HookEntry(
        id="x",
        kind="shell",
        entry="x",
        stage="pre-commit",
        mandatory=False,
    )
    assert _hook_applies(hook, "strict") is False


def test_hook_applies_skips_non_safety_at_poc_tier() -> None:
    hook = HookEntry(
        id="x",
        kind="shell",
        entry="x",
        stage="pre-commit",
        mandatory=True,
        safety=False,
    )
    assert _hook_applies(hook, "strict") is True
    assert _hook_applies(hook, "poc") is False


def test_hook_applies_includes_safety_at_poc_tier() -> None:
    hook = HookEntry(
        id="x",
        kind="shell",
        entry="x",
        stage="pre-commit",
        mandatory=True,
        safety=True,
    )
    assert _hook_applies(hook, "poc") is True


def test_resolve_gitdir_with_directory(tmp_path: Path) -> None:
    (tmp_path / ".git").mkdir()
    assert _resolve_gitdir(tmp_path) == tmp_path / ".git"


def test_resolve_gitdir_with_pointer_file(tmp_path: Path) -> None:
    actual = tmp_path / "actual_gitdir"
    actual.mkdir()
    pointer = tmp_path / ".git"
    pointer.write_text(f"gitdir: {actual}\n")
    resolved = _resolve_gitdir(tmp_path)
    assert resolved == actual


def test_resolve_gitdir_with_relative_pointer(tmp_path: Path) -> None:
    actual = tmp_path / "actual_gitdir"
    actual.mkdir()
    pointer = tmp_path / ".git"
    pointer.write_text("gitdir: actual_gitdir\n")
    resolved = _resolve_gitdir(tmp_path)
    assert resolved.resolve() == actual.resolve()


def test_resolve_gitdir_pointer_without_prefix(tmp_path: Path) -> None:
    pointer = tmp_path / ".git"
    pointer.write_text("not a pointer\n")
    assert _resolve_gitdir(tmp_path) == tmp_path / ".git"


def test_read_rendered_hooks_finds_files(tmp_path: Path) -> None:
    (tmp_path / "pre-commit").write_text("body1")
    (tmp_path / "pre-push").write_text("body2")
    rendered = _read_rendered_hooks(tmp_path)
    assert rendered["pre-commit"] == "body1"
    assert rendered["pre-push"] == "body2"
    assert "commit-msg" not in rendered


def test_check_hooks_rendered_vendored_returns_empty(tmp_path: Path) -> None:
    assert _check_hooks_rendered(tmp_path, HooksManifest(), "vendored") == []


def test_check_hooks_rendered_finds_present_hooks(tmp_path: Path) -> None:
    repo = _make_repo_with_hooks(tmp_path, "r1", pre_commit_markers=["ci-lint"])
    manifest = HooksManifest(
        hooks=[
            HookEntry(
                id="ci-lint",
                kind="makefile_target",
                entry="lint",
                stage="pre-commit",
                mandatory=True,
            ),
        ],
    )
    assert _check_hooks_rendered(repo, manifest, "strict") == []


def test_check_hooks_rendered_flags_missing(tmp_path: Path) -> None:
    repo = _make_repo_with_hooks(tmp_path, "r1")
    manifest = HooksManifest(
        hooks=[
            HookEntry(
                id="ci-lint",
                kind="makefile_target",
                entry="lint",
                stage="pre-commit",
                mandatory=True,
            ),
        ],
    )
    issues = _check_hooks_rendered(repo, manifest, "strict")
    assert len(issues) == 1
    assert "ci-lint" in issues[0]


def test_check_hooks_rendered_handles_missing_hooks_dir(tmp_path: Path) -> None:
    issues = _check_hooks_rendered(tmp_path, HooksManifest(), "strict")
    assert any("hooks not found" in i for i in issues)


# ── integration: main() entry point ───────────────────────────────────────────


def _setup_strict_repo_with_full_contract(workspace: Path, name: str) -> Path:
    project = workspace / "projects" / name
    project.mkdir(parents=True)
    (project / "quality_exceptions.yaml").write_text(
        yaml.safe_dump({"version": 1, "project": name, "exceptions": []}),
    )
    (project / ".git" / "hooks").mkdir(parents=True)
    (project / ".git" / "hooks" / "pre-commit").write_text(
        "#!/usr/bin/env bash\n# === Hook: ci-lint ===\n# === Hook: ci-type-check ===\n",
    )
    (project / ".git" / "hooks" / "pre-push").write_text(
        "#!/usr/bin/env bash\n",
    )
    return project


def test_main_passes_for_strict_compliant_project(tmp_path: Path) -> None:
    root = _make_workspace(tmp_path)
    _write_manifest(
        root,
        [
            {
                "id": "ci-lint",
                "kind": "makefile_target",
                "entry": "lint",
                "stage": "pre-commit",
                "mandatory": True,
            },
            {
                "id": "ci-type-check",
                "kind": "makefile_target",
                "entry": "type-check",
                "stage": "pre-commit",
                "mandatory": True,
            },
        ],
    )
    _write_template_registry(root, {"defaults": {"tier": "strict"}})
    project = _setup_strict_repo_with_full_contract(root, "X")
    assert main(["--project", str(project), "--quiet"]) == EXIT_OK


def test_main_fails_when_quality_exceptions_missing(tmp_path: Path) -> None:
    root = _make_workspace(tmp_path)
    _write_manifest(root, [])
    _write_template_registry(root, {"defaults": {"tier": "strict"}})
    project = root / "projects" / "X"
    (project / ".git" / "hooks").mkdir(parents=True)
    assert main(["--project", str(project), "--quiet"]) == EXIT_VIOLATION


def test_main_returns_infra_error_when_no_workspace(tmp_path: Path) -> None:
    assert main(["--project", str(tmp_path), "--quiet"]) == EXIT_INFRA_ERROR


def test_main_returns_infra_error_when_no_manifest(tmp_path: Path) -> None:
    root = _make_workspace(tmp_path)
    project = root / "projects" / "X"
    project.mkdir()
    assert main(["--project", str(project), "--quiet"]) == EXIT_INFRA_ERROR


def test_main_passes_trivially_for_vendored_tier(tmp_path: Path) -> None:
    root = _make_workspace(tmp_path)
    _write_manifest(root, [])
    _write_template_registry(
        root,
        {
            "defaults": {"tier": "strict"},
            "exemptions": [{"path": "projects/vendored", "tier": "vendored"}],
        },
    )
    project = root / "projects" / "vendored"
    project.mkdir(parents=True)
    assert main(["--project", str(project), "--quiet"]) == EXIT_OK


def test_main_emits_ok_lines_when_not_quiet(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    root = _make_workspace(tmp_path)
    _write_manifest(
        root,
        [
            {
                "id": "ci-lint",
                "kind": "makefile_target",
                "entry": "lint",
                "stage": "pre-commit",
                "mandatory": True,
            },
        ],
    )
    _write_template_registry(root, {"defaults": {"tier": "strict"}})
    project = _setup_strict_repo_with_full_contract(root, "X")
    rc = main(["--project", str(project)])
    assert rc == EXIT_OK
    captured = capsys.readouterr()
    assert "[OK]" in captured.out


def test_main_workspace_root_is_strict(tmp_path: Path) -> None:
    """Project at workspace root resolves rel='.' and tier='strict'."""
    root = _make_workspace(tmp_path)
    _write_manifest(root, [])
    _write_template_registry(root, {"defaults": {"tier": "strict"}})
    (root / "quality_exceptions.yaml").write_text(
        yaml.safe_dump({"version": 1, "project": "ROOT", "exceptions": []}),
    )
    (root / ".git" / "hooks").mkdir(parents=True)
    rc = main(["--project", str(root), "--quiet"])
    assert rc == EXIT_OK
