"""Edge-case tests for the silent-swallow detector."""

import io

import pytest
from check_silent_swallow import main


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
    return main(), captured.getvalue()


# ---------------------------------------------------------------------------
# Extra edge-case tests that go beyond simple pattern matching
# ---------------------------------------------------------------------------


class TestEdgeCases:
    """Edge cases not covered by the parametrized table above."""

    def test_empty_diff_passes(self, monkeypatch: pytest.MonkeyPatch) -> None:
        rc, _ = _run_main(monkeypatch, "")
        assert rc == 0

    def test_no_added_lines_passes(self, monkeypatch: pytest.MonkeyPatch) -> None:
        diff_text = (
            "diff --git a/x.py b/x.py\n"
            "--- a/x.py\n"
            "+++ b/x.py\n"
            "@@ -1,3 +1,3 @@\n"
            " context line\n"
            "-old line\n"
            "+new line\n"
        )
        rc, _output = _run_main(monkeypatch, diff_text)
        # "new line" is an added line but has no violation pattern
        assert rc == 0

    def test_multiple_violations_deduplicated(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        lines = ["except Exception: pass", "except ValueError: pass"]
        diff_text = _diff("x.py", lines)
        rc, output = _run_main(monkeypatch, diff_text)
        assert rc == 1
        # Each except is on a different line so both appear
        out_lines = output.strip().split("\n")
        _EXPECTED_TWO_VIOLATIONS = 2
        assert len(out_lines) == _EXPECTED_TWO_VIOLATIONS

    def test_violations_sorted_by_file_then_line(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        diff_text = _diff("z.py", ["except Exception: pass"]) + _diff(
            "a.py", ["except Exception: pass"]
        )
        rc, output = _run_main(monkeypatch, diff_text)
        assert rc == 1
        lines_out = output.strip().split("\n")
        assert lines_out[0].startswith("a.py:")
        assert lines_out[1].startswith("z.py:")

    def test_snippet_truncation(self, monkeypatch: pytest.MonkeyPatch) -> None:
        long_line = "except Exception:  # " + "x " * 200
        diff_text = _diff("x.py", ["try:", "    foo()", long_line, "    pass"])
        rc, output = _run_main(monkeypatch, diff_text)
        assert rc == 1
        assert "..." in output

    def test_keyboard_interrupt_not_flagged(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        diff_text = _diff(
            "x.py",
            ["except KeyboardInterrupt:", "    pass"],
        )
        rc, _ = _run_main(monkeypatch, diff_text)
        assert rc == 0

    def test_unknown_file_type_not_flagged(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        diff_text = _diff("x.txt", ["except Exception: pass"])
        rc, _ = _run_main(monkeypatch, diff_text)
        assert rc == 0

    def test_dev_null_file_skipped(self, monkeypatch: pytest.MonkeyPatch) -> None:
        diff_text = (
            "diff --git a/x.py b/x.py\n"
            "--- a/x.py\n"
            "+++ /dev/null\n"
            "@@ -1,1 +0,0 @@\n"
            "-except Exception: pass\n"
        )
        rc, _ = _run_main(monkeypatch, diff_text)
        assert rc == 0
