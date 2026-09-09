"""Tracked-file discovery for the banned-pattern scanner.

REQ-BANNED-PATTERN-MATCHING §13: Git file discovery MUST use
NUL-delimited output so spaces, tabs, and newlines in valid filenames
never split file records.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


def scan_root() -> Path:
    """Repository root to scan (CI_SCAN_ROOT when set by sibling hooks)."""
    raw = os.environ.get("CI_SCAN_ROOT", "").strip()
    return Path(raw) if raw else Path.cwd()


def project_exception_file(config_dir: Path, root: Path) -> Path | None:
    """The one project-exceptions file to load: repo config wins.

    When CI_CONFIG_DIR points at the sealed artifact config and the repo
    also carries its own banned_words_exceptions_v5.yaml, the consumer
    file wins and the sealed default is not loaded (loading both would
    double every entry).
    """
    for candidate in (
        root / "config" / "banned_words_exceptions_v5.yaml",
        config_dir / "banned_words_exceptions_v5.yaml",
    ):
        if candidate.is_file():
            return candidate
    return None


def tracked_files(argv_files: list[str], root: Path) -> list[str]:
    """File list from argv (hook contract) or NUL-delimited git ls-files."""
    if argv_files:
        return argv_files
    cmd = [
        "git",
        "-C",
        str(root),
        "ls-files",
        "-z",
        "--cached",
        "--others",
        "--exclude-standard",
    ]
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            check=True,
            timeout=120,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        print(f"banned-words: git ls-files failed: {exc}", file=sys.stderr)
        _msg = 1
        raise SystemExit(_msg) from exc
    if proc.stderr:
        sys.stderr.write(f"git ls-files: {proc.stderr.decode(errors='replace')}")
    return [
        p.decode("utf-8", errors="surrogateescape")
        for p in proc.stdout.split(b"\0")
        if p
    ]
