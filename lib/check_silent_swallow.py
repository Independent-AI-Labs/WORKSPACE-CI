#!/usr/bin/env python3
"""workspace-ci silent-error-swallow detector: reads unified diff on stdin.

Emits one violation per line:
  <file>:<line>: <pattern_id> -- <line content>

Exits 0 if no violations, 1 otherwise.

This script is self-contained: stdlib only. Invoked from
lib/checks_silent.sh.

Patterns are organised by language in sibling modules:
  check_silent_swallow_base.py   : diff parsing + AddedLine
  check_silent_swallow_python.py : Python inline + multi-line except
  check_silent_swallow_js.py     : JS/TS inline + multi-line catch
  check_silent_swallow_system.py : Shell + cron patterns
"""

import re
import sys

from check_silent_swallow_ansible import (
    ANSIBLE_INLINE,
    detect_ansible_tasks,
    detect_registered_output_swallow,
    is_ansible_file,
)
from check_silent_swallow_base import AddedLine, parse_diff
from check_silent_swallow_js import JS_INLINE, detect_js_multiline, is_js_file
from check_silent_swallow_python import (
    PY_INLINE,
    detect_python_multiline,
    is_python_file,
)
from check_silent_swallow_system import (
    CRON_ENV,
    CRON_LINE,
    CRON_OK,
    CRON_SHEBANG_OR_COMMENT,
    SH_MASK,
    is_cron_file,
    is_shell_file,
)

_SNIPPET_MAX = 200


def _match_inline(
    a: AddedLine,
    text: str,
    patterns: list[tuple[str, re.Pattern[str]]],
) -> tuple[str, int, str, str] | None:
    """Match inline patterns against a line."""
    for pid, rgx in patterns:
        if rgx.search(text):
            return (a.path, a.lineno, pid, text.rstrip())
    return None


def _check_cron_inline(
    a: AddedLine,
    text: str,
) -> tuple[str, int, str, str] | None:
    """Check a cron line for missing log redirect."""
    stripped = text.rstrip()
    if not stripped:
        return None
    if CRON_SHEBANG_OR_COMMENT.match(stripped):
        return None
    if CRON_ENV.match(stripped):
        return None
    if not CRON_LINE.match(stripped):
        return None
    if not CRON_OK.search(stripped):
        return (a.path, a.lineno, "cron-no-log-redirect", stripped)
    return None


def _check_inline(
    a: AddedLine,
) -> tuple[str, int, str, str] | None:
    """Check a line for inline violations across all languages."""
    text = a.text

    if is_python_file(a.path):
        if not re.match(r"^\s*#", text):
            return _match_inline(a, text, PY_INLINE)
    elif is_js_file(a.path):
        return _match_inline(a, text, JS_INLINE)
    elif is_shell_file(a.path):
        return _match_inline(a, text, SH_MASK)
    elif is_ansible_file(a.path):
        return _match_inline(a, text, ANSIBLE_INLINE)
    elif is_cron_file(a.path):
        return _check_cron_inline(a, text)

    return None


def _collect_multiline_violations(
    added: list[AddedLine],
) -> list[tuple[str, int, str, str]]:
    """Collect all multiline violations from language-specific detectors."""
    violations: list[tuple[str, int, str, str]] = []

    for header, pid in detect_python_multiline(added):
        violations.append((header.path, header.lineno, pid, header.text.rstrip()))
    for header, pid in detect_js_multiline(added):
        violations.append((header.path, header.lineno, pid, header.text.rstrip()))
    for header, pid in detect_ansible_tasks(added):
        if is_ansible_file(header.path):
            violations.append((header.path, header.lineno, pid, header.text.rstrip()))
    for header, pid in detect_registered_output_swallow(added):
        if is_ansible_file(header.path):
            violations.append((header.path, header.lineno, pid, header.text.rstrip()))
    return violations


def _emit_violations(
    violations: list[tuple[str, int, str, str]],
) -> int:
    """Deduplicate, sort, and emit violations. Returns exit code."""
    if not violations:
        return 0
    violations.sort(key=lambda v: (v[0], v[1]))
    seen: set[tuple[str, int, str]] = set()
    for path, lineno, pid, text in violations:
        key = (path, lineno, pid)
        if key in seen:
            continue
        seen.add(key)
        snippet = (
            text if len(text) <= _SNIPPET_MAX else text[: _SNIPPET_MAX - 3] + "..."
        )
        sys.stdout.write(f"{path}:{lineno}: {pid} -- {snippet}\n")
    return 1


def main() -> int:
    diff_text = sys.stdin.read()
    added = list(parse_diff(diff_text))

    violations: list[tuple[str, int, str, str]] = []

    for a in added:
        v = _check_inline(a)
        if v is not None:
            violations.append(v)

    violations.extend(_collect_multiline_violations(added))

    return _emit_violations(violations)


if __name__ == "__main__":
    sys.exit(main())
