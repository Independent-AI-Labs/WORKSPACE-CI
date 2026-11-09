"""Galaxy source checker.

Checks every tracked ``.galaxy`` file for:
- tab indentation
- balanced braces and parentheses
- duplicate top-level function definitions
- ``include`` targets that resolve to a file

The checker is read-only and exits non-zero when it finds a violation.
"""

from __future__ import annotations

import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

FUNC_RE = re.compile(
    r"^(?:[A-Za-z_][A-Za-z0-9_ ]*?)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^;]*\)\s*\{"
)
INCLUDE_RE = re.compile(r'^\s*include\s+"([^"]+)"')
STRING_OR_COMMENT = re.compile(r'"(?:\\.|[^"\\])*"|//[^\n]*')


def _strip(text: str) -> str:
    return STRING_OR_COMMENT.sub("", text)


def _galaxy_files() -> list[Path]:
    cmd = ["git", "ls-files", "--cached", "--others", "--exclude-standard", "*.galaxy"]
    try:
        result = subprocess.run(cmd, check=True, capture_output=True, text=True)
    except (OSError, subprocess.SubprocessError) as exc:
        print(f"galaxy: git ls-files failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
    if result.stderr:
        sys.stderr.write(f"galaxy: git ls-files: {result.stderr}")
    return [Path(line) for line in result.stdout.splitlines() if line]


def _check_balance(path: Path, text: str, errors: list[str]) -> None:
    clean = _strip(text)
    for opening, closing, label in (("{", "}", "brace"), ("(", ")", "parenthesis")):
        depth = 0
        for char in clean:
            if char == opening:
                depth += 1
            elif char == closing:
                depth -= 1
                if depth < 0:
                    errors.append(f"{path}: unmatched {label} {closing}")
                    break
        if depth > 0:
            errors.append(f"{path}: {depth} unclosed {label}(s)")


def _check_tabs(path: Path, text: str, errors: list[str]) -> None:
    for number, line in enumerate(text.splitlines(), start=1):
        if line[: len(line) - len(line.lstrip("\t"))]:
            errors.append(f"{path}:{number}: tab indentation")


def _resolve_include(path: Path, name: str) -> bool:
    if name.startswith("TriggerLibs/"):
        return True
    target = name + ".galaxy"
    return any((base / target).is_file() for base in (path.parent, *path.parents))


def _check_includes(path: Path, text: str, errors: list[str]) -> None:
    for number, line in enumerate(text.splitlines(), start=1):
        match = INCLUDE_RE.match(line)
        if match is None:
            continue
        if not _resolve_include(path, match.group(1)):
            errors.append(f"{path}:{number}: missing include {match.group(1)}")


def _check_duplicates(
    names: dict[str, list[str]], include_names: dict[str, list[str]]
) -> list[str]:
    errors: list[str] = []
    for name, places in names.items():
        if len(places) > 1:
            errors.append(f"duplicate function {name}: {', '.join(places)}")
    for name, places in include_names.items():
        if len(places) > 1:
            errors.append(f"duplicate include {name}: {', '.join(places)}")
    return errors


def main() -> int:
    files = _galaxy_files()
    if not files:
        print("galaxy: no files")
        return 0

    errors: list[str] = []
    funcs: dict[str, list[str]] = defaultdict(list)
    includes: dict[str, list[str]] = defaultdict(list)
    for path in files:
        text = path.read_text(encoding="utf-8")
        _check_balance(path, text, errors)
        _check_tabs(path, text, errors)
        _check_includes(path, text, errors)
        for line in text.splitlines():
            match = FUNC_RE.match(line)
            if match is not None:
                funcs[match.group(1)].append(str(path))
            include = INCLUDE_RE.match(line)
            if include is not None:
                includes[include.group(1)].append(str(path))
    errors.extend(_check_duplicates(funcs, includes))

    for error in errors:
        print(error)
    if errors:
        print(f"galaxy: {len(errors)} violation(s)")
        return 1
    print(f"galaxy: {len(files)} file(s) OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
