"""Tests for ci.check_boot_venv_layout: checks 5-8 (inherit + moon.yml).

Covers SPEC-BOOT-LAYOUT §6.3 checks 5-6 (inherit entry resolution +
world-writable), check 7 (moon.yml bootDir/parentBoot consistency), and
check 8 (moon.yml dependsOn alignment with inherit owners).
"""

from __future__ import annotations

from pathlib import Path

from ci._boot_layout_helpers import MoonProject
from ci.check_boot_venv_layout import (
    BootLayout,
    MoonYml,
    _check_inherit_entries,
    _check_moon_dependson_alignment,
    _check_moon_metadata_consistency,
)

# ---------------------------------------------------------------------------
# Check 5+6: _check_inherit_entries
# ---------------------------------------------------------------------------


def test_check_inherit_entries_empty_returns_no_findings(tmp_path: Path) -> None:
    project = tmp_path / "p"
    project.mkdir()
    layout = BootLayout(inherit=[])
    assert _check_inherit_entries(layout, project) == []


def test_check_inherit_entries_nonexistent_path_is_info(tmp_path: Path) -> None:
    project = tmp_path / "p"
    project.mkdir()
    layout = BootLayout(inherit=["../WORKSPACE-CI/.boot-linux"])
    findings = _check_inherit_entries(layout, project)
    level, msg = findings[0]
    assert level == "INFO"
    assert "does not exist on disk" in msg
    assert "soft-optional" in msg


def test_check_inherit_entries_existing_dir_ok(tmp_path: Path) -> None:
    project = tmp_path / "p"
    project.mkdir()
    sibling = tmp_path / "WORKSPACE-CI" / ".boot-linux"
    sibling.mkdir(parents=True)
    sibling.chmod(0o755)
    layout = BootLayout(inherit=["../WORKSPACE-CI/.boot-linux"])
    findings = _check_inherit_entries(layout, project)
    level, msg = findings[0]
    assert level == "OK"
    assert "existing directory" in msg


def test_check_inherit_entries_exists_as_file(tmp_path: Path) -> None:
    project = tmp_path / "p"
    project.mkdir()
    sibling = tmp_path / "WORKSPACE-CI" / ".boot-linux"
    sibling.parent.mkdir(parents=True)
    sibling.write_text("oops")
    layout = BootLayout(inherit=["../WORKSPACE-CI/.boot-linux"])
    findings = _check_inherit_entries(layout, project)
    level, msg = findings[0]
    assert level == "WARN"
    assert "exists as a file" in msg


def test_check_inherit_entries_empty_entry_is_warn(tmp_path: Path) -> None:
    project = tmp_path / "p"
    project.mkdir()
    layout = BootLayout(inherit=["  "])
    findings = _check_inherit_entries(layout, project)
    level, msg = findings[0]
    assert level == "WARN"
    assert msg == "inherit: contains an empty entry"


def test_check_inherit_entries_leaf_world_writable_preserves_nfr_bl_3_2(
    tmp_path: Path,
) -> None:
    project = tmp_path / "p"
    project.mkdir()
    sibling = tmp_path / "WORKSPACE-CI" / ".boot-linux"
    sibling.mkdir(parents=True)
    sibling.chmod(0o777)
    layout = BootLayout(inherit=["../WORKSPACE-CI/.boot-linux"])
    findings = _check_inherit_entries(layout, project)
    level, msg = findings[0]
    assert level == "WARN"
    assert "world-writable" in msg
    assert "per NFR-BL-3.2" in msg
    assert "(leaf)" in msg


def test_check_inherit_entries_bin_world_writable_only(tmp_path: Path) -> None:
    project = tmp_path / "p"
    project.mkdir()
    sibling = tmp_path / "WORKSPACE-CI" / ".boot-linux"
    sibling.mkdir(parents=True)
    sibling.chmod(0o755)
    bin_dir = sibling / "bin"
    bin_dir.mkdir()
    bin_dir.chmod(0o777)
    layout = BootLayout(inherit=["../WORKSPACE-CI/.boot-linux"])
    findings = _check_inherit_entries(layout, project)
    level, msg = findings[0]
    assert level == "WARN"
    assert "world-writable" in msg
    assert "(bin/)" in msg
    assert "(leaf)" not in msg.split("world-writable")[1].split("per")[0]


def test_check_inherit_entries_both_leaf_and_bin_world_writable(
    tmp_path: Path,
) -> None:
    project = tmp_path / "p"
    project.mkdir()
    sibling = tmp_path / "WORKSPACE-CI" / ".boot-linux"
    sibling.mkdir(parents=True)
    sibling.chmod(0o777)
    bin_dir = sibling / "bin"
    bin_dir.mkdir()
    bin_dir.chmod(0o777)
    layout = BootLayout(inherit=["../WORKSPACE-CI/.boot-linux"])
    findings = _check_inherit_entries(layout, project)
    level, msg = findings[0]
    assert level == "WARN"
    assert "(leaf+bin/)" in msg


# ---------------------------------------------------------------------------
# Check 7: _check_moon_metadata_consistency
# ---------------------------------------------------------------------------


