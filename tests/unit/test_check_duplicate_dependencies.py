"""Unit tests for ci/check_duplicate_dependencies module."""

import json
from pathlib import Path
from unittest.mock import patch

import pytest

from ci.check_duplicate_dependencies import (
    _MIN_DUPLICATE_ENTRIES,
    BUILTIN_EXCLUDES,
    _collect_entries,
    _is_mutually_exclusive,
    _parse_dep_name,
    check_redundant,
    check_self_duplicates,
    find_workspace_root,
    main,
)


@pytest.fixture(autouse=True)
def _skip_exemption_validation():
    with patch(
        "ci.check_duplicate_dependencies.validate_exemption_file", lambda *a, **k: None
    ):
        yield


class TestParseDepName:
    def test_parses_standard_dep(self) -> None:
        assert _parse_dep_name("numpy==1.20.0") == "numpy"
        assert _parse_dep_name("pydantic>=2.0") == "pydantic"
        assert _parse_dep_name("requests") == "requests"

    def test_parses_with_extras(self) -> None:
        assert _parse_dep_name("uvicorn[standard]==0.49.0") == "uvicorn"

    def test_parses_case_insensitive(self) -> None:
        assert _parse_dep_name("PyYAML>=6.0") == "pyyaml"

    def test_strips_quotes(self) -> None:
        assert _parse_dep_name('"pytest==8.0.0"') == "pytest"
        assert _parse_dep_name("'pytest==8.0.0'") == "pytest"

    def test_handles_whitespace(self) -> None:
        assert _parse_dep_name("  httpx>=0.28  ") == "httpx"


class TestCollectEntries:
    def test_collects_dependencies(self) -> None:
        data = {"project": {"dependencies": ["numpy==1.0.0", "pandas>=2.0"]}}
        entries = _collect_entries(data)
        names = [e.dep_name for e in entries]
        assert "numpy" in names
        assert "pandas" in names

    def test_collects_optional_dependencies(self) -> None:
        data = {
            "project": {
                "dependencies": [],
                "optional-dependencies": {"dev": ["pytest==8.0.0"]},
            }
        }
        entries = _collect_entries(data)
        assert len(entries) == 1
        assert entries[0].dep_name == "pytest"
        assert entries[0].section == "optional-dev"
        assert entries[0].group == "dev"

    def test_collects_both_sections(self) -> None:
        data = {
            "project": {
                "dependencies": ["numpy==1.0.0"],
                "optional-dependencies": {"dev": ["pytest==8.0.0"]},
            }
        }
        entries = _collect_entries(data)
        assert len(entries) == _MIN_DUPLICATE_ENTRIES

    def test_handles_empty_optional_deps(self) -> None:
        data = {"project": {"dependencies": ["numpy==1.0.0"]}}
        entries = _collect_entries(data)
        assert len(entries) == 1


class TestIsMutuallyExclusive:
    def test_detects_conflict_group(self) -> None:
        data = {
            "tool": {
                "uv": {
                    "conflicts": [
                        [{"extra": "cpu"}, {"extra": "cuda"}, {"extra": "rocm"}]
                    ]
                }
            }
        }
        assert _is_mutually_exclusive(data, ["cpu", "cuda"]) is True

    def test_no_conflicts_when_no_config(self) -> None:
        data = {}
        assert _is_mutually_exclusive(data, ["cpu", "cuda"]) is False

    def test_no_conflicts_when_single_group(self) -> None:
        data = {"tool": {"uv": {"conflicts": [[{"extra": "cpu"}]]}}}
        assert _is_mutually_exclusive(data, ["cpu"]) is False

    def test_not_mutually_exclusive_different_groups(self) -> None:
        data = {
            "tool": {
                "uv": {
                    "conflicts": [
                        [{"extra": "cpu"}, {"extra": "cuda"}],
                        [{"extra": "test"}, {"extra": "lint"}],
                    ]
                }
            }
        }
        assert _is_mutually_exclusive(data, ["cpu", "lint"]) is False


