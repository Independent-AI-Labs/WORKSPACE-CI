"""Inline-code checker: detect code carried where a file does not declare it.

Contract: docs/requirements/REQ-INLINE-CODE.md,
specification: docs/specifications/SPEC-INLINE-CODE.md.

The checker reuses the normalization views and discovery of
``ci.banned_scan``. It scans every non-gitignored file, excludes constructs
that policy declares allowed for the file's language (a level-one fenced
code block in Markdown, a token such as a shell interpreter invocation, or
a named rule category such as SQL in a SQL source file), and matches
code-signature rules against the original, normalized, and decoded views.
"""

from __future__ import annotations

import bisect
import re
import sys
from pathlib import Path
from typing import NamedTuple

import yaml

from ci.banned_scan import classify, discover
from ci.banned_scan import engine as _engine
from ci.inline_code_decode import View, build_views

DEFAULT_LANGUAGES: dict[str, str] = {
    ".md": "markdown",
    ".markdown": "markdown",
    ".mdown": "markdown",
    ".sh": "shell",
    ".bash": "shell",
    ".zsh": "shell",
    ".yml": "yaml",
    ".yaml": "yaml",
    ".sql": "sql",
}

_SHEBANG_INTERPRETERS: tuple[str, ...] = (
    "bash",
    "zsh",
    "dash",
    "ash",
    "ksh",
    "sh",
)

_PYYAML_SAFE = yaml.safe_load

# Definitional files that carry rule patterns rather than executed code.
SELF_SKIP: frozenset[str] = frozenset(
    {
        "ci/check_inline_code.py",
        "config/inline_code.yaml",
        "config/inline_code.schema.yaml",
        "config/inline_code_exceptions.yaml",
        "config-staging/inline_code.yaml",
        "config-staging/inline_code.schema.yaml",
        "config-staging/inline_code_exceptions.yaml",
        "tests/unit/test_check_inline_code.py",
    }
)


class PolicyError(Exception):
    """Policy is missing or structurally invalid (fail closed)."""


class Rule(NamedTuple):
    id: str
    mode: str
    pattern: str
    category: str
    reason: str
    flags: tuple[str, ...] = ()
    boundary: bool = False
    regex: re.Pattern[str] = re.compile("")


class Construct(NamedTuple):
    id: str
    language: str
    level: int
    reason: str
    open: str = ""
    close: str = ""
    pattern: str = ""
    category: str = ""
    open_re: re.Pattern[str] | None = None
    close_re: re.Pattern[str] | None = None
    pattern_re: re.Pattern[str] | None = None


class Policy(NamedTuple):
    rules: list[Rule]
    constructs: list[Construct]
    decode_depth: int
    exemptions: set[tuple[str, str]]


class Finding(NamedTuple):
    rule: Rule
    path: str
    line: int
    col: int
    matched: str
    view: str


def _compile_pattern(
    pattern: str, mode: str, boundary: bool, flags: tuple[str, ...]
) -> re.Pattern[str]:
    compiled_flags = re.MULTILINE
    if "s" in flags:
        compiled_flags |= re.DOTALL
    if "i" in flags:
        compiled_flags |= re.IGNORECASE
    if mode == "normalized-token" and boundary:
        pattern = rf"(?<![a-z0-9]){pattern}(?![a-z0-9])"
    try:
        return re.compile(pattern, compiled_flags)
    except re.error as exc:
        msg = f"invalid pattern {pattern!r}: {exc}"
        raise PolicyError(msg) from exc


def _load_rule(entry: dict) -> Rule:
    mode = str(entry.get("mode", "raw-regex"))
    flags = tuple(str(f) for f in entry.get("flags", []))
    boundary = bool(entry.get("boundary", False))
    pattern = str(entry["pattern"])
    try:
        regex = _compile_pattern(pattern, mode, boundary, flags)
    except PolicyError as exc:
        msg = f"rule {entry.get('id')}: {exc}"
        raise PolicyError(msg) from exc
    return Rule(
        id=str(entry["id"]),
        mode=mode,
        pattern=pattern,
        category=str(entry.get("category", "code")),
        reason=str(entry.get("reason", "")),
        flags=flags,
        boundary=boundary,
        regex=regex,
    )