def test_check_moon_metadata_moon_none_returns_empty(tmp_path: Path) -> None:
    layout = BootLayout(boot_dir=".boot-linux")
    assert _check_moon_metadata_consistency(layout, None) == []


def test_check_moon_metadata_project_none_returns_empty(tmp_path: Path) -> None:
    layout = BootLayout(boot_dir=".boot-linux")
    moon = MoonYml(project=None)
    assert _check_moon_metadata_consistency(layout, moon) == []


def test_check_moon_metadata_boot_dir_match_is_ok(tmp_path: Path) -> None:
    layout = BootLayout(boot_dir=".boot-linux")
    moon = MoonYml(project=MoonProject(bootDir=".boot-linux"))
    findings = _check_moon_metadata_consistency(layout, moon)
    level, msg = findings[0]
    assert level == "OK"
    assert "bootDir='.boot-linux'" in msg
    assert "matches boot_layout.yaml" in msg


def test_check_moon_metadata_boot_dir_mismatch_is_warn(tmp_path: Path) -> None:
    layout = BootLayout(boot_dir=".boot-linux")
    moon = MoonYml(project=MoonProject(bootDir="other"))
    findings = _check_moon_metadata_consistency(layout, moon)
    level, msg = findings[0]
    assert level == "WARN"
    assert "does not match boot_layout.yaml::boot_dir='.boot-linux'" in msg


def test_check_moon_metadata_boot_dir_absent_on_moon_is_info(
    tmp_path: Path,
) -> None:
    layout = BootLayout(boot_dir=".boot-linux")
    moon = MoonYml(project=MoonProject(bootDir=None))
    findings = _check_moon_metadata_consistency(layout, moon)
    level, msg = findings[0]
    assert level == "INFO"
    assert "project.bootDir absent" in msg


def test_check_moon_metadata_parentboot_match_order_independent(
    tmp_path: Path,
) -> None:
    inherit = ["../WORKSPACE-CI/.boot-linux", "../WORKSPACE-GUARD/.boot-linux"]
    layout = BootLayout(boot_dir=None, inherit=inherit)
    moon = MoonYml(
        project=MoonProject(
            parentBoot=[
                "../WORKSPACE-GUARD/.boot-linux/",
                "../WORKSPACE-CI/.boot-linux",
            ]
        )
    )
    findings = _check_moon_metadata_consistency(layout, moon)
    matching = [m for lvl, m in findings if lvl == "OK"]
    assert any("parentBoot matches" in m for m in matching)
    assert "2 entries" in matching[0]


def test_check_moon_metadata_parentboot_mismatch_is_warn(tmp_path: Path) -> None:
    inherit = ["../WORKSPACE-CI/.boot-linux"]
    layout = BootLayout(boot_dir=None, inherit=inherit)
    moon = MoonYml(project=MoonProject(parentBoot=["../WORKSPACE-OTHER/.boot-linux"]))
    findings = _check_moon_metadata_consistency(layout, moon)
    level, msg = findings[0]
    assert level == "WARN"
    assert "does not match boot_layout.yaml::inherit" in msg


def test_check_moon_metadata_parentboot_declared_but_inherit_empty(
    tmp_path: Path,
) -> None:
    layout = BootLayout(boot_dir=None, inherit=[])
    moon = MoonYml(project=MoonProject(parentBoot=["../WORKSPACE-OTHER/.boot-linux"]))
    findings = _check_moon_metadata_consistency(layout, moon)
    level, msg = findings[0]
    assert level == "WARN"
    assert "declared but boot_layout.yaml::inherit is empty" in msg


# ---------------------------------------------------------------------------
# Check 8: _check_moon_dependson_alignment
# ---------------------------------------------------------------------------


def test_check_moon_dependson_moon_none_returns_empty(tmp_path: Path) -> None:
    layout = BootLayout(inherit=["../WORKSPACE-CI/.boot-linux"])
    assert _check_moon_dependson_alignment(layout, None) == []


def test_check_moon_dependson_included_is_ok(tmp_path: Path) -> None:
    layout = BootLayout(inherit=["../WORKSPACE-CI/.boot-linux"])
    moon = MoonYml(dependsOn=["ci"])
    findings = _check_moon_dependson_alignment(layout, moon)
    level, msg = findings[0]
    assert level == "OK"
    assert "moon.yml::dependsOn includes 'ci'" in msg


def test_check_moon_dependson_missing_is_warn(tmp_path: Path) -> None:
    layout = BootLayout(inherit=["../WORKSPACE-FOO/.boot-linux"])
    moon = MoonYml(dependsOn=["bar"])
    findings = _check_moon_dependson_alignment(layout, moon)
    level, msg = findings[0]
    assert level == "WARN"
    assert "moon.yml::dependsOn" in msg
    assert "MISSING 'foo'" in msg


def test_check_moon_dependson_ancestor_only_inherit_skipped(
    tmp_path: Path,
) -> None:
    layout = BootLayout(inherit=["/etc/some-ancestor/.boot-linux"])
    moon = MoonYml(dependsOn=[])
    assert _check_moon_dependson_alignment(layout, moon) == []
