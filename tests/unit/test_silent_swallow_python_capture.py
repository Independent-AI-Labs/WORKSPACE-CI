"""Unit tests for Python subprocess capture / progress swallow patterns."""

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
        "py_capture_output_unsurfaced",
        "x.py",
        [
            "result = subprocess.run(",
            '    ["git", "ls-files"],',
            "    capture_output=True,",
            "    text=True,",
            ")",
            "return result.stdout.splitlines()",
        ],
        _SHOULD_BLOCK,
        "py-capture-output-unsurfaced",
    ),
    SwallowCase(
        "py_stdout_pipe_no_progress",
        "scripts/extract-code-stats.py",
        [
            "    try:",
            "        result = subprocess.run(",
            '            ["bash", str(_CODE_STATS), "--json"],',
            "            stdout=subprocess.PIPE,",
            "            stderr=None,",
            "            text=True,",
            "            check=True,",
            "        )",
        ],
        _SHOULD_BLOCK,
        "py-subprocess-pipe-no-progress",
    ),
    SwallowCase(
        "py_capture_output_multiline_unsurfaced",
        "ci/check_markdown_docs.py",
        [
            "        result = subprocess.run(",
            '            ["git", "rev-parse", "--show-toplevel"],',
            "            capture_output=True,",
            "            text=True,",
            "            check=True,",
            "        )",
            "        return Path(result.stdout.strip()).resolve()",
        ],
        _SHOULD_BLOCK,
        "py-capture-output-unsurfaced",
    ),
]

PASSING_CASES: list[SwallowCase] = [
    SwallowCase(
        "py_capture_output_surfaces_stderr",
        "lib/check_banned_words.py",
        [
            "        result = subprocess.run(",
            "            git_cmd,",
            "            capture_output=True,",
            "            text=True,",
            "            check=True,",
            "        )",
            "    except subprocess.CalledProcessError as exc:",
            '        sys.stderr.write(f"git ls-files failed (exit {exc.returncode})")',
            "        if exc.stderr:",
            '            sys.stderr.write(f": {exc.stderr}")',
        ],
        _SHOULD_PASS,
        None,
    ),
    SwallowCase(
        "py_stdout_pipe_with_progress",
        "scripts/extract-code-stats.py",
        [
            "    print(",
            '        "[extract-code-stats] running cloc across workspace",',
            "        file=sys.stderr,",
            "        flush=True,",
            "    )",
            "    try:",
            "        result = subprocess.run(",
            '            ["bash", str(_CODE_STATS), "--json"],',
            "            stdout=subprocess.PIPE,",
            "            stderr=None,",
            "            text=True,",
            "            check=True,",
            "        )",
        ],
        _SHOULD_PASS,
        None,
    ),
    SwallowCase(
        "py_capture_output_surfaces_on_error",
        "ci/check_markdown_docs.py",
        [
            "    try:",
            "        result = subprocess.run(",
            '            ["git", "ls-files", "*.md"],',
            "            capture_output=True,",
            "            text=True,",
            "            check=True,",
            "        )",
            "    except subprocess.CalledProcessError as exc:",
            "        if exc.stderr:",
            '            sys.stderr.write(exc.stderr)',
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
def test_python_capture_swallow_patterns(
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