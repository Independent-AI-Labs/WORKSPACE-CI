#!/usr/bin/env python3
"""One-shot generator for config/policy_integrity_baseline.yaml.

Records exact digests of every currently-broad exemption entry so the
integrity checker freezes the broad set: new or modified broad entries
fail closed; removals require shrinking this file through review.
"""

import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
from check_policy_integrity import _entry_digest, _is_broad

from ci.paths import resolve_config_path

bw_path = Path(resolve_config_path("banned_words"))
with open(bw_path) as f:
    bw = yaml.safe_load(f) or {}

baseline: dict[str, list[str]] = {"universal": [], "project": []}
for entry in bw.get("universal_exceptions") or []:
    if _is_broad(entry):
        baseline["universal"].append(_entry_digest(entry))

project_exc = bw_path.parent / "banned_words_exceptions.yaml"
if project_exc.is_file():
    with open(project_exc) as f:
        pex = yaml.safe_load(f) or {}
    for entry in pex.get("exceptions") or []:
        if _is_broad(entry):
            baseline["project"].append(_entry_digest(entry))

baseline["universal"] = sorted(baseline["universal"])
baseline["project"] = sorted(baseline["project"])
out = bw_path.parent / "policy_integrity_baseline.yaml"
out.write_text(
    "# Frozen broad-exemption baseline. Only shrink through review.\n"
    + yaml.safe_dump(baseline, sort_keys=True),
    encoding="utf-8",
)
print(
    f"wrote {out}: "
    f"universal={len(baseline['universal'])} project={len(baseline['project'])}"
)