def _load_construct(entry: dict) -> Construct:
    open_pattern = str(entry.get("open", ""))
    close_pattern = str(entry.get("close", ""))
    token_pattern = str(entry.get("pattern", ""))
    category = str(entry.get("category", ""))
    selectors = [
        bool(token_pattern),
        bool(open_pattern or close_pattern),
        bool(category),
    ]
    if sum(selectors) != 1:
        msg = (
            f"construct {entry.get('id')}: declare exactly one of a pattern, "
            "open/close, or a category"
        )
        raise PolicyError(msg)
    if bool(open_pattern) != bool(close_pattern):
        msg = f"construct {entry.get('id')}: open and close must be declared together"
        raise PolicyError(msg)
    open_re = close_re = pattern_re = None
    try:
        if token_pattern:
            pattern_re = re.compile(token_pattern)
        elif not category:
            open_re = re.compile(open_pattern)
            close_re = re.compile(close_pattern)
    except re.error as exc:
        msg = f"construct {entry.get('id')}: invalid pattern: {exc}"
        raise PolicyError(msg) from exc
    return Construct(
        id=str(entry["id"]),
        language=str(entry["language"]),
        level=int(entry.get("level", 1)),
        reason=str(entry.get("reason", "")),
        open=open_pattern,
        close=close_pattern,
        pattern=token_pattern,
        category=category,
        open_re=open_re,
        close_re=close_re,
        pattern_re=pattern_re,
    )


