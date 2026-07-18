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
_RC_ASSIGN_INLINE_RE = re.compile(r"(?:local\s+)?[_a-zA-Z]+\w*=\$\?")
_STDERR_TEMP_RE = re.compile(r'2>\s*"\$_[^"]*"')
_IF_NEGATED_RE = re.compile(r"^\s*if\s+!")
_PIPE_TEE_RE = re.compile(r"\|\s*tee\b")
_PIPESTATUS_RE = re.compile(r"\bPIPESTATUS\b")
_BUILD_LOG_REF_RE = re.compile(
    r"(?:BUILD_LOG|build\.log).*(?:ERROR|FAIL|failed)|"
    r"(?:ERROR|FAIL|failed).*(?:BUILD_LOG|build\.log)",
    re.IGNORECASE,
)
_BUILD_LOG_SURF_RE = re.compile(
    r"\b(?:tail|cat|sed)\b[^\n]*(?:BUILD_LOG|build\.log|\$\{BUILD_LOG\})",
    re.IGNORECASE,
)


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
    if _RC_ASSIGN_INLINE_RE.search(text):
        return None
    if _IF_NEGATED_RE.search(text):
        return None
    for j in range(i + 1, min(i + 4, len(lines))):
        if _RC_ASSIGN_RE.match(lines[j].text):
            return None
    return "sh-stderr-temp-discard"


def _check_pipe_tee_without_pipestatus(
    lines: list[AddedLine],
    i: int,
) -> str | None:
    text = lines[i].text
    if re.match(r"^\s*#", text):
        return None
    if not _PIPE_TEE_RE.search(text):
        return None
    if _PIPESTATUS_RE.search(text):
        return None
    for j in range(i, min(i + 7, len(lines))):
        if _PIPESTATUS_RE.search(lines[j].text):
            return None
    return "sh-pipe-tee-no-pipestatus"


def _check_build_log_not_surfaced(
    lines: list[AddedLine],
    i: int,
) -> str | None:
    text = lines[i].text
    if not _BUILD_LOG_REF_RE.search(text):
        return None
    if _BUILD_LOG_SURF_RE.search(text):
        return None
    for j in range(i + 1, min(i + 9, len(lines))):
        if _BUILD_LOG_SURF_RE.search(lines[j].text):
            return None
    return "sh-build-log-not-surfaced"


def detect_shell_multiline(
    added_lines: list[AddedLine],
) -> list[tuple[AddedLine, str]]:
    violations: list[tuple[AddedLine, str]] = []
    checks = (
        _check_if_then_colon_noop,
        _check_stderr_temp_without_rc,
        _check_pipe_tee_without_pipestatus,
        _check_build_log_not_surfaced,
    )
    for i, _line in enumerate(added_lines):
        for check in checks:
            pid = check(added_lines, i)
            if pid is not None:
                violations.append((_line, pid))
                break
    return violations
