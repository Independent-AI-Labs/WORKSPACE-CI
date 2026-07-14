"""Shell multi-line detection for the error-swallowing detector.

Inline shell patterns live in config/silent_swallow_patterns.yaml.
This module implements multi-line if/then colon-noop detection (set -e
evasion) and temp-file stderr discard without rc capture.
"""

import re

from check_silent_swallow_base import AddedLine

_IF_THEN_EOL_RE = re.compile(r"^\s*if\s+.+\s*;\s*then\s*$")
_COLON_ONLY_RE = re.compile(r"^\s*:\s*$")
_ELSE_RE = re.compile(r"^\s*else\b")
_FI_RE = re.compile(r"^\s*fi\s*$")
_RC_CAPTURE_RE = re.compile(r"\|\|\s*[_a-zA-Z]*rc=\$\?")
_RC_ASSIGN_RE = re.compile(r"^\s*(?:local\s+)?[_a-zA-Z]+\w*=\$\?")
_STDERR_TEMP_RE = re.compile(r'2>\s*"\$_[^"]*"')
_IF_NEGATED_RE = re.compile(r"^\s*if\s+!")


def _check_if_then_colon_noop(lines: list[AddedLine], i: int) -> str | None:
    text = lines[i].text
    if not _IF_THEN_EOL_RE.match(text):
        return None
    for j in range(i + 1, min(i + 6, len(lines))):
        nt = lines[j].text
        if _FI_RE.match(nt):
            return None
        if not nt.strip():
            continue
        if _COLON_ONLY_RE.match(nt):
            for k in range(j + 1, min(j + 4, len(lines))):
                n2 = lines[k].text
                if not n2.strip():
                    continue
                if _ELSE_RE.match(n2):
                    return None
                if _FI_RE.match(n2):
                    return "sh-if-then-colon-noop"
                return None
            return "sh-if-then-colon-noop"
        return None
    return None


def _check_stderr_temp_without_rc(lines: list[AddedLine], i: int) -> str | None:
    text = lines[i].text
    if not _STDERR_TEMP_RE.search(text):
        return None
    if _RC_CAPTURE_RE.search(text):
        return None
    if _IF_NEGATED_RE.search(text):
        return None
    for j in range(i + 1, min(i + 4, len(lines))):
        if _RC_ASSIGN_RE.match(lines[j].text):
            return None
    return "sh-stderr-temp-discard"


def detect_shell_multiline(
    added_lines: list[AddedLine],
) -> list[tuple[AddedLine, str]]:
    violations: list[tuple[AddedLine, str]] = []
    checks = (_check_if_then_colon_noop, _check_stderr_temp_without_rc)
    for i, _line in enumerate(added_lines):
        for check in checks:
            pid = check(added_lines, i)
            if pid is not None:
                violations.append((added_lines[i], pid))
                break
    return violations