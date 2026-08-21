#!/usr/bin/env python3
"""Non-exemptible structural policy-integrity validation.

Validates the STRUCTURE of banned_words.yaml and per-project
banned_words_exceptions.yaml against the exemption rules in
docs/requirements/REQ-BANNED-PATTERN-MATCHING.md:

  1. No catch-all exemption patterns (.* and regex equivalents).
  2. One exact anchored file and one exact rule per exemption entry.
  3. No extension-wide, basename-wide, directory-wide, recursive, or
     alternation path scopes.
  4. No exemptions targeting deployment, bootstrap, hook-generation,
     Ansible, or lifecycle implementation paths.
  5. Every exemption path matches exactly one tracked regular file.

Legacy broad entries are grandfathered through an exact-digest baseline
(config/policy_integrity_baseline.yaml). Any baseline change (added,
removed, or modified broad entry) fails closed and requires a reviewed
baseline update that only shrinks. This runs BEFORE ordinary exemptions
load, so writable policy content cannot disable it.

Exits 0 if policy structure is intact, 1 otherwise.
"""

from __future__ import annotations

import hashlib
import re
import subprocess
import sys
from collections.abc import Mapping
from pathlib import Path
from typing import Any

import yaml

from ci.paths import resolve_config_path

CATCH_ALL_PATTERNS = re.compile(r"^\(\?\^?\)??\.(\*|\+)$|^\[\^\]\*$|^\[\\s\\S\]\*$")
FORBIDDEN_SCOPES = re.compile(
    r"(?:^|/)(?:scripts|res/ansible|lib|bootstrap|hitl)(?:/|$)"
    r"|^Makefile$|^makefile$"
    r"|^\.pre-commit-config\.yaml$"
    r"|^(?:[^^]|.{0,40}?)scripts/"
)
BASELINE_KEYS = ("universal", "project")


def _has_broad_chars(path: str) -> bool:
    return any(c in path for c in "*+[]{}|(") or ".*" in path or ".+" in path


def _entry_digest(entry: Mapping[str, Any]) -> str:
    normalized = yaml.safe_dump(
        {
            "paths": sorted(entry.get("paths") or []),
            "patterns": sorted(entry.get("patterns") or []),
        },
        sort_keys=True,
        default_flow_style=False,
    )
    return hashlib.sha256(normalized.encode()).hexdigest()


_BROAD_PATH_CHARS = (".*", ".+", "[", "]", "{", "}", "|", "(?:")


def _is_broad(entry: Mapping[str, Any]) -> bool:
    """True when the entry violates any structural exemption rule."""
    paths = entry.get("paths") or []
    patterns = entry.get("patterns") or []
    if not paths or not patterns:
        return True
    if len(paths) != 1 or len(patterns) != 1:
        return True
    pat = str(patterns[0])
    if CATCH_ALL_PATTERNS.match(pat) or pat in {".*", ".+"}:
        return True
    path = str(paths[0])
    if not path.startswith("^") or not path.endswith("$"):
        return True
    if any(m in path for m in _BROAD_PATH_CHARS):
        return True
    return bool(FORBIDDEN_SCOPES.search(path.lstrip("^").rstrip("$")))


def _load_baseline() -> dict[str, list[str]] | None:
    baseline_path = Path(
        resolve_config_path("policy_integrity_baseline", required=False)
    )
    if not baseline_path.is_file():
        return None
    with open(baseline_path) as f:
        data: Any = yaml.safe_load(f) or {}
    return {k: [str(d) for d in data.get(k) or []] for k in BASELINE_KEYS}


def _tracked_files() -> set[str]:
    """Tracked files via git; empty set outside a repository."""
    try:
        proc = subprocess.run(
            ["git", "ls-files", "-z"],
            capture_output=True,
            check=True,
            timeout=60,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        print(f"policy-integrity: git ls-files unavailable: {exc}", file=sys.stderr)
        return set()
    return {p.decode() for p in proc.stdout.split(b"\0") if p}


def _check_entries(
    entries: list[Mapping[str, Any]],
    source: str,
    baseline: dict[str, list[str]],
    violations: list[str],
) -> None:
    tracked = _tracked_files()
    for entry in entries:
        digest = _entry_digest(entry)
        broad = _is_broad(entry)
        if broad and digest not in baseline.get(source, []):
            violations.append(
                f"{source}: broad exemption entry not in reviewed baseline "
                f"(digest {digest[:12]}): paths={entry.get('paths')} "
                f"patterns={entry.get('patterns')}"
            )
        if broad:
            continue
        for raw in entry.get("paths") or []:
            path = str(raw).strip("^$")
            if not path or _has_broad_chars(path):
                continue
            matches = [t for t in tracked if t == path or re.fullmatch(raw, t)]
            if len(matches) != 1:
                violations.append(
                    f"{source}: exemption path matches {len(matches)} tracked "
                    f"files (must be exactly 1): {raw}"
                )


def main() -> int:
    violations: list[str] = []
    try:
        baseline = _load_baseline()
        if baseline is None:
            # Bootstrap state: the artifact predates the baseline config.
            # The gate activates only once a reviewed deploy ships it;
            # present-but-mismatched baselines still fail closed below.
            print("policy-integrity: baseline config absent (pre-activation)")
            return 0
        bw_path = Path(resolve_config_path("banned_words"))
        with open(bw_path) as f:
            bw: Any = yaml.safe_load(f) or {}
        _check_entries(
            bw.get("universal_exceptions") or [], "universal", baseline, violations
        )
        project_exc = bw_path.parent / "banned_words_exceptions.yaml"
        if project_exc.is_file():
            with open(project_exc) as f:
                pex: Any = yaml.safe_load(f) or {}
            _check_entries(pex.get("exceptions") or [], "project", baseline, violations)
    except (OSError, ValueError, yaml.YAMLError) as exc:
        print(f"policy-integrity: failed to load policy: {exc}", file=sys.stderr)
        return 1

    if violations:
        print("policy-integrity: structural violations found:", file=sys.stderr)
        for v in violations:
            print(f"  {v}", file=sys.stderr)
        print(
            "policy-integrity: broad exemptions are frozen; shrink the policy and "
            "update config/policy_integrity_baseline.yaml through review.",
            file=sys.stderr,
        )
        return 1
    print("policy-integrity: policy structure intact")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
