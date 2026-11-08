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
SCANNER_MODE = 0o755
SEALED_ROOT_MODE = 0o711


class ScannerError(Exception):
    """The scanner is missing, unverifiable, or returned an invalid result."""


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


def scan(entries: Sequence[Mapping[str, str]]) -> list[ScanFinding]:
    verify_scanner()
    payload = json.dumps({"schema": SCHEMA, "files": entries})
    try:
        completed = subprocess.run(
            [str(SCANNER)],
            input=payload,
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
    if not isinstance(response, dict) or response.get("schema") != SCHEMA:
        msg = "inline scanner returned an incompatible schema"
        raise ScannerError(msg)
    findings = response.get("findings")
    if not isinstance(findings, list):
        msg = "inline scanner response has no findings list"
        raise ScannerError(msg)
    return cast("list[ScanFinding]", findings)
