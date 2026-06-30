"""Tests for ci.check_boot_venv_layout — check 9, _load_moon_yml, main().

Covers SPEC-BOOT-LAYOUT §6.3 check 9 (.pre-commit-config.yaml --project
refs), the _load_moon_yml helper, and the main() end-to-end path.
All filesystem state is built inside the ``tmp_path`` pytest fixture.
"""

from __future__ import annotations

import sys
import textwrap
from pathlib import Path

import pytest

from ci.check_boot_venv_layout import (
    MoonYml,
    _check_precommit_project_refs,
    _load_moon_yml,
    main,
)

# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------


def _make_project(
    tmp_path: Path,
    *,
    boot_layout: str | None = None,
    moon_yml: str | None = None,
    pre_commit: str | None = None,
) -> Path:
    """Build a minimal project tree under tmp_path."""
    project = tmp_path / "WORKSPACE-TEST"
    project.mkdir()
    if boot_layout is not None:
        (project / "config").mkdir()
        (project / "config" / "boot_layout.yaml").write_text(boot_layout)
    if moon_yml is not None:
        (project / "moon.yml").write_text(moon_yml)
    if pre_commit is not None:
        (project / ".pre-commit-config.yaml").write_text(pre_commit)
    return project


def _boot_layout_yaml(
    *,
    boot_dir: str | None = "null",
    venv_dir: str | None = "null",
    inherit: list[str] | None = None,
) -> str:
    """Render a config/boot_layout.yaml document as a YAML text blob."""
    lines: list[str] = ["version: 1"]
    if boot_dir == "null":
        lines.append("boot_dir: null")
    else:
        lines.append(f"boot_dir: {boot_dir!r}")
    if venv_dir == "null":
        lines.append("venv_dir: null")
    else:
        lines.append(f"venv_dir: {venv_dir!r}")
    if inherit:
        rendered = ", ".join(repr(i) for i in inherit)
        lines.append(f"inherit: [{rendered}]")
    else:
        lines.append("inherit: []")
    return "\n".join(lines) + "\n"


def _pcc_with_ref(ref: str) -> str:
    return textwrap.dedent(
        f"""
        - id: check-foo
          entry: uv run --project {ref} --no-sync python -m ci.check_foo
        """
    )


