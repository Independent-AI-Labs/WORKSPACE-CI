"""Banned-pattern matching engine (schema v5).

Contract highlights (REQ-BANNED-PATTERN-MATCHING):
- §12.1-3: strict UTF-8 decode; invalid bytes or NUL in text fail the check.
- §12.5-6: exact-tracked-type binary classification happens before decoding.
- §15: exemptions resolve once per file, by stable rule ID.
- §16.5-6: one decode per file; every regex compiled once per process.
- §18.1: file content is read once; whole-content matching reports every
  match with its original line and column.
"""

from __future__ import annotations

import bisect
import re
import time
from collections.abc import Iterator
from pathlib import Path

from . import classify, normalize
from .model import ExceptionEntry, Policy, Rule

SKIP_CONTENT_CLASSES = frozenset(
    {"binary", "generated", "lock", "reference", "fixture", "policy-definition"}
)

# Resource budgets (16.4, 18.5-18.6): fail closed with a specific rule
# when a file or a single rule's matching exceeds these bounds.
MAX_FILE_BYTES = 16 * 1024 * 1024
MAX_FINDINGS_PER_RULE = 10_000
MAX_SECONDS_PER_FILE = 30.0


class Finding:
    __slots__ = ("col", "line", "matched", "path", "rule")

    def __init__(self, path: str, line: int, col: int, rule: Rule, matched: str):
        self.path = path
        self.line = line
        self.col = col
        self.rule = rule
        self.matched = matched


class InputError(Exception):
    """A tracked text file failed strict input validation (fail closed)."""


class BudgetError(Exception):
    """A resource budget was exceeded (fail closed with rule context)."""


class LineMap:
    """Offset → (line, column) mapping built once per file."""

    def __init__(self, text: str) -> None:
        self._offsets = [0]
        for idx, ch in enumerate(text):
            if ch == "\n":
                self._offsets.append(idx + 1)

    def locate(self, offset: int) -> tuple[int, int]:
        line = bisect.bisect_right(self._offsets, offset)
        col = offset - self._offsets[line - 1] + 1
        return line, col


def read_text(path: Path) -> str:
    """Strict whole-file read: invalid UTF-8 or NUL bytes fail the check."""
    data = path.read_bytes()
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError as exc:
        _msg = f"invalid UTF-8 at byte {exc.start}: {exc.reason}"
        raise InputError(_msg) from exc
    if "\x00" in text:
        _msg = "NUL byte present in declared text file"
        raise InputError(_msg)
    return text


def exempt_rule_ids(
    path: str,
    policy: Policy,
    project_exceptions: dict[str, list[ExceptionEntry]],
) -> frozenset[str]:
    """Resolve the file's exempt rule set once (universal + project)."""
    ids: set[str] = set()
    for entries in policy.exceptions.values():
        for exc in entries:
            if exc.regex.fullmatch(path):
                ids.add(exc.rule)
    for entries in project_exceptions.values():
        for exc in entries:
            if exc.regex.fullmatch(path):
                ids.add(exc.rule)
    return frozenset(ids)


def _directory_applies(directory: str, path: str) -> bool:
    return path.startswith(f"{directory}/") or f"/{directory}/" in path


class _ViewCache:
    """Per-file normalized views, computed at most once per stage set
    (16.5: one decode, one view per required normalization)."""

    def __init__(self, text: str) -> None:
        self._text = text
        self._views: dict[tuple[str, ...], tuple[str, list[int]]] = {}

    def get(self, stages: tuple[str, ...]) -> tuple[str, list[int]]:
        cached = self._views.get(stages)
        if cached is None:
            cached = normalize.compose(self._text, stages)
            self._views[stages] = cached
        return cached