class TestCheckSelfDuplicates:
    def test_no_duplicates(self, tmp_path: Path) -> None:
        toml = tmp_path / "pyproject.toml"
        toml.write_text("""[project]
dependencies = ["numpy==1.0.0", "pandas==2.0.0"]
""")
        issues = check_self_duplicates(toml)
        assert issues == []

    def test_detects_version_mismatch(self, tmp_path: Path) -> None:
        toml = tmp_path / "pyproject.toml"
        toml.write_text("""[project]
dependencies = ["httpx>=0.28"]

[project.optional-dependencies]
dev = ["httpx==0.28.1"]
""")
        issues = check_self_duplicates(toml)
        assert len(issues) == 1
        assert issues[0].kind == "SELF_DUPLICATE_MISMATCH"
        assert "httpx" in issues[0].message
        assert "VERSION" not in issues[0].message

    def test_detects_same_version(self, tmp_path: Path) -> None:
        toml = tmp_path / "pyproject.toml"
        toml.write_text("""[project]
optional-dependencies = {dev = ["pytest==8.0.0"], test = ["pytest==8.0.0"]}
""")
        issues = check_self_duplicates(toml)
        assert len(issues) == 1
        assert issues[0].kind == "SELF_DUPLICATE_SAME"

    def test_skips_mutually_exclusive_extras(self, tmp_path: Path) -> None:
        toml = tmp_path / "pyproject.toml"
        toml.write_text("""[project]
optional-dependencies = {cpu = ["torch==2.0"], cuda = ["torch==2.0"]}

[tool.uv]
conflicts = [[{extra = "cpu"}, {extra = "cuda"}]]
""")
        issues = check_self_duplicates(toml)
        assert issues == []

    def test_skips_builtin_excludes(self, tmp_path: Path) -> None:
        toml = tmp_path / "pyproject.toml"
        toml.write_text("""[project]
dependencies = ["setuptools==80.0"]

[project.optional-dependencies]
dev = ["setuptools==80.0"]
""")
        issues = check_self_duplicates(toml)
        assert issues == []

    def test_detects_deps_and_optional_same_version(self, tmp_path: Path) -> None:
        toml = tmp_path / "pyproject.toml"
        toml.write_text("""[project]
dependencies = ["numpy==1.0.0"]

[project.optional-dependencies]
dev = ["numpy==1.0.0"]
""")
        issues = check_self_duplicates(toml)
        assert len(issues) == 1
        assert issues[0].kind == "SELF_DUPLICATE_SAME"

    def test_deps_vs_optional_different_versions(self, tmp_path: Path) -> None:
        toml = tmp_path / "pyproject.toml"
        toml.write_text("""[project]
dependencies = ["pydantic>=2.0"]

[project.optional-dependencies]
dev = ["pydantic==2.13.4"]
""")
        issues = check_self_duplicates(toml)
        assert len(issues) == 1
        assert issues[0].kind == "SELF_DUPLICATE_MISMATCH"


class TestCheckRedundant:
    def test_no_redundancy(self, tmp_path: Path) -> None:
        root = tmp_path / "root"
        root.mkdir()
        (root / "pyproject.toml").write_text("""[project]
dependencies = ["unique-pkg==1.0.0"]
""")
        member = tmp_path / "member"
        member.mkdir()
        (member / "pyproject.toml").write_text("""[project]
dependencies = ["other-pkg==2.0.0"]
""")
        issues = check_redundant(root, {"member": member}, set())
        assert issues == []

    def test_detects_redundancy(self, tmp_path: Path) -> None:
        root = tmp_path / "root"
        root.mkdir()
        (root / "pyproject.toml").write_text("""[project]
dependencies = ["shared-pkg==1.0.0"]
""")
        member = tmp_path / "member"
        member.mkdir()
        (member / "pyproject.toml").write_text("""[project]
dependencies = ["shared-pkg==1.0.0"]
""")
        issues = check_redundant(root, {"member": member}, set())
        assert len(issues) == 1
        assert issues[0].kind == "REDUNDANT"
        assert "shared-pkg" in issues[0].message

    def test_respects_excludes(self, tmp_path: Path) -> None:
        root = tmp_path / "root"
        root.mkdir()
        (root / "pyproject.toml").write_text("""[project]
dependencies = ["tqdm==4.0.0"]
""")
        member = tmp_path / "member"
        member.mkdir()
        (member / "pyproject.toml").write_text("""[project]
dependencies = ["tqdm==4.0.0"]
""")
        issues = check_redundant(root, {"member": member}, {"tqdm"})
        assert issues == []

    def test_skips_workspace_member_name(self, tmp_path: Path) -> None:
        root = tmp_path / "root"
        root.mkdir()
        (root / "pyproject.toml").write_text("""[project]
dependencies = []
""")
        member = tmp_path / "member"
        member.mkdir()
        (member / "pyproject.toml").write_text("""[project]
dependencies = ["member==1.0.0"]
""")
        issues = check_redundant(root, {"member": member}, set())
        assert issues == []

    def test_skips_builtin_excludes(self, tmp_path: Path) -> None:
        root = tmp_path / "root"
        root.mkdir()
        (root / "pyproject.toml").write_text("""[project]
dependencies = ["setuptools==80.0"]
""")
        member = tmp_path / "member"
        member.mkdir()
        (member / "pyproject.toml").write_text("""[project]
dependencies = ["setuptools==80.0"]
""")
        issues = check_redundant(root, {"member": member}, set())
        assert issues == []

    def test_only_checks_runtime_deps(self, tmp_path: Path) -> None:
        root = tmp_path / "root"
        root.mkdir()
        (root / "pyproject.toml").write_text("""[project]
dependencies = []

[project.optional-dependencies]
dev = ["pytest==8.0.0"]
""")
        member = tmp_path / "member"
        member.mkdir()
        (member / "pyproject.toml").write_text("""[project]
dependencies = ["pytest==8.0.0"]
""")
        issues = check_redundant(root, {"member": member}, set())
        assert issues == []


