"""Normalized views and bounded reconstructions (REQ sections 4-11).

Every view carries an offset map (view position -> original position) so
findings report original line/column. All transforms are bounded,
declared, and single-pass; no uncontrolled stemming, no repeated nested
decoding, no source evaluation (REQ sections 9 and 10).

Normalization stages (mutation-test order):
  camelsplit lowercase-to-uppercase transitions become separators (5.9)
  joined     shell line-continuations join with a space (9)
  unescaped  bounded hex/octal/unicode/url escape decode (10)
  zwstrip    zero-width and format characters removed (11.3)
  wssep      non-ASCII whitespace acts as a separator (11.5)
  nfc/nfkc   Unicode normalization views (11.1)
  fold       Unicode full case folding (4.3)
  confusable homoglyph folding (11.6; bounded table)
"""

from __future__ import annotations

import re
import typing
import unicodedata

BIDI_CONTROLS = frozenset(
    "\u061c\u200e\u200f\u202a\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069"
)
ZERO_WIDTH = frozenset("\u200b\u200c\u200d\u2060\ufeff")
ASCII_WHITESPACE = frozenset(" \t\n\r\x0b\x0c")

# Bounded confusable table: Latin letters and digits with common
# Cyrillic/Greek/fullwidth lookalikes. Extending it is a reviewed policy
# change, never an unreviewed edit.
_CONFUSABLES: dict[str, str] = {}
for _lat, _conf in (
    ("a", "аαａ"),
    ("b", "Ььβｂ"),
    ("c", "сϲｃ"),
    ("d", "ԁⅾｄ"),
    ("e", "еεｅ"),
    ("g", "ɡցｇ"),
    ("h", "һｈ"),
    ("i", "іӀｉ"),
    ("j", "јｊ"),
    ("k", "кκｋ"),
    ("l", "Ɩⅼｌ"),
    ("m", "мｍ"),
    ("n", "оոｎ"),
    ("o", "оο０"),
    ("p", "рρｐ"),
    ("q", "գｑ"),
    ("r", "гɾｒ"),
    ("s", "ѕｓ"),
    ("t", "тτｔ"),
    ("u", "ѕυｕ"),
    ("v", "ѵνｖ"),
    ("w", "ѡԝｗ"),
    ("x", "хχｘ"),
    ("y", "уγｙ"),
    ("z", "ᴢｚ"),
    ("0", "０"),
    ("1", "１ӏ"),
    ("3", "З３"),
    ("6", "б６"),
    ("-", "\u2010\u2011\u2012\u2013\u2014\u2015\u2212"),
    ("/", "\u2044\u2215"),
):
    for _ch in _conf:
        _CONFUSABLES[_ch] = _lat

HEX_ESCAPE_RE = re.compile(r"\\x([0-9a-fA-F]{2})")
OCT_ESCAPE_RE = re.compile(r"\\([0-7]{1,3})")
UNI_ESCAPE_RE = re.compile(r"\\u([0-9a-fA-F]{4})")
URL_ESCAPE_RE = re.compile(r"%([0-9a-fA-F]{2})")
CONTINUATION_RE = re.compile(r"\\\n")
_ESCAPE_COMBINED = re.compile(
    f"{HEX_ESCAPE_RE.pattern}|{OCT_ESCAPE_RE.pattern}"
    f"|{UNI_ESCAPE_RE.pattern}|{URL_ESCAPE_RE.pattern}"
)


class BidiError(ValueError):
    """Bidirectional control characters are rejected in text (11.4)."""


def check_bidi(text: str) -> None:
    for ch in text:
        if ch in BIDI_CONTROLS:
            _msg = f"bidirectional control character U+{ord(ch):04X} present"
            raise BidiError(_msg)


def view_camelsplit(text: str) -> tuple[str, list[int]]:
    """Insert a separator at lowercase-to-uppercase transitions (5.9)
    and at letter-to-uppercase transitions after version digits (6)."""
    out: list[str] = []
    index: list[int] = []
    for pos, ch in enumerate(text):
        if (
            pos > 0
            and ch.isupper()
            and (text[pos - 1].islower() or text[pos - 1].isdigit())
        ):
            out.append("_")
            index.append(pos)
        out.append(ch)
        index.append(pos)
    return "".join(out), index


def view_joined(text: str) -> tuple[str, list[int]]:
    out: list[str] = []
    index: list[int] = []
    pos = 0
    while pos < len(text):
        m = CONTINUATION_RE.match(text, pos)
        if m:
            out.append(" ")
            index.append(pos)
            pos = m.end()
            continue
        out.append(text[pos])
        index.append(pos)
        pos += 1
    return "".join(out), index


