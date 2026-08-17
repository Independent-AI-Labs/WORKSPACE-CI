"""Minimal Linux renameat2(RENAME_EXCHANGE) wrapper."""

from __future__ import annotations

import argparse
import ctypes
import os
from pathlib import Path

AT_FDCWD = -100
RENAME_EXCHANGE = 2
INVALID_PATH = "expected an existing absolute real directory"
FILESYSTEM_MISMATCH = "exchange paths must share a parent and filesystem"


def exchange(left: Path, right: Path) -> None:
    """Atomically exchange two existing paths on one filesystem."""
    for path in (left, right):
        if not path.is_absolute() or path.is_symlink() or not path.is_dir():
            raise ValueError(INVALID_PATH)
    if left.parent != right.parent or left.stat().st_dev != right.stat().st_dev:
        raise ValueError(FILESYSTEM_MISMATCH)

    libc = ctypes.CDLL(None, use_errno=True)
    renameat2 = libc.renameat2
    renameat2.argtypes = [
        ctypes.c_int,
        ctypes.c_char_p,
        ctypes.c_int,
        ctypes.c_char_p,
        ctypes.c_uint,
    ]
    renameat2.restype = ctypes.c_int
    result = renameat2(
        AT_FDCWD,
        os.fsencode(left),
        AT_FDCWD,
        os.fsencode(right),
        RENAME_EXCHANGE,
    )
    if result:
        error = ctypes.get_errno()
        raise OSError(error, os.strerror(error), f"{left} <-> {right}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("left", type=Path)
    parser.add_argument("right", type=Path)
    arguments = parser.parse_args()
    exchange(arguments.left, arguments.right)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
