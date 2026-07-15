"""Bootstrap script gap detection for the error-swallowing detector."""

import re
from collections.abc import Iterator

from check_silent_swallow_base import AddedLine

_LOG_RE = re.compile(r"\b_log\s+")
_COMPLETION_LOG_RE = re.compile(
    r"_log\s+.*(?:\bOK\b|\balready\b|\binstalled\b|\bdone\b)",
    re.IGNORECASE,
)
_BLOCKING_RE = re.compile(r"\b(?:tar\b|install\b|curl\b|uv\s+sync\b)")


def _is_bootstrap_script(path: str) -> bool:
    base = path.rsplit("/", 1)[-1]
    return path.startswith("scripts/bootstrap-") or base == "bootstrap-uv"


def _check_bootstrap_gap_no_log(
    lines: dict[int, AddedLine],
    lineno: int,
) -> str | None:
    header = lines.get(lineno)
    if header is None or not _COMPLETION_LOG_RE.search(header.text):
        return None
    for offset in range(1, 8):
        body = lines.get(lineno + offset)
        if body is None:
            continue
        text = body.text.strip()
        if not text or text.startswith("#"):
            continue
        if _LOG_RE.search(body.text):
            return None
        if _BLOCKING_RE.search(body.text):
            return "sh-bootstrap-gap-no-log"
        return None
    return None


def detect_bootstrap_multiline(
    added: list[AddedLine],
) -> Iterator[tuple[AddedLine, str]]:
    by_file: dict[str, dict[int, AddedLine]] = {}
    for a in added:
        if not _is_bootstrap_script(a.path):
            continue
        by_file.setdefault(a.path, {})[a.lineno] = a

    for lines in by_file.values():
        for lineno in sorted(lines):
            pid = _check_bootstrap_gap_no_log(lines, lineno)
            if pid is not None:
                yield lines[lineno], pid