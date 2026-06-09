"""Markdown reference extraction.

Walks the token stream produced by markdown-it-py and emits a `Reference` for
every link/image target. Also extracts a slug map of the doc's own headings so
that in-doc anchor validation can happen without a second parse.
"""

from __future__ import annotations

from collections.abc import Iterable
from pathlib import Path
from typing import NamedTuple

from markdown_it import MarkdownIt
from markdown_it.token import Token

from ci._md_slug import slugify


class Reference(NamedTuple):
    """A single link/image target inside a markdown document."""

    kind: str  # "link" or "image"
    href: str
    src_file: Path
    line: int  # 1-based (markdown-it emits 0-based; we normalise on build)


class ParsedDoc(NamedTuple):
    """The extracted references plus the doc's own heading slug→text map."""

    path: Path
    references: list[Reference]
    headings: dict[str, str]  # slug → heading text


def _heading_text(tokens: list[Token], start_idx: int) -> str:
    """Collect text content between a heading_open and matching heading_close."""
    parts: list[str] = []
    for tok in tokens[start_idx + 1 :]:
        if tok.type == "heading_close":
            break
        if tok.type == "inline" and tok.content:
            parts.append(tok.content)
    return " ".join(parts).strip()


def _walk_inline(tokens: Iterable[Token], line: int) -> Iterable[tuple[str, str, int]]:
    """Yield (kind, href, line) tuples from an inline token stream."""
    for tok in tokens:
        if tok.type == "link_open":
            href = tok.attrGet("href")
            if isinstance(href, str):
                yield ("link", href, line)
        elif tok.type == "image":
            src = tok.attrGet("src")
            if isinstance(src, str):
                yield ("image", src, line)


def parse_doc(path: Path, text: str) -> ParsedDoc:
    """Parse a markdown doc; return its refs + heading slug map."""
    md = MarkdownIt("commonmark")
    tokens = md.parse(text)
    refs: list[Reference] = []
    headings: dict[str, str] = {}

    for idx, tok in enumerate(tokens):
        if tok.type == "heading_open":
            txt = _heading_text(tokens, idx)
            slug = slugify(txt)
            if slug:
                headings[slug] = txt
            continue
        if tok.type == "inline" and tok.children:
            # tok.map is [start, end] 0-based; translate to 1-based line
            line = (tok.map[0] + 1) if tok.map else 0
            for kind, href, ln in _walk_inline(tok.children, line):
                refs.append(Reference(kind=kind, href=href, src_file=path, line=ln))

    return ParsedDoc(path=path, references=refs, headings=headings)
