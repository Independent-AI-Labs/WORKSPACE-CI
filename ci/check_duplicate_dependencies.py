#!/usr/bin/env python3
"""Duplicate and redundant dependency checker for uv workspaces that detects
two classes of issues in pyproject.toml. Flags self-duplicates where the same
package appears in multiple dependency sections with version mismatches as
errors. Warns on redundant dependencies where the workspace root declares a
package already provided by a workspace member.

Intentionally duplicated deps can be excluded via
config/duplicate_dependency_excludes.yaml.

Usage:
    python -m ci.check_duplicate_dependencies
    python -m ci.check_duplicate_dependencies --json
    python -m ci.check_duplicate_dependencies --workspace-root /path/to/root
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, NamedTuple

import tomllib
import yaml

from ci.paths import resolve_config_path, validate_exemption_file

BUILTIN_EXCLUDES: frozenset[str] = frozenset(
    {
        "python",
        "pip",
        "setuptools",
        "wheel",
    }
)

_MIN_DUPLICATE_ENTRIES = 2


class DupEntry(NamedTuple):
    dep_name: str
    spec: str
    section: str
    group: str


class DuplicateIssue(NamedTuple):
    kind: str
    message: str


def _load_toml(path: Path) -> dict[str, Any]:
    with open(path, "rb") as f:
        return tomllib.load(f)


def find_workspace_root() -> Path:
    cwd = Path.cwd()
    for parent in [cwd, *cwd.parents]:
        candidate = parent / "pyproject.toml"
        if not candidate.exists():
            continue
        data = _load_toml(candidate)
        sources = data.get("tool", {}).get("uv", {}).get("sources", {})
        if any(isinstance(s, dict) and "path" in s for s in sources.values()):
            return parent
    for parent in [cwd, *cwd.parents]:
        if (parent / "pyproject.toml").exists():
            return parent
    return cwd


def _parse_dep_name(dep_str: str) -> str:
    s = dep_str.strip()
    if (s.startswith('"') and s.endswith('"')) or (
        s.startswith("'") and s.endswith("'")
    ):
        s = s[1:-1]
    i = 0
    for ch in s:
        if ch.isalnum() or ch in ("-", "_", "."):
            i += 1
        elif ch == "[":
            break
        else:
            break
    return s[:i].lower()


def _load_excludes() -> set[str]:
    excludes_path = resolve_config_path("duplicate_dependency_excludes", required=False)
    if not excludes_path.exists():
        return set()
    validate_exemption_file(excludes_path, "duplicate_dependency_excludes.yaml")
    try:
        with open(excludes_path) as f:
            data = yaml.safe_load(f) or {}
    except (yaml.YAMLError, OSError) as e:
        print(f"Warning: Failed to load {excludes_path}: {e}", file=sys.stderr)
        return set()
    result: set[str] = set()
    for name in data.get("excludes", []):
        if isinstance(name, str) and name.strip():
            result.add(name.strip().lower())
    return result


def _get_workspace_member_paths(root: Path) -> dict[str, Path]:
    root_toml = root / "pyproject.toml"
    if not root_toml.exists():
        return {}
    data = _load_toml(root_toml)
    sources = data.get("tool", {}).get("uv", {}).get("sources", {})
    members: dict[str, Path] = {}
    for name, spec in sources.items():
        if isinstance(spec, dict) and "path" in spec:
            member_path = (root / spec["path"]).resolve()
            if (member_path / "pyproject.toml").exists():
                members[name.lower()] = member_path
    return members


def _is_mutually_exclusive(data: dict[str, Any], groups: list[str]) -> bool:
    conflicts = data.get("tool", {}).get("uv", {}).get("conflicts", [])
    if not conflicts:
        return False
    group_set = set(groups)
    for conflict_group in conflicts:
        if not isinstance(conflict_group, list):
            continue
        conflict_extras = set()
        for item in conflict_group:
            if isinstance(item, dict) and "extra" in item:
                conflict_extras.add(item["extra"])
        if group_set.issubset(conflict_extras) and len(group_set) > 1:
            return True
    return False


def _collect_entries(data: dict[str, Any]) -> list[DupEntry]:
    entries: list[DupEntry] = []

    deps = data.get("project", {}).get("dependencies", [])
    for dep_str in deps:
        name = _parse_dep_name(dep_str)
        entries.append(DupEntry(name, dep_str.strip(), "deps", "deps"))

    optional = data.get("project", {}).get("optional-dependencies", {})
    if isinstance(optional, dict):
        for group, group_deps in optional.items():
            for dep_str in group_deps:
                name = _parse_dep_name(dep_str)
                entries.append(
                    DupEntry(name, dep_str.strip(), f"optional-{group}", group)
                )

    return entries


def check_self_duplicates(toml_path: Path) -> list[DuplicateIssue]:
    data = _load_toml(toml_path)
    entries = _collect_entries(data)

    by_name: dict[str, list[DupEntry]] = {}
    for e in entries:
        if e.dep_name not in BUILTIN_EXCLUDES:
            by_name.setdefault(e.dep_name, []).append(e)

    issues: list[DuplicateIssue] = []

    for dep_name, dup_entries in by_name.items():
        if len(dup_entries) < _MIN_DUPLICATE_ENTRIES:
            continue

        groups = list({e.group for e in dup_entries})
        if len(groups) < _MIN_DUPLICATE_ENTRIES:
            continue

        if _is_mutually_exclusive(data, groups):
            continue

        specs = [e.spec for e in dup_entries]
        sections = [e.section for e in dup_entries]

        versions_differ = len(set(specs)) > 1
        detail = ", ".join(f"{s}: {sp}" for s, sp in zip(sections, specs, strict=True))

        if versions_differ:
            kind = "SELF_DUPLICATE_MISMATCH"
            msg = (
                f"SELF-DUPLICATE in {toml_path.name}: "
                f"{dep_name} declared in multiple sections with "
                f"mismatched versions: {detail}"
            )
        else:
            kind = "SELF_DUPLICATE_SAME"
            msg = (
                f"SELF-DUPLICATE in {toml_path.name}: "
                f"{dep_name} declared in multiple sections "
                f"(same version): {detail}"
            )

        issues.append(DuplicateIssue(kind, msg))

    return issues


def check_redundant(
    root: Path, members: dict[str, Path], excludes: set[str]
) -> list[DuplicateIssue]:
    root_data = _load_toml(root / "pyproject.toml")
    root_entries = _collect_entries(root_data)

    root_runtime: dict[str, str] = {}
    for e in root_entries:
        if (
            e.section == "deps"
            and e.dep_name not in excludes
            and e.dep_name not in BUILTIN_EXCLUDES
            and e.dep_name not in members
        ):
            root_runtime[e.dep_name] = e.spec

    member_runtime: dict[str, set[str]] = {}
    for member_name, member_path in members.items():
        member_data = _load_toml(member_path / "pyproject.toml")
        member_runtime[member_name] = set()
        for e in _collect_entries(member_data):
            if e.section == "deps":
                member_runtime[member_name].add(e.dep_name)

    issues: list[DuplicateIssue] = []
    for dep_name in sorted(root_runtime):
        spec = root_runtime[dep_name]
        providers = [m for m, deps in member_runtime.items() if dep_name in deps]
        if providers:
            p = ", ".join(sorted(providers))
            issues.append(
                DuplicateIssue(
                    "REDUNDANT",
                    f"REDUNDANT: {spec} already provided by workspace member(s): {p}",
                )
            )

    return issues


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Check for duplicate and redundant dependencies"
    )
    parser.add_argument("--json", action="store_true", help="Output results as JSON")
    parser.add_argument(
        "--workspace-root",
        type=Path,
        default=None,
        help="Path to workspace root (default: auto-detect)",
    )
    args = parser.parse_args()

    root = args.workspace_root or find_workspace_root()
    excludes = _load_excludes()

    all_issues: list[DuplicateIssue] = []

    root_toml = root / "pyproject.toml"
    if root_toml.exists():
        all_issues.extend(check_self_duplicates(root_toml))

    members = _get_workspace_member_paths(root)
    for member_path in members.values():
        member_toml = member_path / "pyproject.toml"
        if member_toml.exists():
            all_issues.extend(check_self_duplicates(member_toml))

    if members:
        all_issues.extend(check_redundant(root, members, excludes))

    if args.json:
        output = [{"kind": i.kind, "message": i.message} for i in all_issues]
        print(json.dumps(output, indent=2))
        return 1 if all_issues else 0
    else:
        if all_issues:
            errors = sum(1 for i in all_issues if i.kind == "SELF_DUPLICATE_MISMATCH")
            warnings = len(all_issues) - errors
            print(
                f"\nDUPLICATE/REDUNDANT DEPENDENCIES FOUND "
                f"({errors} errors, {warnings} warnings)\n"
            )
            for issue in all_issues:
                prefix = "ERROR" if issue.kind == "SELF_DUPLICATE_MISMATCH" else "WARN"
                print(f"  [{prefix}] {issue.message}")
            print()

            if errors > 0:
                print(
                    "Version-mismatch duplicates are BLOCKING. "
                    "Fix conflicting version constraints.\n"
                )
                return 1

            print(
                "Same-version duplicates and redundancies are "
                "WARNINGS (non-blocking). Review and clean up if "
                "unnecessary.\n"
            )
            return 0

        print("No duplicate or redundant dependencies found.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
