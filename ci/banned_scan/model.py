"""Final banned-pattern policy model (schema v5).

Loads banned_words.yaml (v5) and banned_words_exceptions_v5.yaml.
Strict: unknown keys, duplicate rule IDs, unanchored or inexact exemption
paths, exemptions for non-exemptible rules, and unknown rule references
all fail closed at load time. There is exactly one model; nothing parses
any earlier format.
"""

from __future__ import annotations

import datetime as _dt
import re
from pathlib import Path

import yaml

RULE_MODES = ("raw-regex", "normalized-token", "normalized-path", "filename")
CASE_MODES = ("sensitive", "fold")
RULE_KEYS = {
    "id",
    "mode",
    "case",
    "pattern",
    "reason",
    "category",
    "non_exemptible",
    "scope",
    "boundary",
    "separators",
    "variants",
}
EXCEPTION_KEYS = {
    "rule",
    "path",
    "rationale",
    "owner",
    "review_date",
    "removal",
}
IMPLEMENTED_MODES = ("raw-regex", "normalized-token", "normalized-path", "filename")
NORMALIZED_MODES = ("normalized-token", "normalized-path")

# Regex safety (16.3): bounded-length patterns, no quantifier over a
# group whose body is a single quantified atom (the (a+)+ /(\w+)*
# catastrophic-backtracking signature). Multi-atom groups with disjoint
# split points (for example `\S+\s+`) are not ambiguous and pass.
_MAX_PATTERN_LEN = 400
_NESTED_QUANT_RE = re.compile(r"\((?:\?:)?[A-Za-z0-9_\\.\[\]^|-]+[*+]\)[*+{]")

_ID_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
_ID_TOKEN_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9./_-]*$")
_UNANCHORED_RE = re.compile(r"[.*+?\[\]{}|()]")


class PolicyError(Exception):
    """Policy failed strict validation; the check must fail closed."""


class Rule:
    __slots__ = (
        "boundary",
        "case",
        "category",
        "directory",
        "id",
        "mode",
        "non_exemptible",
        "pattern",
        "reason",
        "regex",
        "scope",
        "separators",
        "variants",
    )

    def __init__(self, fields: dict):
        f = fields
        self.id = f["id"]
        self.mode = f["mode"]
        self.case = f["case"]
        self.pattern = f["pattern"]
        self.reason = f["reason"]
        self.category = f["category"]
        self.non_exemptible = f["non_exemptible"]
        self.scope = f["scope"]
        self.boundary = f["boundary"]
        self.separators = f["separators"]
        self.variants = f["variants"]
        self.directory = f["directory"]
        self.regex = f["regex"]

    @property
    def content_scanning(self) -> bool:
        return self.mode != "filename"


class ExceptionEntry:
    __slots__ = (
        "owner",
        "path",
        "rationale",
        "regex",
        "removal",
        "review_date",
        "rule",
    )

    def __init__(self, fields: dict):
        f = fields
        self.rule = f["rule"]
        self.path = f["path"]
        self.rationale = f["rationale"]
        self.owner = f["owner"]
        self.review_date = f["review_date"]
        self.removal = f["removal"]
        self.regex = f["regex"]


class Policy:
    __slots__ = ("directory_rules", "exceptions", "filename_rules", "order", "rules")

    def __init__(self, rules, order, filename_rules, directory_rules, exceptions):
        self.rules = rules
        self.order = order
        self.filename_rules = filename_rules
        self.directory_rules = directory_rules
        self.exceptions = exceptions


def _check_keys(where: str, mapping: dict, allowed: set[str]) -> None:
    unknown = sorted(set(mapping) - allowed)
    if unknown:
        _msg = f"{where}: unknown key(s) {unknown}; allowed: {sorted(allowed)}"
        raise PolicyError(_msg)


def _exact_path_regex(where: str, path: str) -> re.Pattern[str]:
    if not isinstance(path, str) or not path.startswith("^") or not path.endswith("$"):
        _msg = f"{where}: path must be an anchored exact regex (^...$): {path!r}"
        raise PolicyError(_msg)
    body = path[1:-1]
    if not body:
        _msg = f"{where}: path is empty"
        raise PolicyError(_msg)
    if _UNANCHORED_RE.search(re.sub(r"\\.", "", body)):
        _msg = f"{where}: path must not contain regex metacharacters: {path!r}"
        raise PolicyError(_msg)
    try:
        return re.compile(path)
    except re.error as exc:
        _msg = f"{where}: path regex invalid ({path!r}): {exc}"
        raise PolicyError(_msg) from exc


def _require_str(where: str, raw: dict, key: str) -> str:
    value = raw.get(key)
    if not isinstance(value, str) or not value:
        _msg = f"{where}: {key} must be a nonempty string"
        raise PolicyError(_msg)
    return value


