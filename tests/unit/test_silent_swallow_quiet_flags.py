"""Silent-swallow quiet/silent flag pattern tests.

Dedicated module for the sh-quiet-flag and sh-short-q-noisy patterns.
Split from test_silent_swallow_patterns.py to stay under the 512-line
file-length limit.

Each case feeds a synthetic unified diff to check_silent_swallow.main()
via monkeypatched stdin, then asserts the exit code and optionally
checks the violation output for a specific pattern_id.
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

BLOCKED_CASES: list[SwallowCase] = [
    SwallowCase(
        "sh_quiet_long_flag",
        "x.sh",
        ["git fetch origin main --quiet"],
        _SHOULD_BLOCK,
        "sh-quiet-flag",
    ),
    SwallowCase(
        "sh_silent_long_flag",
        "x.sh",
        ["deploy --silent production"],
        _SHOULD_BLOCK,
        "sh-quiet-flag",
    ),
    SwallowCase(
        "sh_short_q_apt",
        "x.sh",
        ["apt-get update -qq && apt-get install -y foo"],
        _SHOULD_BLOCK,
        "sh-short-q-noisy",
    ),
    SwallowCase(
        "sh_short_q_pytest",
        "x.sh",
        ["pytest tests/ -q"],
        _SHOULD_BLOCK,
        "sh-short-q-noisy",
    ),
]

PASSING_CASES: list[SwallowCase] = [
    SwallowCase(
        "sh_grep_q_exit_status_idiom",
        "x.sh",
        ["if grep -q pattern file.txt; then", "    echo found", "fi"],
        _SHOULD_PASS,
        None,
    ),
    SwallowCase(
        "sh_grep_qE_pipeline_idiom",
        "x.sh",
        ['echo "$out" | grep -qE "^FAILED" && exit 1'],
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
def test_quiet_flag_pattern(
    monkeypatch: pytest.MonkeyPatch,
    case: SwallowCase,
) -> None:
    """Run a synthetic diff through main() and check exit code + output."""
    diff_text = _diff(case.path, case.lines)
    rc, output = _run_main(monkeypatch, diff_text)
    assert rc == case.expect_rc, (
        f"[{case.test_id}] expected rc={case.expect_rc}, got rc={rc}; output={output!r}"
    )
    if case.grep_pattern is not None:
        assert case.grep_pattern in output, (
            f"[{case.test_id}] expected '{case.grep_pattern}' in output, "
            f"got: {output!r}"
        )
