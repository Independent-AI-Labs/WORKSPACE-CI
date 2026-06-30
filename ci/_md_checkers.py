"""Reference checkers: dispatched by URL scheme / form.

Each checker inspects a Reference and returns a list of Findings.
"""

from __future__ import annotations

import difflib
import re
from pathlib import Path
from typing import NamedTuple, Protocol

from ci._md_refs import ParsedDoc, Reference, parse_doc

SEVERITY_ERROR = "error"
SEVERITY_WARNING = "warning"

_MAILTO_RE = re.compile(r"^mailto:[^@\s]+@[^@\s]+\.[^@\s]+$", re.IGNORECASE)
_TEL_RE = re.compile(r"^tel:[+\d\-()\s]+$", re.IGNORECASE)
_HTTP_RE = re.compile(r"^https?://", re.IGNORECASE)
_OTHER_SCHEME_RE = re.compile(r"^[a-z][a-z0-9+.\-]*:", re.IGNORECASE)
_MARKDOWN_SUFFIXES = frozenset({".md", ".markdown", ".mdown"})


class Finding(NamedTuple):
    ref: Reference
    severity: str
    message: str
    suggestion: str | None = None


class RemoteClient(Protocol):
    def check(self, url: str) -> tuple[bool, str]: ...
    def close(self) -> None: ...


def _split_anchor(href: str) -> tuple[str, str | None]:
    if "#" not in href:
        return href, None
    path, anchor = href.split("#", 1)
    return path, anchor or None


def _resolve_local(ref: Reference, raw_path: str) -> Path:
    """Resolve a path relative to the doc, or repo-absolute for leading /."""
    if raw_path.startswith("/"):
        cursor = ref.src_file.resolve().parent
        while cursor != cursor.parent:
            if (cursor / ".git").exists():
                return (cursor / raw_path.lstrip("/")).resolve()
            cursor = cursor.parent
        return Path(raw_path)
    return (ref.src_file.parent / raw_path).resolve()


def _suggest_slug(slug: str, available: dict[str, str]) -> str | None:
    matches = difflib.get_close_matches(slug, list(available.keys()), n=1, cutoff=0.6)
    return matches[0] if matches else None


def _suggest_file(name: str, siblings: list[str]) -> str | None:
    matches = difflib.get_close_matches(name, siblings, n=1, cutoff=0.6)
    return matches[0] if matches else None


def _check_in_page_anchor(
    ref: Reference,
    doc: ParsedDoc,
    href: str,
) -> list[Finding]:
    slug = href[1:]
    if not slug:
        return [Finding(ref, SEVERITY_ERROR, "empty anchor")]
    if slug in doc.headings:
        return []
    suggestion = _suggest_slug(slug, doc.headings)
    hint = f"#{suggestion}" if suggestion else None
    return [Finding(ref, SEVERITY_ERROR, f"unknown anchor #{slug}", hint)]


def _check_mailto(ref: Reference, href: str) -> list[Finding]:
    if not _MAILTO_RE.match(href):
        return [Finding(ref, SEVERITY_WARNING, f"malformed mailto: {href}")]
    return []


def _check_tel(ref: Reference, href: str) -> list[Finding]:
    if not _TEL_RE.match(href):
        return [Finding(ref, SEVERITY_WARNING, f"malformed tel: {href}")]
    return []


def _check_http(
    ref: Reference,
    href: str,
    remote: RemoteClient | None,
) -> list[Finding]:
    if remote is None:
        return []
    ok, detail = remote.check(href)
    if ok:
        return []
    return [Finding(ref, SEVERITY_ERROR, f"unreachable URL: {detail}")]


def _missing_file_finding(ref: Reference, target: Path, raw_path: str) -> Finding:
    siblings = (
        [p.name for p in target.parent.iterdir() if p.is_file()]
        if target.parent.exists()
        else []
    )
    suggestion = _suggest_file(target.name, siblings)
    hint = str(target.parent / suggestion) if suggestion else None
    return Finding(ref, SEVERITY_ERROR, f"missing file: {raw_path}", hint)


def _slugs_for_target(
    target: Path,
    slug_cache: dict[Path, dict[str, str]],
) -> dict[str, str]:
    cached = slug_cache.get(target)
    if cached is not None:
        return cached
    try:
        slugs = parse_doc(target, target.read_text(encoding="utf-8")).headings
    except (OSError, UnicodeDecodeError):
        slugs = {}
    slug_cache[target] = slugs
    return slugs


def _check_cross_doc_anchor(
    ref: Reference,
    target: Path,
    anchor: str,
    raw_path: str,
    slug_cache: dict[Path, dict[str, str]],
) -> list[Finding]:
    slugs = _slugs_for_target(target, slug_cache)
    if anchor in slugs:
        return []
    suggestion = _suggest_slug(anchor, slugs)
    hint = f"{raw_path}#{suggestion}" if suggestion else None
    return [
        Finding(
            ref,
            SEVERITY_ERROR,
            f"unknown anchor in {raw_path}: #{anchor}",
            hint,
        ),
    ]


def _check_local_path(
    ref: Reference,
    href: str,
    slug_cache: dict[Path, dict[str, str]],
) -> list[Finding]:
    raw_path, anchor = _split_anchor(href)
    target = _resolve_local(ref, raw_path) if raw_path else ref.src_file

    if not target.exists():
        return [_missing_file_finding(ref, target, raw_path)]

    if anchor and target.suffix.lower() in _MARKDOWN_SUFFIXES:
        return _check_cross_doc_anchor(ref, target, anchor, raw_path, slug_cache)

    return []


def _check_uri_scheme(
    ref: Reference,
    href: str,
    remote: RemoteClient | None,
) -> list[Finding] | None:
    """Return findings for any URI-with-scheme href, or None if not URI-shaped."""
    lowered = href.lower()
    if lowered.startswith("mailto:"):
        return _check_mailto(ref, href)
    if lowered.startswith("tel:"):
        return _check_tel(ref, href)
    if _HTTP_RE.match(href):
        return _check_http(ref, href, remote)
    if _OTHER_SCHEME_RE.match(href):
        return []
    return None


def check_reference(
    ref: Reference,
    doc: ParsedDoc,
    slug_cache: dict[Path, dict[str, str]],
    remote: RemoteClient | None = None,
) -> list[Finding]:
    """Dispatch `ref` to the appropriate checker(s) and collect findings.

    `slug_cache` is shared across the whole run so cross-doc anchor checks
    don't re-parse the target file.
    """
    href = ref.href.strip()
    if not href:
        return [Finding(ref, SEVERITY_ERROR, "empty href")]

    if href.startswith("#"):
        return _check_in_page_anchor(ref, doc, href)

    scheme_result = _check_uri_scheme(ref, href, remote)
    if scheme_result is not None:
        return scheme_result

    return _check_local_path(ref, href, slug_cache)
