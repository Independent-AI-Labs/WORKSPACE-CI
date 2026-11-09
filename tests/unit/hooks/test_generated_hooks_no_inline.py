"""Generated native hooks use the sealed runner, never inline interpreter code."""

from __future__ import annotations

import re
import subprocess
import tempfile
from pathlib import Path

INLINE = re.compile(
    r"\b(?:bash|sh|python[0-9.]*|perl|ruby|node|php|lua|awk)\s+-[ce]\b"
)
STAGES = ("pre-commit", "commit-msg", "pre-push")


def test_generated_hooks_have_no_inline_interpreter() -> None:
    root = Path(__file__).parents[3]
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(
            [str(root / "scripts" / "generate-hooks"), "--output-dir", tmp],
            cwd=root,
            check=True,
        )
        for stage in STAGES:
            body = (Path(tmp) / stage).read_text(encoding="utf-8")
            assert INLINE.search(body) is None, stage
            assert "lib/checks.sh" not in body, stage
            assert "/opt/workspace-ci/scripts/run-hook " in body, stage