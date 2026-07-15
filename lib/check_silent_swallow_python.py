"""Python multi-line except-block detection for the error-swallowing
detector.

Inline Python patterns are now defined in
config/silent_swallow_patterns.yaml and loaded at runtime by
check_silent_swallow.py. This module retains file-type detection
and the multi-line except-body classifier.

Each pattern has its own dedicated check function so the wiki can
display the exact detection logic per pattern via source_function
references in the YAML config.
"""

import re
from collections.abc import Iterator

from check_silent_swallow_base import AddedLine


def is_python_file(path: str) -> bool:
    return path.endswith(".py")


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


def _resolve_body_line(
    lines: dict[int, AddedLine],
    lineno: int,
    header_indent: int,
) -> AddedLine | None:
    """Resolve the next body line after an except header.

    Handles comment-line skip logic.
    Returns the body line if one exists, None otherwise.
    """
    nxt = lines.get(lineno + 1)
    if nxt is None:
        return None
    next_indent = len(re.match(r"^(\s*)", nxt.text).group(1))
    if re.match(r"^\s*#", nxt.text):
        nxt2 = lines.get(lineno + 2)
        if nxt2 is None:
            return None
        next_indent2 = len(re.match(r"^(\s*)", nxt2.text).group(1))
        if next_indent2 <= header_indent:
            return None
        nxt = nxt2
    if next_indent <= header_indent:
        return None
    return nxt


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


def _check_except_empty_body(
    lines: dict[int, AddedLine],
    lineno: int,
    header_indent: int,
) -> str | None:
    """Detect except block with an empty body; no error handling at all."""
    if _resolve_body_line(lines, lineno, header_indent) is None:
        return "py-except-empty-body"
    return None


def _check_except_pass(
    nxt: AddedLine,
    lines: dict[int, AddedLine],
    lineno: int,
    header_indent: int,
) -> str | None:
    """Detect except block that swallows errors with a bare pass statement."""
    match = _BODY_RE.match(nxt.text)
    if not match:
        return None
    body_indent = len(match.group("indent"))
    if body_indent <= header_indent:
        return None
    if match.group(2) == "pass":
        return "py-except-pass"
    return None


def _check_except_continue(
    nxt: AddedLine,
    lines: dict[int, AddedLine],
    lineno: int,
    header_indent: int,
) -> str | None:
    """Detect except block that swallows errors with a bare continue statement."""
    match = _BODY_RE.match(nxt.text)
    if not match:
        return None
    body_indent = len(match.group("indent"))
    if body_indent <= header_indent:
        return None
    if match.group(2) == "continue":
        return "py-except-continue"
    return None


def _check_except_ellipsis(
    nxt: AddedLine,
    lines: dict[int, AddedLine],
    lineno: int,
    header_indent: int,
) -> str | None:
    """Detect except block that swallows errors with Ellipsis (...)."""
    match = _BODY_RE.match(nxt.text)
    if not match:
        return None
    body_indent = len(match.group("indent"))
    if body_indent <= header_indent:
        return None
    if match.group(2) == "...":
        return "py-except-ellipsis"
    return None


def _check_except_return_none(
    nxt: AddedLine,
    lines: dict[int, AddedLine],
    lineno: int,
    header_indent: int,
) -> str | None:
    """Detect except block returning None, hiding the exception from the caller."""
    match = _BODY_RE.match(nxt.text)
    if not match:
        return None
    body_indent = len(match.group("indent"))
    if body_indent <= header_indent:
        return None
    if match.group(2).startswith("return"):
        return "py-except-return-none"
    return None


def _check_except_debug_only(
    nxt: AddedLine,
    lines: dict[int, AddedLine],
    lineno: int,
    header_indent: int,
) -> str | None:
    """Detect except block that only logs at debug level; the error is not surfaced."""
    match = _DEBUG_LOG_RE.match(nxt.text)
    if not match:
        return None
    body_indent = len(match.group("indent"))
    if body_indent <= header_indent:
        return None
    if _is_follow_up_blocked(lines, lineno, body_indent):
        return None
    return "py-except-debug-only"


