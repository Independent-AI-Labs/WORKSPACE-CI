"""Versioned, pure result types for deterministic dependency validation."""

from __future__ import annotations

from hashlib import sha256
from typing import Final, Literal

from pydantic import BaseModel, ConfigDict

RESULT_SCHEMA_VERSION: Final = 1
InputStatus = Literal["read", "absent", "unreadable"]
InputKind = Literal[
    "catalog",
    "declaration",
    "npm-lock-declaration",
    "npm-lock",
    "npm-workspace-root",
    "npm-workspace-lock",
    "npm-workspace-member",
    "uv-lock-declaration",
    "uv-lock",
    "npm-workspaces-root",
    "dockerfile",
    "compose",
    "exclusions",
]


class InputResult(BaseModel):
    """Identity and applicability of one consumer-relative validation input."""

    model_config = ConfigDict(frozen=True)

    kind: InputKind
    relative_path: str | None
    applicable: bool
    content_identity: str | None
    status: InputStatus


class Diagnostic(BaseModel):
    """A stable structured form of one validation diagnostic."""

    model_config = ConfigDict(frozen=True)

    rule_id: str
    remediation_code: str
    severity: Literal["error"]
    path: str | None
    location: str | None
    message: str


class ConsumerRootIdentity(BaseModel):
    """Filesystem identity of the opened consumer root."""

    model_config = ConfigDict(frozen=True)

    device: int
    inode: int


class ValidationSummary(BaseModel):
    """Totals derived solely from the current validation invocation."""

    model_config = ConfigDict(frozen=True)

    status: Literal["valid", "invalid"]
    files_checked: int
    declarations_checked: int
    errors: int


class ValidationResult(BaseModel):
    """Complete deterministic validation result for one invocation."""

    model_config = ConfigDict(frozen=True)

    schema_version: Literal[1]
    mode: Literal["validate"]
    consumer_root_identity: ConsumerRootIdentity
    validator_generation_identity: None = None
    inputs: tuple[InputResult, ...]
    diagnostics: tuple[Diagnostic, ...]
    summary: ValidationSummary


def input_result(
    path: str,
    data: bytes | None,
    *,
    kind: InputKind,
    applicable: bool,
    status: InputStatus,
) -> InputResult:
    """Create a content identity for an input read during this invocation."""
    return InputResult(
        kind=kind,
        relative_path=_consumer_path(path),
        applicable=applicable,
        content_identity=sha256(data).hexdigest() if data is not None else None,
        status=status,
    )


def diagnostic_from_text(message: str) -> Diagnostic:
    """Convert stable diagnostic text into stable structured fields."""
    rule_id, _, remainder = message.partition(" ")
    subject, separator, detail = remainder.partition(": ")
    path, location = _path_and_location(subject)
    return Diagnostic(
        rule_id=rule_id,
        remediation_code=_remediation_code(rule_id),
        severity="error",
        path=path,
        location=location,
        message=detail if separator else remainder,
    )


def validation_result(
    consumer_root: ConsumerRootIdentity,
    inputs: tuple[InputResult, ...],
    diagnostics: list[str],
) -> ValidationResult:
    """Build a result from data owned entirely by the current invocation."""
    structured = tuple(diagnostic_from_text(item) for item in sorted(diagnostics))
    return ValidationResult(
        schema_version=RESULT_SCHEMA_VERSION,
        mode="validate",
        consumer_root_identity=consumer_root,
        # This source checkout has no trusted release identity to bind.
        validator_generation_identity=None,
        inputs=inputs,
        diagnostics=structured,
        summary=ValidationSummary(
            status="invalid" if structured else "valid",
            files_checked=sum(
                item.applicable and item.status == "read" for item in inputs
            ),
            declarations_checked=sum(
                item.applicable
                and item.status == "read"
                and item.kind
                in {
                    "declaration",
                    "npm-lock-declaration",
                    "npm-workspace-root",
                    "npm-workspace-member",
                    "uv-lock-declaration",
                    "npm-workspaces-root",
                }
                for item in inputs
            ),
            errors=len(structured),
        ),
    )


def _path_and_location(subject: str) -> tuple[str | None, str | None]:
    if not subject or subject == "$":
        return None, "$" if subject else None
    path, separator, location = subject.partition(":")
    if path.startswith("'") and path.endswith("'"):
        path = path[1:-1]
    if not separator:
        return _consumer_path(path), None
    return _consumer_path(path), location


def _consumer_path(value: str) -> str | None:
    """Retain only normalized paths that cannot name files outside the root."""
    if (
        not value
        or value.startswith("/")
        or "\x00" in value
        or any(part in {"", ".", ".."} for part in value.split("/"))
    ):
        return None
    return value


def _remediation_code(rule_id: str) -> str:
    """Map each stable rule family to one finite corrective-action code."""
    family = rule_id.split("-", maxsplit=2)[1] if rule_id.startswith("DV-") else "GEN"
    return {
        "IN": "correct-input",
        "CAT": "correct-catalog",
        "DECL": "correct-python-declaration",
        "NPM": "correct-npm-declaration",
        "LOCK": "correct-npm-lock",
        "UVL": "correct-uv-lock",
        "EXC": "correct-exclusions",
        "DOCKER": "correct-container-image",
    }.get(family, "correct-dependency-input")
