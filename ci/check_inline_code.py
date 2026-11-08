"""Inline-code checker consumer.

Contract: docs/requirements/REQ-INLINE-CODE.md,
specification: docs/specifications/SPEC-INLINE-CODE.md.

Matching, masking, decoding, and rule evaluation are owned by
WORKSPACE-GUARD and reached through the sealed inline scanner. This module
keeps only discovery, language selection, exemption overlay, scanner
verification, and reporting.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import NamedTuple

import yaml

from ci import inline_scanner
from ci.banned_scan import classify, discover
from ci.banned_scan import engine as _engine

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


class Policy(NamedTuple):
    exemptions: set[tuple[str, str]]


class GuardRule(NamedTuple):
    id: str
    category: str
    reason: str


class Finding(NamedTuple):
    rule: GuardRule
    path: str
    line: int
    col: int
    matched: str
    view: str


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
    exemptions = {
        (str(entry["rule"]), str(entry["path"]))
        for entry in raw.get("exemptions") or []
    }
    return Policy(exemptions)


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


def _skip_class(rel: str, classes) -> bool:
    if classes is None:
        return False
    file_class = classes.of(rel)
    return file_class is not None and file_class.cls in _engine.SKIP_CONTENT_CLASSES


def _scan_all_guard(
    files: list[str],
    root: Path,
    policy: Policy,
    classes,
) -> list[Finding]:
    entries: list[dict[str, str]] = []
    for rel in files:
        if rel in SELF_SKIP or not (root / rel).is_file():
            continue
        if _skip_class(rel, classes):
            continue
        data = (root / rel).read_bytes()
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError:
            text = None
        language = detect_language(rel, text) or "text"
        entries.append({"path": str(root / rel), "language": language})
    findings: list[Finding] = []
    for item in inline_scanner.scan(entries):
        rel = Path(str(item["path"])).relative_to(root).as_posix()
        rule_id = str(item["rule"])
        if (rule_id, rel) in policy.exemptions and item.get("exemptible", True):
            continue
        rule = GuardRule(rule_id, str(item["category"]), str(item["reason"]))
        findings.append(
            Finding(
                rule,
                rel,
                int(str(item["line"])),
                int(str(item["column"])),
                str(item["matched"]),
                str(item["view"]),
            )
        )
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
        findings = _scan_all_guard(files, root, policy, classes)
    except (PolicyError, inline_scanner.ScannerError) as exc:
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
