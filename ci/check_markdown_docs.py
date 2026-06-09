#!/usr/bin/env python3
"""Markdown documentation reference validator.

Walks `.md` files (or dirs), extracts every link / image target, and validates
each against the local filesystem, in-doc and cross-doc anchor slugs, and
(optionally) remote HTTP(S) endpoints.

Usage:
    python -m ci.check_markdown_docs [PATHS...]
        [--check-remote] [--timeout 5.0] [--json] [--ignore GLOB]
        [--fail-on error|warning|any] [--all-md]

    --all-md  Scan ALL markdown files tracked by git (retroactive mode).
              When this flag is set, PATHS are ignored and every .md file
              in the repository is checked. Useful for pre-push or CI.

Config (optional): `<CI_CONFIG_DIR>/markdown_docs.yaml`.
"""

from __future__ import annotations

import argparse
import fnmatch
import json
import os
import subprocess
import sys
from http import HTTPStatus
from pathlib import Path

import httpx
import yaml
from pydantic import BaseModel, ConfigDict, Field
from typing_extensions import TypedDict

from ci._md_checkers import (
    SEVERITY_ERROR,
    SEVERITY_WARNING,
    Finding,
    RemoteClient,
    check_reference,
)
from ci._md_refs import ParsedDoc, parse_doc


class MarkdownDocsConfig(BaseModel):
    """Typed view of `<CI_CONFIG_DIR>/markdown_docs.yaml`."""

    model_config = ConfigDict(extra="ignore")
    ignore: list[str] = Field(default_factory=list)
    check_remote: bool = False
    timeout: float = 5.0
    exceptions: list[MarkdownExceptionEntry] = Field(default_factory=list)


class MarkdownExceptionEntry(TypedDict, total=False):
    """Exception entry for markdown docs findings."""

    file: str
    line: int


# ANSI colour codes
RED = "\033[91m"
YELLOW = "\033[93m"
GREEN = "\033[92m"
DIM = "\033[2m"
BOLD = "\033[1m"
RESET = "\033[0m"

DEFAULT_HTTP_TIMEOUT = 5.0
HTTP_OK_MIN = HTTPStatus.OK
HTTP_REDIRECT_MAX = HTTPStatus.BAD_REQUEST  # 400 — first non-success
HTTP_METHOD_NOT_ALLOWED = HTTPStatus.METHOD_NOT_ALLOWED
_MD_SUFFIXES = frozenset({".md", ".markdown", ".mdown"})


def _find_config_dir() -> Path | None:
    env = os.environ.get("CI_CONFIG_DIR")
    if env:
        return Path(env).resolve()
    cursor = Path(__file__).resolve()
    for _ in range(5):
        cursor = cursor.parent
        if (cursor / "config").is_dir():
            return cursor / "config"
    return None


def _load_config() -> MarkdownDocsConfig:
    cfg_dir = _find_config_dir()
    if not cfg_dir:
        return MarkdownDocsConfig()
    cfg_file = cfg_dir / "markdown_docs.yaml"
    if not cfg_file.is_file():
        return MarkdownDocsConfig()
    try:
        loaded = yaml.safe_load(cfg_file.read_text(encoding="utf-8"))
    except yaml.YAMLError:
        return MarkdownDocsConfig()
    if isinstance(loaded, dict):
        return MarkdownDocsConfig.model_validate(loaded)
    return MarkdownDocsConfig()


def _path_is_ignored(path: Path, ignore: list[str]) -> bool:
    rp_str = str(path)
    return any(
        fnmatch.fnmatch(rp_str, pat) or fnmatch.fnmatch(path.name, pat)
        for pat in ignore
    )


def _expand_root(root: Path, ignore: list[str], seen: set[Path]) -> list[Path]:
    if not root.exists():
        print(f"{YELLOW}warning:{RESET} {root} does not exist", file=sys.stderr)
        return []

    found: list[Path] = []

    def _add(p: Path) -> None:
        rp = p.resolve()
        if rp in seen or _path_is_ignored(rp, ignore):
            return
        seen.add(rp)
        found.append(p)

    if root.is_file():
        if root.suffix.lower() in _MD_SUFFIXES:
            _add(root)
        return found

    for p in root.rglob("*.md"):
        if any(part.startswith(".") and part != "." for part in p.parts):
            continue
        _add(p)
    return found


def _iter_md_files(paths: list[Path], ignore: list[str]) -> list[Path]:
    """Expand `paths` (files and dirs) into a list of .md files, skipping ignores."""
    seen: set[Path] = set()
    out: list[Path] = []
    for root in paths:
        out.extend(_expand_root(root, ignore, seen))
    return out


