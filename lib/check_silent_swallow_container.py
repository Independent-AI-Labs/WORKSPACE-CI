"""Containerfile / Dockerfile detection for the error-swallowing detector."""

import re
from collections.abc import Iterator

from check_silent_swallow_base import AddedLine

_RUN_RE = re.compile(r"^\s*RUN\b", re.IGNORECASE)
_TRACE_RE = re.compile(r"\b(?:echo\s+[\[\"]|set\s+[-+]?[eux]+|set\s+-x)\b")
_SET_TRACE_RE = re.compile(r"\bset\s+[-+]?[eux]+\b")
_ECHO_STEP_RE = re.compile(r'\becho\s+[\["]')
_STEP_CMD_RE = re.compile(
    r"^\s*(?:tar\b|npm\b|uv\s+sync\b|bash\s+scripts/)",
    re.IGNORECASE,
)


def is_container_file(path: str) -> bool:
    base = path.rsplit("/", 1)[-1]
    return base in ("Containerfile", "Dockerfile")


def _check_run_chained_no_trace(text: str) -> str | None:
    if not _RUN_RE.match(text):
        return None
    if text.count("&&") < 2:
        return None
    if _TRACE_RE.search(text):
        return None
    return "container-run-chained-no-trace"


def _check_run_step_missing_echo(text: str) -> str | None:
    if not _RUN_RE.match(text):
        return None
    if not _SET_TRACE_RE.search(text):
        return None
    if "&&" not in text:
        return None
    segments = re.split(r"\s*&&\s*", text)
    for idx, segment in enumerate(segments):
        seg = segment.strip()
        if not _STEP_CMD_RE.match(seg):
            continue
        has_echo = bool(_ECHO_STEP_RE.search(seg))
        if idx > 0 and _ECHO_STEP_RE.search(segments[idx - 1]):
            has_echo = True
        if not has_echo:
            return "container-run-step-missing-echo"
    return None


def _join_continued_lines(added: list[AddedLine]) -> list[tuple[AddedLine, str]]:
    by_file: dict[str, list[AddedLine]] = {}
    for a in added:
        if not is_container_file(a.path):
            continue
        by_file.setdefault(a.path, []).append(a)

    joined: list[tuple[AddedLine, str]] = []
    for lines in by_file.values():
        sorted_lines = sorted(lines, key=lambda x: x.lineno)
        idx = 0
        while idx < len(sorted_lines):
            start = sorted_lines[idx]
            parts = [start.text.rstrip().rstrip("\\").strip()]
            idx += 1
            while idx < len(sorted_lines) and sorted_lines[idx - 1].text.rstrip().endswith(
                "\\"
            ):
                parts.append(sorted_lines[idx].text.strip())
                idx += 1
            joined.append((start, " ".join(parts)))
    return joined


def detect_container_multiline(
    added: list[AddedLine],
) -> Iterator[tuple[AddedLine, str]]:
    for header, text in _join_continued_lines(added):
        for check in (_check_run_chained_no_trace, _check_run_step_missing_echo):
            pid = check(text)
            if pid is not None:
                yield header, pid
                break