def _run_main_capturing_exit(
    project: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> int:
    """Invoke main() with patched argv, returning the SystemExit code."""
    monkeypatch.setattr(sys, "argv", ["check-boot-venv-layout", str(project)])
    with pytest.raises(SystemExit) as exc:
        main()
    assert exc.value.code is not None
    return int(exc.value.code)


# ---------------------------------------------------------------------------
# Check 9 — _check_precommit_project_refs
# ---------------------------------------------------------------------------


def test_check_precommit_project_refs_no_config_returns_empty(
    tmp_path: Path,
) -> None:
    project = tmp_path / "p"
    project.mkdir()
    assert _check_precommit_project_refs(project) == []


def test_check_precommit_project_refs_ok(tmp_path: Path) -> None:
    project = tmp_path / "p"
    project.mkdir()
    target = tmp_path / "WORKSPACE-CI"
    target.mkdir()
    (target / "pyproject.toml").write_text("[project]\nname='x'\n")
    venv_bin = target / ".venv" / "bin"
    venv_bin.mkdir(parents=True)
    (venv_bin / "python").write_text("#!/usr/bin/env bash\n")
    (project / ".pre-commit-config.yaml").write_text(_pcc_with_ref("../WORKSPACE-CI"))
    findings = _check_precommit_project_refs(project)
    level, msg = findings[0]
    assert level == "OK"
    assert "pyproject.toml + .venv/bin/python present" in msg


def test_check_precommit_project_refs_missing_pyproject(tmp_path: Path) -> None:
    project = tmp_path / "p"
    project.mkdir()
    target = tmp_path / "WORKSPACE-CI"
    target.mkdir()
    venv_bin = target / ".venv" / "bin"
    venv_bin.mkdir(parents=True)
    (venv_bin / "python").write_text("#!/usr/bin/env bash\n")
    (project / ".pre-commit-config.yaml").write_text(_pcc_with_ref("../WORKSPACE-CI"))
    findings = _check_precommit_project_refs(project)
    level, msg = findings[0]
    assert level == "WARN"
    assert "missing pyproject.toml" in msg


def test_check_precommit_project_refs_missing_venv_python(tmp_path: Path) -> None:
    project = tmp_path / "p"
    project.mkdir()
    target = tmp_path / "WORKSPACE-CI"
    target.mkdir()
    (target / "pyproject.toml").write_text("[project]\nname='x'\n")
    (project / ".pre-commit-config.yaml").write_text(_pcc_with_ref("../WORKSPACE-CI"))
    findings = _check_precommit_project_refs(project)
    level, msg = findings[0]
    assert level == "WARN"
    assert "has pyproject.toml but no .venv/bin/python" in msg


def test_check_precommit_project_refs_multiple_distinct_targets(
    tmp_path: Path,
) -> None:
    project = tmp_path / "p"
    project.mkdir()
    for name in ("WORKSPACE-CI", "WORKSPACE-GUARD"):
        t = tmp_path / name
        t.mkdir()
        (t / "pyproject.toml").write_text("[project]\n")
        bin_d = t / ".venv" / "bin"
        bin_d.mkdir(parents=True)
        (bin_d / "python").write_text("#!/usr/bin/env bash\n")
    (project / ".pre-commit-config.yaml").write_text(
        textwrap.dedent(
            """
            - id: a
              entry: uv run --project ../WORKSPACE-CI --no-sync python -m ci.a
            - id: b
              entry: uv run --project ../WORKSPACE-GUARD --no-sync python -m ci.b
            """
        )
    )
    findings = _check_precommit_project_refs(project)
    expected_targets = 2
    assert len(findings) == expected_targets
    assert all(lvl == "OK" for lvl, _ in findings)


def test_check_precommit_project_refs_duplicate_ref_deduped(
    tmp_path: Path,
) -> None:
    project = tmp_path / "p"
    project.mkdir()
    target = tmp_path / "WORKSPACE-CI"
    target.mkdir()
    (target / "pyproject.toml").write_text("[project]\n")
    bin_d = target / ".venv" / "bin"
    bin_d.mkdir(parents=True)
    (bin_d / "python").write_text("#!/usr/bin/env bash\n")
    (project / ".pre-commit-config.yaml").write_text(
        textwrap.dedent(
            """
            - id: a
              entry: uv run --project ../WORKSPACE-CI --no-sync python -m ci.a
            - id: b
              entry: uv run --project ../WORKSPACE-CI --no-sync python -m ci.b
            """
        )
    )
    findings = _check_precommit_project_refs(project)
    assert len(findings) == 1


# ---------------------------------------------------------------------------
# _load_moon_yml
# ---------------------------------------------------------------------------


def test_load_moon_yml_returns_none_when_absent(tmp_path: Path) -> None:
    assert _load_moon_yml(tmp_path) is None


def test_load_moon_yml_returns_none_on_malformed(tmp_path: Path) -> None:
    (tmp_path / "moon.yml").write_text("a: [unclosed\n")
    assert _load_moon_yml(tmp_path) is None


def test_load_moon_yml_returns_none_on_non_mapping(tmp_path: Path) -> None:
    (tmp_path / "moon.yml").write_text("- a\n- b\n")
    assert _load_moon_yml(tmp_path) is None


def test_load_moon_yml_parses_valid(tmp_path: Path) -> None:
    (tmp_path / "moon.yml").write_text(
        textwrap.dedent(
            """
            project:
              name: test
              bootDir: .boot-linux
              parentBoot: []
            dependsOn: []
            """
        )
    )
    moon = _load_moon_yml(tmp_path)
    assert moon is not None
    assert isinstance(moon, MoonYml)
    assert moon.project is not None
    assert moon.project.bootDir == ".boot-linux"


# ---------------------------------------------------------------------------
# main() end-to-end
# ---------------------------------------------------------------------------


def test_main_valid_layout_with_matching_moon_exits_zero(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project = _make_project(
        tmp_path,
        boot_layout=_boot_layout_yaml(
            boot_dir=".boot-linux",
            venv_dir=".venv",
            inherit=[],
        ),
        moon_yml=textwrap.dedent(
            """
            project:
              bootDir: .boot-linux
              parentBoot: []
            dependsOn: []
            """
        ),
    )
    (project / ".boot-linux").mkdir()
    venv_bin = project / ".venv" / "bin"
    venv_bin.mkdir(parents=True)
    (venv_bin / "python").write_text("#!/usr/bin/env bash\n")
    assert _run_main_capturing_exit(project, monkeypatch) == 0


def test_main_no_boot_layout_exits_zero(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project = _make_project(tmp_path)
    assert _run_main_capturing_exit(project, monkeypatch) == 0


def test_main_all_warn_findings_still_exits_zero(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """FR-BL-7.7: WARN findings must NOT cause a non-zero exit (non-blocking)."""
    project = _make_project(
        tmp_path,
        boot_layout=_boot_layout_yaml(
            boot_dir=".boot-linux",
            venv_dir=".venv",
            inherit=["../WORKSPACE-CI/.boot-linux"],
        ),
        moon_yml=textwrap.dedent(
            """
            project:
              bootDir: other
              parentBoot: ["../WRONG/.boot-linux"]
            dependsOn: ["bar"]
            """
        ),
    )
    assert _run_main_capturing_exit(project, monkeypatch) == 0


def test_main_integral_consistency_counts(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Smoke test that main() writes a summary line via _emit_and_exit."""
    project = _make_project(
        tmp_path,
        boot_layout=_boot_layout_yaml(
            boot_dir=".boot-linux",
            venv_dir=".venv",
            inherit=[],
        ),
        moon_yml=textwrap.dedent(
            """
            project:
              bootDir: .boot-linux
              parentBoot: []
            dependsOn: []
            """
        ),
    )
    (project / ".boot-linux").mkdir()
    venv_bin = project / ".venv" / "bin"
    venv_bin.mkdir(parents=True)
    (venv_bin / "python").write_text("#!/usr/bin/env bash\n")
    monkeypatch.setattr(sys, "argv", ["check-boot-venv-layout", str(project)])
    with pytest.raises(SystemExit) as exc:
        main()
    assert exc.value.code is not None
    assert int(exc.value.code) == 0