class _HttpClient:
    """Tries HEAD first, retries with GET when the server refuses HEAD.

    Creates a fresh transport per probe to avoid connection-pool pollution
    (httpx HTTP/2 re-use can return stale status codes after ~30 requests
    to diverse hosts).  Caches results so repeated URL references are
    probed once per run.
    """

    def __init__(self, timeout: float) -> None:
        self._timeout = timeout
        self._headers = {"user-agent": "ci-md-validator/0.1"}
        self._cache: dict[str, tuple[bool, str]] = {}

    def check(self, url: str) -> tuple[bool, str]:
        if url in self._cache:
            return self._cache[url]
        result = self._probe(url)
        self._cache[url] = result
        return result

    def _new_client(self) -> httpx.Client:
        return httpx.Client(
            timeout=self._timeout,
            follow_redirects=True,
            headers=self._headers,
        )

    def _probe(self, url: str) -> tuple[bool, str]:
        for method in ("HEAD", "GET"):
            client = self._new_client()
            try:
                r = client.request(method, url)
            except httpx.RequestError as exc:
                client.close()
                return (False, f"{type(exc).__name__}: {exc}")
            client.close()
            if HTTP_OK_MIN <= r.status_code < HTTP_REDIRECT_MAX:
                return (True, f"{r.status_code}")
            # HEAD may get inconsistent results (e.g. intermittent 404 from
            # PDF endpoints) — fall through to GET for a definitive answer.
            if method == "HEAD":
                continue
            return (False, f"HTTP {r.status_code}")
        return (False, "no response")

    def close(self) -> None:
        pass


def _apply_exceptions(
    findings: list[Finding],
    exceptions: list[MarkdownExceptionEntry],
) -> list[Finding]:
    """Drop findings that match a configured exception entry."""
    if not exceptions:
        return findings
    out: list[Finding] = []
    for f in findings:
        rel = str(f.ref.src_file)
        skip = False
        for exc in exceptions:
            if exc.get("file") and not rel.endswith(str(exc["file"])):
                continue
            if exc.get("line") and f.ref.line != exc["line"]:
                continue
            skip = True
            break
        if not skip:
            out.append(f)
    return out


def _print_human(findings: list[Finding]) -> None:
    by_file: dict[Path, list[Finding]] = {}
    for f in findings:
        by_file.setdefault(f.ref.src_file, []).append(f)

    for src_file, items in sorted(by_file.items(), key=lambda kv: str(kv[0])):
        try:
            rel = src_file.relative_to(Path.cwd())
        except ValueError:
            rel = src_file
        print(f"\n{BOLD}{rel}{RESET}")
        for f in sorted(items, key=lambda x: x.ref.line):
            icon = (
                f"{RED}✗{RESET}"
                if f.severity == SEVERITY_ERROR
                else f"{YELLOW}⚠{RESET}"
            )
            tail = (
                f"{DIM} (did you mean: {f.suggestion}?){RESET}" if f.suggestion else ""
            )
            print(f"  {icon} L{f.ref.line} {f.message}{tail}")


class FindingJson(TypedDict, total=False):
    """JSON representation of a finding for --json output."""

    line: int
    kind: str
    href: str
    severity: str
    message: str
    suggestion: str | None


def _print_json(findings: list[Finding]) -> None:
    by_file: dict[str, list[FindingJson]] = {}
    for f in findings:
        by_file.setdefault(str(f.ref.src_file), []).append(
            {
                "line": f.ref.line,
                "kind": f.ref.kind,
                "href": f.ref.href,
                "severity": f.severity,
                "message": f.message,
                "suggestion": f.suggestion,
            },
        )
    print(json.dumps({"files": by_file}, indent=2))


def _should_fail(findings: list[Finding], fail_on: str) -> bool:
    if fail_on == "any":
        return bool(findings)
    if fail_on == "warning":
        return any(f.severity in (SEVERITY_ERROR, SEVERITY_WARNING) for f in findings)
    return any(f.severity == SEVERITY_ERROR for f in findings)