class TestFindWorkspaceRoot:
    def test_finds_root_with_sources(self, tmp_path: Path) -> None:
        root = tmp_path / "workspace"
        root.mkdir()
        (root / "pyproject.toml").write_text("""[project]
name = "workspace"

[tool.uv.sources]
member = { path = "packages/member", editable = true }
""")
        member_dir = root / "packages" / "member"
        member_dir.mkdir(parents=True)
        (member_dir / "pyproject.toml").write_text("""[project]
name = "member"
""")
        with patch(
            "ci.check_duplicate_dependencies.Path.cwd",
            return_value=member_dir,
        ):
            found = find_workspace_root()
        assert found == root


class TestMain:
    def test_returns_zero_when_clean(self, tmp_path: Path) -> None:
        root = tmp_path / "clean"
        root.mkdir()
        (root / "pyproject.toml").write_text("""[project]
dependencies = ["unique-pkg==1.0.0"]

[tool.uv.sources]
member = { path = "member", editable = true }
""")
        member = root / "member"
        member.mkdir()
        (member / "pyproject.toml").write_text("""[project]
dependencies = ["other-pkg==2.0.0"]
""")
        with (
            patch(
                "ci.check_duplicate_dependencies.Path.cwd",
                return_value=root,
            ),
            patch("sys.argv", ["check_duplicate_dependencies.py"]),
        ):
            result = main()
        assert result == 0

    def test_returns_one_for_version_mismatch(self, tmp_path: Path) -> None:
        root = tmp_path / "dirty"
        root.mkdir()
        (root / "pyproject.toml").write_text("""[project]
dependencies = ["pkg-a==1.0.0"]

[project.optional-dependencies]
dev = ["pkg-a==2.0.0"]

[tool.uv.sources]
member = { path = "member", editable = true }
""")
        member = root / "member"
        member.mkdir()
        (member / "pyproject.toml").write_text("""[project]
dependencies = ["other-pkg==2.0.0"]
""")
        with (
            patch(
                "ci.check_duplicate_dependencies.Path.cwd",
                return_value=root,
            ),
            patch("sys.argv", ["check_duplicate_dependencies.py"]),
        ):
            result = main()
        assert result == 1

    def test_json_output(self, tmp_path: Path) -> None:
        root = tmp_path / "jsonroot"
        root.mkdir()
        (root / "pyproject.toml").write_text("""[project]
dependencies = ["numpy==1.0.0"]

[project.optional-dependencies]
dev = ["numpy==2.0.0"]

[tool.uv.sources]
member = { path = "member", editable = true }
""")
        member = root / "member"
        member.mkdir()
        (member / "pyproject.toml").write_text("""[project]
dependencies = []
""")
        with (
            patch(
                "ci.check_duplicate_dependencies.Path.cwd",
                return_value=root,
            ),
            patch(
                "sys.argv",
                ["check_duplicate_dependencies.py", "--json"],
            ),
            patch("sys.stdout") as mock_stdout,
        ):
            result = main()
        assert result == 1
        write_calls = mock_stdout.write.call_args_list
        payload = "".join(c[0][0] for c in write_calls)
        output = json.loads(payload)
        assert len(output) >= 1
        assert any(i["kind"] == "SELF_DUPLICATE_MISMATCH" for i in output)


class TestConstants:
    def test_min_duplicate_entries_is_two(self) -> None:
        expected = 2
        assert expected == _MIN_DUPLICATE_ENTRIES

    def test_builtin_excludes_contains_setuptools(self) -> None:
        assert "setuptools" in BUILTIN_EXCLUDES
        assert "python" in BUILTIN_EXCLUDES
        assert "wheel" in BUILTIN_EXCLUDES
