#!/usr/bin/env python3
"""workspace-ci silent-error-swallow detector — reads unified diff on stdin.

Emits one violation per line:
  <file>:<line>: <pattern_id> -- <line content>

Exits 0 if no violations, 1 otherwise.

This script is self-contained — stdlib only. Invoked from
lib/checks_silent.sh.

Patterns are organised by language in sibling modules:
  check_silent_swallow_base.py    — diff parsing + AddedLine
  check_silent_swallow_python.py  — Python inline + multi-line except
  check_silent_swallow_js.py      — JS/TS inline + multi-line catch
  check_silent_swallow_system.py  — Shell + cron patterns
"""

import re
import sys

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
from check_silent_swallow_ansible import (
    ANSIBLE_INLINE,
    detect_ansible_tasks,
    detect_registered_output_swallow,
    is_ansible_file,
)


def main() -> int:
    diff_text = sys.stdin.read()
    added = list(parse_diff(diff_text))

    violations: list[tuple[str, int, str, str]] = []

    for a in added:
        text = a.text

        if is_python_file(a.path):
            if re.match(r"^\s*#", text):
                continue
            for pid, rgx in PY_INLINE:
                if rgx.search(text):
                    violations.append(
                        (a.path, a.lineno, pid, text.rstrip())
                    )
                    break
            continue

        if is_js_file(a.path):
            for pid, rgx in JS_INLINE:
                if rgx.search(text):
                    violations.append(
                        (a.path, a.lineno, pid, text.rstrip())
                    )
                    break
            continue

        if is_shell_file(a.path):
            for pid, rgx in SH_MASK:
                if rgx.search(text):
                    violations.append(
                        (a.path, a.lineno, pid, text.rstrip())
                    )
                    break
            continue

        if is_ansible_file(a.path):
            for pid, rgx in ANSIBLE_INLINE:
                if rgx.search(text):
                    violations.append(
                        (a.path, a.lineno, pid, text.rstrip())
                    )
                    break
            continue

        if is_cron_file(a.path):
            stripped = text.rstrip()
            if not stripped:
                continue
            if CRON_SHEBANG_OR_COMMENT.match(stripped):
                continue
            if CRON_ENV.match(stripped):
                continue
            if not CRON_LINE.match(stripped):
                continue
            if not CRON_OK.search(stripped):
                violations.append(
                    (a.path, a.lineno, "cron-no-log-redirect", stripped)
                )
            continue

    for header, pid in detect_python_multiline(added):
        violations.append(
            (header.path, header.lineno, pid, header.text.rstrip())
        )

    for header, pid in detect_js_multiline(added):
        violations.append(
            (header.path, header.lineno, pid, header.text.rstrip())
        )

    for header, pid in detect_ansible_tasks(added):
        if not is_ansible_file(header.path):
            continue
        violations.append(
            (header.path, header.lineno, pid, header.text.rstrip())
        )

    for header, pid in detect_registered_output_swallow(added):
        if not is_ansible_file(header.path):
            continue
        violations.append(
            (header.path, header.lineno, pid, header.text.rstrip())
        )

    if not violations:
        return 0

    violations.sort(key=lambda v: (v[0], v[1]))
    seen: set[tuple[str, int, str]] = set()
    for path, lineno, pid, text in violations:
        key = (path, lineno, pid)
        if key in seen:
            continue
        seen.add(key)
        snippet = text if len(text) <= 200 else text[:197] + "..."
        sys.stdout.write(f"{path}:{lineno}: {pid} -- {snippet}\n")
    return 1


if __name__ == "__main__":
    sys.exit(main())