def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Validate references in markdown docs")
    parser.add_argument(
        "paths", nargs="*", type=Path, default=[], help="Files or directories"
    )
    parser.add_argument(
        "--check-remote",
        action="store_true",
        help="Check HTTP(S) URLs",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=DEFAULT_HTTP_TIMEOUT,
        help="HTTP timeout seconds",
    )
    parser.add_argument("--json", dest="json_output", action="store_true")
    parser.add_argument(
        "--ignore",
        action="append",
        default=[],
        help="glob pattern to skip",
    )
    parser.add_argument(
        "--fail-on",
        choices=("error", "warning", "any"),
        default="error",
        help="minimum severity that causes non-zero exit",
    )
    parser.add_argument(
        "--all-md",
        action="store_true",
        help="Scan ALL markdown files tracked by git, not just provided paths",
    )
    return parser


def _resolve_remote(check_remote: bool, timeout: float) -> RemoteClient | None:
    if not check_remote:
        return None
    try:
        return _HttpClient(timeout)
    except (ImportError, httpx.HTTPError):
        print(
            f"{YELLOW}warning:{RESET} httpx not installed; skipping remote checks",
            file=sys.stderr,
        )
        return None


def _scan_files(
    files: list[Path],
    remote: RemoteClient | None,
) -> list[Finding]:
    slug_cache: dict[Path, dict[str, str]] = {}
    findings: list[Finding] = []
    for path in files:
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as exc:
            print(f"{YELLOW}warning:{RESET} cannot read {path}: {exc}", file=sys.stderr)
            continue
        doc: ParsedDoc = parse_doc(path, text)
        slug_cache[path.resolve()] = doc.headings
        for ref in doc.references:
            findings.extend(check_reference(ref, doc, slug_cache, remote))
    if remote is not None:
        remote.close()
    return findings


def _emit_summary(
    findings: list[Finding],
    files: list[Path],
    json_output: bool,
) -> None:
    if json_output:
        _print_json(findings)
        return
    if not findings:
        print(f"{GREEN}SUCCESS:{RESET} No broken references in {len(files)} file(s).")
        return
    _print_human(findings)
    errors = sum(1 for f in findings if f.severity == SEVERITY_ERROR)
    warnings = sum(1 for f in findings if f.severity == SEVERITY_WARNING)
    err_word = "error" if errors == 1 else "errors"
    warn_word = "warning" if warnings == 1 else "warnings"
    file_word = "file" if len(files) == 1 else "files"
    print(
        f"\n{BOLD}Summary:{RESET} "
        f"{RED}{errors} {err_word}{RESET}, "
        f"{YELLOW}{warnings} {warn_word}{RESET} "
        f"across {len(files)} {file_word}",
    )


def _discover_all_md(ignore: list[str]) -> list[Path]:
    """Discover all .md files tracked by git in the current repo."""
    try:
        result = subprocess.run(
            ["git", "ls-files", "*.md"],
            capture_output=True,
            text=True,
            check=True,
        )
    except FileNotFoundError:
        print(
            f"{YELLOW}error:{RESET} git not found",
            file=sys.stderr,
        )
        return []
    except subprocess.CalledProcessError as exc:
        print(
            f"{YELLOW}error:{RESET} git ls-files failed: {exc.stderr.strip()}",
            file=sys.stderr,
        )
        return []

    cwd = Path.cwd()
    files: list[Path] = []
    for raw_line in result.stdout.strip().splitlines():
        cleaned = raw_line.strip()
        if not cleaned:
            continue
        p = (cwd / cleaned).resolve()
        if not _path_is_ignored(p, ignore):
            files.append(p)
    return files


def run(argv: list[str] | None = None) -> int:
    args = _build_arg_parser().parse_args(argv)

    config = _load_config()
    ignore = list(args.ignore) + list(config.ignore)
    check_remote = args.check_remote or config.check_remote
    timeout = args.timeout if args.timeout != DEFAULT_HTTP_TIMEOUT else config.timeout

    if args.all_md:
        files = _discover_all_md(ignore)
        if not files:
            if not args.json_output:
                print(f"{DIM}No markdown files found in repository.{RESET}")
            return 0
    else:
        if not args.paths:
            print(f"{RED}error:{RESET} provide PATHS or --all-md", file=sys.stderr)
            return 1
        files = _iter_md_files(args.paths, ignore)
        if not files:
            if not args.json_output:
                print(f"{DIM}No markdown files to check.{RESET}")
            return 0

    remote = _resolve_remote(check_remote, timeout)
    findings = _scan_files(files, remote)
    findings = _apply_exceptions(findings, config.exceptions)

    _emit_summary(findings, files, args.json_output)

    return 1 if _should_fail(findings, args.fail_on) else 0


def main() -> None:
    sys.exit(run())


if __name__ == "__main__":
    main()
