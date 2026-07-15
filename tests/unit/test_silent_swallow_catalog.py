"""Silent Swallow Patterns Catalog tests.

Dedicated test module for the 8-pattern catalog of silent-swallow
anti-patterns found in CI library extensions (Ansible dev.yml and shell
integration tests). Split from test_silent_swallow_patterns.py to stay
under the 512-line file-length limit.

Each case feeds a synthetic unified diff to
check_silent_swallow.main() via monkeypatched stdin, then asserts the
exit code and optionally checks the violation output for a specific
pattern_id. Each BLOCKED case has a paired PASSING case showing the
safe ("fixed") variant.
"""

from __future__ import annotations

import io
from collections.abc import Sequence
from typing import NamedTuple

import pytest
from check_silent_swallow import main


class SwallowCase(NamedTuple):
    """A single silent-swallow test case."""

    test_id: str
    path: str
    lines: list[str]
    expect_rc: int
    grep_pattern: str | None


def _diff(path: str, lines: list[str]) -> str:
    """Build a minimal unified diff string for one file with added lines."""
    body = "\n".join("+" + line for line in lines)
    return (
        f"diff --git a/{path} b/{path}\n"
        f"--- a/{path}\n"
        f"+++ b/{path}\n"
        f"@@ -0,0 +1,{len(lines)} @@\n"
        f"{body}\n"
    )


def _run_main(monkeypatch: pytest.MonkeyPatch, diff_text: str) -> tuple[int, str]:
    """Run check_silent_swallow.main() with stdin replaced by diff_text."""
    monkeypatch.setattr("sys.stdin", io.TextIOWrapper(io.BytesIO(diff_text.encode())))
    captured = io.StringIO()
    monkeypatch.setattr("sys.stdout", captured)
    rc = main()
    return rc, captured.getvalue()


_SHOULD_BLOCK = 1
_SHOULD_PASS = 0

# ── BLOCKED: the 8 catalog patterns (each should be detected) ───────────
BLOCKED_CASES: list[SwallowCase] = [
    # Pattern 1: ansible.builtin.command for long-running ops (inline form)
    SwallowCase(
        "cat1_ansible_command_inline_no_guard",
        "res/ansible/dev.yml",
        [
            "- name: Build container images",
            '  ansible.builtin.command: "{{ compose_cmd }} build"',
            "  changed_when: true",
        ],
        _SHOULD_BLOCK,
        "ansible-shell-no-guard",
    ),
    # Pattern 2: ansible.builtin.shell with register: for test suites.
    #   failed_when:false swallows exit code; debug only shown after completion
    SwallowCase(
        "cat2_ansible_shell_register_test_suite",
        "res/ansible/dev.yml",
        [
            "- name: Source .env and run full test suite",
            "  ansible.builtin.shell: |",
            "    source .env && bash tests/run_all.sh",
            "  register: test_result",
            "  failed_when: false",
            "  changed_when: true",
            "- name: Show test results",
            "  ansible.builtin.debug:",
            "    var: test_result.stdout_lines",
        ],
        _SHOULD_BLOCK,
        "ansible-failed-when-false",
    ),
    # Pattern 3: failed_when: false on critical operations
    SwallowCase(
        "cat3_ansible_failed_when_false",
        "res/ansible/dev.yml",
        [
            "- name: Some critical task",
            "  ansible.builtin.command: do-critical-thing",
            "  failed_when: false",
        ],
        _SHOULD_BLOCK,
        "ansible-failed-when-false",
    ),
    # Pattern 4: register: on init/setup commands with NO debug output
    SwallowCase(
        "cat4_ansible_register_no_debug",
        "res/ansible/dev.yml",
        [
            "- name: Run ClickHouse init SQL",
            "  ansible.builtin.shell: >",
            "    podman exec -i clickhouse-client < init.sql",
            "  register: ch_init",
            "  changed_when: true",
            "  failed_when: false",
        ],
        _SHOULD_BLOCK,
        "ansible-register-output-swallowed",
    ),
    # Pattern 5: 2>/dev/null in shell scripts (pure stderr redirect, no || true)
    SwallowCase(
        "cat5_sh_devnull_redirect",
        "tests/integration/test_stack_up.sh",
        ['podman network create dataops_default 2>/dev/null'],
        _SHOULD_BLOCK,
        "sh-devnull-silent",
    ),
    # Pattern 6: curl -sf combined with 2>/dev/null
    SwallowCase(
        "cat6_curl_sf_devnull",
        "tests/integration/test_stack_up.sh",
        ['curl -sf -o /dev/null "$url" 2>/dev/null'],
        _SHOULD_BLOCK,
        "sh-devnull-silent",
    ),
    # Pattern 7: until retry loops without prior context (the shell task
    #   registers output but never displays it; retries just delay)
    SwallowCase(
        "cat7_ansible_shell_register_no_display",
        "res/ansible/dev.yml",
        [
            "- name: Wait for service",
            "  ansible.builtin.shell: curl -sf http://localhost:8080/health",
            "  register: result",
            "  until: result.rc == 0",
            "  retries: 6",
            "  delay: 5",
        ],
        _SHOULD_BLOCK,
        "ansible-register-output-swallowed",
    ),
    # Pattern 8: || true on teardown/cleanup
    SwallowCase(
        "cat8_sh_or_true_teardown",
        "tests/integration/test_stack_up.sh",
        ['podman-compose -f "$COMPOSE_FILE" down 2>/dev/null || true'],
        _SHOULD_BLOCK,
        "sh-pipe-true",
    ),
]

