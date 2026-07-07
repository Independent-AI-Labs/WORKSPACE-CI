#!/usr/bin/env python3
"""extract-hook-descriptions: extract hook entrypoint descriptions.

Reads config/required_hooks.yaml to find all hook entries, then extracts
a human-readable description from each hook's entrypoint:

  - shell / shell_with_arg:    comment block after the ``# --- <func> ---``
                               marker in lib/checks*.sh files.
  - python_module / _files:    module-level docstring (first paragraph)
                               via ast from ci/<module>.py.
  - makefile_target:           ``## `` help comment from the Makefile.

Output: web/src/data/hook-descriptions.json

This JSON is loaded by the wiki at request time to populate the
description field on Hook cards.

Usage:
    uv run python scripts/extract-hook-descriptions.py
"""

import ast
import json
import os
import re
import sys
from datetime import UTC, datetime
from pathlib import Path

import yaml

_SCRIPTS_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _SCRIPTS_DIR.parent
_CONFIG_DIR = Path(os.environ.get("CI_CONFIG_DIR") or str(_REPO_ROOT / "config"))
_LIB_DIR = Path(os.environ.get("CI_LIB_DIR") or str(_REPO_ROOT / "lib"))
_CI_DIR = Path(os.environ.get("CI_CI_DIR") or str(_REPO_ROOT / "ci"))
_DEFAULT_DATA_DIR = _REPO_ROOT / "web" / "src" / "data"
_OUTPUT_DIR = Path(os.environ.get("CI_WEB_DATA_DIR") or str(_DEFAULT_DATA_DIR))
CONFIG_PATH = _CONFIG_DIR / "required_hooks.yaml"
MAKEFILE_PATH = _REPO_ROOT / "Makefile"
OUTPUT_PATH = _OUTPUT_DIR / "hook-descriptions.json"
_PREVIEW_LIMIT = 80


def load_config() -> dict:
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return yaml.safe_load(f)


def _first_paragraph(text: str) -> str:
    """Return the first paragraph of a docstring (before first blank line)."""
    if not text:
        return ""
    paragraphs = text.strip().split("\n\n")
    return paragraphs[0].strip().replace("\n", " ")


def extract_shell_description(entry: str) -> str:
    """Find the ``# --- <entry> ---`` marker and collect comment lines after it."""
    marker_re = re.compile(r"^#\s*---\s*" + re.escape(entry) + r"\b")

    sh_files = sorted(_LIB_DIR.glob("checks*.sh"))
    for sh_file in sh_files:
        lines = sh_file.read_text(encoding="utf-8").splitlines()
        for i, line in enumerate(lines):
            if not marker_re.match(line):
                continue
            desc_lines: list[str] = []
            for j in range(i + 1, len(lines)):
                stripped = lines[j].lstrip()
                if stripped.startswith("#"):
                    text = stripped.lstrip("#").strip()
                    if text:
                        desc_lines.append(text)
                elif stripped == "":
                    continue
                else:
                    break
            if desc_lines:
                return " ".join(desc_lines)
    return ""


def extract_python_description(entry: str) -> str:
    """Parse the module-level docstring from a Python entrypoint."""
    module_part = entry.split(maxsplit=1)[0]
    parts = module_part.split(".")
    py_path = _CI_DIR.joinpath(*parts).with_suffix(".py")
    if not py_path.exists():
        py_path = Path(*parts).with_suffix(".py")
    if not py_path.exists():
        print(
            f"WARNING: Python module for entry '{entry}' not found",
            file=sys.stderr,
        )
        return ""

    source_text = py_path.read_text(encoding="utf-8")
    tree = ast.parse(source_text, filename=str(py_path))
    docstring = ast.get_docstring(tree)
    return _first_paragraph(docstring or "")


def extract_makefile_description(entry: str) -> str:
    """Find ``target: ## description`` in the Makefile."""
    if not MAKEFILE_PATH.exists():
        return ""
    target_re = re.compile(
        r"^" + re.escape(entry) + r"\s*:.*?##\s*(.+)$"
    )
    for line in MAKEFILE_PATH.read_text(encoding="utf-8").splitlines():
        m = target_re.match(line)
        if m:
            return m.group(1).strip()
    return ""


def extract_description(hook: dict) -> str:
    kind = hook.get("kind", "")
    entry = hook.get("entry", "")

    if kind in ("shell", "shell_inline", "shell_with_arg"):
        return extract_shell_description(entry)
    if kind in ("python_module", "python_module_files"):
        return extract_python_description(entry)
    if kind == "makefile_target":
        return extract_makefile_description(entry)
    return ""


def main() -> int:
    config = load_config()
    hooks = config.get("hooks", [])

    descriptions: dict[str, str] = {}
    for hook in hooks:
        hook_id = hook.get("id", "")
        if not hook_id:
            continue
        desc = extract_description(hook)
        if desc:
            descriptions[hook_id] = desc
        else:
            print(
                f"WARNING: no description extracted for hook '{hook_id}'",
                file=sys.stderr,
            )

    output = {
        "generated_at": datetime.now(UTC).isoformat(),
        "descriptions": descriptions,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"Extracted {len(descriptions)} hook descriptions to {OUTPUT_PATH}")
    for hook_id, desc in descriptions.items():
        preview = desc[:_PREVIEW_LIMIT] + "..." if len(desc) > _PREVIEW_LIMIT else desc
        print(f"  {hook_id}: {preview}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
