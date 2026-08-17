"""Pure offline validation of Dockerfile base-image references.

Accepted tags use the strict ``DIGIT+ ("." DIGIT+)*`` grammar, with one or
more numeric components (for example, ``3``, ``3.13``, or ``2026.08.09``).
Tags with prefixes, suffixes, variants, or names are deliberately rejected so
the validator never needs registry state to determine whether they move.
"""

from __future__ import annotations

import re

_INSTRUCTION_RE = re.compile(r"^\s*FROM(?:\s|$)", re.IGNORECASE)
_ARG_RE = re.compile(
    r"^\s*ARG\s+([A-Za-z_][A-Za-z0-9_]*)(?:=([^\s]*))?\s*$", re.IGNORECASE
)
_VARIABLE_RE = re.compile(r"\$(?:[A-Za-z_][A-Za-z0-9_]*|\{[^}]*\})")
_TAG_RE = re.compile(r"^[0-9]+(?:\.[0-9]+)*$")
_DIGEST_RE = re.compile(r"^sha256:[0-9a-f]{64}$")
_ALIAS_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]*$")
_NAME_COMPONENT_RE = re.compile(r"^[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*$")
_REGISTRY_RE = re.compile(
    r"^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*(?::[0-9]+)?$"
)
_ALIAS_TOKENS = 2
_MOVING_TAGS = frozenset(
    {"latest", "stable", "edge", "nightly", "beta", "alpha", "dev", "test"}
)


def _logical_lines(text: str) -> list[tuple[int, str]]:
    lines: list[tuple[int, str]] = []
    start = 0
    pending = ""
    for number, line in enumerate(text.splitlines(), start=1):
        stripped = line.rstrip()
        if not pending:
            start = number
        if stripped.endswith("\\"):
            pending += stripped[:-1] + " "
            continue
        lines.append((start, pending + line))
        pending = ""
    if pending:
        lines.append((start, pending))
    return lines


def _image_and_tag(reference: str) -> tuple[str, str | None, str | None]:
    name, separator, digest = reference.partition("@")
    if separator:
        return name, None, digest
    last_component = name.rsplit("/", maxsplit=1)[-1]
    if ":" not in last_component:
        return name, None, None
    image, tag = name.rsplit(":", maxsplit=1)
    return image, tag, None


def _valid_repository_name(name: str) -> bool:
    components = name.split("/")
    if not components or any(not component for component in components):
        return False
    registry = components[0]
    if len(components) > 1 and ("." in registry or ":" in registry):
        return bool(_REGISTRY_RE.fullmatch(registry)) and all(
            _NAME_COMPONENT_RE.fullmatch(component) for component in components[1:]
        )
    return all(_NAME_COMPONENT_RE.fullmatch(component) for component in components)


def validate_image_reference(
    reference: str, location: str, subject: str = "image"
) -> list[str]:
    """Validate one immutable image reference without contacting a registry."""
    diagnostic: str | None = None
    if _VARIABLE_RE.search(reference):
        diagnostic = f"DV-DOCKER-002 {location}: unresolved variable in {subject}"
    elif reference.count("@") > 1:
        diagnostic = f"DV-DOCKER-003 {location}: malformed {subject} digest"
    else:
        image, tag, digest = _image_and_tag(reference)
        if not _valid_repository_name(image):
            diagnostic = f"DV-DOCKER-004 {location}: malformed {subject} reference"
        elif digest is not None and not _DIGEST_RE.fullmatch(digest):
            diagnostic = f"DV-DOCKER-003 {location}: malformed {subject} digest"
        elif digest is None and (tag is None or not tag):
            diagnostic = f"DV-DOCKER-005 {location}: {subject} requires a tag or digest"
        elif digest is None and tag is not None and tag.lower() in _MOVING_TAGS:
            diagnostic = f"DV-DOCKER-006 {location}: moving {subject} tag {tag!r}"
        elif digest is None and tag is not None and not _TAG_RE.fullmatch(tag):
            diagnostic = (
                f"DV-DOCKER-007 {location}: {subject} tag {tag!r} must be a numeric "
                "dotted version"
            )
    return [] if diagnostic is None else [diagnostic]


def _variable_name(variable: str) -> str | None:
    name = variable[2:-1] if variable.startswith("${") else variable[1:]
    return name if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name) else None


def _resolve_from_reference(
    reference: str, arguments: dict[str, str | None], ambiguous: set[str]
) -> str:
    """Resolve declared literal ARGs only where they occupy an image component."""

    def replace(match: re.Match[str]) -> str:
        variable = match.group()
        name = _variable_name(variable)
        start, end = match.span()
        whole_component = (start == 0 or reference[start - 1] in "/:@") and (
            end == len(reference) or reference[end] in "/:@"
        )
        value = arguments.get(name) if name is not None else None
        if (
            not whole_component
            or name is None
            or name in ambiguous
            or not value
            or _VARIABLE_RE.search(value)
        ):
            return variable
        return value

    return _VARIABLE_RE.sub(replace, reference)


def _record_global_arg(
    line: str, arguments: dict[str, str | None], ambiguous: set[str]
) -> None:
    match = _ARG_RE.match(line)
    if match is None:
        return
    name, value = match.groups()
    if name in arguments:
        ambiguous.add(name)
        return
    arguments[name] = value if value and not _VARIABLE_RE.search(value) else None


def _validate_from_tokens(
    tokens: list[str],
    location: str,
    stages: set[str],
    arguments: dict[str, str | None],
    ambiguous: set[str],
) -> list[str]:
    diagnostics: list[str] = []
    index = 1
    while index < len(tokens) and tokens[index].startswith("--"):
        if _VARIABLE_RE.search(tokens[index]):
            diagnostics.append(
                f"DV-DOCKER-002 {location}: unresolved variable in FROM option"
            )
        index += 1
    if index >= len(tokens):
        diagnostics.append(f"DV-DOCKER-004 {location}: malformed FROM instruction")
        return diagnostics
    reference = _resolve_from_reference(tokens[index], arguments, ambiguous)
    remainder = tokens[index + 1 :]
    if reference.lower() != "scratch" and reference.lower() not in stages:
        diagnostics.extend(validate_image_reference(reference, location, "FROM image"))
    if not remainder:
        return diagnostics
    if len(remainder) != _ALIAS_TOKENS or remainder[0].lower() != "as":
        diagnostics.append(f"DV-DOCKER-004 {location}: malformed FROM instruction")
        return diagnostics
    alias = remainder[1]
    if not _ALIAS_RE.fullmatch(alias):
        diagnostics.append(f"DV-DOCKER-004 {location}: malformed stage alias")
        return diagnostics
    stages.add(alias.lower())
    return diagnostics


def validate_dockerfile_bytes(data: bytes, display_path: str) -> list[str]:
    """Validate Dockerfile FROM references from descriptor-bound bytes only."""
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError as error:
        return [f"DV-DOCKER-001 {display_path}: invalid UTF-8: {error}"]

    diagnostics: list[str] = []
    stages: set[str] = set()
    arguments: dict[str, str | None] = {}
    ambiguous: set[str] = set()
    seen_from = False
    for line_number, line in _logical_lines(text):
        if not seen_from:
            _record_global_arg(line, arguments, ambiguous)
        if _INSTRUCTION_RE.match(line):
            seen_from = True
            location = f"{display_path}:{line_number}"
            diagnostics.extend(
                _validate_from_tokens(
                    line.split(), location, stages, arguments, ambiguous
                )
            )
    return diagnostics
