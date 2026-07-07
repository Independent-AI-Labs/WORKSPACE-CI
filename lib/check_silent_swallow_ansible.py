"""Ansible multi-line task detection for the error-swallowing detector.

Inline Ansible patterns are now defined in
config/silent_swallow_patterns.yaml and loaded at runtime by
check_silent_swallow.py. This module retains file-type detection
and the multi-line task/output detectors.

Each pattern has its own dedicated check function so the wiki can
display the exact detection logic per pattern via source_function
references in the YAML config.
"""

import re

_SHELL_RE = re.compile(
    r"^\s+(?:ansible\.builtin\.)?shell:\s*(?:\||>|['\"]|$|\S)"
)
_COMMAND_RE = re.compile(
    r"^\s+(?:ansible\.builtin\.)?command:\s*(?:\||>|['\"]|$|\S)"
)
_REGISTER_RE = re.compile(r"^\s+register:\s*\S")
_FAILED_WHEN_RE = re.compile(r"^\s+failed_when:\s")
_CHANGED_WHEN_FALSE_RE = re.compile(r"^\s+changed_when:\s*false\s*$")
_TASK_NAME_RE = re.compile(r"^\s*- name:")
_FAILED_WHEN_FALSE_RE = re.compile(r"^\s+failed_when:\s*false\s*$")


def is_ansible_file(path: str) -> bool:
    """YAML files under ansible paths or named dev.yml/compose.yml etc."""
    base = path.rsplit("/", 1)[-1]
    if not path.endswith((".yml", ".yaml")):
        return False
    if "ansible" in path:
        return True
    return base in (
        "dev.yml",
        "compose.yml",
        "site.yml",
        "playbook.yml",
    )


_SCAN_WINDOW = 30


def _scan_task_flags(
    lines: list,
    i: int,
) -> tuple[bool, bool]:
    """Scan forward for register/failed_when flags.

    Returns (has_register, has_failed_when).
    """
    has_register = False
    has_failed_when = False
    for j in range(i + 1, min(i + _SCAN_WINDOW, len(lines))):
        nt = lines[j].text
        if _REGISTER_RE.search(nt):
            has_register = True
            break
        if _FAILED_WHEN_RE.search(nt):
            has_failed_when = True
        if nt and nt[0] not in (" ", "\t", "-") and not nt.startswith("  "):
            break
        if _TASK_NAME_RE.match(nt):
            break
    return has_register, has_failed_when


def _check_changed_when_false(
    lines: list,
    i: int,
) -> bool:
    """Check if changed_when: false exists in the task block."""
    for j in range(i + 1, min(i + _SCAN_WINDOW, len(lines))):
        nt = lines[j].text
        if _CHANGED_WHEN_FALSE_RE.search(nt):
            return True
    return False


def _check_ansible_shell_no_register(
    lines: list,
    i: int,
) -> str | None:
    """Detect shell/command task with changed_when:false but no register or failed_when."""
    has_register, has_failed_when = _scan_task_flags(lines, i)
    if has_register or has_failed_when:
        return None
    if not _check_changed_when_false(lines, i):
        return None
    return "ansible-shell-no-register"


def _check_ansible_shell_no_guard(
    lines: list,
    i: int,
) -> str | None:
    """Detect shell/command task without register, failed_when, or changed_when guard."""
    has_register, has_failed_when = _scan_task_flags(lines, i)
    if has_register or has_failed_when:
        return None
    if _check_changed_when_false(lines, i):
        return None
    return "ansible-shell-no-guard"


def detect_ansible_tasks(added_lines):
    """Multi-line detector: find shell/command tasks without register:.

    Returns list of (header_addedline, pattern_id).
    """
    violations = []
    lines = added_lines
    i = 0
    while i < len(lines):
        line = lines[i]
        text = line.text

        if _SHELL_RE.search(text) or _COMMAND_RE.search(text):
            pid = _check_ansible_shell_no_register(lines, i)
            if pid is None:
                pid = _check_ansible_shell_no_guard(lines, i)
            if pid is not None:
                violations.append((line, pid))

        i += 1

    return violations


