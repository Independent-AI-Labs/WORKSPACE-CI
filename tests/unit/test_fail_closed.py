"""Fail-closed tests for check_silent_swallow when config is missing.

These tests prove that the Python checker fails-closed (exits non-zero)
when its config file is missing, rather than crashing with an
unhandled exception that the bash wrapper might swallow.

Context: The prior bug was that check_silent_swallow.py used a
relative path default ``Path("config")`` for config resolution.
When invoked from a sibling repo (WORKSPACE-GUARD) whose CWD was
not the CI root, the config file was not found, causing an
unhandled FileNotFoundError. The bash wrapper (checks_silent.sh)
gated error-counting on BOTH non-zero exit AND non-empty stdout,
so the crash (empty stdout) was swallowed as a clean pass.

The fix has two layers:
  1. ci_paths.find_config_dir() resolves config path from __file__,
     not CWD.
  2. _load_config() checks file existence and exits with code 2
     (distinguishable from violation exit code 1) with a clear
     stderr message.

These tests verify layer 2: the fail-closed behavior at the Python
level when the config is genuinely missing.
"""

from __future__ import annotations

import io
from pathlib import Path

import pytest

import check_silent_swallow


def _patch_config_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    """Patch _CONFIG_PATH to point to a nonexistent file."""
    monkeypatch.setattr(
        check_silent_swallow,
        "_CONFIG_PATH",
        Path("/nonexistent/config/silent_swallow_patterns.yaml"),
    )


def _run_main(
    monkeypatch: pytest.MonkeyPatch, diff_text: str
) -> tuple[int, str, str]:
    """Run main() with stdin replaced by diff_text."""
    monkeypatch.setattr("sys.stdin", io.TextIOWrapper(io.BytesIO(diff_text.encode())))
    out = io.StringIO()
    err = io.StringIO()
    monkeypatch.setattr("sys.stdout", out)
    monkeypatch.setattr("sys.stderr", err)
    rc = check_silent_swallow.main()
    return rc, out.getvalue(), err.getvalue()


class TestFailClosedMissingConfig:
    """Prove check_silent_swallow fails-closed when config is missing."""

    def test_exits_nonzero_when_config_missing(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _patch_config_missing(monkeypatch)
        diff = "--- a/x.py\n+++ b/x.py\n@@ -0,0 +1,1 @@\n+def f(): return 1\n"
        with pytest.raises(SystemExit) as exc_info:
            _run_main(monkeypatch, diff)
        assert exc_info.value.code != 0, (
            "check_silent_swallow must exit non-zero when config is missing"
        )

    def test_stderr_message_when_config_missing(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _patch_config_missing(monkeypatch)
        diff = "--- a/x.py\n+++ b/x.py\n@@ -0,0 +1,1 @@\n+def f(): return 1\n"
        err_capture = io.StringIO()
        monkeypatch.setattr("sys.stderr", err_capture)
        monkeypatch.setattr("sys.stdin", io.TextIOWrapper(io.BytesIO(diff.encode())))
        with pytest.raises(SystemExit):
            check_silent_swallow.main()
        err = err_capture.getvalue()
        assert "Config not found" in err, (
            f"stderr should mention missing config, got: {err!r}"
        )

    def test_exits_nonzero_when_config_dir_empty(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        monkeypatch.setattr(
            check_silent_swallow,
            "_CONFIG_PATH",
            tmp_path / "silent_swallow_patterns.yaml",
        )
        diff = "--- a/x.py\n+++ b/x.py\n@@ -0,0 +1,1 @@\n+def f(): return 1\n"
        with pytest.raises(SystemExit) as exc_info:
            _run_main(monkeypatch, diff)
        assert exc_info.value.code != 0
