#!/usr/bin/env python3
"""Non-exemptible structural policy-integrity validation (schema v5).

Validates the STRUCTURE of banned_words.yaml, banned_words_exceptions_v5.yaml,
and file_classifications.yaml against REQ-BANNED-PATTERN-MATCHING §15:

  1. Every rule has a stable unique kebab-case id and a declared mode.
  2. Every exemption names exactly one rule id and one anchored exact
     repository-relative file path, with rationale, owner, review date,
     and removal condition.
  3. Project exemption paths match exactly one tracked regular file of
     the repository that owns the config.
  4. Classification manifest entries match exactly one tracked file.

This checker contains no directory or extension lists: enforcement is
purely structural. It is independent of the scanner loader by design.
Exits 0 if policy structure is intact, 1 otherwise.
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

import yaml

from ci.banned_scan import model

_ID_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
_CLASS_ENTRY_KEYS = {"class", "validated_by", "owner"}
_CLASSES = ("binary", "generated", "lock", "reference", "fixture", "policy-definition")


def _fail(messages: list[str]) -> int:
    print("policy-integrity: structural violations found:", file=sys.stderr)
    for m in messages:
        print(f"  {m}", file=sys.stderr)
    print(
        "policy-integrity: exemptions must be one exact file + one rule id "
        "with full provenance; classification entries must be exact files.",
        file=sys.stderr,
    )
    return 1


def _tracked_files(root: Path) -> set[str]:
    try:
        proc = subprocess.run(
            ["git", "-C", str(root), "ls-files", "-z"],
            capture_output=True,
            check=True,
            timeout=60,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        print(f"policy-integrity: git ls-files unavailable: {exc}", file=sys.stderr)
        _msg = 1
        raise SystemExit(_msg) from exc
    return {
        p.decode("utf-8", errors="surrogateescape")
        for p in proc.stdout.split(b"\0")
        if p
    }


def _check_project_exceptions(
    exc_path: Path,
    repo_root: Path,
    violations: list[str],
) -> None:
    if not exc_path.is_file():
        return
    tracked = _tracked_files(repo_root)
    try:
        raw = yaml.safe_load(exc_path.read_text(encoding="utf-8")) or {}
    except (OSError, yaml.YAMLError) as exc:
        violations.append(f"{exc_path}: unreadable: {exc}")
        return
    for i, entry in enumerate(raw.get("exceptions") or []):
        where = f"{exc_path.name} exceptions[{i}]"
        path = entry.get("path") if isinstance(entry, dict) else None
        if not isinstance(path, str):
            violations.append(f"{where}: missing exact path")
            continue
        matches = [t for t in tracked if re.fullmatch(path, t)]
        if len(matches) != 1:
            violations.append(
                f"{where}: path matches {len(matches)} tracked files "
                f"(must be exactly 1): {path}"
            )


def _check_classifications(
    manifest_path: Path, repo_root: Path, violations: list[str]
) -> None:
    if not manifest_path.is_file():
        return
    tracked = _tracked_files(repo_root)
    try:
        raw = yaml.safe_load(manifest_path.read_text(encoding="utf-8")) or {}
    except (OSError, yaml.YAMLError) as exc:
        violations.append(f"classification manifest unreadable: {exc}")
        return
    files = raw.get("files") or {}
    for fpath, entry in files.items():
        where = f"classifications.files[{fpath!r}]"
        if not isinstance(entry, dict) or entry.get("class") not in _CLASSES:
            violations.append(f"{where}: class must be one of {_CLASSES}")
            continue
        unknown = sorted(set(entry) - _CLASS_ENTRY_KEYS)
        if unknown:
            violations.append(f"{where}: unknown key(s) {unknown}")
        if entry.get("class") in ("generated", "lock") and not entry.get(
            "validated_by"
        ):
            violations.append(f"{where}: generated/lock entries require validated_by")
        matches = [t for t in tracked if t == fpath]
        if len(matches) != 1:
            violations.append(
                f"{where}: entry must name exactly one tracked file "
                f"(matches {len(matches)}): {fpath}"
            )


def main() -> int:
    violations: list[str] = []
    config_dir = Path(os.environ.get("CI_CONFIG_DIR", "config"))
    repo_root = config_dir.parent

    try:
        policy = model.load_universal(config_dir)
    except model.PolicyError as exc:
        return _fail([f"banned_words.yaml: {exc}"])

    try:
        model.load_project_exceptions(
            policy,
            config_dir / "banned_words_exceptions_v5.yaml",
            "config-dir",
        )
    except model.PolicyError as exc:
        violations.append(str(exc))
    _check_project_exceptions(
        config_dir / "banned_words_exceptions_v5.yaml",
        config_dir.parent,
        violations,
    )
    scan_root = os.environ.get("CI_SCAN_ROOT", "").strip()
    if scan_root and Path(scan_root) != config_dir.parent:
        consumer_exc = Path(scan_root) / "config" / "banned_words_exceptions_v5.yaml"
        try:
            model.load_project_exceptions(policy, consumer_exc, "consumer")
        except model.PolicyError as exc:
            violations.append(str(exc))
        _check_project_exceptions(consumer_exc, Path(scan_root), violations)

    _check_classifications(
        (Path(scan_root) if scan_root else config_dir.parent)
        / "config"
        / "file_classifications.yaml",
        Path(scan_root) if scan_root else config_dir.parent,
        violations,
    )

    if violations:
        return _fail(violations)
    print("policy-integrity: policy structure intact")
    return 0


if __name__ == "__main__":
    _msg = main()
    raise SystemExit(_msg)
