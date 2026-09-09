"""Final-model banned-pattern scanner entry (schema v5).

Emits one block per finding:

    path:line:col
      Rule: <stable id>
      Pattern: ...
      Reason: ...
      > matched snippet

Exits 0 when clean, 1 on any violation or fail-closed input/policy error.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from ci.banned_scan import classify, discover, engine, model
from ci.paths import ExemptionFileError, validate_exemption_file


def _report(f: engine.Finding) -> None:
    loc = f"{f.path}:{f.line}:{f.col}" if f.line else f.path
    print(loc)
    print(f"  Rule:    {f.rule.id}")
    print(f"  Pattern: {f.rule.pattern}")
    print(f"  Reason:  {f.rule.reason}")
    snippet = f.matched.replace("\n", "\\n")[:80]
    if snippet:
        print(f"  > {snippet}")


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    config_dir = Path(os.environ.get("CI_CONFIG_DIR", "config"))
    root = discover.scan_root()

    try:
        policy = model.load_universal(config_dir)
        exc_file = discover.project_exception_file(config_dir, root)
        project_exc: dict[str, list[model.ExceptionEntry]] = {}
        if exc_file is not None:
            try:
                validate_exemption_file(exc_file, "banned_words_exceptions_v5.yaml")
            except ExemptionFileError as exc:
                print(f"banned-words: {exc}", file=sys.stderr)
                return 1
            loaded = model.load_project_exceptions(policy, exc_file, str(exc_file))
            for rule_id, entries in loaded.items():
                project_exc[rule_id] = list(entries)
        classes = classify.load(root)
    except (model.PolicyError, classify.ClassificationError) as exc:
        print(f"banned-words: policy invalid: {exc}", file=sys.stderr)
        return 1

    files = discover.tracked_files(argv, root)
    print(f"Scanning {len(files)} file(s) for banned patterns...")

    findings: list[engine.Finding] = []
    for rel in files:
        if not (root / rel).is_file():
            continue
        try:
            findings.extend(engine.scan_file(rel, root, policy, project_exc, classes))
        except engine.InputError as exc:
            print(
                f"{rel}: input failed strict validation: {exc}",
                file=sys.stderr,
            )
            print(
                f"banned-words: fail closed on unreadable or invalid text",
                file=sys.stderr,
            )
            return 1

    for f in findings:
        _report(f)
    if findings:
        print(f"\n{len(findings)} banned pattern(s) found.")
        return 1
    print("No banned patterns found.")
    return 0


if __name__ == "__main__":
    _msg = main()
    raise SystemExit(_msg)
