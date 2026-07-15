"""Unit tests for ci.paths module: shared path resolution."""

from __future__ import annotations

from pathlib import Path

import ci.paths as ci_paths
import pytest
import yaml


@pytest.fixture(autouse=True)
def _clear_override_cache() -> None:
    ci_paths.clear_config_override_cache()
    yield
    ci_paths.clear_config_override_cache()


class TestFindConfigDir:
    def test_returns_absolute_path(self) -> None:
        result = ci_paths.find_config_dir()
        assert result.is_absolute()

    def test_result_is_existing_directory(self) -> None:
        result = ci_paths.find_config_dir()
        assert result.is_dir()

    def test_env_var_override(
        self,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        monkeypatch.setenv("CI_CONFIG_DIR", str(tmp_path))
        result = ci_paths.find_config_dir()
        assert result == tmp_path.resolve()

    def test_workspace_ci_config_root_alias(
        self,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        monkeypatch.delenv("CI_CONFIG_DIR", raising=False)
        monkeypatch.setenv("WORKSPACE_CI_CONFIG_ROOT", str(tmp_path))
        result = ci_paths.find_config_dir()
        assert result == tmp_path.resolve()

    def test_raises_when_env_unset(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("CI_CONFIG_DIR", raising=False)
        monkeypatch.delenv("WORKSPACE_CI_CONFIG_ROOT", raising=False)
        with pytest.raises(FileNotFoundError, match="CI_CONFIG_DIR"):
            ci_paths.find_config_dir()

    def test_config_dir_contains_yaml_files(self) -> None:
        result = ci_paths.find_config_dir()
        yaml_files = list(result.glob("*.yaml"))
        assert len(yaml_files) > 0


class TestResolveConfigPath:
    def test_env_override_wins_over_manifest(
        self,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        manifest = tmp_path / "overrides.yaml"
        custom = tmp_path / "custom.yaml"
        custom.write_text("version: 1\n", encoding="utf-8")
        manifest.write_text(
            yaml.safe_dump({"banned_words": str(tmp_path / "manifest.yaml")}),
            encoding="utf-8",
        )
        (tmp_path / "manifest.yaml").write_text("version: 1\n", encoding="utf-8")
        monkeypatch.setenv("CI_CONFIG_OVERRIDES", str(manifest))
        monkeypatch.setenv("CI_CONFIG_PATH_BANNED_WORDS", str(custom))

        result = ci_paths.resolve_config_path("banned_words")
        assert result == custom.resolve()

    def test_manifest_override_wins_over_config_dir(
        self,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        config_dir = tmp_path / "config"
        config_dir.mkdir()
        manifest_path = tmp_path / "overrides.yaml"
        override_file = tmp_path / "override.yaml"
        override_file.write_text("version: 1\n", encoding="utf-8")
        manifest_path.write_text(
            yaml.safe_dump({"banned_words": "override.yaml"}),
            encoding="utf-8",
        )
        (config_dir / "banned_words.yaml").write_text("version: 0\n", encoding="utf-8")
        monkeypatch.setenv("CI_CONFIG_DIR", str(config_dir))
        monkeypatch.setenv("CI_CONFIG_OVERRIDES", str(manifest_path))

        result = ci_paths.resolve_config_path("banned_words")
        assert result == override_file.resolve()

    def test_consumer_path_used_when_default_missing(
        self,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        config_dir = tmp_path / "config"
        config_dir.mkdir()
        consumer = tmp_path / "local.yaml"
        consumer.write_text("version: 1\n", encoding="utf-8")
        monkeypatch.setenv("CI_CONFIG_DIR", str(config_dir))
        monkeypatch.chdir(tmp_path)

        result = ci_paths.resolve_config_path(
            "dead_code",
            consumer_path=Path("local.yaml"),
        )
        assert result == consumer.resolve()

    def test_required_false_returns_missing_default(
        self,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        config_dir = tmp_path / "config"
        config_dir.mkdir()
        monkeypatch.setenv("CI_CONFIG_DIR", str(config_dir))

        result = ci_paths.resolve_config_path("missing_config", required=False)
        assert result == (config_dir / "missing_config.yaml").resolve()

    def test_guard_namespace_isolated(
        self,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        guard_file = tmp_path / "guard_custom.yaml"
        guard_file.write_text("version: 1\n", encoding="utf-8")
        monkeypatch.setenv("CI_GUARD_CONFIG_PATH_GUARD_CUSTOM", str(guard_file))

        result = ci_paths.resolve_guard_config_path("guard_custom", required=False)
        assert result == guard_file.resolve()


class TestFindLibDir:
    def test_returns_absolute_path(self) -> None:
        result = ci_paths.find_lib_dir()
        assert result.is_absolute()
        assert result.is_dir()

    def test_env_var_override(
        self,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        monkeypatch.setenv("CI_LIB_DIR", str(tmp_path))
        result = ci_paths.find_lib_dir()
        assert result == tmp_path.resolve()

    def test_contains_resolver_script(self) -> None:
        result = ci_paths.find_lib_dir()
        assert (result / "resolve_config_path.py").is_file()
        assert (result.parent / "ci" / "paths.py").is_file()


class TestFindProjectRoot:
    def test_returns_absolute_path(self) -> None:
        result = ci_paths.find_project_root()
        assert result.is_absolute()
        assert result.is_dir()

    def test_env_var_override(
        self,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
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

    def test_env_var_override(
        self,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        monkeypatch.setenv("CI_WEB_DATA_DIR", str(tmp_path))
        result = ci_paths.find_web_data_dir()
        assert result == tmp_path.resolve()


class TestNormalizeConfigStem:
    def test_strips_yaml_suffix(self) -> None:
        assert ci_paths.normalize_config_stem("banned_words.yaml") == "banned_words"

    def test_strips_yml_suffix(self) -> None:
        assert ci_paths.normalize_config_stem("foo.yml") == "foo"


class TestConfigPathEnvVar:
    def test_ci_prefix(self) -> None:
        assert ci_paths.config_path_env_var("banned-words") == "CI_CONFIG_PATH_BANNED_WORDS"

    def test_guard_prefix(self) -> None:
        assert (
            ci_paths.config_path_env_var("guard-custom", guard=True)
            == "CI_GUARD_CONFIG_PATH_GUARD_CUSTOM"
        )


class TestFindGuardConfigDir:
    def test_env_override(
        self,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        monkeypatch.setenv("CI_GUARD_CONFIG_DIR", str(tmp_path))
        assert ci_paths.find_guard_config_dir() == tmp_path.resolve()

    def test_raises_when_unset(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("CI_GUARD_CONFIG_DIR", raising=False)
        monkeypatch.delenv("WORKSPACE_GUARD_CONFIG_ROOT", raising=False)
        with pytest.raises(FileNotFoundError, match="CI_GUARD_CONFIG_DIR"):
            ci_paths.find_guard_config_dir()


class TestFindProjectRootFallback:
    def test_derives_from_config_dir(
        self,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        config_dir = tmp_path / "config"
        config_dir.mkdir()
        monkeypatch.delenv("CI_PROJECT_ROOT", raising=False)
        monkeypatch.setenv("CI_CONFIG_DIR", str(config_dir))
        assert ci_paths.find_project_root() == tmp_path.resolve()


class TestLoadYamlConfig:
    def test_loads_existing_config(
        self,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        config_dir = tmp_path / "config"
        config_dir.mkdir()
        config_file = config_dir / "sample.yaml"
        config_file.write_text("version: 2\n", encoding="utf-8")
        monkeypatch.setenv("CI_CONFIG_DIR", str(config_dir))

        data = ci_paths.load_yaml_config("sample")
        assert data == {"version": 2}

    def test_returns_none_when_optional_missing(
        self,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        config_dir = tmp_path / "config"
        config_dir.mkdir()
        monkeypatch.setenv("CI_CONFIG_DIR", str(config_dir))

        data = ci_paths.load_yaml_config("missing", required=False)
        assert data is None


class TestResolveGuardConfigPath:
    def test_raises_when_required_and_missing(
        self,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        monkeypatch.setenv("CI_GUARD_CONFIG_DIR", str(tmp_path))
        with pytest.raises(FileNotFoundError, match="Guard config not found"):
            ci_paths.resolve_guard_config_path("missing_guard_cfg")


class TestManifestErrors:
    def test_invalid_manifest_type(
        self,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        manifest = tmp_path / "bad.yaml"
        manifest.write_text("- not-a-mapping\n", encoding="utf-8")
        monkeypatch.setenv("CI_CONFIG_OVERRIDES", str(manifest))
        with pytest.raises(TypeError, match="must be a mapping"):
            ci_paths.resolve_config_path("banned_words")

    def test_missing_manifest_file(
        self,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        monkeypatch.setenv("CI_CONFIG_OVERRIDES", str(tmp_path / "nope.yaml"))
        with pytest.raises(FileNotFoundError, match="manifest not found"):
            ci_paths.resolve_config_path("banned_words")