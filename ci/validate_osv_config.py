"""Validate the repository OSV suppression configuration strictly."""

from __future__ import annotations

import argparse
import datetime as dt
import re
from pathlib import Path

import tomllib

ALLOWED_ROOT = frozenset({"IgnoredVulns"})
ALLOWED_SUPPRESSION = frozenset({"id", "reason", "ignoreUntil"})
OSV_ID = re.compile(
    r"^(?:CVE-\d{4}-\d{4,}|"
    r"GHSA-[23456789cfghjmpqrvwx]{4}(?:-[23456789cfghjmpqrvwx]{4}){2}|"
    r"[A-Z][A-Z0-9]+-\S+)$"
)


def validate(path: Path, today: dt.date | None = None) -> list[str]:
    try:
        data = tomllib.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, tomllib.TOMLDecodeError) as error:
        return [f"invalid OSV configuration: {error}"]
    unknown_root = sorted(data.keys() - ALLOWED_ROOT)
    errors = [f"unknown root field: {key}" for key in unknown_root]
    entries = data.get("IgnoredVulns", [])
    if not isinstance(entries, list):
        return [*errors, "IgnoredVulns must be an array of tables"]
    current = today or dt.datetime.now(dt.UTC).date()
    seen: set[str] = set()
    for index, entry in enumerate(entries):
        label = f"IgnoredVulns[{index}]"
        if not isinstance(entry, dict):
            errors.append(f"{label} must be a table")
            continue
        unknown_fields = sorted(entry.keys() - ALLOWED_SUPPRESSION)
        errors.extend(f"{label}: unknown field {key}" for key in unknown_fields)
        identifier = entry.get("id")
        reason = entry.get("reason")
        expiry = entry.get("ignoreUntil")
        if not isinstance(identifier, str) or not OSV_ID.fullmatch(identifier):
            errors.append(f"{label}: invalid id")
        elif identifier in seen:
            errors.append(f"{label}: duplicate id {identifier}")
        else:
            seen.add(identifier)
        if not isinstance(reason, str) or not reason.strip():
            errors.append(f"{label}: reason is required")
        if not isinstance(expiry, dt.date) or isinstance(expiry, dt.datetime):
            errors.append(f"{label}: ignoreUntil must be a TOML date")
        elif expiry < current:
            errors.append(f"{label}: suppression expired on {expiry.isoformat()}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("path", type=Path)
    errors = validate(parser.parse_args().path)
    if errors:
        print("\n".join(errors))
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
