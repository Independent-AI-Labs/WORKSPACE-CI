"""Verify the deployed Python runtime imports its policy dependencies.

Invoked after publication (scripts/deploy-ci and the Ansible deploy role)
in place of an inline interpreter sanity check, so the verification is a
tracked module rather than an inline-code payload.
"""

from __future__ import annotations

import sys

import pydantic
import yaml


def main() -> int:
    print(f"runtime ok: PyYAML {yaml.__version__}, pydantic {pydantic.VERSION}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
