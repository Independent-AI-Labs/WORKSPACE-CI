#!/usr/bin/env python3
"""Print the resolved filesystem path for a CI config YAML stem.

Used by ci_config_path() in lib/ci_config_paths.sh. Reads the same env
vars propagated by lib/ci.sh and ci_run_python_checker.

Usage:
    resolve_config_path.py <stem> [consumer_path]

Prints the resolved path to stdout. Exits 0 on success, 1 on resolver
failure, 2 on usage error.
"""

from __future__ import annotations

import sys
from pathlib import Path

from ci.paths import resolve_config_path

_MIN_ARGS = 2
_CONSUMER_ARG_INDEX = 2
_EXIT_USAGE = 2


def main() -> int:
    if len(sys.argv) < _MIN_ARGS:
        print("usage: resolve_config_path.py <stem> [consumer_path]", file=sys.stderr)
        return _EXIT_USAGE

    stem = sys.argv[1]
    consumer = (
        sys.argv[_CONSUMER_ARG_INDEX]
        if len(sys.argv) > _CONSUMER_ARG_INDEX and sys.argv[_CONSUMER_ARG_INDEX]
        else None
    )
    consumer_path = Path(consumer) if consumer else None

    try:
        path = resolve_config_path(stem, consumer_path=consumer_path, required=False)
    except (FileNotFoundError, TypeError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        return 1

    print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