def view_unescaped(text: str) -> tuple[str, list[int]]:
    """Bounded escape decode; each decoded char maps to its escape start."""
    out: list[str] = []
    index: list[int] = []
    pos = 0
    while pos < len(text):
        m = _ESCAPE_COMBINED.match(text, pos)
        if m:
            hexpart = m.group(1) or m.group(3) or m.group(4)
            decoded = chr(int(hexpart, 16)) if hexpart else chr(int(m.group(2), 8))
            out.append(decoded)
            index.append(pos)
            pos = m.end()
            continue
        out.append(text[pos])
        index.append(pos)
        pos += 1
    return "".join(out), index


def view_zwstrip(text: str) -> tuple[str, list[int]]:
    out = []
    index = []
    for pos, ch in enumerate(text):
        if ch in ZERO_WIDTH:
            continue
        out.append(ch)
        index.append(pos)
    return "".join(out), index


def view_wssep(text: str) -> tuple[str, list[int]]:
    out = []
    index = []
    for pos, ch in enumerate(text):
        if ch.isspace() and ch not in ASCII_WHITESPACE:
            out.append(" ")
        else:
            out.append(ch)
        index.append(pos)
    return "".join(out), index


def view_nf(
    text: str, form: typing.Literal["NFC", "NFD", "NFKC", "NFKD"]
) -> tuple[str, list[int]]:
    """Normalize per base-character + combining-marks chunk."""
    out: list[str] = []
    index: list[int] = []
    pos = 0
    n = len(text)
    while pos < n:
        start = pos
        pos += 1
        while pos < n and unicodedata.combining(text[pos]):
            pos += 1
        chunk = text[start:pos]
        norm = unicodedata.normalize(form, chunk)
        out.append(norm)
        index.extend([start] * len(norm))
    return "".join(out), index


def view_fold(text: str) -> tuple[str, list[int]]:
    out: list[str] = []
    index: list[int] = []
    pos = 0
    while pos < len(text):
        folded = text[pos].casefold()
        out.append(folded)
        index.extend([pos] * len(folded))
        pos += 1
    return "".join(out), index


def view_confusable(text: str) -> tuple[str, list[int]]:
    out = []
    index = []
    for pos, ch in enumerate(text):
        out.append(_CONFUSABLES.get(ch, ch))
        index.append(pos)
    return "".join(out), index


def normalize_path(text: str) -> str:
    """Collapse repeated separators and lexical dot segments (8.2-8.3)."""
    doubled = re.sub(r"/{2,}", "/", text)
    parts: list[str] = []
    for seg in doubled.split("/"):
        if seg == ".":
            continue
        if seg == ".." and parts and parts[-1] not in ("", ".."):
            parts.pop()
            continue
        parts.append(seg)
    return "/".join(parts)


_COLLAPSE_RE = re.compile(r"//+")
_DOTSEG_RE = re.compile(r"[^/]+/\.\.(/|$)")
_LEADING_DOT_RE = re.compile(r"/\.(?=/)")


def view_pathnorm(text: str) -> tuple[str, list[int]]:
    """Index-mapped path normalization: collapse `//` and `/./`, resolve
    `/seg/../` lexically without touching the filesystem (8.2-8.3)."""
    src = text
    index = list(range(len(src)))
    for _ in range(8):  # bounded passes
        out: list[str] = []
        idx: list[int] = []
        pos = 0
        changed = False
        n = len(src)
        while pos < n:
            if src[pos] == "/":
                m = _COLLAPSE_RE.match(src, pos)
                if m and m.end() - m.start() > 1:
                    out.append("/")
                    idx.append(index[pos])
                    pos = m.end()
                    changed = True
                    continue
                m = _LEADING_DOT_RE.match(src, pos)
                if m:
                    out.append("/")
                    idx.append(index[pos])
                    pos = m.end()
                    changed = True
                    continue
            m = _DOTSEG_RE.match(src, pos)
            if m and src[pos] != "/":
                out.append("/")
                idx.append(index[pos])
                pos = m.end()
                changed = True
                continue
            out.append(src[pos])
            idx.append(index[pos] if pos < len(index) else index[-1])
            pos += 1
        src = "".join(out)
        index = idx
        if not changed:
            break
    return src, index


# REQ 8.6 enumerates these wrapper/assignment prefixes; the list is the
# requirement's own vocabulary, not a protected-directory allowlist.
WRAPPER_TOKENS = (
    "sudo",
    "env",
    "exec",
    "nice",
    "nohup",
    "setsid",
    "stdbuf",
    "timeout",
    "xargs",
)
_BINDIRS_RE = re.compile(r"(?<![A-Za-z0-9_/.-])(?:/usr/local/bin|/bin)/")


def view_bindirs(text: str) -> tuple[str, list[int]]:
    """Canonicalize protected bin directories (8.7): /bin and
    /usr/local/bin map to /usr/bin so equivalent paths match the same
    protected tool. Replacement chars map to the match start."""
    out: list[str] = []
    index: list[int] = []
    pos = 0
    n = len(text)
    while pos < n:
        m = _BINDIRS_RE.match(text, pos)
        if m:
            out.append("/usr/bin/")
            index.extend([pos] * len("/usr/bin/"))
            pos = m.end()
            continue
        out.append(text[pos])
        index.append(pos)
        pos += 1
    return "".join(out), index


