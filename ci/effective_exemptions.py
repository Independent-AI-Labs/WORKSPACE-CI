#!/usr/bin/env python3
"""Effective-exemption report and drift check (ledger items 191-194).

Generates the machine-readable effective-exemption report (every
universal + project exemption resolved against tracked files, every
classification entry, policy digest) and, in --check mode, compares it
against the committed artifact:

  - unused exemption (path matches zero tracked files) fails;
  - exemption matching more than one tracked file fails;
  - any change to an exemption's matched file (rename/move/new match)
    fails and demands review (regenerate via --regen after review).

Exits 0 clean, 1 on violations/drift, 2 usage.
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import TypedDict

from ci.banned_scan import classify, model

ARTIFACT = Path("reports/effective-exemptions.json")


class ExemptionRow(TypedDict):
    source: str
    rule: str
    path: str
    file: str | None
    match_count: int
    rationale: str
    owner: str
    review_date: str
    removal: str


ClassificationRow = TypedDict(
    "ClassificationRow",
    {"file": str, "class": str, "validated_by": str | None, "owner": str},
)


class Report(TypedDict):
    schema: int
    policy_digest: str
    rule_count: int
    exemption_count: int
    classification_count: int
    exemptions: list[ExemptionRow]
    classifications: list[ClassificationRow]


def _tracked(root: Path) -> list[str]:
    try:
        proc = subprocess.run(
            [
                "git",
                "-C",
                str(root),
                "ls-files",
                "--cached",
                "--others",
                "--exclude-standard",
            ],
            capture_output=True,
            check=True,
            timeout=60,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        print(f"effective-exemptions: git ls-files failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
    if proc.stderr:
        sys.stderr.write(f"git ls-files: {proc.stderr.decode(errors='replace')}")
    return sorted(f.decode() for f in proc.stdout.splitlines() if f)


def _sort_key(pair: tuple[str, model.ExceptionEntry]) -> tuple[str, str]:
    return (pair[1].rule, pair[1].path)


def build(root: Path) -> Report:
    config_dir = Path(os.environ.get("CI_CONFIG_DIR", root / "config"))
    policy = model.load_universal(config_dir)
    project = model.load_project_exceptions(
        policy, root / "config" / "banned_words_exceptions_v5.yaml", "project"
    )
    classes = classify.load(root)
    tracked = _tracked(root)

    def _entry(source: str, e: model.ExceptionEntry) -> ExemptionRow:
        matches = [t for t in tracked if e.regex.fullmatch(t)]
        return {
            "source": source,
            "rule": e.rule,
            "path": e.path,
            "file": matches[0] if len(matches) == 1 else None,
            "match_count": len(matches),
            "rationale": e.rationale,
            "owner": e.owner,
            "review_date": e.review_date,
            "removal": e.removal,
        }

    sources = [
        ("universal", e) for entries in policy.exceptions.values() for e in entries
    ]
    sources += [("project", e) for entries in project.values() for e in entries]
    exemptions = [_entry(src, e) for src, e in sorted(sources, key=_sort_key)]

    classifications: list[ClassificationRow] = [
        {
            "file": fc.path,
            "class": fc.cls,
            "validated_by": fc.validated_by,
            "owner": fc.owner,
        }
        for fc in sorted(classes.files.values(), key=lambda f: f.path)
        if fc.path in tracked
    ]

    policy_digest = hashlib.sha256(
        (config_dir / "banned_words.yaml").read_bytes()
    ).hexdigest()
    return {
        "schema": 1,
        "policy_digest": policy_digest,
        "rule_count": len(policy.rules),
        "exemption_count": len(exemptions),
        "classification_count": len(classifications),
        "exemptions": exemptions,
        "classifications": classifications,
    }


def violations(report: Report) -> list[str]:
    out: list[str] = []
    for e in report["exemptions"]:
        if e["match_count"] == 0:
            out.append(
                f"unused exemption: rule {e['rule']} path {e['path']} matches nothing"
            )
        elif e["match_count"] > 1:
            msg = f"exemption matches {e['match_count']} files: rule {e['rule']}"
            out.append(f"{msg} path {e['path']}")
    return out


def drift(old: Report, new: Report) -> list[str]:
    out: list[str] = []

    def key(e: ExemptionRow) -> tuple[str, str, str]:
        return (e["source"], e["rule"], e["path"])

    old_map = {key(e): e for e in old.get("exemptions", [])}
    new_map = {key(e): e for e in new.get("exemptions", [])}
    removed = sorted(set(old_map) - set(new_map))
    added = sorted(set(new_map) - set(old_map))
    kept = sorted(set(old_map) & set(new_map))
    out.extend(
        f"exemption removed: {k} (reviewed shrink or accidental loss)" for k in removed
    )
    out.extend(
        f"exemption added: {k} (regenerate the artifact after review)" for k in added
    )
    out.extend(
        f"exemption target changed: {k} {old_map[k]['file']} -> {new_map[k]['file']} "
        "(rename/move; old entry must be re-reviewed)"
        for k in kept
        if old_map[k]["file"] != new_map[k]["file"]
    )
    return out


def main(argv: list[str]) -> int:
    root = Path(os.environ.get("CI_SCAN_ROOT", os.getcwd()))
    if argv and argv[0] == "--regen":
        report = build(root)
        bad = violations(report)
        if bad:
            print(
                "effective-exemptions: refusing to regenerate with violations:",
                file=sys.stderr,
            )
            for b in bad:
                print(f"  {b}", file=sys.stderr)
            return 1
        ARTIFACT.parent.mkdir(exist_ok=True)
        ARTIFACT.write_text(json.dumps(report, indent=2, sort_keys=False) + "\n")
        n = report["exemption_count"]
        print(f"effective-exemptions: wrote {ARTIFACT} ({n} entries)")
        return 0
    report = build(root)
    bad = violations(report)
    if bad:
        print("effective-exemptions: violations found:", file=sys.stderr)
        for b in bad:
            print(f"  {b}", file=sys.stderr)
        return 1
    if not ARTIFACT.is_file():
        print(
            f"effective-exemptions: {ARTIFACT} absent; run --regen and review",
            file=sys.stderr,
        )
        return 1
    old = json.loads(ARTIFACT.read_text())
    d = drift(old, report)
    if d:
        print(
            "effective-exemptions: drift against committed artifact:", file=sys.stderr
        )
        for b in d:
            print(f"  {b}", file=sys.stderr)
        print("  Review, then regenerate with --regen.", file=sys.stderr)
        return 1
    print(
        f"effective-exemptions: intact ({report['exemption_count']} exemptions, "
        f"{report['classification_count']} classifications, no drift)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
