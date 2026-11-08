"""check-generated must verify generated data without mutating it."""

from __future__ import annotations

import hashlib
import subprocess
from pathlib import Path

TRACKED = ("hook-sources.json", "script-sources.json")


def _digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def test_check_generated_is_read_only() -> None:
    root = Path(__file__).parents[3]
    data_dir = root / "web" / "src" / "data"
    before = {name: _digest(data_dir / name) for name in TRACKED}

    subprocess.run(["make", "check-generated"], cwd=root, check=True)
    after = {name: _digest(data_dir / name) for name in TRACKED}
    assert after == before