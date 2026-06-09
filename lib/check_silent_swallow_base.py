"""Shared types and diff parser for silent-swallow detectors."""

import re
from typing import Iterator


class AddedLine:
    __slots__ = ("path", "lineno", "text")

    def __init__(self, path: str, lineno: int, text: str) -> None:
        self.path = path
        self.lineno = lineno
        self.text = text

    def __repr__(self) -> str:
        return f"AddedLine({self.path}:{self.lineno}: {self.text!r})"


def parse_diff(diff_text: str) -> Iterator[AddedLine]:
    """Yield AddedLine for each '+' line in a unified diff."""

    current_file = None
    new_lineno = 0
    hunk_re = re.compile(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@")

    for raw in diff_text.splitlines():
        if raw.startswith("diff --git "):
            parts = raw.split(" b/", 1)
            current_file = parts[1] if len(parts) == 2 else None
            new_lineno = 0
            continue
        if raw.startswith("+++ "):
            payload = raw[4:]
            if payload.startswith("b/"):
                current_file = payload[2:]
            elif payload == "/dev/null":
                current_file = None
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
