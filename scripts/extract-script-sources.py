#!/usr/bin/env python3
"""extract-script-sources: extract script source code for wiki tooling page.

Reads scripts/manifest.yaml to find all script entries, then reads
each script file and extracts:
  - The file's docstring or comment header (as the docstring field)
  - The full file content (as the source field)
  - The language (python or bash, detected from extension/shebang)

Output: web/src/data/script-sources.json

This JSON is loaded by the wiki at request time to populate the
EntryPointDialog on Tooling cards.

Usage:
    uv run python scripts/extract-script-sources.py
"""

import ast
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import yaml

_SCRIPTS_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _SCRIPTS_DIR.parent
_OUTPUT_DIR = Path(
    os.environ.get("CI_WEB_DATA_DIR")
    or str(_REPO_ROOT / "web" / "src" / "data")
)
CONFIG_PATH = _REPO_ROOT / "scripts" / "manifest.yaml"
OUTPUT_PATH = _OUTPUT_DIR / "script-sources.json"


def load_config() -> dict:
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return yaml.safe_load(f)


def _first_paragraph(text: str) -> str:
    if not text:
        return ""
    paragraphs = text.strip().split("\n\n")
    return paragraphs[0].strip().replace("\n", " ")


def _detect_language(path: Path) -> str:
    if path.suffix == ".py":
        return "python"
    text = path.read_text(encoding="utf-8", errors="replace")
    first_line = text.splitlines()[0] if text else ""
    if first_line.startswith("#!"):
        if "python" in first_line:
            return "python"
        if "bash" in first_line or "sh" in first_line:
            return "bash"
    return "bash"


def _extract_bash_docstring(lines: list[str]) -> str | None:
    doc_lines: list[str] = []
    in_header = False
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("#!"):
            continue
        if stripped == "":
            if in_header:
                break
            continue
        if stripped.startswith("#"):
            in_header = True
            text = stripped.lstrip("#").strip()
            if text:
                doc_lines.append(text)
        else:
            break
    return " ".join(doc_lines) if doc_lines else None


def extract_script(entry: dict) -> dict[str, str | None] | None:
    script_id = entry.get("id", "")
    rel_path = entry.get("path", "")
    if not script_id or not rel_path:
        return None

    file_path = _REPO_ROOT / rel_path
    if not file_path.exists():
        print(
            f"WARNING: script file '{rel_path}' not found",
            file=sys.stderr,
        )
        return None

    source_text = file_path.read_text(encoding="utf-8")
    language = _detect_language(file_path)

    docstring: str | None = None
    if language == "python":
        try:
            tree = ast.parse(source_text, filename=str(file_path))
            module_doc = ast.get_docstring(tree)
            if module_doc:
                docstring = _first_paragraph(module_doc)
        except SyntaxError as exc:
            print(
                f"WARNING: failed to parse {file_path}: {exc}",
                file=sys.stderr,
            )
    else:
        docstring = _extract_bash_docstring(source_text.splitlines())

    if not docstring:
        docstring = entry.get("summary")

    return {
        "id": script_id,
        "name": script_id,
        "source_file": rel_path,
        "docstring": docstring,
        "source": source_text,
        "language": language,
    }


def main() -> int:
    config = load_config()
    scripts = config.get("scripts", [])

    sources: list[dict[str, str | None]] = []
    for entry in scripts:
        result = extract_script(entry)
        if result is None:
            continue
        sources.append(result)

    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "sources": sources,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"Extracted {len(sources)} script sources to {OUTPUT_PATH}")
    for entry in sources:
        print(f"  {entry['id']}: {entry['language']} ({entry['source_file']})")

    return 0


if __name__ == "__main__":
    sys.exit(main())