def _check_except_raise_no_from(
    nxt: AddedLine,
    lines: dict[int, AddedLine],
    lineno: int,
    header_indent: int,
) -> str | None:
    """Detect except block raising a new exception without chaining (no from clause)."""
    match = _RAISE_NEW_RE.match(nxt.text)
    if not match:
        return None
    body_indent = len(match.group("indent"))
    if body_indent <= header_indent:
        return None
    if _is_follow_up_blocked(lines, lineno, body_indent):
        return None
    return "py-except-raise-no-from"


def _check_except_silent_exit(
    nxt: AddedLine,
    lines: dict[int, AddedLine],
    lineno: int,
    header_indent: int,
) -> str | None:
    """Detect except block calling sys.exit(0), terminating with success on error."""
    match = _SILENT_EXIT_RE.match(nxt.text)
    if not match:
        return None
    body_indent = len(match.group("indent"))
    if body_indent <= header_indent:
        return None
    if _is_follow_up_blocked(lines, lineno, body_indent):
        return None
    return "py-except-silent-exit"


def _check_except_print(
    nxt: AddedLine,
    lines: dict[int, AddedLine],
    lineno: int,
    header_indent: int,
) -> str | None:
    """Detect except block that only prints the error; no logging,
    re-raise, or recovery."""
    match = _PRINT_RE.match(nxt.text)
    if not match:
        return None
    body_indent = len(match.group("indent"))
    if body_indent <= header_indent:
        return None
    if _is_follow_up_blocked(lines, lineno, body_indent):
        return None
    return "py-except-print"


_BODY_CHECKS: list = [
    _check_except_pass,
    _check_except_continue,
    _check_except_ellipsis,
    _check_except_return_none,
]

_NON_SILENT_CHECK_FNS: list = [
    _check_except_debug_only,
    _check_except_raise_no_from,
    _check_except_silent_exit,
    _check_except_print,
]


def _classify_except_body(
    nxt: AddedLine,
    lines: dict[int, AddedLine],
    lineno: int,
    header_indent: int,
) -> str | None:
    """Classify the body of an except block.

    Dispatches to per-pattern check functions and returns the first match.
    Returns the pattern_id if a violation is found, None otherwise.
    """
    for check in _BODY_CHECKS:
        pid = check(nxt, lines, lineno, header_indent)
        if pid is not None:
            return pid

    for check in _NON_SILENT_CHECK_FNS:
        pid = check(nxt, lines, lineno, header_indent)
        if pid is not None:
            return pid

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

            nxt = _resolve_body_line(lines, lineno, header_indent)
            if nxt is None:
                pid = _check_except_empty_body(lines, lineno, header_indent)
                if pid is not None:
                    yield header, pid
                continue

            pid = _classify_except_body(nxt, lines, lineno, header_indent)
            if pid is None:
                continue
            yield header, pid


_SUBPROCESS_CALL_RE = re.compile(r"\bsubprocess\.(?:run|call|Popen)\s*\(")
_CAPTURE_OUTPUT_RE = re.compile(r"\bcapture_output\s*=\s*True\b")
_STDOUT_PIPE_RE = re.compile(r"\bstdout\s*=\s*(?:subprocess\.)?PIPE\b")
_STDERR_SURFACED_RE = re.compile(
    r"\b(?:stderr|exc\.stderr|result\.stderr|completed\.stderr)\b"
    r"|sys\.stderr\.write|print\s*\([^)]*stderr"
)
_RAISE_OR_CHECK_RE = re.compile(r"\braise\b|returncode\s*!=\s*0")
_PROGRESS_RE = re.compile(
    r"print\s*\([^)]*file\s*=\s*sys\.stderr"
    r"|sys\.stderr\.write\s*\("
    r"|(?:logger|log|logging)\.(?:info|warning)\s*\("
    r"|\[[\w-]+\].*(?:running|progress|slow|cloc|workspace|per-repo)"
    r"|\b_log\s+"
)
_CALL_WINDOW = 12
_PROGRESS_LOOKBACK = 25
_SURFACING_LOOKAHEAD = 16


