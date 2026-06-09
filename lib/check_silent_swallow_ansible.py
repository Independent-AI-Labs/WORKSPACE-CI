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
