"""Unit tests for silent-swallow detector patterns (in-process, no subprocess).

Each test feeds a synthetic unified diff to check_silent_swallow.main()
via monkeypatched stdin and asserts the exit code and violation output.
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


# ---------------------------------------------------------------------------
# Test case definitions: (id, path, lines, expect_rc, grep_pattern_or_None)
# expect_rc: 1 = should block, 0 = should pass
# grep_pattern: if set, output must contain this substring
# ---------------------------------------------------------------------------

_SHOULD_BLOCK = 1
_SHOULD_PASS = 0

# Each case: (test_id, file_path, added_lines, expected_rc, optional_output_grep)
BLOCKED_CASES: list[SwallowCase] = [
    SwallowCase(
        "py_except_pass",
        "x.py",
        ["try:", "    foo()", "except Exception:", "    pass"],
        _SHOULD_BLOCK,
        "py-except-",
    ),
    SwallowCase(
        "py_except_pass_silent_ok_no_longer_exempts",
        "x.py",
        ["try:", "    foo()", "except Exception:  # silent-ok: tested", "    pass"],
        _SHOULD_BLOCK,
        None,
    ),
    SwallowCase(
        "py_inline_except_pass", "x.py", ["except Exception: pass"], _SHOULD_BLOCK, None
    ),
    SwallowCase(
        "py_contextlib_suppress",
        "x.py",
        ["import contextlib", "with contextlib.suppress(Exception):"],
        _SHOULD_BLOCK,
        None,
    ),
    SwallowCase(
        "py_from_import_suppress",
        "x.py",
        ["from contextlib import suppress"],
        _SHOULD_BLOCK,
        None,
    ),
    SwallowCase(
        "py_except_ellipsis", "x.py", ["except Exception: ..."], _SHOULD_BLOCK, None
    ),
    SwallowCase(
        "py_except_debug_only",
        "x.py",
        ["except Exception as e:", "    logger.debug(e)"],
        _SHOULD_BLOCK,
        None,
    ),
    SwallowCase(
        "py_except_log_debug",
        "x.py",
        ["except Exception as e:", '    log.debug(f"oops: {e}")'],
        _SHOULD_BLOCK,
        None,
    ),
    SwallowCase(
        "py_except_self_logger_debug",
        "x.py",
        ["except Exception as e:", "    self.logger.debug(e)"],
        _SHOULD_BLOCK,
        None,
    ),
    SwallowCase(
        "py_except_raise_no_from",
        "x.py",
        ["except Exception:", '    raise RuntimeError("bad")'],
        _SHOULD_BLOCK,
        None,
    ),
    SwallowCase(
        "py_except_raise_from_none",
        "x.py",
        ["except Exception:", '    raise RuntimeError("bad") from None'],
        _SHOULD_BLOCK,
        None,
    ),
    SwallowCase(
        "py_except_sys_exit_zero",
        "x.py",
        ["except Exception:", "    sys.exit(0)"],
        _SHOULD_BLOCK,
        None,
    ),
    SwallowCase(
        "py_except_os_exit_zero",
        "x.py",
        ["except Exception:", "    os._exit(0)"],
        _SHOULD_BLOCK,
        None,
    ),
    SwallowCase(
        "py_subprocess_check_false",
        "x.py",
        ["r = subprocess.run(cmd, check=False)"],
        _SHOULD_BLOCK,
        None,
    ),
    SwallowCase(
        "js_empty_catch",
        "x.ts",
        ["try { foo(); } catch (e) {}"],
        _SHOULD_BLOCK,
        None,
    ),
    SwallowCase(
        "js_empty_arrow_catch",
        "x.ts",
        ["p.catch(() => {})"],
        _SHOULD_BLOCK,
        None,
    ),
    SwallowCase(
        "js_silent_ok_no_longer_exempts",
        "x.ts",
        ["try { foo(); } catch (e) {} // silent-ok: optional cleanup"],
        _SHOULD_BLOCK,
        None,
    ),
    SwallowCase(
        "js_empty_catch_noparam",
        "x.ts",
        ["try { foo(); } catch {}"],
        _SHOULD_BLOCK,
        None,
    ),
    SwallowCase(
        "js_comment_only_catch",
        "x.ts",
        ["try { foo(); } catch (e) { /* nothing */ }"],
        _SHOULD_BLOCK,
        None,
    ),
    SwallowCase(
        "js_catch_returns_null",
        "x.ts",
        ["const v = await foo().catch(() => null);"],
        _SHOULD_BLOCK,
        None,
    ),
    SwallowCase(
        "js_catch_returns_undefined",
        "x.ts",
        ["const v = await foo().catch(_ => undefined);"],
        _SHOULD_BLOCK,
        None,
    ),
    SwallowCase(
        "js_catch_returns_void_zero",
        "x.ts",
        ["await foo().catch(e => void 0);"],
        _SHOULD_BLOCK,
        None,
    ),
    SwallowCase(
        "js_existssync_source_select",
        "x.ts",
        ["const p = existsSync(a) ? a : resolveConfigPath('legacy')"],
        _SHOULD_BLOCK,
        "js-existssync-source-select",
    ),
    SwallowCase(
        "js_or_literal_default",
        "x.ts",
        ["const bg = readCssVar('--bg') || '#181818'"],
        _SHOULD_BLOCK,
        "js-or-literal-default",
    ),
    SwallowCase(
        "js_nullish_literal_default",
        "x.ts",
        ["const label = getNavLabelForHref(href) ?? '/projects'"],
        _SHOULD_BLOCK,
        "js-nullish-literal-default",
    ),
    SwallowCase(
        "js_hardcoded_hex_color",
        "x.ts",
        ["return theme === 'light' ? '#ffffff' : '#181818'"],
        _SHOULD_BLOCK,
        "js-hardcoded-hex-color",
    ),
    SwallowCase(
        "js_catch_debug_only",
        "x.ts",
        [
            "try {",
            "    releasePointerCapture(id)",
            "} catch (err) {",
            "    console.debug('already released:', err)",
            "}",
        ],
        _SHOULD_BLOCK,
        "js-catch-debug-only",
    ),
    SwallowCase(
        "sh_pipe_true",
        "x.sh",
        ["rm something || true"],
        _SHOULD_BLOCK,
        None,
    ),
    SwallowCase(
        "sh_pipe_colon",
        "x.sh",
        ["rm something || :"],
        _SHOULD_BLOCK,
        None,
    ),
    SwallowCase(
        "sh_silent_ok_no_longer_exempts",
        "x.sh",
        ["rm /tmp/foo || true # silent-ok: non-critical cleanup"],
        _SHOULD_BLOCK,
        None,
    ),
    SwallowCase(
        "sh_devnull_no_fallback",
        "x.sh",
        ["somecmd 2>/dev/null"],
        _SHOULD_BLOCK,
        None,
    ),
    SwallowCase(
        "sh_devnull_with_fallback",
        "x.sh",
        ['somecmd 2>/dev/null || echo "missing"'],
        _SHOULD_BLOCK,
        None,
    ),
    SwallowCase(
        "sh_pipefail_mask_tail",
        "x.sh",
        ["somecmd 2>&1 | tail -1"],
        _SHOULD_BLOCK,
        None,
    ),
    SwallowCase(
        "sh_pipefail_mask_head",
        "x.sh",
        ["somecmd 2>&1 | head -1"],
        _SHOULD_BLOCK,
        None,
    ),
    SwallowCase(
        "sh_pipefail_mask_true",
        "x.sh",
        ["somecmd | true"],
        _SHOULD_BLOCK,
        None,
    ),
    SwallowCase(
        "sh_pipe_true_continuation",
        "x.sh",
        ["rm something ||\\", "    true"],
        _SHOULD_BLOCK,
        None,
    ),
    SwallowCase(
        "cron_devnull_double_redirect",
        "foo.cron",
        ["*/5 * * * * /usr/bin/run-task.sh >> /dev/null 2>&1"],
        _SHOULD_BLOCK,
        None,
    ),
    SwallowCase(
        "cron_devnull_single_redirect",
        "foo.cron",
        ["*/5 * * * * /usr/bin/run-task.sh > /dev/null 2>&1"],
        _SHOULD_BLOCK,
        None,
    ),
    SwallowCase(
        "cron_devnull_no_space",
        "foo.cron",
        ["*/5 * * * * /usr/bin/run-task.sh >>/dev/null 2>&1"],
        _SHOULD_BLOCK,
        None,
    ),
    SwallowCase(
        "cron_no_redirect",
        "foo.cron",
        ["*/5 * * * * /usr/bin/run-task.sh"],
        _SHOULD_BLOCK,
        None,
    ),
]


PASSING_CASES: list[SwallowCase] = [
    SwallowCase(
        "js_catch_with_real_handler",
        "x.ts",
        ["await foo().catch(e => log.error(e));"],
        _SHOULD_PASS,
        None,
    ),
    SwallowCase(
        "js_existssync_guarded_throw",
        "x.ts",
        ["if (!existsSync(a)) { throw new Error('missing config') }"],
        _SHOULD_PASS,
        None,
    ),
    SwallowCase(
        "js_required_value_no_default",
        "x.ts",
        ["const bg = requireCssVar('--bg')"],
        _SHOULD_PASS,
        None,
    ),
    SwallowCase(
        "js_nullish_variable_fallback",
        "x.ts",
        ["const label = getNavLabelForHref(href) ?? segment"],
        _SHOULD_PASS,
        None,
    ),
    SwallowCase(
        "js_catch_error_and_rethrow",
        "x.ts",
        [
            "try {",
            "    foo()",
            "} catch (err) {",
            "    console.error('failed:', err)",
            "    throw err",
            "}",
        ],
        _SHOULD_PASS,
        None,
    ),
    SwallowCase(
        "sh_pipefail_real_consumer_jq",
        "x.sh",
        ["somecmd | jq ."],
        _SHOULD_PASS,
        None,
    ),
    SwallowCase(
        "cron_with_redirect",
        "foo.cron",
        ["*/5 * * * * /usr/bin/run-task.sh >> /var/log/task.log 2>&1"],
        _SHOULD_PASS,
        None,
    ),
    SwallowCase(
        "cron_with_systemd_cat",
        "foo.cron",
        ["*/5 * * * * /usr/bin/run-task.sh | systemd-cat -t mytask"],
        _SHOULD_PASS,
        None,
    ),
    SwallowCase(
        "cron_env_lines_skipped",
        "foo.cron",
        [
            "SHELL=/bin/bash",
            "PATH=/usr/bin:/bin",
            "MAILTO=ops@example.com",
            "# regular comment",
        ],
        _SHOULD_PASS,
        None,
    ),
    SwallowCase(
        "py_except_debug_then_raise",
        "x.py",
        ["except Exception as e:", "    log.debug(e)", "    raise"],
        _SHOULD_PASS,
        None,
    ),
    SwallowCase(
        "py_except_raise_from_e",
        "x.py",
        ["except Exception as e:", '    raise RuntimeError("bad") from e'],
        _SHOULD_PASS,
        None,
    ),
    SwallowCase(
        "py_except_bare_reraise",
        "x.py",
        ["except Exception:", "    raise"],
        _SHOULD_PASS,
        None,
    ),
    SwallowCase(
        "py_subprocess_check_true",
        "x.py",
        ["r = subprocess.run(cmd, check=True)"],
        _SHOULD_PASS,
        None,
    ),
    SwallowCase(
        "py_clean_code",
        "x.py",
        ["def f():", "    return 1 + 2"],
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
def test_silent_swallow_pattern(
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
