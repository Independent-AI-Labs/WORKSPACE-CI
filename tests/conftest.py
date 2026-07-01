"""Pytest configuration: make lib/ flat-import modules discoverable.

The lib/ directory has no __init__.py and modules use flat imports
(e.g. `from check_silent_swallow_base import AddedLine`). Adding lib/
to sys.path here lets unit tests import those modules in-process,
eliminating the per-test subprocess spawn that the shell-based pipe
tests required.
"""

import sys
from pathlib import Path

_TESTS_DIR = Path(__file__).resolve().parent
_PROJECT_DIR = _TESTS_DIR.parent
_LIB_DIR = _PROJECT_DIR / "lib"
if str(_LIB_DIR) not in sys.path:
    sys.path.insert(0, str(_LIB_DIR))
