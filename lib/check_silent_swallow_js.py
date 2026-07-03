"""JavaScript/TypeScript multi-line catch detection for the
error-swallowing detector.

Inline JS/TS patterns are now defined in
config/silent_swallow_patterns.yaml and loaded at runtime by
check_silent_swallow.py. This module retains file-type detection
and the multi-line catch-body detector.
"""

import re
from collections.abc import Iterator

from check_silent_swallow_base import AddedLine


def is_js_file(path: str) -> bool:
    return path.endswith((".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"))


JS_CATCH_HEADER = re.compile(r"^(?P<indent>\s*)\}\s*catch\s*(?:\([^)]*\))?\s*\{")
JS_SILENT_RETURN = re.compile(
    r"^(?P<indent>\s+)"
    r"(?:return\s+(?:null|undefined|\[\]|\{\}|false|''|\"\"|0)\s*;?\s*"
    r"|void\s+\w+(?:\?\.[\w]+)*\s*\(\s*\)\s*;?)\s*(?://.*)?$"
)
JS_CONSOLE_LOG = re.compile(r"\bconsole\.(?:error|warn|log|info|debug)\b")
JS_THROW = re.compile(r"\bthrow\b")


def _check_catch_body(
    lines: dict[int, AddedLine],
    lineno: int,
    header_indent: int,
) -> bool:
    """Check lines after a catch header for silent return.

    Returns True if a silent-return violation is found.
    """
    for offset in range(1, 4):
        body = lines.get(lineno + offset)
        if body is None:
            continue
        if body.text.strip() == "}":
            return False
        if JS_CONSOLE_LOG.search(body.text) or JS_THROW.search(body.text):
            return False
        rm = JS_SILENT_RETURN.match(body.text)
        if rm:
            body_indent = len(rm.group("indent"))
            if body_indent <= header_indent:
                continue
            return True
        if body.text.strip() and not body.text.strip().startswith("//"):
            return False
    return False


def detect_js_multiline(
    added: list[AddedLine],
) -> Iterator[tuple[AddedLine, str]]:
    """Detect catch-header followed by silent return in added lines."""

    by_file: dict[str, dict[int, AddedLine]] = {}
    for a in added:
        if not is_js_file(a.path):
            continue
        by_file.setdefault(a.path, {})[a.lineno] = a

    for lines in by_file.values():
        for lineno, header in sorted(lines.items()):
            m = JS_CATCH_HEADER.match(header.text)
            if not m:
                continue
            header_indent = len(m.group("indent"))
            if _check_catch_body(lines, lineno, header_indent):
                yield header, "js-catch-silent-return-multi"
