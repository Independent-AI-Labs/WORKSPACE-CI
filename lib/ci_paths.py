"""Shared path resolution for CI Python checkers.

This module is the SINGLE source of truth for locating CI config, lib,
and project directories from Python checker scripts. It eliminates
CWD-dependent relative-path bugs by resolving paths from ``__file__``.

Usage::

    from ci_paths import find_config_dir

    config_dir = find_config_dir()
    config_path = config_dir / "silent_swallow_patterns.yaml"

Resolution order:
  1. Environment variable override (``CI_CONFIG_DIR``, absolute path).
  2. Walk up from this file's location to find a ``config/`` directory.

The walk-up ensures the correct path is found regardless of the
process's current working directory (CWD). This is critical because
hooks in sibling repos (e.g. WORKSPACE-GUARD) ``cd`` to their own
root before invoking CI checkers.
"""

from __future__ import annotations

import os
from pathlib import Path

_THIS_FILE = Path(__file__).resolve()

_MAX_WALK_UP = 10


def find_config_dir() -> Path:
    """Return the absolute path to the CI config directory.

    Resolution order:
      1. ``CI_CONFIG_DIR`` environment variable (if set, must be absolute
         or resolved relative to CWD, but callers in ci.sh always set
         it to an absolute path).
      2. Walk up from this file's location (``lib/ci_paths.py``) to find
         a parent containing ``config/``.

    Raises:
        FileNotFoundError: If no ``config/`` directory can be found.
    """
    env = os.environ.get("CI_CONFIG_DIR")
    if env:
        return Path(env).resolve()
    candidate = _THIS_FILE.parent
    for _ in range(_MAX_WALK_UP):
        if (candidate / "config").is_dir():
            return candidate / "config"
        candidate = candidate.parent
    msg = "Cannot find CI config directory (walked up from lib/ci_paths.py)"
    raise FileNotFoundError(msg)


def find_lib_dir() -> Path:
    """Return the absolute path to the CI lib directory.

    Resolution order:
      1. ``CI_LIB_DIR`` environment variable (if set).
      2. The directory containing this file (``lib/``).
    """
    env = os.environ.get("CI_LIB_DIR")
    if env:
        return Path(env).resolve()
    return _THIS_FILE.parent


def find_project_root() -> Path:
    """Return the absolute path to the CI project root.

    Resolution order:
      1. ``CI_PROJECT_ROOT`` environment variable (if set).
      2. The parent of the ``lib/`` directory.
    """
    env = os.environ.get("CI_PROJECT_ROOT")
    if env:
        return Path(env).resolve()
    return find_lib_dir().parent


def find_web_data_dir() -> Path:
    """Return the absolute path to the web data output directory.

    Resolution order:
      1. ``CI_WEB_DATA_DIR`` environment variable (if set).
      2. ``<project_root>/web/src/data``.
    """
    env = os.environ.get("CI_WEB_DATA_DIR")
    if env:
        return Path(env).resolve()
    return find_project_root() / "web" / "src" / "data"
