"""Models, constants, and helpers for the boot-layout audit.

Extracted from check_boot_venv_layout.py to keep that module under the
512-line file-length limit. Provides pydantic schema models, path
resolution helpers, inherit-owner derivation, pre-commit --project
ref scanner, and the YAML loader.
"""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, ConfigDict, Field

EXIT_OK = 0
EXIT_INFRA_ERROR = 2

GREEN = "\033[92m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
DIM = "\033[2m"
RESET = "\033[0m"


# ---------------------------------------------------------------------------
# Schema (SPEC §4.1)
# ---------------------------------------------------------------------------


class BootLayout(BaseModel):
    """Parsed ``config/boot_layout.yaml``."""

    model_config = ConfigDict(extra="ignore")
    version: int = 1
    boot_dir: str | None = None
    venv_dir: str | None = None
    inherit: list[str] = Field(default_factory=list)
    comment: str | None = None


class MoonProject(BaseModel):
    """Subset of ``moon.yml::project`` relevant to boot-layout consistency."""

    model_config = ConfigDict(extra="allow")
    name: str | None = None
    description: str | None = None
    bootDir: str | None = None
    parentBoot: list[str] = Field(default_factory=list)


class MoonYml(BaseModel):
    """Subset of ``moon.yml`` relevant to boot-layout consistency."""

    model_config = ConfigDict(extra="allow")
    project: MoonProject | None = None
    dependsOn: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Output helpers (match check_required_hooks_present.py style)
# ---------------------------------------------------------------------------


def emit(level: str, msg: str) -> None:
    color = {"OK": GREEN, "WARN": YELLOW, "INFO": CYAN}.get(level, DIM)
    print(f"{color}{level:<5}{RESET}  {msg}")


def emit_summary(n_ok: int, n_warn: int, n_info: int) -> None:
    print(
        f"\nboot-layout: {GREEN}{n_ok} ok{RESET}, "
        f"{YELLOW}{n_warn} warning{('s' if n_warn != 1 else '')}{RESET}, "
        f"{CYAN}{n_info} info{RESET}"
    )


# ---------------------------------------------------------------------------
# Path helpers
# ---------------------------------------------------------------------------


def resolve_rel(start: Path, rel: str) -> Path:
    """Resolve a path that may be relative to <start>, absolute, or ~-prefixed."""
    s = rel.strip()
    if not s:
        return start
    if s.startswith("~"):
        p = Path(s).expanduser()
    elif s.startswith("/"):
        p = Path(s)
    else:
        p = start / s
    return p.resolve(strict=False)


def normalize_boot_dir(s: str | None) -> str | None:
    """Strip leading ``./`` and trailing ``/`` from a boot_dir string."""
    if s is None:
        return None
    s = s.strip()
    if not s:
        return None
    s = s.removeprefix("./").rstrip("/")
    return s or None


def is_world_writable(p: Path) -> bool:
    """Return True if path's directory's mode has the world-write bit set."""
    try:
        st = os.stat(p)
    except OSError:
        return False
    return bool(st.st_mode & 0o002)


# ---------------------------------------------------------------------------
# Inherit-owner derivation (SPEC §8.2)
# ---------------------------------------------------------------------------


_INHERIT_OWNER_RE = re.compile(r"(?:^|/)(WORKSPACE-([A-Z0-9_-]+))/")


def derive_moon_id_from_inherit(entry: str) -> str | None:
    """Derive the moon project id (``<NAME>.lower()``) that owns the inherit entry.

    Pattern: ``<...>/WORKSPACE-<NAME>/<rest>`` -> return ``<NAME>.lower()``.
    Returns None for entries that do not match this shape (ancestor-only).
    """
    m = _INHERIT_OWNER_RE.search(entry)
    if not m:
        return None
    return m.group(2).lower()


# ---------------------------------------------------------------------------
# .pre-commit-config.yaml --project ref scanner (SPEC §6.3 check 9)
# ---------------------------------------------------------------------------

_PROJECT_REF_RE = re.compile(
    r"uv\s+run\s+--project\s+(\S+)\s+--no-sync\s+python\s+-m\s+ci\."
)


def scan_precommit_project_refs(pcc_path: Path) -> list[tuple[int, str]]:
    """Yield (line_no, project_path) for every ``uv run --project X --no-sync
    python -m ci.<check>`` ref found in <pcc_path>.
    """
    refs: list[tuple[int, str]] = []
    try:
        text = pcc_path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return refs
    refs.extend(
        (i, m.group(1))
        for i, line in enumerate(text.splitlines(), start=1)
        for m in _PROJECT_REF_RE.finditer(line)
    )
    return refs


# ---------------------------------------------------------------------------
# Loader
# ---------------------------------------------------------------------------


def load_yaml(path: Path) -> Any:
    """Load YAML from <path>, raising on syntax errors. Returns the document tree."""
    with path.open("r", encoding="utf-8") as f:
        return yaml.safe_load(f)