def load_policy(config_dir: Path) -> Policy:
    path = config_dir / "inline_code.yaml"
    if not path.is_file():
        msg = f"inline-code policy not found: {path}"
        raise PolicyError(msg)
    try:
        raw = _PYYAML_SAFE(path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as exc:
        msg = f"inline-code policy unreadable: {exc}"
        raise PolicyError(msg) from exc
    if not isinstance(raw, dict):
        msg = "inline-code policy must be a mapping"
        raise PolicyError(msg)

    rules = [_load_rule(entry) for entry in raw.get("rules") or []]
    constructs = [
        _load_construct(entry) for entry in raw.get("allowed_constructs") or []
    ]
    decode = raw.get("decode") or {}
    depth = int(decode.get("max_depth", 2))
    exemptions = {
        (str(entry["rule"]), str(entry["path"]))
        for entry in raw.get("exemptions") or []
    }
    return Policy(rules, constructs, depth, exemptions)


def detect_language(path: str, text: str | None = None) -> str | None:
    """Detect the file's language or format.

    Extension first, then the interpreter named in a shebang line for
    extensionless scripts. Detection is by declared language or format,
    never by an individual path.
    """
    language = DEFAULT_LANGUAGES.get(Path(path).suffix.lower())
    if language is not None:
        return language
    if text is not None:
        first = text.split("\n", 1)[0]
        if first.startswith("#!"):
            for interpreter in _SHEBANG_INTERPRETERS:
                if re.search(rf"(?<![\w-]){re.escape(interpreter)}(?![\w-])", first):
                    return "shell"
    return None


def load_project_exemptions(root: Path) -> set[tuple[str, str]]:
    """Project exemptions overlay the sealed universal policy."""
    path = root / "config" / "inline_code_exceptions.yaml"
    if not path.is_file():
        return set()
    try:
        raw = _PYYAML_SAFE(path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as exc:
        msg = f"inline-code exceptions unreadable: {exc}"
        raise PolicyError(msg) from exc
    if raw is None:
        return set()
    if not isinstance(raw, dict):
        msg = "inline-code exceptions must be a mapping"
        raise PolicyError(msg)
    return {
        (str(entry["rule"]), str(entry["path"]))
        for entry in raw.get("exemptions") or []
    }


def _active_constructs(language: str | None, policy: Policy) -> list[Construct]:
    if language is None:
        return []
    return [c for c in policy.constructs if c.language == language]


def _allowed_categories(language: str | None, policy: Policy) -> set[str]:
    """Rule categories a category-form construct excludes for the language."""
    if language is None:
        return set()
    return {
        c.category for c in policy.constructs if c.language == language and c.category
    }


def _opens(body: str, active: list[Construct]) -> Construct | None:
    for construct in active:
        if construct.open_re is not None and construct.open_re.match(body):
            return construct
    return None


def _blank(chars: list[str], start: int, end: int) -> None:
    for i in range(start, end):
        if chars[i] != "\n":
            chars[i] = " "


def mask_allowed_constructs(text: str, language: str | None, policy: Policy) -> str:
    """Replace allowed construct regions with spaces, preserving offsets.

    A construct declares an open/close region (for example a fenced code
    block) or a token pattern (for example an interpreter invocation that
    the language itself carries); both are excluded here without shifting
    any later byte. A category-form construct has neither and is handled by
    the caller, which leaves its named rule category unmatched.
    """
    active = _active_constructs(language, policy)
    if not active:
        return text
    chars = list(text)
    offset = 0
    open_construct: Construct | None = None
    start = 0
    for line in text.splitlines(keepends=True):
        body = line.rstrip("\n")
        if open_construct is None:
            open_construct = _opens(body, active)
            if open_construct is not None:
                start = offset
        elif open_construct.close_re is not None and open_construct.close_re.match(
            body
        ):
            _blank(chars, start, offset + len(line))
            open_construct = None
        offset += len(line)
    if open_construct is not None:
        msg = f"unterminated allowed construct {open_construct.id}"
        raise PolicyError(msg)
    for construct in active:
        if construct.pattern_re is None:
            continue
        for match in construct.pattern_re.finditer("".join(chars)):
            _blank(chars, match.start(), match.end())
    return "".join(chars)


def _line_map(text: str):
    offsets = [0]
    for idx, ch in enumerate(text):
        if ch == "\n":
            offsets.append(idx + 1)

    def locate(pos: int) -> tuple[int, int]:
        line = bisect.bisect_right(offsets, pos)
        return line, pos - offsets[line - 1] + 1

    return locate


def _matches_in(rule: Rule, views: list[View], path: str, locate) -> list[Finding]:
    findings: list[Finding] = []
    seen: set[tuple[int, int]] = set()
    for view in views:
        for match in rule.regex.finditer(view.text):
            start = match.start()
            pos = view.offsets[start] if start < len(view.offsets) else 0
            line, col = locate(pos)
            if (line, col) in seen:
                continue
            seen.add((line, col))
            findings.append(Finding(rule, path, line, col, match.group(0), view.name))
    return findings


def scan_file(rel: str, root: Path, policy: Policy) -> list[Finding]:
    data = (root / rel).read_bytes()
    if b"\x00" in data:
        return []
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        return []

    language = detect_language(rel, text)
    masked = mask_allowed_constructs(text, language, policy)
    views = build_views(masked, policy.decode_depth)
    locate = _line_map(text)

    allowed = _allowed_categories(language, policy)
    findings: list[Finding] = []
    for rule in policy.rules:
        if (rule.id, rel) in policy.exemptions or rule.category in allowed:
            continue
        findings.extend(_matches_in(rule, views, rel, locate))
    return findings


def _report(finding: Finding) -> None:
    print(f"{finding.path}:{finding.line}:{finding.col}")
    print(f"  Rule:     {finding.rule.id}")
    print(f"  Category: {finding.rule.category}")
    print(f"  View:     {finding.view}")
    print(f"  Reason:   {finding.rule.reason}")
    snippet = finding.matched.replace("\n", "\\n")[:100]
    if snippet:
        print(f"  > {snippet}")


def _skip_class(rel: str, classes) -> bool:
    if classes is None:
        return False
    file_class = classes.of(rel)
    return file_class is not None and file_class.cls in _engine.SKIP_CONTENT_CLASSES


def _scan_all(files: list[str], root: Path, policy: Policy, classes) -> list[Finding]:
    findings: list[Finding] = []
    for rel in files:
        if rel in SELF_SKIP or not (root / rel).is_file():
            continue
        if _skip_class(rel, classes):
            continue
        findings.extend(scan_file(rel, root, policy))
    return findings


def _policy_dir() -> Path:
    """Resolve the universal policy directory from the checker's own tree.

    Anchored to the module location and never to the environment, so an
    environment variable, working directory, or PYTHONPATH supplied by the
    triggering process cannot select the policy
    (REQ-HOOK-TRUST-BOUNDARY section 5).
    """
    package_root = Path(__file__).resolve().parent.joinpath("..").resolve()
    return package_root / "config"


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    config_dir = _policy_dir()
    root = discover.scan_root()
    try:
        policy = load_policy(config_dir)
    except PolicyError as exc:
        print(f"inline-code: {exc}", file=sys.stderr)
        return 1

    files = discover.tracked_files(argv, root)
    try:
        project_exemptions = load_project_exemptions(root)
    except PolicyError as exc:
        print(f"inline-code: {exc}", file=sys.stderr)
        return 1
    policy = policy._replace(exemptions=policy.exemptions | project_exemptions)
    try:
        classes = classify.load(root)
    except classify.ClassificationError:
        classes = None

    try:
        findings = _scan_all(files, root, policy, classes)
    except PolicyError as exc:
        print(f"inline-code: {exc}", file=sys.stderr)
        return 1

    for finding in findings:
        _report(finding)
    if findings:
        print(f"\n{len(findings)} inline-code finding(s).")
        return 1
    print(f"No inline code found in {len(files)} non-gitignored file(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
