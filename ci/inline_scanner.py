"""Thin client for the WORKSPACE-GUARD inline scanner."""

from __future__ import annotations

import errno
import json
import os
import stat
import subprocess
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import TypedDict, cast

# HG-13: a capability-less copy of the guard binary outside the 0700 sealed
# guard root. It reads request paths with the caller's own DAC only.
SCANNER = Path("/usr/lib/workspace-guard/inline-scan")
SCHEMA = 1
VIEWS_SCHEMA = 2
SCANNER_MODE = 0o755
CAPABILITY_XATTR = "security.capability"
# The filesystem holds no xattr for the file, or cannot hold one at all.
_NO_XATTR_ERRNOS = frozenset({errno.ENODATA, errno.ENOTSUP})


class ScannerError(Exception):
    """The scanner is missing, unverifiable, or returned an invalid result."""


class ScanView(TypedDict):
    name: str
    text: str
    offsets: list[int]


class FileViews(TypedDict):
    path: str
    views: list[ScanView]


class ScanFinding(TypedDict, total=False):
    path: str
    rule: str
    category: str
    reason: str
    line: int
    column: int
    matched: str
    view: str
    exemptible: bool


def _mode(path: Path) -> int:
    return stat.S_IMODE(os.stat(path).st_mode)


def _has_file_capabilities(path: Path) -> bool:
    try:
        os.getxattr(path, CAPABILITY_XATTR, follow_symlinks=False)
    except OSError as exc:
        if exc.errno in _NO_XATTR_ERRNOS:
            return False
        msg = f"cannot read file capabilities of {path}: {exc}"
        raise ScannerError(msg) from exc
    return True


def _verify_parents(path: Path, root_uid: int, stop: Path) -> None:
    """Every parent up to and including ``stop`` is root-owned and not
    group or other writable, so no one else can swap the scanner."""
    directory = path.parent
    while True:
        try:
            metadata = os.lstat(directory)
        except OSError as exc:
            msg = f"inline scanner parent unavailable: {directory}: {exc}"
            raise ScannerError(msg) from exc
        if not stat.S_ISDIR(metadata.st_mode):
            msg = f"inline scanner parent is not a directory: {directory}"
            raise ScannerError(msg)
        if metadata.st_uid != root_uid:
            msg = f"inline scanner parent is not root-owned: {directory}"
            raise ScannerError(msg)
        if stat.S_IMODE(metadata.st_mode) & 0o022:
            msg = f"inline scanner parent is group or other writable: {directory}"
            raise ScannerError(msg)
        if directory in (stop, directory.parent):
            return
        directory = directory.parent


def verify_scanner(
    scanner: Path | None = None,
    *,
    root_uid: int = 0,
    stop: Path = Path("/"),
) -> None:
    path = SCANNER if scanner is None else scanner
    try:
        metadata = os.lstat(path)
    except OSError as exc:
        msg = f"inline scanner unavailable: {path}: {exc}"
        raise ScannerError(msg) from exc
    if not stat.S_ISREG(metadata.st_mode):
        msg = f"inline scanner is not a regular file: {path}"
        raise ScannerError(msg)
    if metadata.st_uid != root_uid:
        msg = f"inline scanner is not root-owned: {path}"
        raise ScannerError(msg)
    if _mode(path) != SCANNER_MODE:
        msg = f"inline scanner mode is not 0755: {path}"
        raise ScannerError(msg)
    if _has_file_capabilities(path):
        msg = f"inline scanner carries file capabilities: {path}"
        raise ScannerError(msg)
    _verify_parents(path, root_uid, stop)


def _request(payload: Mapping[str, object], schema: int) -> Mapping[str, object]:
    verify_scanner()
    try:
        completed = subprocess.run(
            [str(SCANNER)],
            input=json.dumps(payload),
            text=True,
            capture_output=True,
            check=True,
        )
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or exc.stdout or "").strip()
        msg = f"inline scanner failed ({exc.returncode}): {detail}"
        raise ScannerError(msg) from exc
    except OSError as exc:
        msg = f"inline scanner failed to start: {exc}"
        raise ScannerError(msg) from exc
    try:
        response = json.loads(completed.stdout)
    except json.JSONDecodeError as exc:
        msg = f"inline scanner returned invalid JSON: {exc}"
        raise ScannerError(msg) from exc
    if not isinstance(response, dict) or response.get("schema") != schema:
        msg = "inline scanner returned an incompatible schema"
        raise ScannerError(msg)
    return cast("Mapping[str, object]", response)


def scan(entries: Sequence[Mapping[str, str]]) -> list[ScanFinding]:
    response = _request({"schema": SCHEMA, "files": list(entries)}, SCHEMA)
    findings = response.get("findings")
    if not isinstance(findings, list):
        msg = "inline scanner response has no findings list"
        raise ScannerError(msg)
    return cast("list[ScanFinding]", findings)


def scan_views(
    entries: Sequence[Mapping[str, str]],
    decode_depth: int,
) -> list[FileViews]:
    response = _request(
        {
            "schema": VIEWS_SCHEMA,
            "files": list(entries),
            "decode_depth": decode_depth,
        },
        VIEWS_SCHEMA,
    )
    files = response.get("files")
    if not isinstance(files, list):
        msg = "inline scanner response has no views list"
        raise ScannerError(msg)
    return cast("list[FileViews]", files)
