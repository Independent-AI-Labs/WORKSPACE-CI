"""Shared types and diff parser for silent-swallow detectors."""

import re
from collections.abc import Iterator


class AddedLine:
    __slots__ = ("lineno", "path", "text")

    def __init__(self, path: str, lineno: int, text: str) -> None:
        self.path = path
        self.lineno = lineno
        self.text = text

    def __repr__(self) -> str:
        return f"AddedLine({self.path}:{self.lineno}: {self.text!r})"


def _parse_diff_git_header(raw: str) -> str | None:
    """Extract file path from 'diff --git a/... b/...' line."""
    marker = " b/"
    idx = raw.find(marker)
    if idx == -1:
        return None
    return raw[idx + len(marker) :]


def _update_current_file(raw: str, current_file: str | None) -> str | None:
    """Update current_file from '+++ b/path' or '/dev/null' line."""
    payload = raw[4:]
    if payload.startswith("b/"):
        return payload[2:]
    if payload == "/dev/null":
        return None
    return current_file


def parse_diff(diff_text: str) -> Iterator[AddedLine]:
    """Yield AddedLine for each '+' line in a unified diff."""

    current_file = None
    new_lineno = 0
    hunk_re = re.compile(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@")

    for raw in diff_text.splitlines():
        if raw.startswith("diff --git "):
            current_file = _parse_diff_git_header(raw)
            new_lineno = 0
            continue
        if raw.startswith("+++ "):
            current_file = _update_current_file(raw, current_file)
            new_lineno = 0
            continue
        if raw.startswith("--- "):
            continue
        m = hunk_re.match(raw)
        if m:
            new_lineno = int(m.group(1))
            continue
        if not current_file:
            continue
        if raw.startswith("+") and not raw.startswith("+++"):
            yield AddedLine(current_file, new_lineno, raw[1:])
            new_lineno += 1
        elif raw.startswith(" "):
            new_lineno += 1
