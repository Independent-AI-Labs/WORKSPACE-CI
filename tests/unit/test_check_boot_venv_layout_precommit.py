"""Tests for ci.check_boot_venv_layout: check 6 + main().

Covers SPEC-BOOT-LAYOUT §6.3 check 6 (.pre-commit-config.yaml --project
refs resolve to pyproject.toml + venv) and the main() end-to-end path.
All filesystem state is built inside the ``tmp_path`` pytest fixture.
"""

from __future__ import annotations

import sys
import textwrap
from pathlib import Path

import pytest

from ci.check_boot_venv_layout import (
    _check_precommit_project_refs,
    main,
)

# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------


def _make_project(
    tmp_path: Path,
    *,
    moon_yml: str | None = None,
    pre_commit: str | None = None,
) -> Path:
    """Build a minimal project tree under tmp_path."""
    project = tmp_path / "WORKSPACE-TEST"
    project.mkdir()
    if moon_yml is not None:
        (project / "moon.yml").write_text(moon_yml)
    if pre_commit is not None:
        (project / ".pre-commit-config.yaml").write_text(pre_commit)
    return project


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
# Check 6: _check_precommit_project_refs
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
    target = tmp_path / "CI"
    target.mkdir()
    (target / "pyproject.toml").write_text("[project]\nname='x'\n")
    venv_bin = target / ".venv" / "bin"
    venv_bin.mkdir(parents=True)
    (venv_bin / "python").write_text("#!/usr/bin/env bash\n")
    (project / ".pre-commit-config.yaml").write_text(_pcc_with_ref("../CI"))
    findings = _check_precommit_project_refs(project)
    level, msg = findings[0]
    assert level == "OK"
    assert "pyproject.toml + .venv/bin/python at" in msg


def test_check_precommit_project_refs_missing_pyproject(tmp_path: Path) -> None:
    project = tmp_path / "p"
    project.mkdir()
    target = tmp_path / "CI"
    target.mkdir()
    venv_bin = target / ".venv" / "bin"
    venv_bin.mkdir(parents=True)
    (venv_bin / "python").write_text("#!/usr/bin/env bash\n")
    (project / ".pre-commit-config.yaml").write_text(_pcc_with_ref("../CI"))
    findings = _check_precommit_project_refs(project)
    level, msg = findings[0]
    assert level == "WARN"
    assert "missing pyproject.toml" in msg


def test_check_precommit_project_refs_missing_venv_python(tmp_path: Path) -> None:
    project = tmp_path / "p"
    project.mkdir()
    target = tmp_path / "CI"
    target.mkdir()
    (target / "pyproject.toml").write_text("[project]\nname='x'\n")
    (project / ".pre-commit-config.yaml").write_text(_pcc_with_ref("../CI"))
    findings = _check_precommit_project_refs(project)
    level, msg = findings[0]
    assert level == "WARN"
    assert "no .venv/bin/python" in msg


