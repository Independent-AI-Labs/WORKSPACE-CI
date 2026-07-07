#!/usr/bin/env python3
"""extract-swallow-source: extract detector function source + docstrings.

Reads config/silent_swallow_patterns.yaml to find all custom_detectors
and multiline_detectors, then uses the ast module to extract each
referenced function's docstring and source code from the referenced
Python source file.

Output: web/src/data/swallow-detectors.json

This JSON is loaded by the wiki at request time to populate the
function-code dialog on Error Swallowing pattern cards.

Usage:
    uv run python scripts/extract-swallow-source.py

Or via Makefile:
    make extract-swallow
"""

import ast
import json
import os
import sys
from datetime import UTC, datetime
from pathlib import Path

import yaml

_SCRIPTS_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _SCRIPTS_DIR.parent
_CONFIG_DIR = Path(os.environ.get("CI_CONFIG_DIR") or str(_REPO_ROOT / "config"))
_LIB_DIR = Path(os.environ.get("CI_LIB_DIR") or str(_REPO_ROOT / "lib"))
_DEFAULT_DATA_DIR = _REPO_ROOT / "web" / "src" / "data"
_OUTPUT_DIR = Path(os.environ.get("CI_WEB_DATA_DIR") or str(_DEFAULT_DATA_DIR))
CONFIG_PATH = _CONFIG_DIR / "silent_swallow_patterns.yaml"
OUTPUT_PATH = _OUTPUT_DIR / "swallow-detectors.json"


def load_config() -> dict:
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return yaml.safe_load(f)


def extract_function_source(
    source_file: str,
    func_name: str,
) -> dict[str, str | None] | None:
    path = Path(source_file)
    if not path.exists():
        path = _LIB_DIR / Path(source_file).name
    if not path.exists():
        print(
            f"WARNING: {source_file} not found, skipping {func_name}",
            file=sys.stderr,
        )
        return None

    source_text = path.read_text(encoding="utf-8")
    tree = ast.parse(source_text, filename=str(path))

    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        if node.name != func_name:
            continue

        docstring = ast.get_docstring(node)
        source_segment = ast.get_source_segment(source_text, node)
        if source_segment is None:
            source_segment = ""

        source_segment = source_segment.rstrip()

        return {
            "name": func_name,
            "source_file": source_file,
            "docstring": docstring,
            "source": source_segment,
        }

    print(f"WARNING: function {func_name} not found in {source_file}", file=sys.stderr)
    return None


def main() -> int:
    config = load_config()

    detector_names: set[str] = set()
    entries: list[dict[str, str | None]] = []

    for section in ("custom_detectors", "multiline_detectors"):
        for entry in config.get(section, []):
            source_func = entry.get("source_function") or entry.get("detector")
            source_file = entry.get("source_file")
            if not source_func or not source_file:
                continue
            if source_func in detector_names:
                continue
            detector_names.add(source_func)

            result = extract_function_source(source_file, source_func)
            if result is not None:
                entries.append(result)

    output = {
        "generated_at": datetime.now(UTC).isoformat(),
        "source_version": "",
        "detectors": entries,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"Extracted {len(entries)} detector functions to {OUTPUT_PATH}")
    for entry in entries:
        print(f"  {entry['name']} ({entry['source_file']})")

    return 0


if __name__ == "__main__":
    sys.exit(main())
