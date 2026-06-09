"""Python silent-swallow patterns: inline and multi-line except detection."""

import re
from typing import Iterator

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
        re.compile(
            r"\bsubprocess\.(?:run|call)\s*\([^)]*\bcheck\s*=\s*False"
        ),
    ),
    (
        "py-subprocess-check-false-multiline",
        re.compile(r"^\s*check\s*=\s*False\s*,?\s*(?:#.*)?$"),
    ),
    (
        "py-detect-path-fallback",
        re.compile(
            r"if\s+not\s+\w+\s+and\s+(?:component\.)?detect_path\b"
        ),
    ),
    (
        "py-result-or-literal",
        re.compile(r"\.strip\(\)\s*or\s*\"[^\"]*\"(?!\s*raise)"),
    ),
]

PY_EXCEPT_HEADER = re.compile(
    r"^(?P<indent>\s*)except\b[^:]*:\s*(#.*)?$"
)


def detect_python_multiline(
    added: list[AddedLine],
) -> Iterator[tuple[AddedLine, str]]:
    """Detect except-header followed by sole-statement body in added lines."""

    by_file: dict[str, dict[int, AddedLine]] = {}
    for a in added:
        if not is_python_file(a.path):
            continue
        by_file.setdefault(a.path, {})[a.lineno] = a

    body_re = re.compile(
        r"^(?P<indent>\s+)(pass|continue|return(\s+None)?|\.\.\.)\s*(#.*)?$"
    )
    debug_log_re = re.compile(
        r"^(?P<indent>\s+)"
        r"(?:[A-Za-z_][\w.]*\.)?(?:logger|log|logging)\.debug\s*\("
    )
    raise_new_re = re.compile(
        r"^(?P<indent>\s+)raise\s+[A-Za-z_][\w.]*\s*\([^)]*\)\s*"
        r"(?:from\s+None\s*)?(?:#.*)?$"
    )
    silent_exit_re = re.compile(
        r"^(?P<indent>\s+)"
        r"(?:sys\.exit|os\._exit|exit|quit)\s*\(\s*0?\s*\)"
        r"\s*(?:#.*)?$"
    )
    print_re = re.compile(
        r"^(?P<indent>\s+)print\s*\(.+\)\s*(?:#.*)?$"
    )

    for path, lines in by_file.items():
        for lineno, header in sorted(lines.items()):
            m = PY_EXCEPT_HEADER.match(header.text)
            if not m:
                continue
            # KeyboardInterrupt is a deliberate user signal (Ctrl+C),
            # not an error to swallow — returning None is acceptable.
            if "KeyboardInterrupt" in header.text:
                continue
            header_indent = len(m.group("indent"))
            nxt = lines.get(lineno + 1)
            if nxt is None:
                yield header, "py-except-empty-body"
                continue
            next_indent = len(re.match(r"^(\s*)", nxt.text).group(1))
            if re.match(r"^\s*#", nxt.text):
                nxt2 = lines.get(lineno + 2)
                if nxt2 is not None:
                    next_indent2 = len(
                        re.match(r"^(\s*)", nxt2.text).group(1)
                    )
                    if next_indent2 <= header_indent:
                        yield header, "py-except-empty-body"
                        continue
                    nxt = nxt2
                else:
                    yield header, "py-except-empty-body"
                    continue
            if next_indent <= header_indent:
                yield header, "py-except-empty-body"
                continue
            bm = body_re.match(nxt.text)
            pid: str | None = None
            if bm:
                body_indent = len(bm.group("indent"))
                if body_indent <= header_indent:
                    continue
                stmt = bm.group(2)
                pid = {
                    "pass": "py-except-pass",
                    "continue": "py-except-continue",
                    "...": "py-except-ellipsis",
                }.get(stmt, "py-except-return-none")
                if stmt.startswith("return"):
                    pid = "py-except-return-none"
            else:
                dm = debug_log_re.match(nxt.text)
                rm = raise_new_re.match(nxt.text)
                em = silent_exit_re.match(nxt.text)
                pm = print_re.match(nxt.text)
                match = dm or rm or em or pm
                if not match:
                    continue
                body_indent = len(match.group("indent"))
                if body_indent <= header_indent:
                    continue
                follow = lines.get(lineno + 2)
                if follow is not None:
                    fm = re.match(
                        r"^(?P<indent>\s+)\S", follow.text
                    )
                    if fm and len(fm.group("indent")) >= body_indent:
                        continue
                if dm:
                    pid = "py-except-debug-only"
                elif rm:
                    pid = "py-except-raise-no-from"
                elif em:
                    pid = "py-except-silent-exit"
                elif pm:
                    pid = "py-except-print"
            if pid is None:
                continue
            yield header, pid