def _validate_rule_shape(where: str, raw: dict) -> tuple[str, str, str, bool]:
    mode = raw["mode"]
    if mode not in RULE_MODES:
        _msg = f"{where}: mode must be one of {RULE_MODES}: {mode!r}"
        raise PolicyError(_msg)
    if mode not in IMPLEMENTED_MODES:
        _msg = f"{where}: mode {mode!r} is not implemented in this build"
        raise PolicyError(_msg)
    case = raw["case"]
    if case not in CASE_MODES:
        _msg = f"{where}: case must be one of {CASE_MODES}: {case!r}"
        raise PolicyError(_msg)
    if mode in NORMALIZED_MODES and case != "fold":
        _msg = f"{where}: {mode} rules are case-folded by default (REQ 4.1)"
        raise PolicyError(_msg)
    non_exemptible = bool(raw.get("non_exemptible", False))
    scope = raw.get("scope", "all")
    if scope not in ("all", "production", "docs"):
        _msg = f"{where}: scope must be all|production|docs: {scope!r}"
        raise PolicyError(_msg)
    if non_exemptible and scope != "all":
        _msg = f"{where}: non-exemptible rules must use scope 'all'"
        raise PolicyError(_msg)
    return mode, case, scope, non_exemptible


def _parse_rule(where: str, raw: object, directory: str | None) -> Rule:
    if not isinstance(raw, dict):
        _msg = f"{where}: rule must be a mapping"
        raise PolicyError(_msg)
    _check_keys(where, raw, RULE_KEYS)
    for key in ("id", "mode", "case", "pattern", "reason"):
        if key not in raw:
            _msg = f"{where}: missing required key '{key}'"
            raise PolicyError(_msg)
    rule_id = raw["id"]
    if not isinstance(rule_id, str) or not _ID_RE.match(rule_id):
        _msg = f"{where}: id must be kebab-case: {rule_id!r}"
        raise PolicyError(_msg)
    mode, case, scope, non_exemptible = _validate_rule_shape(where, raw)
    pattern = _require_str(where, raw, "pattern")
    reason = _require_str(where, raw, "reason")
    if len(pattern) > _MAX_PATTERN_LEN:
        _msg = f"{where}: pattern exceeds {_MAX_PATTERN_LEN} chars (16.4 bounded input)"
        raise PolicyError(_msg)
    if _NESTED_QUANT_RE.search(pattern):
        _msg = (
            f"{where}: pattern has a nested quantifier (16.3 catastrophic backtracking)"
        )
        raise PolicyError(_msg)
    if mode in NORMALIZED_MODES and not _ID_TOKEN_RE.fullmatch(pattern):
        _msg = f"{where}: {mode} pattern must be a plain token (got {pattern!r})"
        raise PolicyError(_msg)
    try:
        regex = re.compile(pattern, 0 if case == "sensitive" else re.IGNORECASE)
    except re.error as exc:
        _msg = f"{where}: pattern invalid ({pattern!r}): {exc}"
        raise PolicyError(_msg) from exc
    return Rule(
        {
            "id": rule_id,
            "mode": mode,
            "case": case,
            "pattern": pattern,
            "reason": reason,
            "category": raw.get("category"),
            "non_exemptible": non_exemptible,
            "scope": scope,
            "boundary": raw.get("boundary"),
            "separators": tuple(raw.get("separators") or ()),
            "variants": tuple(raw.get("variants") or ()),
            "directory": directory,
            "regex": regex,
        }
    )


def _parse_exception(where: str, raw: object) -> ExceptionEntry:
    if not isinstance(raw, dict):
        _msg = f"{where}: exception must be a mapping"
        raise PolicyError(_msg)
    _check_keys(where, raw, EXCEPTION_KEYS)
    for key in EXCEPTION_KEYS:
        if key not in raw:
            _msg = f"{where}: missing required key '{key}'"
            raise PolicyError(_msg)
    rule = raw["rule"]
    if not isinstance(rule, str) or not _ID_RE.match(rule):
        _msg = f"{where}: rule must be a rule id: {rule!r}"
        raise PolicyError(_msg)
    rationale = raw["rationale"]
    if not isinstance(rationale, str) or not rationale:
        _msg = f"{where}: rationale must state why this exact file must match this rule"
        raise PolicyError(_msg)
    owner = raw["owner"]
    if not isinstance(owner, str) or not owner:
        _msg = f"{where}: owner must be nonempty"
        raise PolicyError(_msg)
    review_date = raw["review_date"]
    try:
        _dt.date.fromisoformat(review_date)
    except (TypeError, ValueError) as exc:
        _msg = f"{where}: review_date must be YYYY-MM-DD: {review_date!r}"
        raise PolicyError(_msg) from exc
    removal = raw["removal"]
    if not isinstance(removal, str) or not removal:
        _msg = f"{where}: removal (expiry or removal condition) must be nonempty"
        raise PolicyError(_msg)
    regex = _exact_path_regex(where, raw["path"])
    return ExceptionEntry(
        {
            "rule": rule,
            "path": raw["path"],
            "rationale": rationale,
            "owner": owner,
            "review_date": review_date,
            "removal": removal,
            "regex": regex,
        }
    )


