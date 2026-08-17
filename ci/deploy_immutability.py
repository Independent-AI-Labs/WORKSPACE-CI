#!/usr/bin/env python3
import os
import subprocess
import sys

PATHS = {
    "seal-candidate": ("+i", "/opt/.workspace-ci.candidate", True),
    "unseal-candidate": ("-i", "/opt/.workspace-ci.candidate", True),
    "unseal-candidate-root": ("-i", "/opt/.workspace-ci.candidate", False),
    "seal-deployed": ("+i", "/opt/workspace-ci", False),
    "unseal-deployed": ("-i", "/opt/workspace-ci", False),
}
EXIT_USAGE = 2


def main() -> int:
    if os.geteuid() != 0 or len(sys.argv) != EXIT_USAGE or sys.argv[1] not in PATHS:
        print(f"usage: {sys.argv[0]} {'|'.join(PATHS)}", file=sys.stderr)
        return EXIT_USAGE
    flag, path, recursive = PATHS[sys.argv[1]]
    command = (
        (
            "/usr/bin/find",
            path,
            "-xdev",
            "!",
            "-type",
            "l",
            "-exec",
            "/usr/bin/chattr",
            flag,
            "--",
            "{}",
            "+",
        )
        if recursive
        else ("/usr/bin/chattr", flag, path)
    )
    subprocess.run(command, check=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
