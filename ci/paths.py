"""Shared path resolution for CI Python checkers and scripts.

Config directory resolution uses ``CI_CONFIG_DIR`` (or wiki alias
``WORKSPACE_CI_CONFIG_ROOT``) from the environment. Callers sourcing
``lib/ci.sh`` or ``ci_run_python_checker`` always propagate these vars.
"""

from __future__ import annotations

import os
import stat
import subprocess
import sys
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

_CONFIG_PATH_ENV_PREFIX = "CI_CONFIG_PATH_"
_CONFIG_OVERRIDES_ENV = "CI_CONFIG_OVERRIDES"
_GUARD_CONFIG_PATH_ENV_PREFIX = "CI_GUARD_CONFIG_PATH_"
_GUARD_CONFIG_OVERRIDES_ENV = "CI_GUARD_CONFIG_OVERRIDES"


def normalize_config_stem(name: str) -> str:
    """Return the config stem from a filename or bare name."""
    stem = name.removesuffix(".yaml").removesuffix(".yml")
    return stem


def config_path_env_var(stem: str, *, guard: bool = False) -> str:
    """Return the per-file override env var name for a config stem."""
    normalized = normalize_config_stem(stem).upper().replace("-", "_")
    prefix = _GUARD_CONFIG_PATH_ENV_PREFIX if guard else _CONFIG_PATH_ENV_PREFIX
    return f"{prefix}{normalized}"


def _env_config_dir() -> Path | None:
    for key in ("CI_CONFIG_DIR", "WORKSPACE_CI_CONFIG_ROOT"):
        value = os.environ.get(key)
        if value:
            return Path(value).resolve()
    return None


def _env_guard_config_dir() -> Path | None:
    for key in ("CI_GUARD_CONFIG_DIR", "WORKSPACE_GUARD_CONFIG_ROOT"):
        value = os.environ.get(key)
        if value:
            return Path(value).resolve()
    return None


def find_config_dir() -> Path:
    """Return the absolute path to the CI config directory from env."""
    env_dir = _env_config_dir()
    if env_dir is not None:
        return env_dir
    msg = "CI_CONFIG_DIR or WORKSPACE_CI_CONFIG_ROOT must be set"
    raise FileNotFoundError(msg)


def find_guard_config_dir() -> Path:
    """Return the absolute path to the WORKSPACE-GUARD config directory."""
    env_dir = _env_guard_config_dir()
    if env_dir is not None:
        return env_dir
    msg = "CI_GUARD_CONFIG_DIR or WORKSPACE_GUARD_CONFIG_ROOT must be set"
    raise FileNotFoundError(msg)


def find_project_root() -> Path:
    """Return the absolute path to the CI project root from env."""
    env = os.environ.get("CI_PROJECT_ROOT")
    if env:
        return Path(env).resolve()
    config_dir = _env_config_dir()
    if config_dir is not None:
        return config_dir.parent
    msg = "CI_PROJECT_ROOT or CI_CONFIG_DIR must be set"
    raise FileNotFoundError(msg)


def find_lib_dir() -> Path:
    """Return the absolute path to the CI lib directory from env."""
    env = os.environ.get("CI_LIB_DIR")
    if env:
        return Path(env).resolve()
    return find_project_root() / "lib"


def _parse_override_manifest(
    manifest_path: Path,
    *,
    guard: bool,
) -> dict[str, Path]:
    with open(manifest_path, encoding="utf-8") as handle:
        raw: Any = yaml.safe_load(handle) or {}

    if not isinstance(raw, dict):
        msg = f"Config override manifest must be a mapping: {manifest_path}"
        raise TypeError(msg)

    entries = raw.get("overrides", raw)
    if not isinstance(entries, dict):
        msg = f"Config override manifest must contain mappings: {manifest_path}"
        raise TypeError(msg)

    base_dir = manifest_path.resolve().parent
    resolved: dict[str, Path] = {}
    for key, value in entries.items():
        if not isinstance(key, str) or not isinstance(value, str):
            continue
        stem = normalize_config_stem(key)
        candidate = Path(value)
        if not candidate.is_absolute():
            candidate = (base_dir / candidate).resolve()
        else:
            candidate = candidate.resolve()
        resolved[stem] = candidate
    return resolved


@lru_cache(maxsize=2)
def _load_override_manifest(*, guard: bool) -> dict[str, Path]:
    env_key = _GUARD_CONFIG_OVERRIDES_ENV if guard else _CONFIG_OVERRIDES_ENV
    manifest = os.environ.get(env_key)
    if not manifest:
        return {}
    manifest_path = Path(manifest).resolve()
    if not manifest_path.is_file():
        msg = f"Config override manifest not found: {manifest_path}"
        raise FileNotFoundError(msg)
    return _parse_override_manifest(manifest_path, guard=guard)


def _resolve_from_env(stem: str, *, guard: bool) -> Path | None:
    env_name = config_path_env_var(stem, guard=guard)
    value = os.environ.get(env_name)
    if not value:
        return None
    return Path(value).resolve()


def _resolve_from_manifest(stem: str, *, guard: bool) -> Path | None:
    manifest = _load_override_manifest(guard=guard)
    return manifest.get(stem)


