#!/usr/bin/env python3
import os
import subprocess
import sys

PATHS = {
    "seal-candidate": ("-R", "+i", "/opt/.workspace-ci.candidate"),
    "unseal-candidate": ("-R", "-i", "/opt/.workspace-ci.candidate"),
    "unseal-candidate-root": ("-i", "/opt/.workspace-ci.candidate"),
    "seal-deployed": ("+i", "/opt/workspace-ci"),
    "unseal-deployed": ("-i", "/opt/workspace-ci"),
}
EXIT_USAGE = 2


def main() -> int:
    if os.geteuid() != 0 or len(sys.argv) != EXIT_USAGE or sys.argv[1] not in PATHS:
        print(f"usage: {sys.argv[0]} {'|'.join(PATHS)}", file=sys.stderr)
        return EXIT_USAGE
    subprocess.run(("/usr/bin/chattr", *PATHS[sys.argv[1]]), check=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