REGISTERED_VAR_RE = re.compile(r"^\s+register:\s*(\S+)")
DEBUG_STDOUT_RE = re.compile(r"^\s+ansible\.builtin\.debug:\s*$|^\s+debug:\s*$")
STDOUT_REF_RE = re.compile(r"\{\{\s*(\w+)\.stdout\s*(?:\||\}\})")
WHEN_RC_NONZERO_RE = re.compile(
    r"^\s*when:\s*.*(?:rc\s*!=\s*0|rc\s*>\s*0|not\b.*\brc\b.*\b==\s*0)"
)

_REG_VAR_BLOCKLIST = ("item", "ansible_facts", "results")
_TOLERANT_SCAN_WINDOW = 15
_DISPLAY_SCAN_WINDOW = 80
_WHEN_GUARD_WINDOW = 5


def _find_registered_var(
    lines: list,
    i: int,
) -> tuple[str | None, bool]:
    """Scan forward for register var and tolerance flags.

    Returns (reg_var, has_tolerant).
    """
    reg_var = None
    has_tolerant = False
    for j in range(i + 1, min(i + _TOLERANT_SCAN_WINDOW, len(lines))):
        nt = lines[j].text
        m = REGISTERED_VAR_RE.match(nt)
        if m and not reg_var:
            reg_var = m.group(1)
        if _FAILED_WHEN_FALSE_RE.match(nt):
            has_tolerant = True
        if _TASK_NAME_RE.match(nt):
            break
    return reg_var, has_tolerant


def _has_unconditional_display(
    lines: list,
    i: int,
    reg_var: str,
) -> bool:
    """Check if reg_var's stdout is displayed without a when guard.

    Scans across task boundaries so a debug task in a follow-up block
    (e.g. ``- name: Show results`` referencing ``reg_var.stdout_lines``)
    still counts as display. The scan is bounded by _DISPLAY_SCAN_WINDOW.
    """
    scan_end = min(i + _DISPLAY_SCAN_WINDOW, len(lines))
    for j in range(i + 1, scan_end):
        nt = lines[j].text
        if f"{reg_var}.stdout" in nt or f"{reg_var}.stderr" in nt:
            has_when_guard = False
            for k in range(
                j - _WHEN_GUARD_WINDOW,
                min(j + _WHEN_GUARD_WINDOW, len(lines)),
            ):
                if 0 <= k < len(lines):
                    kt = lines[k].text
                    if WHEN_RC_NONZERO_RE.search(kt):
                        has_when_guard = True
                        break
            if not has_when_guard:
                return True
    return False


def _check_ansible_register_output_swallowed(
    lines: list,
    i: int,
) -> str | None:
    """Detect task that registers output but only displays it on failure
    (or never displays it at all).

    The output is silently discarded on success. When failed_when:false is
    also present, the task never fails, so conditional display-on-failure
    never triggers and the output is completely invisible.
    """
    reg_var, _ = _find_registered_var(lines, i)
    if not reg_var or reg_var in _REG_VAR_BLOCKLIST:
        return None
    if not _has_unconditional_display(lines, i, reg_var):
        return "ansible-register-output-swallowed"
    return None


def detect_registered_output_swallow(added_lines):
    """Find shell/command tasks that register output but only display it
    conditionally on failure: the output is silently discarded on success.

    Returns list of (header_addedline, pattern_id).
    """
    violations = []
    lines = added_lines
    i = 0
    while i < len(lines):
        text = lines[i].text

        if not (_SHELL_RE.search(text) or _COMMAND_RE.search(text)):
            i += 1
            continue

        pid = _check_ansible_register_output_swallowed(lines, i)
        if pid is not None:
            violations.append((lines[i], pid))

        i += 1

    return violations
