"""JavaScript/TypeScript multi-line catch detection for the
error-swallowing detector.

Inline JS/TS patterns are now defined in
config/silent_swallow_patterns.yaml and loaded at runtime by
check_silent_swallow.py. This module retains file-type detection
and the multi-line catch-body detector.

Each pattern has its own dedicated check function so the wiki can
display the exact detection logic per pattern via source_function
references in the YAML config.
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
) -> str | None:
    """Check lines after a catch header for a silent return.

    Returns "js-catch-silent-return-multi" if a silent-return violation
    is found, None otherwise.
    """
    for offset in range(1, 4):
        body = lines.get(lineno + offset)
        if body is None:
            continue
        if body.text.strip() == "}":
            return None
        if JS_CONSOLE_LOG.search(body.text) or JS_THROW.search(body.text):
            return None
        rm = JS_SILENT_RETURN.match(body.text)
        if rm:
            body_indent = len(rm.group("indent"))
            if body_indent <= header_indent:
                continue
            return "js-catch-silent-return-multi"
        if body.text.strip() and not body.text.strip().startswith("//"):
            return None
    return None


_WARN_RE = re.compile(r"\bconsole\.warn\s*\(")
_RETURN_RE = re.compile(r"^\s*return\s*;?\s*(?://.*)?$")
_THROW_RE = re.compile(r"\bthrow\b")
_PROCESS_EXIT_RE = re.compile(r"\bprocess\.exit\s*\(")


def _check_warn_and_return(
    lines: dict[int, AddedLine],
    lineno: int,
) -> str | None:
    header = lines.get(lineno)
    if header is None or not _WARN_RE.search(header.text):
        return None
    for offset in range(1, 5):
        body = lines.get(lineno + offset)
        if body is None:
            continue
        if _THROW_RE.search(body.text) or _PROCESS_EXIT_RE.search(body.text):
            return None
        if _RETURN_RE.match(body.text):
            if "skipping" in header.text.lower():
                return "js-warn-skip-return"
            return "js-warn-return-softfail"
        if body.text.strip() and not body.text.strip().startswith("//"):
            return None
    return None


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
            pid = _check_catch_body(lines, lineno, header_indent)
            if pid is not None:
                yield header, pid


def detect_js_soft_fail_multiline(
    added: list[AddedLine],
) -> Iterator[tuple[AddedLine, str]]:
    by_file: dict[str, dict[int, AddedLine]] = {}
    for a in added:
        if not is_js_file(a.path):
            continue
        by_file.setdefault(a.path, {})[a.lineno] = a

    for lines in by_file.values():
        for lineno in sorted(lines):
            pid = _check_warn_and_return(lines, lineno)
            if pid is not None:
                yield lines[lineno], pid


_FAILURE_BATCH_RE = re.compile(r"\bfailures\.(?:length|filter)\b")
_KEEP_EXISTING_RE = re.compile(
    r"keeping\s+existing|fall\s+back",
    re.IGNORECASE,
)
_SOFT_RETURN_RE = re.compile(
    r"^\s*return\s+(?:false|null|undefined|0)\s*;?\s*(?://.*)?$",
)
_PROD_GUARD_RE = re.compile(r"\b(?:CI_WIKI_PROD_BUILD|abortOrWarn)\b")
_PREBUILD_SCRIPTS = frozenset(
    {
        "web/scripts/sync-logos.mjs",
        "web/scripts/fetch-web-documents.mjs",
        "web/scripts/sync-web-content.mjs",
    },
)


def _check_warn_batch_no_exit(
    lines: dict[int, AddedLine],
    lineno: int,
) -> str | None:
    header = lines.get(lineno)
    if header is None or not _FAILURE_BATCH_RE.search(header.text):
        return None
    for offset in range(0, 6):
        body = lines.get(lineno + offset)
        if body is None:
            continue
        if _PROCESS_EXIT_RE.search(body.text):
            return None
        if _WARN_RE.search(body.text):
            return "js-warn-batch-no-exit"
    return None


def _check_catch_warn_return_soft(
    lines: dict[int, AddedLine],
    lineno: int,
    header_indent: int,
) -> str | None:
    saw_warn = False
    for offset in range(1, 6):
        body = lines.get(lineno + offset)
        if body is None:
            continue
        if body.text.strip() == "}":
            break
        if _THROW_RE.search(body.text) or _PROCESS_EXIT_RE.search(body.text):
            return None
        if _WARN_RE.search(body.text):
            saw_warn = True
            continue
        if saw_warn and _SOFT_RETURN_RE.match(body.text):
            return "js-catch-return-soft"
        if body.text.strip() and not body.text.strip().startswith("//"):
            return None
    return None


def _check_warn_keep_existing(
    lines: dict[int, AddedLine],
    lineno: int,
) -> str | None:
    header = lines.get(lineno)
    if header is None or not _WARN_RE.search(header.text):
        return None
    if not _KEEP_EXISTING_RE.search(header.text):
        return None
    for offset in range(-5, 6):
        body = lines.get(lineno + offset)
        if body is None:
            continue
        if _PROD_GUARD_RE.search(body.text) or _PROCESS_EXIT_RE.search(body.text):
            return None
    return "js-warn-keep-existing"


def detect_js_prod_fail_multiline(
    added: list[AddedLine],
) -> Iterator[tuple[AddedLine, str]]:
    by_file: dict[str, dict[int, AddedLine]] = {}
    for a in added:
        if not is_js_file(a.path):
            continue
        by_file.setdefault(a.path, {})[a.lineno] = a

    for path, lines in by_file.items():
        for lineno, header in sorted(lines.items()):
            if path in _PREBUILD_SCRIPTS:
                m = JS_CATCH_HEADER.match(header.text)
                if m:
                    header_indent = len(m.group("indent"))
                    pid = _check_catch_warn_return_soft(
                        lines,
                        lineno,
                        header_indent,
                    )
                    if pid is not None:
                        yield header, pid
                        continue

            if not path.startswith("web/scripts/"):
                continue

            for check in (
                _check_warn_batch_no_exit,
                _check_warn_keep_existing,
            ):
                pid = check(lines, lineno)
                if pid is not None:
                    yield lines[lineno], pid
                    break
