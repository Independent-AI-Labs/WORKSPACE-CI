#!/usr/bin/env python3
"""workspace-ci banned-words scanner.

Reads banned_words.yaml + banned_words_exceptions.yaml via PyYAML,
scans all tracked files for banned patterns, emits violations.

Exits 0 if no violations, 1 otherwise.

Self-contained: requires PyYAML (already a project dependency).
Invoked from lib/checks_core.sh::ci_check_banned_words.

Replaces the bash + AWK implementation (lib/parse_banned_words.awk +
lib/parse_exceptions.awk + 170-line ci_check_banned_words shell
function) which spawned ~33,000 subprocesses under PRoot (58 patterns
x 96 files x ~6 procs/iteration), taking 5+ minutes. This Python
implementation does zero subprocess spawns for pattern matching
(one git ls-files call for file discovery) and completes in <1s.
"""

import re
import subprocess
import sys
from pathlib import Path
from typing import Any

import yaml
from ci_paths import find_config_dir


def _merge_exceptions(exc_map: dict[str, list[str]], exc_path: Path) -> None:
    """Load a banned_words_exceptions.yaml file and merge into exc_map."""
    if not exc_path.is_file():
        return
    with open(exc_path) as f:
        exc_data: Any = yaml.safe_load(f) or {}
    for exc in exc_data.get("exceptions") or []:
        pattern = exc.get("pattern", "")
        paths = exc.get("paths") or []
        if pattern and paths:
            exc_map.setdefault(str(pattern), []).extend(paths)


def _load_config(
    config_dir: Path,
) -> tuple[
    list[dict[str, str]],
    dict[str, list[dict[str, str]]],
    list[dict[str, str]],
    dict[str, list[str]],
]:
    """Load banned_words.yaml + banned_words_exceptions.yaml.

    Returns (banned, directory_rules, filename_rules, exc_map).
    exc_map: pattern -> [path_regex, ...] (universal + project).
    Supports '.*' as a wildcard: if '.*' is a key, its paths
    exempt matching files from ALL patterns.

    Exceptions are loaded from two sources (matching the prior bash
    implementation's behaviour):
    1. CI_CONFIG_DIR/banned_words_exceptions.yaml: CI's own exceptions
    2. config/banned_words_exceptions.yaml relative to CWD: per-project
       exceptions (each repo has its own). Skipped if it resolves to the
       same file as #1 (avoids double-loading when running from CI itself).
    """
    bw_path = config_dir / "banned_words.yaml"
    with open(bw_path) as f:
        bw: Any = yaml.safe_load(f) or {}

    banned: list[dict[str, str]] = bw.get("banned") or []
    raw_dir: Any = bw.get("directory_rules") or {}
    directory_rules: dict[str, list[dict[str, str]]] = {}
    for dir_key, rules in raw_dir.items():
        directory_rules[str(dir_key)] = rules or []
    filename_rules: list[dict[str, str]] = bw.get("filename_rules") or []

    exc_map: dict[str, list[str]] = {}

    for exc in bw.get("universal_exceptions") or []:
        paths = exc.get("paths") or []
        for pattern in exc.get("patterns") or []:
            exc_map.setdefault(str(pattern), []).extend(paths)

    ci_exc_path = config_dir / "banned_words_exceptions.yaml"
    _merge_exceptions(exc_map, ci_exc_path)

    project_exc_path = Path("config") / "banned_words_exceptions.yaml"
    if project_exc_path.resolve() != ci_exc_path.resolve():
        _merge_exceptions(exc_map, project_exc_path)

    return banned, directory_rules, filename_rules, exc_map


def _is_exempt(
    filepath: str,
    pattern: str,
    exc_map: dict[str, list[str]],
) -> bool:
    """Check if (filepath, pattern) is exempted.

    Checks both the exact pattern key and the '.*' wildcard.
    The '.*' wildcard exempts matching files from ALL patterns,
    fixing a bug in the prior bash implementation where the
    '.*' key in the exception map was a dead entry (exact key
    match never matched any banned pattern).
    """
    wildcard_paths = exc_map.get(".*")
    if wildcard_paths:
        for pr in wildcard_paths:
            if re.search(pr, filepath):
                return True
    paths = exc_map.get(pattern)
    if not paths:
        return False
    return any(re.search(pr, filepath) for pr in paths)


def _get_files(argv_files: list[str]) -> list[str]:
    """Get file list from argv or git ls-files."""
    if argv_files:
        return argv_files
    try:
        result = subprocess.run(
            [
                "git",
                "ls-files",
                "--cached",
                "--others",
                "--exclude-standard",
            ],
            capture_output=True,
            text=True,
            stdin=subprocess.DEVNULL,
            check=True,
        )
    except subprocess.CalledProcessError as exc:
        sys.stderr.write(f"git ls-files failed (exit {exc.returncode})")
        if exc.stderr:
            sys.stderr.write(f": {exc.stderr}")
        sys.stderr.write("\n")
        return []
    if result.stderr:
        sys.stderr.write(f"git ls-files: {result.stderr}")
    return [f for f in result.stdout.splitlines() if f]


