"""CI-specific result types for dependency checking.

Provides NamedTuples that support tuple unpacking while adding named field access.
"""

from typing import NamedTuple


class LooseDependency(NamedTuple):
    """A dependency without pinned version."""

    name: str
    current_spec: str
    latest_version: str


class OutdatedDependency(NamedTuple):
    """A dependency with outdated pinned version."""

    name: str
    extras: str | None
    old_version: str | None
    new_version: str


class ParsedDependency(NamedTuple):
    """A parsed dependency specification."""

    name: str
    extras: str | None
    operator: str | None
    version: str | None


class DependencyCheckResult(NamedTuple):
    """Result from checking and collecting dependency issues."""

    loose: list[LooseDependency]
    outdated: list[OutdatedDependency]
    toml_data: object  # parsed TOML data


class ImageRef(NamedTuple):
    """Parsed Docker image reference (image name + optional tag)."""

    image: str
    tag: str | None


class PathCheckResult(NamedTuple):
    """Result from checking a single file for dependency issues."""

    has_errors: bool
    upgrade_count: int