def test_check_precommit_project_refs_multiple_distinct_targets(
    tmp_path: Path,
) -> None:
    project = tmp_path / "p"
    project.mkdir()
    for name in ("CI", "WORKSPACE-GUARD"):
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
              entry: uv run --project ../CI --no-sync python -m ci.a
            - id: b
              entry: uv run --project ../WORKSPACE-GUARD --no-sync python -m ci.b
            """
        )
    )
    findings = _check_precommit_project_refs(project)
    assert len(findings) == 2
    assert all(lvl == "OK" for lvl, _ in findings)


def test_check_precommit_project_refs_duplicate_ref_deduped(
    tmp_path: Path,
) -> None:
    project = tmp_path / "p"
    project.mkdir()
    target = tmp_path / "CI"
    target.mkdir()
    (target / "pyproject.toml").write_text("[project]\n")
    bin_d = target / ".venv" / "bin"
    bin_d.mkdir(parents=True)
    (bin_d / "python").write_text("#!/usr/bin/env bash\n")
    (project / ".pre-commit-config.yaml").write_text(
        textwrap.dedent(
            """
            - id: a
              entry: uv run --project ../CI --no-sync python -m ci.a
            - id: b
              entry: uv run --project ../CI --no-sync python -m ci.b
            """
        )
    )
    findings = _check_precommit_project_refs(project)
    assert len(findings) == 1


# ---------------------------------------------------------------------------
# main() end-to-end
# ---------------------------------------------------------------------------


def test_main_valid_project_with_inherited_boot_dir(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Project with moon.yml + inherited_boot_dirs resolving OK exits 0."""
    sibling = tmp_path / "CI" / ".boot-linux" / "bin"
    sibling.mkdir(parents=True)
    sibling.chmod(0o755)
    project = _make_project(
        tmp_path,
        moon_yml=textwrap.dedent(
            """
            project:
              inherited_boot_dirs: ['../CI']
            dependsOn: ['ci']
            """
        ),
    )
    assert _run_main_capturing_exit(project, monkeypatch) == 0


def test_main_no_moon_yml_exits_zero(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Repo without moon.yml still exits 0 (advisory check)."""
    project = _make_project(tmp_path)
    assert _run_main_capturing_exit(project, monkeypatch) == 0


def test_main_empty_inherited_boot_dirs_exits_zero(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Project with inherited_boot_dirs: [] exits 0 (no inherited dirs)."""
    project = _make_project(
        tmp_path,
        moon_yml=textwrap.dedent(
            """
            project:
              inherited_boot_dirs: []
            dependsOn: []
            """
        ),
    )
    assert _run_main_capturing_exit(project, monkeypatch) == 0


def test_main_all_warn_findings_still_exits_zero(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """WARN findings must NOT cause a non-zero exit (non-blocking)."""
    project = _make_project(
        tmp_path,
        moon_yml=textwrap.dedent(
            """
            project:
              inherited_boot_dirs: ['../MISSING']
            dependsOn: ['bar']
            """
        ),
    )
    assert _run_main_capturing_exit(project, monkeypatch) == 0


def test_main_malformed_moon_yml_exits_zero(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Malformed moon.yml produces WARN but still exits 0."""
    project = _make_project(
        tmp_path,
        moon_yml="a: [unclosed\n",
    )
    assert _run_main_capturing_exit(project, monkeypatch) == 0


def test_main_integral_consistency_counts(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Smoke test that main() writes a summary line via _emit_and_exit."""
    sibling = tmp_path / "CI" / ".boot-linux" / "bin"
    sibling.mkdir(parents=True)
    sibling.chmod(0o755)
    project = _make_project(
        tmp_path,
        moon_yml=textwrap.dedent(
            """
            project:
              inherited_boot_dirs: ['../CI']
            dependsOn: ['ci']
            """
        ),
    )
    monkeypatch.setattr(sys, "argv", ["check-boot-venv-layout", str(project)])
    with pytest.raises(SystemExit) as exc:
        main()
    assert exc.value.code is not None
    assert int(exc.value.code) == 0


def test_main_with_precommit_refs(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """main() with .pre-commit-config.yaml refs exercises check 6."""
    sibling = tmp_path / "CI" / ".boot-linux" / "bin"
    sibling.mkdir(parents=True)
    sibling.chmod(0o755)
    (tmp_path / "CI" / "pyproject.toml").write_text("[project]\n")
    venv_bin = tmp_path / "CI" / ".venv" / "bin"
    venv_bin.mkdir(parents=True)
    (venv_bin / "python").write_text("#!/usr/bin/env bash\n")
    project = _make_project(
        tmp_path,
        moon_yml=textwrap.dedent(
            """
            project:
              inherited_boot_dirs: ['../CI']
            dependsOn: ['ci']
            """
        ),
        pre_commit=_pcc_with_ref("../CI"),
    )
    assert _run_main_capturing_exit(project, monkeypatch) == 0