def _subprocess_call_anchor(
    lines: dict[int, AddedLine],
    lineno: int,
) -> int | None:
    header = lines.get(lineno)
    if header is None:
        return None
    if _SUBPROCESS_CALL_RE.search(header.text):
        return lineno
    for back in range(1, 8):
        prev = lines.get(lineno - back)
        if prev is None:
            break
        if _SUBPROCESS_CALL_RE.search(prev.text):
            return lineno - back
    return None


def _subprocess_call_block(
    lines: dict[int, AddedLine],
    anchor: int,
) -> list[AddedLine]:
    block: list[AddedLine] = []
    for offset in range(0, _CALL_WINDOW):
        body = lines.get(anchor + offset)
        if body is None:
            break
        block.append(body)
    return block


def _call_captures_stdout(block: list[AddedLine]) -> bool:
    return any(
        _CAPTURE_OUTPUT_RE.search(line.text) or _STDOUT_PIPE_RE.search(line.text)
        for line in block
    )


def _has_progress_before(
    lines: dict[int, AddedLine],
    anchor: int,
) -> bool:
    for back in range(1, _PROGRESS_LOOKBACK + 1):
        prev = lines.get(anchor - back)
        if prev is None:
            continue
        if _PROGRESS_RE.search(prev.text):
            return True
    return False


def _surfaces_after_call(
    lines: dict[int, AddedLine],
    anchor: int,
) -> bool:
    for offset in range(0, _SURFACING_LOOKAHEAD):
        body = lines.get(anchor + offset)
        if body is None:
            continue
        if _STDERR_SURFACED_RE.search(body.text) or _RAISE_OR_CHECK_RE.search(
            body.text
        ):
            return True
    return False


def _capture_output_unsurfaced(
    lines: dict[int, AddedLine],
    anchor: int,
    block: list[AddedLine],
) -> str | None:
    if not any(_CAPTURE_OUTPUT_RE.search(line.text) for line in block):
        return None
    if _surfaces_after_call(lines, anchor):
        return None
    return "py-capture-output-unsurfaced"


def _subprocess_pipe_no_progress(
    lines: dict[int, AddedLine],
    anchor: int,
    block: list[AddedLine],
) -> str | None:
    if not any(_STDOUT_PIPE_RE.search(line.text) for line in block):
        return None
    if _has_progress_before(lines, anchor):
        return None
    return "py-subprocess-pipe-no-progress"


def _classify_subprocess_capture(
    lines: dict[int, AddedLine],
    lineno: int,
) -> str | None:
    anchor = _subprocess_call_anchor(lines, lineno)
    if anchor is None:
        return None
    block = _subprocess_call_block(lines, anchor)
    if not _call_captures_stdout(block):
        return None
    pid = _capture_output_unsurfaced(lines, anchor, block)
    if pid is not None:
        return pid
    return _subprocess_pipe_no_progress(lines, anchor, block)


def detect_python_capture_multiline(
    added: list[AddedLine],
) -> Iterator[tuple[AddedLine, str]]:
    by_file: dict[str, dict[int, AddedLine]] = {}
    for a in added:
        if not is_python_file(a.path):
            continue
        by_file.setdefault(a.path, {})[a.lineno] = a

    for path, lines in by_file.items():
        reported: set[tuple[str, int, str]] = set()
        for lineno in sorted(lines):
            pid = _classify_subprocess_capture(lines, lineno)
            if pid is None:
                continue
            anchor = _subprocess_call_anchor(lines, lineno)
            if anchor is None:
                continue
            key = (path, anchor, pid)
            if key in reported:
                continue
            reported.add(key)
            yield lines[anchor], pid
