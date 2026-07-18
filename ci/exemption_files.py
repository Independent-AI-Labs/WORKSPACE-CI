"""Manifest-driven helpers for per-project exemption/config files.

The canonical manifest is ``config/exemption_files.yaml``. Every CI check
that consumes one of these files validates provenance fail-closed (see
``ci.paths.validate_exemption_file``); this module creates missing files
with their defaults (never overwriting) and reports lock state for the
sudo ``make lock-exemptions`` target.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import yaml

from ci.paths import exemption_file_state, find_project_root, resolve_config_path

MANIFEST = "exemption_files"


def load_manifest() -> list[dict[str, str]]:
    cfg = resolve_config_path(MANIFEST)
    with open(cfg, encoding="utf-8") as handle:
        data = yaml.safe_load(handle) or {}
    entries = data.get("files") or []
    return [e for e in entries if isinstance(e, dict) and e.get("path")]


def _default_text(entry: dict[str, str]) -> str:
    source = entry.get("default_source")
    if source:
        return (find_project_root() / source).read_text(encoding="utf-8")
    return entry.get("default_content") or ""


def ensure_exemption_files(project_root: Path) -> list[Path]:
    """Create any missing manifest files in project_root with defaults.

    Never overwrites existing files. Returns the list of created paths.
    """
    created: list[Path] = []
    for entry in load_manifest():
        dst = project_root / entry["path"]
        if dst.exists():
            continue
        text = _default_text(entry)
        if "__PROJECT_NAME__" in text:
            text = text.replace("__PROJECT_NAME__", project_root.name)
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(text, encoding="utf-8")
        created.append(dst)
    return created


def lock_report(project_root: Path) -> list[tuple[Path, str]]:
    """Return (path, state) for every manifest entry in project_root."""
    return [
        (project_root / e["path"], exemption_file_state(project_root / e["path"]))
        for e in load_manifest()
    ]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)
    p_ensure = sub.add_parser("ensure", help="create missing files with defaults")
    p_ensure.add_argument("project_root", type=Path)
    p_report = sub.add_parser("report", help="print lock state per file")
    p_report.add_argument("project_root", type=Path)
    args = parser.parse_args(argv)

    if args.cmd == "ensure":
        for path in ensure_exemption_files(args.project_root):
            print(f"created: {path}")
        return 0
    for path, state in lock_report(args.project_root):
        print(f"{state}: {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