def _collect(
    matches: Iterator[re.Match[str]],
    index: list[int],
    linemap: LineMap,
    rel_path: str,
    rule: Rule,
) -> list[Finding]:
    out: list[Finding] = []
    for count, match in enumerate(matches):
        if count > MAX_FINDINGS_PER_RULE:
            _msg = f"rule {rule.id}: exceeded {MAX_FINDINGS_PER_RULE} findings (budget)"
            raise BudgetError(_msg)
        orig = index[match.start()] if match.start() < len(index) else 0
        line, col = linemap.locate(orig)
        out.append(Finding(rel_path, line, col, rule, match.group(0)))
    return out


def _skipped(
    rule: Rule,
    rel_path: str,
    exempt: frozenset[str],
    classes: classify.Classifications,
) -> bool:
    return (
        not rule.content_scanning
        or rule.id in exempt
        or (
            rule.directory is not None
            and not _directory_applies(rule.directory, rel_path)
        )
        or (rule.scope != "all" and not classes.applies_to(rule.scope, rel_path))
    )


def _prepared(
    rule: Rule, views: _ViewCache, text: str
) -> tuple[str, list[int], re.Pattern[str]]:
    """View + index + regex for one rule (raw rules use the identity view)."""
    if rule.mode == "normalized-token":
        stages = (
            ("camelsplit",) if "identifier-styles" in rule.variants else ()
        ) + normalize.TOKEN_STAGES
        view, index = views.get(stages)
        family = next(
            (v for v in rule.variants if v in normalize.FAMILY_SUFFIXES), None
        )
        regex = (
            normalize.family_boundary_regex(rule.pattern, family)
            if family
            else normalize.token_boundary_regex(
                rule.pattern, "versioned" in rule.variants
            )
        )
        return view, index, regex
    if rule.mode == "normalized-path":
        view, index = views.get(normalize.PATH_STAGES)
        regex = normalize.token_boundary_regex(
            rule.pattern, "versioned" in rule.variants
        )
        return view, index, regex
    assert rule.regex is not None
    return text, list(range(len(text))), rule.regex


def scan_file(
    rel_path: str,
    root: Path,
    policy: Policy,
    project_exceptions: dict[str, list[ExceptionEntry]],
    classes: classify.Classifications,
) -> list[Finding]:
    """Scan one tracked file; returns every finding in content order."""
    findings: list[Finding] = []
    exempt = exempt_rule_ids(rel_path, policy, project_exceptions)
    fc = classes.of(rel_path)

    basename = rel_path.rsplit("/", 1)[-1]
    for rule in policy.filename_rules:
        if (
            rule.id in exempt
            or (rule.scope != "all" and not classes.applies_to(rule.scope, rel_path))
            or (fc is not None and fc.cls in SKIP_CONTENT_CLASSES)
        ):
            continue
        if rule.regex and (rule.regex.search(basename) or rule.regex.search(rel_path)):
            findings.append(Finding(rel_path, 0, 0, rule, basename))

    if fc is not None and fc.cls in SKIP_CONTENT_CLASSES:
        return findings

    target = root / rel_path
    if target.stat().st_size > MAX_FILE_BYTES:
        _msg = f"{rel_path}: exceeds {MAX_FILE_BYTES} bytes (budget)"
        raise BudgetError(_msg)
    started = time.monotonic()
    text = read_text(target)
    normalize.check_bidi(text)
    linemap = LineMap(text)
    views = _ViewCache(text)
    for rule_id in policy.order:
        rule = policy.rules[rule_id]
        if _skipped(rule, rel_path, exempt, classes):
            continue
        view, index, regex = _prepared(rule, views, text)
        findings.extend(_collect(regex.finditer(view), index, linemap, rel_path, rule))
        if time.monotonic() - started > MAX_SECONDS_PER_FILE:
            _msg = (
                f"rule {rule.id} on {rel_path}: "
                f"exceeded {MAX_SECONDS_PER_FILE}s wall budget"
            )
            raise BudgetError(_msg)
    findings.sort(key=lambda f: (f.line, f.col, f.rule.id))
    return findings