_WRAPPER_OR_ASSIGN_RE = re.compile(
    r"(?:\A|[\s;&|(])(?:(?:"
    + "|".join(WRAPPER_TOKENS)
    + r")(?:[ \t]+-\S+)*[ \t]+|(?:[A-Za-z_][A-Za-z0-9_]*=[^\s/&|()]+)[ \t]+)+"
)


def view_wrappers(text: str) -> tuple[str, list[int]]:
    """Strip wrapper command prefixes and interleaved variable
    assignments so they cannot hide protected tools (8.6). One bounded
    pass; deleted spans map to their start."""
    out: list[str] = []
    index: list[int] = []
    pos = 0
    n = len(text)
    while pos < n:
        m = _WRAPPER_OR_ASSIGN_RE.match(text, pos)
        if m:
            head = m.group(0)
            keep = head[0] if not (head[0].isalnum() or head[0] == "_") else ""
            if keep:
                out.append(keep)
                index.append(pos)
            pos = m.end()
            continue
        out.append(text[pos])
        index.append(pos)
        pos += 1
    return "".join(out), index


_ENV_PREFIX_RE = re.compile(
    r"(?<![A-Za-z0-9_$.])\$[A-Za-z_][A-Za-z0-9_]*|\$\{[A-Za-z_][A-Za-z0-9_]*\}"
)


def view_envstrip(text: str) -> tuple[str, list[int]]:
    """Strip shell environment-expansion path prefixes (8.8-adjacent):
    `$VAR/bin/tool` must resolve to the protected tool. Bounded single
    pass; deleted spans map to their start."""
    out: list[str] = []
    index: list[int] = []
    pos = 0
    n = len(text)
    while pos < n:
        m = _ENV_PREFIX_RE.match(text, pos)
        if m:
            pos = m.end()
            continue
        out.append(text[pos])
        index.append(pos)
        pos += 1
    return "".join(out), index


FAMILY_SUFFIXES = {
    "plural": ("s", "es", "ies"),
    "verb-forms": ("s", "es", "ed", "ing"),
}


_STAGES = {
    "camelsplit": view_camelsplit,
    "joined": view_joined,
    "unescaped": view_unescaped,
    "zwstrip": view_zwstrip,
    "wssep": view_wssep,
    "nfc": lambda t: view_nf(t, "NFC"),
    "nfkc": lambda t: view_nf(t, "NFKC"),
    "fold": view_fold,
    "confusable": view_confusable,
    "pathnorm": view_pathnorm,
    "bindirs": view_bindirs,
    "envstrip": view_envstrip,
    "wrappers": view_wrappers,
}

STAGE_ORDER = (
    "camelsplit",
    "joined",
    "unescaped",
    "zwstrip",
    "wssep",
    "nfc",
    "nfkc",
    "fold",
    "confusable",
    "pathnorm",
    "bindirs",
    "envstrip",
    "wrappers",
)

TOKEN_STAGES: tuple[str, ...] = ("zwstrip", "wssep", "nfkc", "fold")
PATH_STAGES: tuple[str, ...] = (
    "zwstrip",
    "wssep",
    "nfc",
    "fold",
    "confusable",
    "envstrip",
    "pathnorm",
    "bindirs",
    "wrappers",
)


def compose(text: str, stages: tuple[str, ...]) -> tuple[str, list[int]]:
    """Apply stages in order, composing offset maps (view pos -> original)."""
    current = text
    index = list(range(len(text)))
    for stage in stages:
        fn = _STAGES.get(stage)
        if fn is None:
            msg = f"unknown normalization stage: {stage}"
            raise ValueError(msg)
        current, idx = fn(current)
        index = [index[i] for i in idx]
    return current, index


def token_boundary_regex(token: str, versioned: bool) -> re.Pattern[str]:
    """Boundary-aware token regex over the folded view (section 5).

    Boundaries: string edges and any non-alphanumeric character, which
    covers whitespace, repeated `_`/`-`, `.`, `/`, `:`, quotes, and
    brackets; camel transitions were already split by the camelsplit
    stage. `versioned` tolerates numeric version suffixes (python3.13).
    """
    body = re.escape(token) + (r"[0-9]*(?:\.[0-9]+)*" if versioned else "")
    return re.compile(rf"(?<![a-z0-9]){body}(?![a-z0-9])")


def family_boundary_regex(token: str, family: str) -> re.Pattern[str]:
    """Declared morphological family (section 7): bounded generated
    suffix alternation with the shared boundary discipline. Unknown
    families fail loudly rather than quietly broadening."""
    suffixes = FAMILY_SUFFIXES.get(family)
    if suffixes is None:
        msg = f"unknown morphological family: {family}"
        raise ValueError(msg)
    alts = "|".join(re.escape(token + s) for s in ("", *suffixes))
    return re.compile(rf"(?<![a-z0-9])(?:{alts})(?![a-z0-9])")
