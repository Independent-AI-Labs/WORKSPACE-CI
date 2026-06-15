"""Shell and cron silent-swallow patterns."""

import re


def is_shell_file(path: str) -> bool:
    base = path.rsplit("/", 1)[-1]
    return (
        path.endswith((".sh", ".bash", ".zsh"))
        or base == "Makefile"
        or base == "shell-setup"
    )


def is_cron_file(path: str) -> bool:
    base = path.rsplit("/", 1)[-1].lower()
    return (
        base == "crontab"
        or base.endswith(".cron")
        or path.endswith(".crontab")
    )


SH_MASK = [
    ("sh-pipe-true", re.compile(r"\|\|\s*true\b")),
    ("sh-pipe-colon", re.compile(r"\|\|\s*:\s*$")),
    ("sh-pipe-true-continuation", re.compile(r"\|\|\s*\\\s*$")),
    (
        "sh-pipefail-mask",
        re.compile(r"\|\s*(?:tail|head|cat|true|:)\b[^|]*$"),
    ),
    ("sh-devnull-silent", re.compile(r"2>\s*/dev/null")),
    ("sh-set-plus-e", re.compile(r"^\s*set\s+\+[eE]\b")),
    (
        "sh-trap-err-noop",
        re.compile(r"^\s*trap\s+(''?|:\\|:\s*'?)\s+ERR\b"),
    ),
    (
        "sh-background-no-wait",
        re.compile(r"^\s*[^#\s&]+\s*&(?:\s*#.*)?$"),
    ),
    ("sh-suppress-stderr", re.compile(r"2>\s*/dev/stderr\s*$")),
    (
        "sh-bare-source",
        re.compile(
            r"^\s*(?:\.|source)\s+\S"
            r"(?!.*\|\|\s*(?:exit|return))"
        ),
    ),
    (
        "sh-fallback-echo",
        re.compile(r"\|\|\s*(?:echo|printf)\b"),
    ),
]

CRON_LINE = re.compile(r"^\s*(\*|\d|@)")
CRON_OK = re.compile(r"(>>?\s*(?!/dev/null\b)/\S+|\|\s*systemd-cat\b)")
CRON_ENV = re.compile(r"^\s*[A-Z_][A-Z0-9_]*\s*=")
CRON_SHEBANG_OR_COMMENT = re.compile(r"^\s*(#|$)")
