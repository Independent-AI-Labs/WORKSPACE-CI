#!/usr/bin/env python3
"""workspace-ci fallback-resolution scanner.

Detects fallback-shaped RESOLUTION logic that word bans cannot catch.
Scoped deliberately to competing-source resolution of tools and boot
paths; plain env-tunable defaults (${PORT:-8080}) and hard-fail
preflights (command -v x || die) are explicit logic and pass.

Detectors:
  1. `${VAR:-...}` whose default command-substitutes or names a boot
     dir: env override delegating to a probe fallback.
  2. try-A-then-B: variable probed with `! -x` and reassigned nearby.
  3a. a shell function naming a boot-dir path AND calling `command -v`:
     boot-then-PATH resolver.
  3b. an array literal holding 2+ boot-dir candidates: multi-source
     candidate resolution.

Makefiles: wildcard-conditional resolution ($(if ...)) is
token-detectable and enforced by the banned-words catalog; out of
scope here.

Exits 0 if no violations, 1 otherwise.
Invoked from lib/checks_core.sh::ci_check_fallback_resolution.
"""

import re
import subprocess
import sys
from pathlib import Path

_DEFAULT_RE = re.compile(r"\$\{[A-Za-z_][A-Za-z0-9_]*:-([^}]*)\}")
_DEFAULT_BAD = re.compile(r"command\s+-v|\bwhich\s|\.boot-[^}]*?/bin/")
_NOTEXEC_RE = re.compile(r"!\s+-x\s+\"?\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?")
_ASSIGN_RE = re.compile(r"^\s*(?:local\s+)?([A-Za-z_][A-Za-z0-9_]*)=")
_FUNC_RE = re.compile(r"^\s*(?:function\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*(?:\(\s*\))?\s*\{")
_BOOT_PATH_RE = re.compile(r"[A-Za-z0-9_/${}.-]*\.boot-(?:linux|macos)[A-Za-z0-9_/${}.-]*")
_BOOT_EXEC_RE = re.compile(r"[A-Za-z0-9_/${}.-]*\.boot-(?:linux|macos)/bin/[A-Za-z0-9_/${}.-]*")
_CMDV_RE = re.compile(r"\bcommand\s+-v\b")
_ARRAY_OPEN_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_]*=\($")

_SHELL_SUFFIXES = {".sh", ".bash", ".bats"}
_MAKE_NAMES = {"Makefile", "makefile", "GNUmakefile"}


_NULL_STDIN = subprocess.DEVNULL


def _git(args: list[str], cwd: Path | None = None) -> str:
    """Run git, surfacing stderr on failure; returns stdout."""
    try:
        result = subprocess.run(
            ["git", *args],
            cwd=cwd,
            capture_output=True,
            text=True,
            stdin=_NULL_STDIN,
            check=True,
        )
    except subprocess.CalledProcessError as exc:
        sys.stderr.write(
            f"git {' '.join(args)} failed (exit {exc.returncode}): {exc.stderr}\n"
        )
        raise SystemExit(2) from exc
    return result.stdout


def _tracked_files(root: Path) -> list[str]:
    out = _git(["ls-files"], cwd=root)
    return [ln for ln in out.splitlines() if ln.strip()]


def _is_shell(path: str, first_line: str) -> bool:
    name = Path(path).name
    if name in _MAKE_NAMES:
        return False
    if Path(path).suffix in _SHELL_SUFFIXES:
        return True
    if Path(path).suffix == "" and first_line.startswith("#!") and (
        "bash" in first_line or first_line.endswith("/sh") or "/sh " in first_line
    ):
        return True
    return False


def _scan_file(root: Path, rel: str) -> list[str]:
    violations: list[str] = []
    try:
        text = (root / rel).read_text(encoding="utf-8", errors="strict")
    except (UnicodeDecodeError, OSError):
        return violations
    lines = text.splitlines()
    if not lines or not _is_shell(rel, lines[0]):
        return violations

    # (1) ${VAR:-default} where the default probes or names a boot dir.
    for i, line in enumerate(lines, 1):
        for m in _DEFAULT_RE.finditer(line):
            if _DEFAULT_BAD.search(m.group(1)):
                violations.append(
                    f"{rel}:{i}: default expansion delegates to a probe/boot path "
                    f"(single explicit source or fail hard)"
                )

    # (2) try-A-then-B: `! -x "$V"` probe, then `V=` reassignment nearby.
    for i, line in enumerate(lines):
        m = _NOTEXEC_RE.search(line)
        if not m:
            continue
        var = m.group(1)
        for j in range(i, min(i + 7, len(lines))):
            am = _ASSIGN_RE.match(lines[j])
            if am and am.group(1) == var:
                violations.append(
                    f"{rel}:{i + 1}: try-A-then-B resolution: '{var}' reassigned "
                    f"after '! -x' probe (fail hard on the single source instead)"
                )
                break

    # (3a) function containing a boot-executable path AND `command -v`.
    # Function range ends at the first `}` in column 0 (or the next
    # function start), so neighboring functions do not bleed together.
    # (3b) array literal holding 2+ boot-executable candidates.
    func_start: int | None = None
    func_name = ""
    func_has_boot = False
    func_has_cmdv = False
    in_array = False
    array_start = 0
    array_boots = 0

    def _flush_func() -> None:
        if func_start is not None and func_has_boot and func_has_cmdv:
            violations.append(
                f"{rel}:{func_start}: function '{func_name}' mixes boot-dir "
                f"executables with 'command -v' (boot-then-PATH resolver)"
            )

    def _flush_array() -> None:
        nonlocal in_array
        if array_boots >= 2:
            violations.append(
                f"{rel}:{array_start}: array names {array_boots} boot-dir "
                f"executable candidates (multi-source resolution)"
            )
        in_array = False

    for i, line in enumerate(lines, 1):
        if in_array:
            array_boots += len(_BOOT_EXEC_RE.findall(line))
            if ")" in line:
                _flush_array()
            continue
        if _ARRAY_OPEN_RE.search(line):
            in_array = True
            array_start = i
            array_boots = len(_BOOT_EXEC_RE.findall(line))
            if ")" in line:
                _flush_array()
        fm = _FUNC_RE.match(line)
        if fm:
            _flush_func()
            func_start = i
            func_name = fm.group(1)
            func_has_boot = False
            func_has_cmdv = False
        if func_start is not None:
            if _BOOT_EXEC_RE.search(line):
                func_has_boot = True
            if _CMDV_RE.search(line):
                func_has_cmdv = True
            if line.startswith("}"):
                _flush_func()
                func_start = None
    _flush_func()

    return violations


def main() -> int:
    root = Path(_git(["rev-parse", "--show-toplevel"]).strip())
    all_violations: list[str] = []
    for rel in _tracked_files(root):
        all_violations.extend(_scan_file(root, rel))
    if all_violations:
        print("FALLBACK-RESOLUTION VIOLATIONS:", file=sys.stderr)
        for v in all_violations:
            print(f"  {v}", file=sys.stderr)
        print(
            f"{len(all_violations)} violation(s). Single explicit source; "
            "no fallback resolution.",
            file=sys.stderr,
        )
        return 1
    print("SUCCESS: no fallback-resolution constructs found.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
