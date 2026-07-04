"""Unit tests for ci_paths module: shared path resolution.

Tests the path resolution that eliminates CWD-dependent relative-path
bugs. Proves that find_config_dir() returns the correct absolute path
regardless of the process's current working directory.

Context: The prior bug was that check_silent_swallow.py used
``Path(os.environ.get("CI_CONFIG_DIR", "config"))`` which defaulted
to a relative path. When hooks in sibling repos (WORKSPACE-GUARD)
``cd`` to their own root, the relative ``config/`` resolved to the
wrong directory, causing FileNotFoundError. ci_paths.py fixes this
by walking up from ``__file__`` to find the ``config/`` directory.
"""

from __future__ import annotations

from pathlib import Path

import pytest
import ci_paths


class TestFindConfigDir:
    """Prove find_config_dir() returns an absolute, existing config path."""

    def test_returns_absolute_path(self) -> None:
        result = ci_paths.find_config_dir()
        assert result.is_absolute()

    def test_result_is_existing_directory(self) -> None:
        result = ci_paths.find_config_dir()
        assert result.is_dir()

    def test_env_var_override(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
        monkeypatch.setenv("CI_CONFIG_DIR", str(tmp_path))
        result = ci_paths.find_config_dir()
        assert result == tmp_path.resolve()

    def test_walk_up_from_file_location(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("CI_CONFIG_DIR", raising=False)
        result = ci_paths.find_config_dir()
        assert result.is_dir()
        assert (result / "silent_swallow_patterns.yaml").is_file() or (
            result / "banned_words.yaml"
        ).is_file()

    def test_works_from_any_cwd(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("CI_CONFIG_DIR", raising=False)
        monkeypatch.chdir("/tmp")
        result = ci_paths.find_config_dir()
        assert result.is_absolute()
        assert result.is_dir()

    def test_raises_when_not_found(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
        monkeypatch.delenv("CI_CONFIG_DIR", raising=False)
        monkeypatch.setattr(ci_paths, "_THIS_FILE", tmp_path / "fake_ci_paths.py")
        with pytest.raises(FileNotFoundError):
            ci_paths.find_config_dir()

    def test_config_dir_contains_yaml_files(self) -> None:
        result = ci_paths.find_config_dir()
        yaml_files = list(result.glob("*.yaml"))
        assert len(yaml_files) > 0


class TestFindLibDir:
    def test_returns_absolute_path(self) -> None:
        result = ci_paths.find_lib_dir()
        assert result.is_absolute()
        assert result.is_dir()

    def test_env_var_override(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
        monkeypatch.setenv("CI_LIB_DIR", str(tmp_path))
        result = ci_paths.find_lib_dir()
        assert result == tmp_path.resolve()

    def test_contains_ci_paths_py(self) -> None:
        result = ci_paths.find_lib_dir()
        assert (result / "ci_paths.py").is_file()


class TestFindProjectRoot:
    def test_returns_absolute_path(self) -> None:
        result = ci_paths.find_project_root()
        assert result.is_absolute()
        assert result.is_dir()

    def test_env_var_override(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
        monkeypatch.setenv("CI_PROJECT_ROOT", str(tmp_path))
        result = ci_paths.find_project_root()
        assert result == tmp_path.resolve()

    def test_contains_lib_and_config(self) -> None:
        result = ci_paths.find_project_root()
        assert (result / "lib").is_dir()
        assert (result / "config").is_dir()


class TestFindWebDataDir:
    def test_returns_absolute_path(self) -> None:
        result = ci_paths.find_web_data_dir()
        assert result.is_absolute()

    def test_env_var_override(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
        monkeypatch.setenv("CI_WEB_DATA_DIR", str(tmp_path))
        result = ci_paths.find_web_data_dir()
        assert result == tmp_path.resolve()