def _resolve_from_config_dir(stem: str, *, guard: bool) -> Path:
    config_dir = find_guard_config_dir() if guard else find_config_dir()
    return config_dir / f"{stem}.yaml"


def _resolve_candidate(
    candidate: Path | None,
    *,
    required: bool,
    label: str,
) -> Path | None:
    if candidate is None:
        return None
    if candidate.is_file() or not required:
        return candidate
    msg = f"{label} not found: {candidate}"
    raise FileNotFoundError(msg)


def resolve_config_path(
    name: str,
    *,
    consumer_path: Path | str | None = None,
    required: bool = True,
) -> Path:
    """Resolve the filesystem path for a CI config file by stem."""
    stem = normalize_config_stem(name)

    env_path = _resolve_candidate(
        _resolve_from_env(stem, guard=False),
        required=required,
        label="Config",
    )
    if env_path is not None:
        return env_path

    manifest_path = _resolve_candidate(
        _resolve_from_manifest(stem, guard=False),
        required=required,
        label="Config",
    )
    if manifest_path is not None:
        return manifest_path

    default_path = _resolve_from_config_dir(stem, guard=False)
    if default_path.is_file():
        return default_path

    if consumer_path is not None:
        resolved_consumer = Path(consumer_path)
        if not resolved_consumer.is_absolute():
            resolved_consumer = (Path.cwd() / resolved_consumer).resolve()
        if resolved_consumer.is_file() or not required:
            return resolved_consumer

    if required and not default_path.is_file():
        msg = f"Config not found: {default_path}"
        raise FileNotFoundError(msg)
    return default_path


def resolve_guard_config_path(
    name: str,
    *,
    required: bool = True,
) -> Path:
    """Resolve the filesystem path for a WORKSPACE-GUARD config file."""
    stem = normalize_config_stem(name)

    env_path = _resolve_candidate(
        _resolve_from_env(stem, guard=True),
        required=required,
        label="Guard config",
    )
    if env_path is not None:
        return env_path

    manifest_path = _resolve_candidate(
        _resolve_from_manifest(stem, guard=True),
        required=required,
        label="Guard config",
    )
    if manifest_path is not None:
        return manifest_path

    default_path = _resolve_from_config_dir(stem, guard=True)
    if required and not default_path.is_file():
        msg = f"Guard config not found: {default_path}"
        raise FileNotFoundError(msg)
    return default_path


def load_yaml_config(
    name: str,
    *,
    consumer_path: Path | str | None = None,
    required: bool = True,
) -> Any:
    """Load a CI config YAML file after resolving its path."""
    path = resolve_config_path(
        name,
        consumer_path=consumer_path,
        required=required,
    )
    if not path.is_file():
        return None
    with open(path, encoding="utf-8") as handle:
        return yaml.safe_load(handle)


def find_web_data_dir() -> Path:
    """Return the absolute path to the web data output directory."""
    env = os.environ.get("CI_WEB_DATA_DIR")
    if env:
        return Path(env).resolve()
    return find_project_root() / "web" / "src" / "data"


def clear_config_override_cache() -> None:
    """Clear cached override manifests (for tests)."""
    _load_override_manifest.cache_clear()


def _has_immutable_flag(path: Path) -> bool:
    try:
        if sys.platform == "darwin":
            out = subprocess.run(
                ["stat", "-f", "%Sf", str(path)],
                capture_output=True,
                text=True,
                check=True,
            )
            return "uchg" in out.stdout
        out = subprocess.run(
            ["lsattr", "-d", str(path)],
            capture_output=True,
            text=True,
            check=True,
        )
    except (OSError, subprocess.CalledProcessError) as exc:
        print(f"ci: cannot read file flags for {path}: {exc}", file=sys.stderr)
        return False
    return "i" in out.stdout.split()[0]


def exemption_file_state(path: Path | str) -> str:
    """Return the provenance state of an exemption/config file.

    One of: ``ok``, ``missing``, ``symlink``, ``not-regular``,
    ``not-root-owned``, ``not-immutable``. Anything other than ``ok``
    means the file must NOT be honored (fail-closed).
    """
    p = Path(path)
    try:
        st = os.lstat(p)
    except FileNotFoundError:
        return "missing"
    if stat.S_ISLNK(st.st_mode):
        return "symlink"
    if not stat.S_ISREG(st.st_mode):
        return "not-regular"
    if st.st_uid != 0:
        return "not-root-owned"
    if not _has_immutable_flag(p):
        return "not-immutable"
    return "ok"


class ExemptionFileError(RuntimeError):
    """Exemption/config file failed provenance validation."""

    def __init__(self, path: Path | str, description: str, state: str) -> None:
        super().__init__(
            f"{description} not compliant: {path} (state: {state}); run lock-exemptions"
        )


def validate_exemption_file(
    path: Path | str, description: str = "exemption file"
) -> None:
    """Fail-closed provenance validation for exemption/config files.

    Raises ExemptionFileError unless the file exists, is a regular
    non-symlink file owned by uid 0, and carries the immutable flag.
    """
    state = exemption_file_state(path)
    if state == "ok":
        return
    raise ExemptionFileError(path, description, state)