# ── PASSING: the "fixed" safe variant of each catalog pattern ────────────
PASSING_CASES: list[SwallowCase] = [
    # Pattern 1 fixed: command with register + failed_when guard + debug
    SwallowCase(
        "cat1_safe_command_with_register",
        "res/ansible/dev.yml",
        [
            "- name: Build container images",
            '  ansible.builtin.command: "{{ compose_cmd }} build"',
            "  register: build_result",
            "  failed_when: build_result.rc != 0",
            "- name: Show build output",
            "  ansible.builtin.debug:",
            "    var: build_result.stdout_lines",
        ],
        _SHOULD_PASS,
        None,
    ),
    # Pattern 2 fixed: register with real failed_when (not false) + debug
    SwallowCase(
        "cat2_safe_shell_register_real_guard",
        "res/ansible/dev.yml",
        [
            "- name: Source .env and run full test suite",
            "  ansible.builtin.shell: |",
            "    source .env && bash tests/run_all.sh",
            "  register: test_result",
            "  failed_when: test_result.rc != 0",
            "  changed_when: true",
            "- name: Show test results",
            "  ansible.builtin.debug:",
            "    var: test_result.stdout_lines",
        ],
        _SHOULD_PASS,
        None,
    ),
    # Pattern 3 fixed: failed_when with a real condition (not false)
    SwallowCase(
        "cat3_safe_failed_when_condition",
        "res/ansible/dev.yml",
        [
            "- name: Some critical task",
            "  ansible.builtin.command: do-critical-thing",
            "  failed_when: result.rc != 0",
        ],
        _SHOULD_PASS,
        None,
    ),
    # Pattern 4 fixed: register + debug display (no failed_when:false)
    SwallowCase(
        "cat4_safe_register_with_debug",
        "res/ansible/dev.yml",
        [
            "- name: Run ClickHouse init SQL",
            "  ansible.builtin.shell: >",
            "    podman exec -i clickhouse-client < init.sql",
            "  register: ch_init",
            "  changed_when: true",
            "- name: Show init output",
            "  ansible.builtin.debug:",
            "    var: ch_init.stdout_lines",
        ],
        _SHOULD_PASS,
        None,
    ),
    # Pattern 5 fixed: stderr to a log file, not /dev/null
    SwallowCase(
        "cat5_safe_stderr_to_log",
        "tests/integration/test_stack_up.sh",
        ['podman-compose -f "$COMPOSE_FILE" down 2>&1 | tee -a /tmp/teardown.log'],
        _SHOULD_PASS,
        None,
    ),
    # Pattern 6 fixed: loud curl with body to temp file; HTTP code surfaced
    SwallowCase(
        "cat6_safe_curl_http_code",
        "tests/integration/test_stack_up.sh",
        [
            '_tmp=$(mktemp); _err=$(mktemp); code=$(curl -sS -o "$_tmp" -w "%{http_code}" "$url" 2>"$_err"); rm -f "$_tmp" "$_err"',
        ],
        _SHOULD_PASS,
        None,
    ),
    # Pattern 8 fixed: teardown with explicit error handling, not || true
    SwallowCase(
        "cat8_safe_teardown_explicit_error",
        "tests/integration/test_stack_up.sh",
        [
            'if ! podman-compose -f "$COMPOSE_FILE" down; then',
            '  echo "ERROR: teardown failed" >&2',
            "  exit 1",
            "fi",
        ],
        _SHOULD_PASS,
        None,
    ),
]

ALL_CASES: Sequence[SwallowCase] = (*BLOCKED_CASES, *PASSING_CASES)


@pytest.mark.parametrize(
    "case",
    ALL_CASES,
    ids=[c.test_id for c in ALL_CASES],
)
def test_silent_swallow_catalog_pattern(
    monkeypatch: pytest.MonkeyPatch,
    case: SwallowCase,
) -> None:
    """Run a synthetic diff through main() and check exit code + output."""
    diff_text = _diff(case.path, case.lines)
    rc, output = _run_main(monkeypatch, diff_text)
    assert rc == case.expect_rc, (
        f"[{case.test_id}] expected rc={case.expect_rc}, got rc={rc}; "
        f"output={output!r}"
    )
    if case.grep_pattern is not None:
        assert case.grep_pattern in output, (
            f"[{case.test_id}] expected '{case.grep_pattern}' in output, "
            f"got: {output!r}"
        )
