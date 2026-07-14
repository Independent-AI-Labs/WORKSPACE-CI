"""Unit tests for shell swallow-pattern extensions (if/then colon, make @true)."""

from __future__ import annotations

import io
from collections.abc import Sequence
from typing import NamedTuple

import pytest
from check_silent_swallow import main


class SwallowCase(NamedTuple):
    test_id: str
    path: str
    lines: list[str]
    expect_rc: int
    grep_pattern: str | None


def _diff(path: str, lines: list[str]) -> str:
    body = "\n".join("+" + line for line in lines)
    return (
        f"diff --git a/{path} b/{path}\n"
        f"--- a/{path}\n"
        f"+++ b/{path}\n"
        f"@@ -0,0 +1,{len(lines)} @@\n"
        f"{body}\n"
    )


def _run_main(monkeypatch: pytest.MonkeyPatch, diff_text: str) -> tuple[int, str]:
    monkeypatch.setattr("sys.stdin", io.TextIOWrapper(io.BytesIO(diff_text.encode())))
    captured = io.StringIO()
    monkeypatch.setattr("sys.stdout", captured)
    rc = main()
    return rc, captured.getvalue()


_SHOULD_BLOCK = 1
_SHOULD_PASS = 0

BLOCKED_CASES: list[SwallowCase] = [
    SwallowCase(
        "sh_if_then_colon_multiline",
        "lib/guard-host-exec.sh",
        [
            '    if offender="$(_guard_try_line guard_host_provision_fleet_in_sudo)"; then',
            "        :",
            "    fi",
        ],
        _SHOULD_BLOCK,
        "sh-if-then-colon-noop",
    ),
    SwallowCase(
        "sh_if_then_colon_inline",
        "x.sh",
        ['if offender="$(false)"; then :; fi'],
        _SHOULD_BLOCK,
        "sh-if-then-colon-inline",
    ),
    SwallowCase(
        "make_recipe_true",
        "Makefile",
        ["%::", "\t@true"],
        _SHOULD_BLOCK,
        "make-recipe-true",
    ),
    SwallowCase(
        "sh_stderr_temp_discard",
        "x.sh",
        ['_groups="$(id -nG "$user" 2>"$_id_err")"'],
        _SHOULD_BLOCK,
        "sh-stderr-temp-discard",
    ),
]

PASSING_CASES: list[SwallowCase] = [
    SwallowCase(
        "sh_rc_capture_assign",
        "lib/guard-host-exec.sh",
        [
            "    local _fleet_rc=0",
            '    offender="$(_guard_try_line guard_host_provision_fleet_in_sudo)" || _fleet_rc=$?',
        ],
        _SHOULD_PASS,
        None,
    ),
    SwallowCase(
        "sh_stderr_temp_with_rc",
        "x.sh",
        ['_groups="$(id -nG "$user" 2>"$_id_err")" || _id_rc=$?'],
        _SHOULD_PASS,
        None,
    ),
    SwallowCase(
        "sh_stderr_temp_next_line_rc",
        "lib/checks_secrets.sh",
        [
            '    _ss_files="$({ git ls-files; } 2>"$_ss_stderr_tmp" | sort -u)"',
            "    local _ss_git_rc=$?",
        ],
        _SHOULD_PASS,
        None,
    ),
    SwallowCase(
        "sh_if_then_colon_with_else",
        "scripts/code-stats",
        [
            'if CLOC="$(_find_cloc)"; then',
            "    :",
            "else",
            '    CLOC=""',
            "fi",
        ],
        _SHOULD_PASS,
        None,
    ),
    SwallowCase(
        "sh_stderr_temp_if_negated",
        "x.sh",
        ['if ! setcap "$cap_str" /usr/bin/git 2>"$_setcap_err"; then'],
        _SHOULD_PASS,
        None,
    ),
    SwallowCase(
        "make_recipe_exit",
        "Makefile",
        ["%::", '\t@echo "ERROR: unknown target" >&2', "\t@exit 1"],
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
def test_shell_swallow_extensions(
    monkeypatch: pytest.MonkeyPatch,
    case: SwallowCase,
) -> None:
    diff_text = _diff(case.path, case.lines)
    rc, output = _run_main(monkeypatch, diff_text)
    assert rc == case.expect_rc, (
        f"[{case.test_id}] expected rc={case.expect_rc}, got rc={rc}; output={output!r}"
    )
    if case.grep_pattern is not None:
        assert case.grep_pattern in output, (
            f"[{case.test_id}] expected '{case.grep_pattern}' in output, got: {output!r}"
        )