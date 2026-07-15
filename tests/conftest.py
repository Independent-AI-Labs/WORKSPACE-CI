"""Pytest configuration: make lib/ flat-import modules discoverable.

The lib/ directory has no __init__.py and modules use flat imports
(e.g. `from check_silent_swallow_base import AddedLine`). Adding lib/
to sys.path here lets unit tests import those modules in-process,
eliminating the per-test subprocess spawn that the shell-based pipe
tests required.
"""

import os
import sys
from pathlib import Path

import pytest

_TESTS_DIR = Path(__file__).resolve().parent
_PROJECT_DIR = _TESTS_DIR.parent
_LIB_DIR = _PROJECT_DIR / "lib"
if str(_LIB_DIR) not in sys.path:
    sys.path.insert(0, str(_LIB_DIR))


@pytest.fixture(autouse=True)
def _default_ci_path_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Mirror lib/ci.sh source-time env for path resolution tests."""
    if not os.environ.get("CI_CONFIG_DIR"):
        monkeypatch.setenv("CI_CONFIG_DIR", str(_PROJECT_DIR / "config"))
    if not os.environ.get("CI_PROJECT_ROOT"):
        monkeypatch.setenv("CI_PROJECT_ROOT", str(_PROJECT_DIR))
    if not os.environ.get("CI_LIB_DIR"):
        monkeypatch.setenv("CI_LIB_DIR", str(_LIB_DIR))