#!/usr/bin/env python3
"""Removed in the schema v5 cut: the baseline mechanism this generated.

config/policy_integrity_baseline.yaml and its schema are deleted in the
same commit; the v5 model makes exemptions structurally exact, so there is
no broad-entry set left to freeze. This file survives only because the
deletion-consumers gate blocks deleting files still present in the
deployed artifact; the contract commit (immediately after the v5 deploy
replaces the artifact) deletes it.
"""

import sys


def main() -> int:
    sys.stderr.write(
        "gen_policy_baseline: mechanism removed in schema v5; "
        "see DECISION-POLICY-GENERATION-TRANSITION-2026-09-08\n"
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
