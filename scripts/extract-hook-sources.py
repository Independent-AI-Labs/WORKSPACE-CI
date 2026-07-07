#!/usr/bin/env python3
"""extract-hook-sources: extract hook entrypoint source code.

Reads config/required_hooks.yaml to find all hook entries, then extracts
the source code of each hook's entrypoint:

  - shell / shell_inline / shell_with_arg:  bash function body via
    brace-matching in lib/checks*.sh files.
  - python_module / python_module_files:    main() function via AST
    from ci/<module>.py (falls back to module-level docstring + all
    top-level defs).
  - makefile_target:                        recipe block from Makefile.

Output: web/src/data/hook-sources.json

This JSON is loaded by the wiki at request time to populate the
EntryPointDialog on Hook cards.

Usage:
    uv run python scripts/extract-hook-sources.py
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
_CONFIG_DIR = Path(
    os.environ.get("CI_CONFIG_DIR") or str(_REPO_ROOT / "config")
)
_LIB_DIR = Path(os.environ.get("CI_LIB_DIR") or str(_REPO_ROOT / "lib"))
_CI_DIR = Path(os.environ.get("CI_CI_DIR") or str(_REPO_ROOT / "ci"))
_OUTPUT_DIR = Path(
    os.environ.get("CI_WEB_DATA_DIR")
    or str(_REPO_ROOT / "web" / "src" / "data")
)
CONFIG_PATH = _CONFIG_DIR / "required_hooks.yaml"
MAKEFILE_PATH = _REPO_ROOT / "Makefile"
OUTPUT_PATH = _OUTPUT_DIR / "hook-sources.json"


def load_config() -> dict:
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return yaml.safe_load(f)


def _first_paragraph(text: str) -> str:
    if not text:
        return ""
    paragraphs = text.strip().split("\n\n")
    return paragraphs[0].strip().replace("\n", " ")


def _extract_brace_body(lines: list[str], start_idx: int) -> list[str] | None:
    """Extract the function body from start_idx, tracking brace depth."""
    depth = 0
    started = False
    body: list[str] = []
    for j in range(start_idx, len(lines)):
        body.append(lines[j])
        for ch in lines[j]:
            if ch == "{":
                depth += 1
                started = True
            elif ch == "}":
                depth -= 1
        if started and depth == 0:
            return body
    return None


def _extract_leading_comments(lines: list[str], start_idx: int) -> str | None:
    """Scan upward from start_idx for consecutive comment lines."""
    doc_lines: list[str] = []
    for k in range(start_idx - 1, -1, -1):
        stripped = lines[k].lstrip()
        if stripped.startswith("#"):
            text = stripped.lstrip("#").strip()
            if text:
                doc_lines.insert(0, text)
        elif stripped == "":
            continue
        else:
            break
    return " ".join(doc_lines) if doc_lines else None


def extract_shell_function(entry: str) -> dict[str, str | None] | None:
    func_re = re.compile(
        r"^(\s*)" + re.escape(entry) + r"\s*\(\)\s*\{"
    )

    sh_files = sorted(_LIB_DIR.glob("checks*.sh"))
    sh_files.extend(sorted(_LIB_DIR.glob("ci.sh")))

    for sh_file in sh_files:
        if not sh_file.exists():
            continue
        lines = sh_file.read_text(encoding="utf-8").splitlines()
        for i, line in enumerate(lines):
            m = func_re.match(line)
            if not m:
                continue

            body = _extract_brace_body(lines, i)
            if body is None:
                continue

            source = "\n".join(body)
            rel_path = str(sh_file.relative_to(_REPO_ROOT))
            docstring = _extract_leading_comments(lines, i)

            return {
                "name": entry,
                "source_file": rel_path,
                "docstring": docstring,
                "source": source,
                "language": "bash",
            }
    return None


def extract_python_main(entry: str) -> dict[str, str | None] | None:
    module_part = entry.split(maxsplit=1)[0]
    parts = module_part.split(".")
    py_path = _CI_DIR.joinpath(*parts).with_suffix(".py")
    if not py_path.exists():
        py_path = _REPO_ROOT.joinpath(*parts).with_suffix(".py")
    if not py_path.exists():
        print(
            f"WARNING: Python module for entry '{entry}' not found",
            file=sys.stderr,
        )
        return None

    rel_path = str(py_path.relative_to(_REPO_ROOT))
    source_text = py_path.read_text(encoding="utf-8")
    tree = ast.parse(source_text, filename=str(py_path))

    module_docstring = ast.get_docstring(tree)

    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        if node.name != "main":
            continue

        docstring = ast.get_docstring(node) or module_docstring
        source_segment = ast.get_source_segment(source_text, node)
        if source_segment is None:
            source_segment = source_text
        source_segment = source_segment.rstrip()

        return {
            "name": entry,
            "source_file": rel_path,
            "docstring": _first_paragraph(docstring) if docstring else None,
            "source": source_segment,
            "language": "python",
        }

    return {
        "name": entry,
        "source_file": rel_path,
        "docstring": _first_paragraph(module_docstring)
        if module_docstring
        else None,
        "source": source_text,
        "language": "python",
    }


def extract_makefile_target(entry: str) -> dict[str, str | None] | None:
    if not MAKEFILE_PATH.exists():
        return None

    lines = MAKEFILE_PATH.read_text(encoding="utf-8").splitlines()
    target_re = re.compile(
        r"^" + re.escape(entry) + r"\s*:.*?##\s*(.+)$"
    )
    target_start_re = re.compile(
        r"^" + re.escape(entry) + r"\s*:"
    )

    for i, line in enumerate(lines):
        m = target_re.match(line)
        docstring = m.group(1).strip() if m else None

        if not target_start_re.match(line):
            continue

        body: list[str] = [line]
        for j in range(i + 1, len(lines)):
            stripped = lines[j]
            if stripped.startswith("\t") or stripped.strip() == "":
                body.append(lines[j])
            else:
                break

        while body and body[-1].strip() == "":
            body.pop()

        source = "\n".join(body)
        return {
            "name": entry,
            "source_file": "Makefile",
            "docstring": docstring,
            "source": source,
            "language": "makefile",
        }

    return None


def extract_source(hook: dict) -> dict[str, str | None] | None:
    kind = hook.get("kind", "")
    entry = hook.get("entry", "")

    if kind in ("shell", "shell_inline", "shell_with_arg"):
        return extract_shell_function(entry)
    if kind in ("python_module", "python_module_files"):
        return extract_python_main(entry)
    if kind == "makefile_target":
        return extract_makefile_target(entry)
    return None


def main() -> int:
    config = load_config()
    hooks = config.get("hooks", [])

    sources: list[dict[str, str | None]] = []
    for hook in hooks:
        hook_id = hook.get("id", "")
        if not hook_id:
            continue
        result = extract_source(hook)
        if result is None:
            print(
                f"WARNING: no source extracted for hook '{hook_id}'",
                file=sys.stderr,
            )
            continue
        result["id"] = hook_id
        sources.append(result)

    output = {
        "generated_at": datetime.now(UTC).isoformat(),
        "sources": sources,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"Extracted {len(sources)} hook sources to {OUTPUT_PATH}")
    for entry in sources:
        print(f"  {entry['id']}: {entry['name']} ({entry['source_file']})")

    return 0


if __name__ == "__main__":
    sys.exit(main())
