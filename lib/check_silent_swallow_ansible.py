"""Ansible playbook silent-swallow patterns."""

import re


def is_ansible_file(path: str) -> bool:
    """YAML files under ansible paths or named dev.yml/compose.yml etc."""
    base = path.rsplit("/", 1)[-1]
    if not path.endswith((".yml", ".yaml")):
        return False
    # Only ansible playbooks, not random YAML configs
    if "ansible" in path:
        return True
    if base in ("dev.yml", "compose.yml", "site.yml", "playbook.yml"):
        return True
    return False


# Inline patterns: each (pattern_id, regex)
# Applied to every added line in ansible files.
ANSIBLE_INLINE = [
    # shell: | ... || true  — silently discards exit codes
    (
        "ansible-shell-or-true",
        re.compile(r"\|\|\s*true\b"),
    ),
    # shell: | ... || :  — same, with colon no-op
    (
        "ansible-shell-or-colon",
        re.compile(r"\|\|\s*:\s*$"),
    ),
    # ignore_errors: yes  — swallows all errors
    (
        "ansible-ignore-errors",
        re.compile(r"^\s*ignore_errors:\s*yes\b"),
    ),
    # shell: ... 2>/dev/null  — stderr to /dev/null without fallback
    # Excludes 2>/dev/null || echo "default" (provides default value)
    (
        "ansible-devnull-stderr",
        re.compile(r"2>\s*/dev/null(?!\s*\|\|\s*(?:echo|printf)\b)"),
    ),
    # shell: without register: on the same task (detected across lines)
    # Handled by multi-line detector below.
]


def detect_ansible_tasks(added_lines):
    """Multi-line detector: find shell/command tasks without register:.

    An ansible task is a YAML block starting with ``- name:`` or a
    dashed list item containing ``shell:`` or ``command:``. If the
    task has a shell/command directive but no ``register:`` field and
    no ``failed_when:`` / ``changed_when: false`` is not sufficient
    because it still swallows the exit code.

    Returns list of (header_addedline, pattern_id).
    """
    violations = []

    # Build a map of task blocks
    # We look for lines containing 'shell:' or 'command:' at the value
    # level (indented under a list item).  Matches both bare ``shell:`` and
    # fully-qualified ``ansible.builtin.shell:``.
    shell_re = re.compile(
        r"^\s+(?:ansible\.builtin\.)?shell:\s*(\||>|['\"])?\s*$"
    )
    command_re = re.compile(
        r"^\s+(?:ansible\.builtin\.)?command:\s*(\||>|['\"])?\s*$"
    )
    register_re = re.compile(r"^\s+register:\s*\S")
    failed_when_re = re.compile(r"^\s+failed_when:\s")
    changed_when_false_re = re.compile(r"^\s+changed_when:\s*false\s*$")

    lines = added_lines
    i = 0
    while i < len(lines):
        line = lines[i]
        text = line.text

        if shell_re.search(text) or command_re.search(text):
            # Found a shell/command directive — scan next ~10 lines for register/failed_when
            has_register = False
            has_failed_when = False
            for j in range(i + 1, min(i + 30, len(lines))):
                nt = lines[j].text
                if register_re.search(nt):
                    has_register = True
                    break
                if failed_when_re.search(nt):
                    has_failed_when = True
                # Stop scanning at next list item (same indent as shell)
                if nt and nt[0] not in (" ", "\t", "-") and not nt.startswith("  "):
                    break
                # Stop at next task name
                if re.match(r"^\s*- name:", nt):
                    break

            if not has_register and not has_failed_when:
                # Check if changed_when: false is the only gate (insufficient)
                for j in range(i + 1, min(i + 30, len(lines))):
                    nt = lines[j].text
                    if changed_when_false_re.search(nt) and not has_register:
                        # changed_when: false without register = swallowed
                        violations.append((line, "ansible-shell-no-register"))
                        break
                else:
                    # No register AND no failed_when — silently unguarded
                    violations.append((line, "ansible-shell-no-guard"))

        i += 1

    return violations


# Pattern: debug task that references a registered variable's output
# but only displays it conditionally on failure (when: rc != 0).
# The shell task's stdout is silently discarded when the command succeeds.
REGISTERED_VAR_RE = re.compile(r"^\s+register:\s*(\S+)")
DEBUG_STDOUT_RE = re.compile(
    r"^\s+ansible\.builtin\.debug:\s*$|^\s+debug:\s*$"
)
STDOUT_REF_RE = re.compile(r"\{\{\s*(\w+)\.stdout\s*(?:\||\}\})")
WHEN_RC_NONZERO_RE = re.compile(
    r"when:\s*.*rc\s*!=\s*0|when:\s*.*rc\s*>\s*0|when:\s*.*not\b.*\brc\b.*\b==\s*0"
)


def detect_registered_output_swallow(added_lines):
    """Find shell/command tasks that register output but only display it
    conditionally on failure — the output is silently discarded on success.

    Only flags shell/command tasks (not stat, uri, or set_fact) that:
    1. Have a register: directive
    2. Do NOT have failed_when: false (intentional tolerance)
    3. Only display the registered output behind a when: rc != 0 guard

    Returns list of (header_addedline, pattern_id).
    """
    violations = []

    shell_re = re.compile(
        r"^\s+(?:ansible\.builtin\.)?shell:\s*(\||>|['\"])?\s*$"
    )
    command_re = re.compile(
        r"^\s+(?:ansible\.builtin\.)?command:\s*(\||>|['\"])?\s*$"
    )

    lines = added_lines
    i = 0
    while i < len(lines):
        text = lines[i].text

        if not (shell_re.search(text) or command_re.search(text)):
            i += 1
            continue

        # Found shell/command — scan for register + failed_when in next ~15 lines
        reg_var = None
        has_tolerant = False
        for j in range(i + 1, min(i + 15, len(lines))):
            nt = lines[j].text
            m = REGISTERED_VAR_RE.match(nt)
            if m and not reg_var:
                reg_var = m.group(1)
            if re.match(r"^\s+failed_when:\s*false\s*$", nt):
                has_tolerant = True
            if re.match(r"^\s*- name:", nt):
                break

        if not reg_var or reg_var in ("item", "ansible_facts", "results"):
            i += 1
            continue
        if has_tolerant:
            i += 1
            continue

        # Scan forward for unconditional display of this var's stdout
        has_unconditional = False
        scan_end = min(i + 80, len(lines))
        for j in range(i + 1, scan_end):
            nt = lines[j].text
            if f"{reg_var}.stdout" in nt or f"{reg_var}.stderr" in nt:
                has_when_guard = False
                for k in range(j - 5, min(j + 5, len(lines))):
                    if k >= 0 and k < len(lines):
                        kt = lines[k].text
                        if WHEN_RC_NONZERO_RE.search(kt):
                            has_when_guard = True
                            break
                if not has_when_guard:
                    has_unconditional = True
                    break
            # Stop at next task barrier
            if re.match(r"^\s*- name:", nt):
                break

        if not has_unconditional:
            violations.append(
                (lines[i], "ansible-register-output-swallowed")
            )

        i += 1

    return violations
