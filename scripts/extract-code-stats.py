#!/usr/bin/env python3
"""extract-code-stats: run code-stats --json and save to web data dir.

Invokes ``scripts/code-stats --json`` (which runs cloc across all nested
git repos under the workspace root) and saves the result to
``web/src/data/code-stats.json`` with a ``generated_at`` timestamp.

This JSON is loaded by the wiki at request time to populate per-language
code-statistics badges on the Project Catalogue home page.

Usage:
    uv run python scripts/extract-code-stats.py

Or via Makefile:
    make extract-code-stats
"""

import json
import os
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _SCRIPTS_DIR.parent
_DEFAULT_DATA_DIR = _REPO_ROOT / "web" / "src" / "data"
_OUTPUT_DIR = Path(os.environ.get("CI_WEB_DATA_DIR") or str(_DEFAULT_DATA_DIR))
_OUTPUT_PATH = _OUTPUT_DIR / "code-stats.json"
_CODE_STATS = _SCRIPTS_DIR / "code-stats"


def main() -> int:
    if not _CODE_STATS.exists():
        print(f"ERROR: code-stats script not found at {_CODE_STATS}", file=sys.stderr)
        return 1

    workspace_root = os.environ.get("CI_WORKSPACE_ROOT", "").strip()
    if not workspace_root:
        # Umbrella repo (WORKSPACE-VM) root, not projects/; nested repos live under projects/.
        _projects_root = _REPO_ROOT.parent
        workspace_root = str(_projects_root.parent)

    env = dict(os.environ)
    env["CI_WORKSPACE_ROOT"] = workspace_root

    try:
        result = subprocess.run(
            ["bash", str(_CODE_STATS), "--json"],
            capture_output=True,
            text=True,
            env=env,
            cwd=str(_REPO_ROOT),
            check=True,
        )
    except subprocess.CalledProcessError as exc:
        print(
            f"ERROR: code-stats failed (rc={exc.returncode})",
            file=sys.stderr,
        )
        if exc.stderr:
            print(exc.stderr, file=sys.stderr)
        return exc.returncode

    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        print(f"ERROR: failed to parse code-stats JSON: {exc}", file=sys.stderr)
        return 1

    output = {
        "generated_at": datetime.now(UTC).isoformat(),
        "totals": data.get("totals", {}),
        "repos": data.get("repos", []),
        "languages": data.get("languages", []),
        "repo_languages": data.get("repo_languages", []),
    }

    _OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(_OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
        f.write("\n")

    totals = output["totals"]
    print(f"Extracted code stats to {_OUTPUT_PATH}")
    print(f"  Repos : {totals.get('repos', 0)}")
    print(f"  Files : {totals.get('files', 0):,}")
    print(f"  Code  : {totals.get('code', 0):,}")
    print(f"  Languages: {len(output['languages'])}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
