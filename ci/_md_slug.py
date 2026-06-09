"""Heading-to-anchor slug generation for markdown.

Matches the portal's client-side rule exactly so that links validated here
resolve in the doc viewer:

    text.lower().replace(r'[^a-z0-9]+', '-').strip('-')

Kept in its own module so the portal (TS) and validator (Py) can never drift.
"""

from __future__ import annotations

import re

_SLUG_RE = re.compile(r"[^a-z0-9]+")


def slugify(text: str) -> str:
    """Convert heading text to the anchor slug used by the markdown viewer."""
    return _SLUG_RE.sub("-", text.lower()).strip("-")
