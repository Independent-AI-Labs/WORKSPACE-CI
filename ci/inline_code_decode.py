"""Bounded decode views for inline-code detection.

Derives the raw, normalized, and decoded views a rule is matched against,
reusing the normalization and offset mapping of ``ci.banned_scan``. Every
decoded form is bounded by the policy's declared depth and per-file cap, so
ordinary text is never decoded without limit.
"""

from __future__ import annotations

import base64
import binascii
import re
from typing import NamedTuple

from ci.banned_scan import normalize

NORMALIZE_STAGES: tuple[str, ...] = (
    "joined",
    "unescaped",
    "zwstrip",
    "wssep",
    "nfkc",
    "fold",
    "confusable",
)

_BASE64_RE = re.compile(r"[A-Za-z0-9+/]{16,}={0,2}")
_HEX_RE = re.compile(r"[0-9a-fA-F]{16,}")
_PERCENT_RE = re.compile(r"(?:%[0-9A-Fa-f]{2}){3,}")
_MAX_DECODED_PER_FILE = 64
_MIN_PRINTABLE_BYTES = 8
_PRINTABLE_NUMERATOR = 8


class View(NamedTuple):
    name: str
    text: str
    offsets: list[int]


def _printable(raw: bytes) -> str | None:
    if len(raw) < _MIN_PRINTABLE_BYTES:
        return None
    text = None
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        text = None
    if text is None:
        return None
    printable = sum(1 for ch in text if ch.isprintable() or ch in " \t\n\r")
    if printable * 10 < len(text) * _PRINTABLE_NUMERATOR:
        return None
    return text


def _b64_decode(padded: str) -> bytes | None:
    raw = None
    try:
        raw = base64.b64decode(padded, validate=True)
    except (ValueError, binascii.Error):
        raw = None
    return raw


def _decode_base64(text: str) -> list[tuple[str, int]]:
    out: list[tuple[str, int]] = []
    for match in _BASE64_RE.finditer(text):
        token = match.group(0)
        padded = token + "=" * (-len(token) % 4)
        raw = _b64_decode(padded)
        if raw is None:
            continue
        decoded = _printable(raw)
        if decoded is not None:
            out.append((decoded, match.start()))
    return out


def _hex_decode(token: str) -> bytes | None:
    raw = None
    try:
        raw = bytes.fromhex(token)
    except ValueError:
        raw = None
    return raw


def _decode_hex(text: str) -> list[tuple[str, int]]:
    out: list[tuple[str, int]] = []
    for match in _HEX_RE.finditer(text):
        token = match.group(0)
        if len(token) % 2:
            token = token[:-1]
        raw = _hex_decode(token)
        if raw is None:
            continue
        decoded = _printable(raw)
        if decoded is not None:
            out.append((decoded, match.start()))
    return out


def _decode_percent(text: str) -> list[tuple[str, int]]:
    out: list[tuple[str, int]] = []
    for match in _PERCENT_RE.finditer(text):
        token = match.group(0)
        raw = bytes(int(token[i + 1 : i + 3], 16) for i in range(0, len(token), 3))
        decoded = _printable(raw)
        if decoded is not None:
            out.append((decoded, match.start()))
    return out


def _decode_once(text: str) -> list[tuple[str, int]]:
    return _decode_base64(text) + _decode_hex(text) + _decode_percent(text)


def build_views(text: str, decode_depth: int) -> list[View]:
    views: list[View] = []
    identity = list(range(len(text)))
    normalized, nindex = normalize.compose(text, NORMALIZE_STAGES)
    views.append(View("raw", text, identity))
    views.append(View("normalized", normalized, nindex))

    pending: list[tuple[str, list[int]]] = [(text, identity)]
    seen: set[str] = {text}
    for _ in range(max(decode_depth, 0)):
        next_pending: list[tuple[str, list[int]]] = []
        for source, source_index in pending:
            if len(views) > _MAX_DECODED_PER_FILE:
                break
            for decoded, offset in _decode_once(source):
                if decoded in seen:
                    continue
                seen.add(decoded)
                base = source_index[offset] if offset < len(source_index) else 0
                index = [base] * len(decoded)
                views.append(View("decoded", decoded, index))
                dnorm, dindex = normalize.compose(decoded, NORMALIZE_STAGES)
                views.append(
                    View("decoded-normalized", dnorm, [index[i] for i in dindex])
                )
                next_pending.append((decoded, index))
        pending = next_pending
        if not pending:
            break
    return views