def _compile_rules(
    rules: list[dict[str, str]],
) -> list[tuple[re.Pattern[str], str, str]]:
    """Compile pattern+reason rules into (regex, pattern, reason)."""
    compiled: list[tuple[re.Pattern[str], str, str]] = []
    for rule in rules:
        pattern = rule.get("pattern", "")
        reason = rule.get("reason", "")
        if not isinstance(pattern, str) or not pattern:
            continue
        if not isinstance(reason, str):
            reason = str(reason)
        try:
            compiled.append((re.compile(pattern), pattern, reason))
        except re.error as exc:
            sys.stderr.write(
                f"WARNING: Skipping invalid pattern: '{pattern}' ({exc})\n"
            )
    return compiled


def _emit(
    filepath: str,
    line_num: int,
    pattern: str,
    reason: str,
    content: str,
) -> None:
    """Print a violation in the ci_error format."""
    print(f"{filepath}:{line_num}")
    print(f"  Pattern: {pattern}")
    print(f"  Reason:  {reason}")
    snippet = content.rstrip()[:80]
    if snippet:
        print(f"  > {snippet}")


def _scan_filename_rules(
    filepath: str,
    bn: str,
    c_filename: list[tuple[re.Pattern[str], str, str]],
    exc_map: dict[str, list[str]],
) -> int:
    """Scan filename against filename rules. Returns error count."""
    errors = 0
    for rgx, pat, rsn in c_filename:
        if _is_exempt(filepath, pat, exc_map):
            continue
        if rgx.search(bn):
            _emit(filepath, 0, pat, rsn, bn)
            errors += 1
    return errors


def _scan_line_rules(
    filepath: str,
    lines: list[str],
    compiled: list[tuple[re.Pattern[str], str, str]],
    exc_map: dict[str, list[str]],
) -> int:
    """Scan file lines against compiled rules. Returns error count."""
    errors = 0
    for rgx, pat, rsn in compiled:
        if _is_exempt(filepath, pat, exc_map):
            continue
        for i, line in enumerate(lines, 1):
            if rgx.search(line):
                _emit(filepath, i, pat, rsn, line)
                errors += 1
    return errors


def _scan_directory_rules(
    filepath: str,
    lines: list[str],
    c_dir: dict[str, list[tuple[re.Pattern[str], str, str]]],
    exc_map: dict[str, list[str]],
) -> int:
    """Scan file against directory-specific rules. Returns error count."""
    errors = 0
    for dk, compiled in c_dir.items():
        if not (filepath.startswith(f"{dk}/") or f"/{dk}/" in filepath):
            continue
        errors += _scan_line_rules(filepath, lines, compiled, exc_map)
    return errors


def _scan_file(
    filepath: str,
    c_banned: list[tuple[re.Pattern[str], str, str]],
    c_dir: dict[str, list[tuple[re.Pattern[str], str, str]]],
    c_filename: list[tuple[re.Pattern[str], str, str]],
    exc_map: dict[str, list[str]],
) -> int:
    """Scan a single file for banned patterns. Returns error count."""
    if not Path(filepath).is_file():
        return 0

    bn = filepath.rsplit("/", 1)[-1] if "/" in filepath else filepath

    errors = _scan_filename_rules(filepath, bn, c_filename, exc_map)

    try:
        with open(filepath, errors="replace") as f:
            lines = f.readlines()
    except OSError as exc:
        sys.stderr.write(f"WARNING: Cannot read {filepath}: {exc}\n")
        return errors

    errors += _scan_directory_rules(filepath, lines, c_dir, exc_map)
    errors += _scan_line_rules(filepath, lines, c_banned, exc_map)
    return errors


def _compile_dir_rules(
    directory_rules: dict[str, list[dict[str, str]]],
) -> dict[str, list[tuple[re.Pattern[str], str, str]]]:
    """Compile directory rules into a dict of (regex, pattern, reason)."""
    c_dir: dict[str, list[tuple[re.Pattern[str], str, str]]] = {}
    for dk, rules in directory_rules.items():
        c_dir[dk] = _compile_rules(rules)
    return c_dir


def main() -> int:
    config_dir = find_config_dir()
    argv_files = sys.argv[1:]

    bw_path = config_dir / "banned_words.yaml"
    if not bw_path.is_file():
        sys.stderr.write(f"Config not found: {bw_path}\n")
        return 1

    (
        banned,
        directory_rules,
        filename_rules,
        exc_map,
    ) = _load_config(config_dir)

    files = _get_files(argv_files)
    if not files:
        print("No banned patterns found.")
        return 0

    print(f"Scanning {len(files)} file(s) for banned patterns...")

    c_banned = _compile_rules(banned)
    c_dir = _compile_dir_rules(directory_rules)
    c_filename = _compile_rules(filename_rules)

    errors = 0
    for filepath in files:
        errors += _scan_file(filepath, c_banned, c_dir, c_filename, exc_map)

    if errors > 0:
        print(f"\n{errors} banned pattern(s) found.")
        return 1

    print("No banned patterns found.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