def _register(
    rules: dict[str, Rule],
    order: list[str],
    rule: Rule,
    bucket: list[Rule] | None = None,
) -> None:
    if rule.id in rules:
        _msg = f"duplicate rule id: {rule.id}"
        raise PolicyError(_msg)
    rules[rule.id] = rule
    order.append(rule.id)
    if bucket is not None:
        bucket.append(rule)


def _load_top_rules(raw: dict) -> tuple[dict[str, Rule], list[str]]:
    rules: dict[str, Rule] = {}
    order: list[str] = []
    for i, item in enumerate(raw.get("rules") or []):
        _register(rules, order, _parse_rule(f"rules[{i}]", item, None))
    return rules, order


def _load_directory_rules(
    raw: dict, rules: dict[str, Rule], order: list[str]
) -> dict[str, list[Rule]]:
    directory_rules: dict[str, list[Rule]] = {}
    for dir_key, items in (raw.get("directory_rules") or {}).items():
        bucket = directory_rules.setdefault(str(dir_key), [])
        for i, item in enumerate(items or []):
            rule = _parse_rule(f"directory_rules.{dir_key}[{i}]", item, str(dir_key))
            _register(rules, order, rule, bucket)
    return directory_rules


def _load_filename_rules(
    raw: dict, rules: dict[str, Rule], order: list[str]
) -> list[Rule]:
    filename_rules: list[Rule] = []
    for i, item in enumerate(raw.get("filename_rules") or []):
        rule = _parse_rule(f"filename_rules[{i}]", item, None)
        if rule.mode != "filename":
            _msg = f"filename_rules[{i}]: mode must be 'filename'"
            raise PolicyError(_msg)
        _register(rules, order, rule, filename_rules)
    return filename_rules


def _load_exceptions(
    raw: dict, rules: dict[str, Rule]
) -> dict[str, list[ExceptionEntry]]:
    exceptions: dict[str, list[ExceptionEntry]] = {}
    for i, item in enumerate(raw.get("exceptions") or []):
        exc = _parse_exception(f"exceptions[{i}]", item)
        rule = rules.get(exc.rule)
        if rule is None:
            _msg = f"exceptions[{i}]: unknown rule id {exc.rule!r}"
            raise PolicyError(_msg)
        if rule.non_exemptible:
            _msg = f"exceptions[{i}]: rule {exc.rule!r} is non-exemptible"
            raise PolicyError(_msg)
        exceptions.setdefault(exc.rule, []).append(exc)
    return exceptions


def load_universal(config_dir: Path) -> Policy:
    """Load banned_words.yaml v5 from config_dir."""
    path = config_dir / "banned_words.yaml"
    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except (OSError, yaml.YAMLError) as exc:
        _msg = f"cannot load {path}: {exc}"
        raise PolicyError(_msg) from exc
    if not isinstance(raw, dict):
        _msg = f"{path}: top level must be a mapping"
        raise PolicyError(_msg)
    _check_keys(
        "banned_words.yaml",
        raw,
        {"version", "rules", "directory_rules", "filename_rules", "exceptions"},
    )
    version = str(raw.get("version", ""))
    if not version.startswith("5."):
        _msg = f"banned_words.yaml: version must be 5.x, got {version!r}"
        raise PolicyError(_msg)
    rules, order = _load_top_rules(raw)
    directory_rules = _load_directory_rules(raw, rules, order)
    filename_rules = _load_filename_rules(raw, rules, order)
    exceptions = _load_exceptions(raw, rules)
    return Policy(rules, order, filename_rules, directory_rules, exceptions)


def load_project_exceptions(
    policy: Policy, path: Path, where: str
) -> dict[str, list[ExceptionEntry]]:
    """Load and validate per-project banned_words_exceptions_v5.yaml."""
    if not path.is_file():
        return {}
    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except (OSError, yaml.YAMLError) as exc:
        _msg = f"cannot load {path}: {exc}"
        raise PolicyError(_msg) from exc
    if not isinstance(raw, dict):
        _msg = f"{path}: top level must be a mapping"
        raise PolicyError(_msg)
    _check_keys(where, raw, {"exceptions"})
    merged: dict[str, list[ExceptionEntry]] = {}
    for i, item in enumerate(raw.get("exceptions") or []):
        entry = _parse_exception(f"{where}.exceptions[{i}]", item)
        rule = policy.rules.get(entry.rule)
        if rule is None:
            _msg = f"{where}.exceptions[{i}]: unknown rule id {entry.rule!r}"
            raise PolicyError(_msg)
        if rule.non_exemptible:
            _msg = f"{where}.exceptions[{i}]: rule {entry.rule!r} is non-exemptible"
            raise PolicyError(_msg)
        for existing in policy.exceptions.get(entry.rule, []):
            if existing.path == entry.path:
                _msg = (
                    f"{where}.exceptions[{i}]: duplicates universal exception "
                    f"for rule {entry.rule!r} path {entry.path!r}"
                )
                raise PolicyError(_msg)
        merged.setdefault(entry.rule, []).append(entry)
    return merged
