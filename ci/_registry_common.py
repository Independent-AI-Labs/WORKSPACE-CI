"""Shared registry-query state and pin-shape helpers for the dependency
version checkers (PyPI, npm, Docker)."""

from __future__ import annotations

import re

QUERY_RESULTS: dict[str, int] = {"failures": 0, "successes": 0}

_UPPER_BOUND_RE = re.compile(r"[, ]\s*(<=?)\s*\d")


def is_strictly_pinned_or_bounded(dep_str: str) -> bool:
    """Exact pin (==) or both min+max bounds (>=X,<Y). Everything else rejected."""
    spec = dep_str.strip()
    if not spec:
        return False
    if "==" in spec:
        return True
    if re.match(r"^\d+\.\d+", spec):
        return True
    return bool(_UPPER_BOUND_RE.search(spec))
