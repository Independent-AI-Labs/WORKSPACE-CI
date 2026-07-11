"""Shell and cron file-type detection for the error-swallowing detector.

Inline shell patterns are now defined in
config/silent_swallow_patterns.yaml and loaded at runtime by
check_silent_swallow.py. This module retains file-type detection
(shebang sniffing, extension/filename matching) and cron regex
constants used by the custom cron-no-log-redirect detector.
"""

import re

_SHEBANG_RE = re.compile(r"^#!\s*/(?:usr/bin/)?(?:env\s+)?(?:ba|da|z)?sh\b")


def _has_shell_shebang(path: str) -> bool:
    """Sniff the first line of <path> for a shell shebang.

    Returns False on any I/O error (missing file, permission denied) so the
    caller's classifier can continue with the next heuristic. Path is treated
    as a real on-disk file (per the diffed-by-name model in checks_silent.sh).
    """
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            first = fh.readline()
    except OSError:
        return False
    return bool(_SHEBANG_RE.match(first))


def is_shell_file(path: str) -> bool:
    base = path.rsplit("/", 1)[-1]
    if path.endswith((".sh", ".bash", ".zsh")) or base in {
        "Makefile",
        "shell-setup",
        ".pre-commit-config.yaml",
    }:
        return True
    # Extensionless scripts (e.g. scripts/bootstrap-uv, scripts/audit-workspace)
    # must ALSO be scanned per the §3.7 "hooks scan ALL files" rule. Sniff the
    # actual file's shebang line so the classifier is path-name-agnostic.
    if "." not in base and base not in ("", "-", "dev", "null"):
        return _has_shell_shebang(path)
    return False


def is_cron_file(path: str) -> bool:
    base = path.rsplit("/", 1)[-1].lower()
    return base == "crontab" or base.endswith(".cron") or path.endswith(".crontab")


CRON_LINE = re.compile(r"^\s*(\*|\d|@)")
CRON_OK = re.compile(r"(>>?\s*(?!/dev/null\b)/\S+|\|\s*systemd-cat\b)")
CRON_ENV = re.compile(r"^\s*[A-Z_][A-Z0-9_]*\s*=")
CRON_SHEBANG_OR_COMMENT = re.compile(r"^\s*(#|$)")
