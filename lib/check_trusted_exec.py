"""Trusted-code service-killing pattern checker.

Contract: docs/requirements/REQ-TRUSTED-EXEC.md,
specification: docs/specifications/SPEC-TRUSTED-EXEC.md.

The runtime shell guard scans only agent command text and untrusted
script bodies. This checker closes the authored-code gap: it scans every
non-gitignored executable carrier (shell, YAML, systemd units, Makefile,
JavaScript or TypeScript, Python, Lua) for ownership-free service-killing
commands. Markdown is not scanned.

The checker reuses the discovery and exact-file classification of
``ci.banned_scan`` and the original, normalized, and bounded decoded
views of ``ci.inline_code_decode``. Every rule is non-exemptible: the
policy shape has no exemption or allowed-construct key, and the loader
rejects a policy that carries one.
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

SUPPORTED_CARRIERS: tuple[str, ...] = (
    "shell",
    "yaml",
    "systemd",
    "makefile",
    "javascript",
    "python",
    "lua",
)

_EXTENSION_CARRIERS: dict[str, str] = {
    ".sh": "shell",
    ".bash": "shell",
    ".zsh": "shell",
    ".ksh": "shell",
    ".ash": "shell",
    ".yml": "yaml",
    ".yaml": "yaml",
    ".service": "systemd",
    ".socket": "systemd",
    ".timer": "systemd",
    ".target": "systemd",
    ".mount": "systemd",
    ".path": "systemd",
    ".slice": "systemd",
    ".scope": "systemd",
    ".mk": "makefile",
    ".js": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".jsx": "javascript",
    ".ts": "javascript",
    ".tsx": "javascript",
    ".py": "python",
    ".lua": "lua",
}

_MAKEFILE_NAMES: tuple[str, ...] = ("Makefile", "makefile", "GNUmakefile")
_MARKDOWN_SUFFIXES: tuple[str, ...] = (".md", ".markdown", ".mdown")
_SHEBANG_SHELLS: tuple[str, ...] = ("bash", "zsh", "dash", "ash", "ksh", "sh")
_VALID_MODES: tuple[str, ...] = ("raw-regex", "normalized-token")
_POLICY_KEYS = frozenset({"version", "decode", "rules"})
_RULE_KEYS = frozenset(
    {"id", "mode", "category", "flags", "carriers", "pattern", "reason"},
)

# Definitional files that carry rule patterns rather than executed code.
SELF_SKIP: frozenset[str] = frozenset(
    {
        "lib/check_trusted_exec.py",
        "config/trusted_exec.yaml",
        "config/trusted_exec.schema.yaml",
        "tests/unit/trusted_exec/test_check_trusted_exec.py",
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
    carriers: frozenset[str]
    flags: tuple[str, ...] = ()
    boundary: bool = False
    regex: re.Pattern[str] | None = None


class Policy(NamedTuple):
    rules: list[Rule]
    decode_depth: int


class Finding(NamedTuple):
    rule: Rule
    path: str
    line: int
    col: int
    matched: str
    view: str


def _compile_rule(
    rule_id: str, pattern: str, mode: str, flags: tuple[str, ...]
) -> re.Pattern[str]:
    compiled_flags = 0
    if "i" in flags:
        compiled_flags |= re.IGNORECASE
    if "s" in flags:
        compiled_flags |= re.DOTALL
    if mode == "normalized-token":
        pattern = rf"(?<![a-z0-9]){pattern}(?![a-z0-9])"
    try:
        return re.compile(pattern, compiled_flags)
    except re.error as exc:
        msg = f"rule {rule_id}: invalid pattern {pattern!r}: {exc}"
        raise PolicyError(msg) from exc


def _load_rule(entry: object) -> Rule:
    if not isinstance(entry, dict):
        msg = "each rule must be a mapping"
        raise PolicyError(msg)
    unknown = sorted(set(entry) - _RULE_KEYS)
    if unknown:
        msg = f"rule {entry.get('id')!r}: unknown key(s) {unknown}"
        raise PolicyError(msg)
    for key in ("id", "mode", "pattern", "category", "reason", "carriers"):
        if key not in entry:
            msg = f"rule {entry.get('id')!r}: missing required key {key!r}"
            raise PolicyError(msg)
    rule_id = str(entry["id"])
    mode = str(entry["mode"])
    if mode not in _VALID_MODES:
        msg = f"rule {rule_id}: mode must be one of {_VALID_MODES}: {mode!r}"
        raise PolicyError(msg)
    carriers = entry["carriers"]
    if not isinstance(carriers, list) or not carriers:
        msg = f"rule {rule_id}: carriers must be a nonempty list"
        raise PolicyError(msg)
    bad = [c for c in carriers if c not in SUPPORTED_CARRIERS]
    if bad:
        msg = f"rule {rule_id}: unknown carrier(s) {bad}"
        raise PolicyError(msg)
    flags = tuple(str(f) for f in entry.get("flags", []) or [])
    pattern = str(entry["pattern"])
    regex = _compile_rule(rule_id, pattern, mode, flags)
    return Rule(
        id=rule_id,
        mode=mode,
        pattern=pattern,
        category=str(entry["category"]),
        reason=str(entry["reason"]),
        carriers=frozenset(carriers),
        flags=flags,
        boundary=mode == "normalized-token",
        regex=regex,
    )


def load_policy(config_dir: Path) -> Policy:
    path = config_dir / "trusted_exec.yaml"
    if not path.is_file():
        msg = f"trusted-exec policy not found: {path}"
        raise PolicyError(msg)
    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as exc:
        msg = f"trusted-exec policy unreadable: {exc}"
        raise PolicyError(msg) from exc
    if not isinstance(raw, dict):
        msg = "trusted-exec policy must be a mapping"
        raise PolicyError(msg)
    for forbidden in ("exemptions", "allowed_constructs"):
        if forbidden in raw:
            msg = f"trusted-exec policy must not declare {forbidden!r}"
            raise PolicyError(msg)
    unknown = sorted(set(raw) - _POLICY_KEYS)
    if unknown:
        msg = f"trusted-exec policy: unknown key(s) {unknown}"
        raise PolicyError(msg)
    rules = [_load_rule(entry) for entry in raw.get("rules") or []]
    if not rules:
        msg = "trusted-exec policy declares no rules"
        raise PolicyError(msg)
    decode = raw.get("decode") or {}
    depth = int(decode.get("max_depth", 2))
    return Policy(rules=rules, decode_depth=depth)


def detect_carrier(path: str, text: str | None = None) -> str | None:
    """Detect the file's carrier, or ``markdown``/``None``.

    Extension first, then Makefile names, then the interpreter named in a
    shebang line for extensionless scripts. Detection is by declared
    grammar or format, never by an individual source directory.
    """
    name = path.rsplit("/", 1)[-1]
    suffix = Path(path).suffix.lower()
    if suffix in _MARKDOWN_SUFFIXES:
        return "markdown"
    if name in _MAKEFILE_NAMES:
        return "makefile"
    carrier = _EXTENSION_CARRIERS.get(suffix)
    if carrier is not None:
        return carrier
    if text is not None:
        first = text.split("\n", 1)[0]
        if first.startswith("#!"):
            for shell in _SHEBANG_SHELLS:
                if re.search(rf"(?<![\w-]){shell}(?![\w-])", first):
                    return "shell"
    return None


def _line_map(text: str):
    offsets = [0]
    for idx, ch in enumerate(text):
        if ch == "\n":
            offsets.append(idx + 1)

    def locate(pos: int) -> tuple[int, int]:
        line = bisect.bisect_right(offsets, pos)
        return line, pos - offsets[line - 1] + 1

    return locate


def _applicable_views(rule: Rule, views: list[View]) -> list[View]:
    if rule.mode == "normalized-token":
        return [v for v in views if v.name in ("normalized", "decoded-normalized")]
    return views


def _matches_in(rule: Rule, views: list[View], locate, rel: str) -> list[Finding]:
    findings: list[Finding] = []
    if rule.regex is None:
        return findings
    seen: set[tuple[int, int]] = set()
    for view in _applicable_views(rule, views):
        for match in rule.regex.finditer(view.text):
            start = match.start()
            pos = view.offsets[start] if start < len(view.offsets) else 0
            line, col = locate(pos)
            if (line, col) in seen:
                continue
            seen.add((line, col))
            findings.append(
                Finding(rule, rel, line, col, match.group(0), view.name),
            )
    return findings


def scan_file(rel: str, root: Path, policy: Policy) -> list[Finding]:
    data = (root / rel).read_bytes()
    if b"\x00" in data:
        return []
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        return []
    carrier = detect_carrier(rel, text)
    if carrier == "markdown":
        return []
    views = build_views(text, policy.decode_depth)
    locate = _line_map(text)
    findings: list[Finding] = []
    for rule in policy.rules:
        if carrier is not None and carrier not in rule.carriers:
            continue
        findings.extend(_matches_in(rule, views, locate, rel))
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
    findings.sort(key=lambda f: (f.path, f.line, f.col, f.rule.id))
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
        print(f"trusted-exec: {exc}", file=sys.stderr)
        return 1

    files = discover.tracked_files(argv, root)
    try:
        classes = classify.load(root)
    except classify.ClassificationError:
        classes = None

    try:
        findings = _scan_all(files, root, policy, classes)
    except PolicyError as exc:
        print(f"trusted-exec: {exc}", file=sys.stderr)
        return 1

    for finding in findings:
        _report(finding)
    if findings:
        print(f"\n{len(findings)} trusted-exec finding(s).")
        return 1
    print(f"No service-killing patterns found in {len(files)} file(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
