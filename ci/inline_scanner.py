"""Thin client for the sealed WORKSPACE-GUARD inline scanner."""

from __future__ import annotations

import json
import os
import stat
import subprocess
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import TypedDict, cast

SCANNER = Path("/usr/lib/workspace-guard/sealed/inline-scan")
SEALED_ROOT = Path("/usr/lib/workspace-guard/sealed")
SCHEMA = 1
VIEWS_SCHEMA = 2
SCANNER_MODE = 0o755
SEALED_ROOT_MODE = 0o711


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


def verify_scanner() -> None:
    try:
        metadata = os.stat(SCANNER)
    except OSError as exc:
        msg = f"inline scanner unavailable: {SCANNER}: {exc}"
        raise ScannerError(msg) from exc
    if not stat.S_ISREG(metadata.st_mode):
        msg = f"inline scanner is not a regular file: {SCANNER}"
        raise ScannerError(msg)
    if metadata.st_uid != 0:
        msg = f"inline scanner is not root-owned: {SCANNER}"
        raise ScannerError(msg)
    if _mode(SCANNER) != SCANNER_MODE:
        msg = f"inline scanner mode is not 0755: {SCANNER}"
        raise ScannerError(msg)
    if _mode(SEALED_ROOT) != SEALED_ROOT_MODE:
        msg = f"sealed guard root mode is not 0711: {SEALED_ROOT}"
        raise ScannerError(msg)


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
