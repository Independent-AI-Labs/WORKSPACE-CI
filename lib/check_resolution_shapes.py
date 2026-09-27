#!/usr/bin/env python3
"""workspace-ci resolution-shape scanner.

Detects competing-source RESOLUTION logic that word bans cannot catch.
Scoped deliberately to competing-source resolution of tools and boot
paths; plain env-tunable defaults (${PORT:-8080}) and hard-fail
preflights (command -v x || die) are explicit logic and pass.

Detectors:
  1. `${VAR:-...}` whose default command-substitutes or names a boot
     dir: env override delegating to a probe.
  2. try-A-then-B: variable probed with `! -x` and reassigned nearby.
  3a. a shell function naming a boot-dir path AND calling `command -v`:
     boot-then-PATH resolver.
  3b. an array literal holding 2+ boot-dir candidates: multi-source
     candidate resolution.
  3c. an if/elif chain whose condition probes a boot-dir executable and
      whose chain also probes PATH: the non-function form of the
      boot-then-PATH resolver.
  4. any reference to a relocated original binary (`<tool>.original`), an
     apt-diverted copy (`<tool>.distrib`), or a `real-` sibling in shell
     content, and any tracked file whose name uses one of those forms.
     This detector has no exemptions: the tree stays locked until every
     such reference is gone.
  5. a probe assignment embedded in an `if`/`elif`/`while` condition, as
     in `if ! V="$(command -v x)"`. The try-A-then-B detector skips these
     because the assignment shares the line with the condition keyword.

Makefiles: wildcard-conditional resolution ($(if ...)) is
token-detectable and enforced by the banned-words catalog; out of
scope here.

Exits 0 if no violations, 1 otherwise.
Invoked from lib/checks_core.sh::ci_check_resolution_shapes.
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
_IF_ELIF_RE = re.compile(r"^(\s*)(if|elif)\b")
_ASSIGN_IN_COND_RE = re.compile(
    r"\b(?:if|elif|while|until)\b[^\n]*?\b([A-Za-z_][A-Za-z0-9_]*)="
    r"\s*[\"']?\$\([^)]*\b(?:command\s+-v|which)\b"
)
_ORIGINAL_USAGE_RE = re.compile(
    r"\breal-[A-Za-z0-9_][A-Za-z0-9_.-]*\b"
    r"|\b[A-Za-z0-9_][A-Za-z0-9_.-]*\.original\b"
    r"|\b[A-Za-z0-9_][A-Za-z0-9_.-]*\.real\b"
    r"|\b[A-Za-z0-9_][A-Za-z0-9_.-]*\.distrib\b"
)
_ORIGINAL_FILENAME_RE = re.compile(
    r"^(?:real-.*|.*\.original|.*\.real|.*\.distrib)$"
)

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
    out = _git(
        ["ls-files", "--cached", "--others", "--exclude-standard"],
        cwd=root,
    )
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

    # (4) forbidden original-binary access. No exemptions: any reference
    # to a relocated original, an apt-diverted copy, or a real- sibling
    # is a violation, so the tree stays locked until every one is gone.
    for i, line in enumerate(lines, 1):
        for m in _ORIGINAL_USAGE_RE.finditer(line):
            violations.append(
                f"{rel}:{i}: original-binary access '{m.group(0)}' "
                f"(address the guarded tool through its wrapper only)"
            )

    # (5) probe assignment embedded in a conditional:
    # `if ! V="$(command -v x)"; then`. Detector 2 misses it because the
    # assignment does not start the line.
    for i, line in enumerate(lines, 1):
        m = _ASSIGN_IN_COND_RE.search(line)
        if m:
            violations.append(
                f"{rel}:{i}: condition-embedded probe assignment: '{m.group(1)}' "
                f"resolved from a probe inside a conditional (resolve once, then "
                f"fail hard)"
            )

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
        closes_line = False
        if fm:
            _flush_func()
            func_start = i
            func_name = fm.group(1)
            func_has_boot = False
            func_has_cmdv = False
            # A one-line definition (`name() { body; }`) closes on the same
            # line. Without this the range bleeds to EOF and drags in
            # unrelated boot paths and command probes.
            body = line[fm.end():]
            closes_line = "}" in body and body.count("{") < body.count("}")
        if func_start is not None:
            if _BOOT_EXEC_RE.search(line):
                func_has_boot = True
            if _CMDV_RE.search(line):
                func_has_cmdv = True
            if closes_line or line.startswith("}"):
                _flush_func()
                func_start = None
    _flush_func()

    # (3c) if/elif chain without an enclosing function: a boot-dir
    # executable probe in the condition while the chain also probes PATH.
    chain_start: int | None = None
    chain_indent = 0
    chain_has_boot = False
    chain_has_cmdv = False
    for i, line in enumerate(lines, 1):
        bm = _IF_ELIF_RE.match(line)
        if bm is not None:
            indent = len(bm.group(1))
            if chain_start is None:
                chain_start, chain_indent = i, indent
                chain_has_boot = bool(_BOOT_EXEC_RE.search(line))
                chain_has_cmdv = bool(_CMDV_RE.search(line))
            elif indent == chain_indent:
                chain_has_boot = chain_has_boot or bool(_BOOT_EXEC_RE.search(line))
                chain_has_cmdv = chain_has_cmdv or bool(_CMDV_RE.search(line))
            continue
        if chain_start is None:
            continue
        if (
            line.lstrip().startswith("fi")
            and len(line) - len(line.lstrip()) == chain_indent
        ):
            if chain_has_boot and chain_has_cmdv:
                violations.append(
                    f"{rel}:{chain_start}: if/elif chain mixes a boot-dir "
                    f"executable probe with 'command -v' (boot-then-PATH "
                    f"resolver)"
                )
            chain_start = None
            continue
        chain_has_cmdv = chain_has_cmdv or bool(_CMDV_RE.search(line))

    return violations


def _filename_violation(rel: str) -> str | None:
    name = Path(rel).name
    if _ORIGINAL_FILENAME_RE.match(name):
        return f"{rel}: forbidden original-binary filename '{name}'"
    return None


def main() -> int:
    root = Path(_git(["rev-parse", "--show-toplevel"]).strip())
    all_violations: list[str] = []
    for rel in _tracked_files(root):
        fv = _filename_violation(rel)
        if fv is not None:
            all_violations.append(fv)
        all_violations.extend(_scan_file(root, rel))
    if all_violations:
        print("RESOLUTION-SHAPE VIOLATIONS:", file=sys.stderr)
        for v in all_violations:
            print(f"  {v}", file=sys.stderr)
        print(
            f"{len(all_violations)} violation(s). Single explicit source; "
            "no competing-source resolution.",
            file=sys.stderr,
        )
        return 1
    print("SUCCESS: no competing-source resolution constructs found.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
