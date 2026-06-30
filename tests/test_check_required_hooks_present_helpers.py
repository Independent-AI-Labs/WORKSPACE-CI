"""Tests for ci.check_required_hooks_present: auto-enforcement self-check."""

from __future__ import annotations

import textwrap
from pathlib import Path

import yaml

from ci.check_required_hooks_present import (
    _find_workspace_root,
    _load_manifest,
    _load_quality_exceptions,
    _load_registry,
    _longest_prefix_tier,
    _project_path_relative,
    _registry_source,
    _resolve_enforcement_mode,
    _resolve_tier,
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


# ── unit: workspace + registry helpers ────────────────────────────────────────


def test_find_workspace_root_finds_with_markers(tmp_path: Path) -> None:
    root = _make_workspace(tmp_path)
    project = root / "projects" / "my-project"
    project.mkdir()
    found = _find_workspace_root(project)
    assert found is not None
    assert found.resolve() == root.resolve()


def test_find_workspace_root_returns_none_when_missing(tmp_path: Path) -> None:
    assert _find_workspace_root(tmp_path) is None


def test_project_path_relative(tmp_path: Path) -> None:
    root = _make_workspace(tmp_path)
    project = root / "projects" / "X"
    project.mkdir()
    assert _project_path_relative(root, project) == "projects/X"


def test_project_path_relative_returns_empty_for_unrelated(tmp_path: Path) -> None:
    root = _make_workspace(tmp_path)
    other = tmp_path / "other"
    other.mkdir()
    assert _project_path_relative(root, other) == ""


def test_registry_source_prefers_live_over_template(tmp_path: Path) -> None:
    root = _make_workspace(tmp_path)
    _write_template_registry(root, {"defaults": {"tier": "strict"}})
    _write_registry(root, {"defaults": {"tier": "poc"}})
    src = _registry_source(root)
    assert src is not None
    assert "workspace/config/" in str(src)


def test_registry_source_falls_back_to_template(tmp_path: Path) -> None:
    root = _make_workspace(tmp_path)
    _write_template_registry(root, {"defaults": {"tier": "strict"}})
    src = _registry_source(root)
    assert src is not None
    assert "templates/" in str(src)


def test_registry_source_returns_none_when_neither_present(tmp_path: Path) -> None:
    root = _make_workspace(tmp_path)
    assert _registry_source(root) is None


def test_load_registry_parses_valid_yaml(tmp_path: Path) -> None:
    f = tmp_path / "x.yaml"
    f.write_text("version: 1\n")
    assert _load_registry(f) == {"version": 1}


def test_load_registry_returns_none_for_malformed_yaml(tmp_path: Path) -> None:
    f = tmp_path / "bad.yaml"
    f.write_text("not: valid: yaml: : :\n")
    assert _load_registry(f) is None


def test_load_registry_returns_none_for_non_dict_yaml(tmp_path: Path) -> None:
    f = tmp_path / "list.yaml"
    f.write_text("- 1\n- 2\n")
    assert _load_registry(f) is None


# ── unit: tier resolution ─────────────────────────────────────────────────────


def test_longest_prefix_tier_picks_most_specific() -> None:
    exemptions = [
        {"path": "projects/legacy/", "tier": "vendored"},
        {"path": "projects/legacy/specific-project/", "tier": "strict"},
    ]
    assert (
        _longest_prefix_tier("projects/legacy/specific-project", exemptions) == "strict"
    )
    assert _longest_prefix_tier("projects/legacy/old", exemptions) == "vendored"


def test_longest_prefix_tier_no_match() -> None:
    assert (
        _longest_prefix_tier("projects/X", [{"path": "projects/Y", "tier": "poc"}])
        == ""
    )


def test_longest_prefix_tier_handles_non_list() -> None:
    assert _longest_prefix_tier("projects/X", "not-a-list") == ""


def test_longest_prefix_tier_skips_non_dict_entries() -> None:
    assert _longest_prefix_tier("projects/X", ["string", 123]) == ""


def test_resolve_tier_default_strict_when_no_registry(tmp_path: Path) -> None:
    root = _make_workspace(tmp_path)
    assert _resolve_tier(root, "projects/X") == "strict"


def test_resolve_tier_uses_registry_match(tmp_path: Path) -> None:
    root = _make_workspace(tmp_path)
    _write_registry(
        root,
        {
            "defaults": {"tier": "strict"},
            "exemptions": [{"path": "projects/poc/", "tier": "poc"}],
        },
    )
    assert _resolve_tier(root, "projects/poc") == "poc"
    assert _resolve_tier(root, "projects/poc/sub") == "poc"
    assert _resolve_tier(root, "projects/other") == "strict"


def test_resolve_tier_handles_malformed_registry(tmp_path: Path) -> None:
    root = _make_workspace(tmp_path)
    (root / "ami" / "config").mkdir(parents=True)
    (root / "ami" / "config" / "project_enforcement.yaml").write_text("a: : : :\n")
    assert _resolve_tier(root, "projects/X") == "strict"


def test_resolve_tier_missing_defaults_returns_strict(tmp_path: Path) -> None:
    root = _make_workspace(tmp_path)
    _write_registry(root, {"exemptions": []})
    assert _resolve_tier(root, "projects/X") == "strict"


# ── unit: enforcement_mode resolution ────────────────────────────────────────


def test_resolve_enforcement_mode_default_warn_when_no_registry(
    tmp_path: Path,
) -> None:
    root = _make_workspace(tmp_path)
    assert _resolve_enforcement_mode(root) == "warn"


def test_resolve_enforcement_mode_reads_warn_from_registry(tmp_path: Path) -> None:
    root = _make_workspace(tmp_path)
    _write_registry(root, {"enforcement_mode": "warn"})
    assert _resolve_enforcement_mode(root) == "warn"


def test_resolve_enforcement_mode_reads_enforce_from_registry(
    tmp_path: Path,
) -> None:
    root = _make_workspace(tmp_path)
    _write_registry(root, {"enforcement_mode": "enforce"})
    assert _resolve_enforcement_mode(root) == "enforce"


def test_resolve_enforcement_mode_unknown_value_falls_back_to_warn(
    tmp_path: Path,
) -> None:
    root = _make_workspace(tmp_path)
    _write_registry(root, {"enforcement_mode": "lol"})
    assert _resolve_enforcement_mode(root) == "warn"


def test_resolve_enforcement_mode_non_string_falls_back_to_warn(
    tmp_path: Path,
) -> None:
    root = _make_workspace(tmp_path)
    _write_registry(root, {"enforcement_mode": 42})
    assert _resolve_enforcement_mode(root) == "warn"


def test_resolve_enforcement_mode_falls_back_to_template(tmp_path: Path) -> None:
    root = _make_workspace(tmp_path)
    _write_template_registry(root, {"enforcement_mode": "enforce"})
    assert _resolve_enforcement_mode(root) == "enforce"


# ── unit: manifest + quality_exceptions loading ───────────────────────────────


def test_load_manifest_parses(tmp_path: Path) -> None:
    root = _make_workspace(tmp_path)
    _write_manifest(
        root,
        [{"id": "h1", "kind": "shell", "entry": "x", "stage": "pre-commit"}],
    )
    manifest = _load_manifest(root)
    assert manifest is not None
    assert len(manifest.hooks) == 1
    assert manifest.hooks[0].id == "h1"


def test_load_manifest_returns_none_when_missing(tmp_path: Path) -> None:
    root = _make_workspace(tmp_path)
    assert _load_manifest(root) is None


def test_load_quality_exceptions_returns_none_when_missing(tmp_path: Path) -> None:
    assert _load_quality_exceptions(tmp_path) is None


def test_load_quality_exceptions_parses(tmp_path: Path) -> None:
    f = tmp_path / "quality_exceptions.yaml"
    f.write_text(
        textwrap.dedent("""
            version: 1
            project: TEST
            exceptions:
              - hook: check-dead-code
                reason: "Vendored adapters with dynamic imports: unanalysable."
                paths: [vendor/]
                added_by: dev@example.com
        """),
    )
    excs = _load_quality_exceptions(tmp_path)
    assert excs is not None
    assert excs.project == "TEST"
    assert len(excs.exceptions) == 1


def test_load_quality_exceptions_handles_non_dict(tmp_path: Path) -> None:
    f = tmp_path / "quality_exceptions.yaml"
    f.write_text("- 1\n- 2\n")
    excs = _load_quality_exceptions(tmp_path)
    assert excs is not None
    assert excs.exceptions == []
