"""Python silent-swallow patterns: inline and multi-line except detection."""

import re
from collections.abc import Iterator

from check_silent_swallow_base import AddedLine


def is_python_file(path: str) -> bool:
    return path.endswith(".py")


PY_INLINE = [
    (
        "py-except-inline-pass",
        re.compile(r"^\s*except\b[^:]*:\s*pass\s*(#.*)?$"),
    ),
    (
        "py-except-inline-continue",
        re.compile(r"^\s*except\b[^:]*:\s*continue\s*(#.*)?$"),
    ),
    (
        "py-except-inline-return-none",
        re.compile(r"^\s*except\b[^:]*:\s*return(\s+None)?\s*(#.*)?$"),
    ),
    (
        "py-except-inline-ellipsis",
        re.compile(r"^\s*except\b[^:]*:\s*\.\.\.\s*(#.*)?$"),
    ),
    (
        "py-contextlib-suppress",
        re.compile(r"\bcontextlib\.suppress\("),
    ),
    (
        "py-import-suppress",
        re.compile(r"^\s*from\s+contextlib\s+import\s+[^#\n]*\bsuppress\b"),
    ),
    (
        "py-subprocess-check-false",
        re.compile(r"\bsubprocess\.(?:run|call)\s*\([^)]*\bcheck\s*=\s*False"),
    ),
    (
        "py-subprocess-check-false-multiline",
        re.compile(r"^\s*check\s*=\s*False\s*,?\s*(?:#.*)?$"),
    ),
    (
        "py-detect-path-fallback",
        re.compile(r"if\s+not\s+\w+\s+and\s+(?:component\.)?detect_path\b"),
    ),
    (
        "py-result-or-literal",
        re.compile(r"\.strip\(\)\s*or\s*\"[^\"]*\"(?!\s*raise)"),
    ),
]

PY_EXCEPT_HEADER = re.compile(r"^(?P<indent>\s*)except\b[^:]*:\s*(#.*)?$")

_BODY_RE = re.compile(
    r"^(?P<indent>\s+)(pass|continue|return(\s+None)?|\.\.\.)\s*(#.*)?$"
)
_DEBUG_LOG_RE = re.compile(
    r"^(?P<indent>\s+)"
    r"(?:[A-Za-z_][\w.]*\.)?(?:logger|log|logging)\.debug\s*\("
)
_RAISE_NEW_RE = re.compile(
    r"^(?P<indent>\s+)raise\s+[A-Za-z_][\w.]*\s*\([^)]*\)\s*"
    r"(?:from\s+None\s*)?(?:#.*)?$"
)
_SILENT_EXIT_RE = re.compile(
    r"^(?P<indent>\s+)"
    r"(?:sys\.exit|os\._exit|exit|quit)\s*\(\s*0?\s*\)"
    r"\s*(?:#.*)?$"
)
_PRINT_RE = re.compile(r"^(?P<indent>\s+)print\s*\(.+\)\s*(?:#.*)?$")

_BODY_MAP: dict[str, str] = {
    "pass": "py-except-pass",
    "continue": "py-except-continue",
    "...": "py-except-ellipsis",
}

_NON_SILENT_CHECKS: list[tuple[re.Pattern[str], str]] = [
    (_DEBUG_LOG_RE, "py-except-debug-only"),
    (_RAISE_NEW_RE, "py-except-raise-no-from"),
    (_SILENT_EXIT_RE, "py-except-silent-exit"),
    (_PRINT_RE, "py-except-print"),
]


def _resolve_next_line(
    lines: dict[int, AddedLine],
    lineno: int,
    header_indent: int,
) -> tuple[AddedLine | None, str | None]:
    """Resolve the body line after an except header.

    Handles comment-line skip logic.
    Returns (body_line, violation_pid).
    """
    nxt = lines.get(lineno + 1)
    if nxt is None:
        return None, "py-except-empty-body"
    next_indent = len(re.match(r"^(\s*)", nxt.text).group(1))
    if re.match(r"^\s*#", nxt.text):
        nxt2 = lines.get(lineno + 2)
        if nxt2 is None:
            return None, "py-except-empty-body"
        next_indent2 = len(re.match(r"^(\s*)", nxt2.text).group(1))
        if next_indent2 <= header_indent:
            return None, "py-except-empty-body"
        nxt = nxt2
    if next_indent <= header_indent:
        return None, "py-except-empty-body"
    return nxt, None


def _is_follow_up_blocked(
    lines: dict[int, AddedLine],
    lineno: int,
    body_indent: int,
) -> bool:
    """Check if the follow-up line blocks this body classification."""
    follow = lines.get(lineno + 2)
    if follow is None:
        return False
    fm = re.match(r"^(?P<indent>\s+)\S", follow.text)
    return bool(fm) and len(fm.group("indent")) >= body_indent


def _classify_except_body(
    nxt: AddedLine,
    lines: dict[int, AddedLine],
    lineno: int,
    header_indent: int,
) -> str | None:
    """Classify the body of an except block.

    Returns the pattern_id if a violation is found, None otherwise.
    """
    bm = _BODY_RE.match(nxt.text)
    if bm:
        body_indent = len(bm.group("indent"))
        if body_indent <= header_indent:
            return None
        stmt = bm.group(2)
        if stmt.startswith("return"):
            return "py-except-return-none"
        return _BODY_MAP.get(stmt, "py-except-return-none")

    for rgx, pid in _NON_SILENT_CHECKS:
        match = rgx.match(nxt.text)
        if not match:
            continue
        body_indent = len(match.group("indent"))
        if body_indent > header_indent and not _is_follow_up_blocked(
            lines, lineno, body_indent
        ):
            return pid
        break
    return None


def detect_python_multiline(
    added: list[AddedLine],
) -> Iterator[tuple[AddedLine, str]]:
    """Detect except-header followed by sole-statement body in added lines."""

    by_file: dict[str, dict[int, AddedLine]] = {}
    for a in added:
        if not is_python_file(a.path):
            continue
        by_file.setdefault(a.path, {})[a.lineno] = a

    for lines in by_file.values():
        for lineno, header in sorted(lines.items()):
            m = PY_EXCEPT_HEADER.match(header.text)
            if not m:
                continue
            if "KeyboardInterrupt" in header.text:
                continue
            header_indent = len(m.group("indent"))
            nxt, pid = _resolve_next_line(lines, lineno, header_indent)
            if pid is not None:
                yield header, pid
                continue
            if nxt is None:
                continue
            pid = _classify_except_body(nxt, lines, lineno, header_indent)
            if pid is None:
                continue
            yield header, pid
