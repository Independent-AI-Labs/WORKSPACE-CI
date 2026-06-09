"""Docker image version checking for compose files and Dockerfiles."""

import json
import logging
import re
import urllib.error
import urllib.request
from pathlib import Path

import yaml
from pydantic import BaseModel, ConfigDict, Field

from ci.models import (
    DependencyCheckResult,
    ImageRef,
    LooseDependency,
    OutdatedDependency,
)

logger = logging.getLogger(__name__)


class DockerHubTag(BaseModel):
    """One entry from Docker Hub's `/v2/repositories/<image>/tags` response."""

    model_config = ConfigDict(extra="ignore")
    name: str = ""
    tag_status: str | None = None


class DockerHubTagsResponse(BaseModel):
    """Top-level shape of the Docker Hub tags API response we consume."""

    model_config = ConfigDict(extra="ignore")
    results: list[DockerHubTag] = Field(default_factory=list)


def _parse_docker_hub_response(payload: object) -> DockerHubTagsResponse:
    """Validate raw JSON payload into the typed response model."""
    if not isinstance(payload, dict):
        return DockerHubTagsResponse()
    return DockerHubTagsResponse.model_validate(payload)


DOCKER_COMPOSE_NAMES = {
    "docker-compose.yml",
    "docker-compose.yaml",
    "compose.yml",
    "compose.yaml",
}
DOCKERFILE_NAMES_RE = re.compile(r"^Dockerfile(\..+)?$")
_BANNED_TAGS = {"latest", "stable", "edge", "nightly", "beta", "alpha", "dev", "test"}
_VERSION_TAG_RE = re.compile(r"^v?\d+(\.\d+)*(-[a-zA-Z0-9._]+)?(\+[a-zA-Z0-9._]+)?$")
_PRERELEASE_SUFFIXES = re.compile(
    r"-(rc|alpha|beta|dev|nightly|snapshot|pre|canary|experimental)\d*$", re.IGNORECASE
)
_VARIANT_SUFFIXES = re.compile(
    r"-(alpine|slim|buster|bullseye|bookworm|trixie|jammy|noble|focal|"
    r"bionic|stretch|windowsservercore|nanoserver|perl)$",
    re.IGNORECASE,
)


def _parse_docker_image(image_ref: str) -> ImageRef:
    """Parse image reference into ImageRef(image, tag). Tag is None if missing."""
    if "@" in image_ref:
        return ImageRef(image_ref, "pinned-by-digest")
    image_ref = re.sub(r"\$\{[^}]*:-([^}]*)\}", r"\1", image_ref)
    image_ref = re.sub(r"\$\{[^}]+\}", "", image_ref).strip()
    if not image_ref:
        return ImageRef("", None)
    if ":" in image_ref:
        parts = image_ref.rsplit(":", 1)
        return ImageRef(parts[0], parts[1])
    return ImageRef(image_ref, None)


# Matches a git commit-hash suffix: dash followed by 7+ hex characters
_GIT_HASH_SUFFIX_RE = re.compile(r"^v?(\d+(?:\.\d+)*)-[0-9a-f]{7,}$")


def _parse_version_tuple(tag: str) -> tuple[int, ...] | None:
    """Extract numeric version tuple from a tag like 'v3.8.1' or '8.4.0'.

    Also handles date-based tags with commit-hash suffixes like
    '2025.12.17-896863802' by stripping the hash suffix first.

    Prerelease suffixes (e.g. '1.0.0-rc1') are intentionally NOT stripped
    so they are rejected as non-versions.

    Returns a tuple of ints, or None if the tag is not a version.
    """
    # Try stripping a git commit-hash suffix (dash + 7+ hex chars)
    m = _GIT_HASH_SUFFIX_RE.match(tag)
    if m:
        core = m.group(1)
        return tuple(int(x) for x in core.split("."))

    # Standard version tag without suffix
    m = re.match(r"^v?(\d+(?:\.\d+)*)$", tag)
    if m:
        return tuple(int(x) for x in m.group(1).split("."))

    logger.debug("Tag '%s' is not a parseable version", tag)
    return None


def _resolve_docker_hub_api_path(image: str) -> str | None:
    """Map image reference to Docker Hub API path, or None for non-Hub."""
    if "/" not in image or image.startswith("docker.io/"):
        name = image.rsplit("/", maxsplit=1)[-1] if "/" in image else image
        return f"library/{name}"
    if image.count("/") == 1 and "." not in image.split("/", maxsplit=1)[0]:
        return image
    return None


def _pick_best_tag(tags: list[DockerHubTag]) -> str | None:
    """Pick highest semver tag from Docker Hub API results."""
    clean: list[tuple[tuple[int, ...], str]] = []
    candidates: list[str] = []
    for tag_entry in tags:
        tag = tag_entry.name
        if not tag or tag in _BANNED_TAGS:
            continue
        if not _VERSION_TAG_RE.match(tag):
            continue
        if _PRERELEASE_SUFFIXES.search(tag) or _VARIANT_SUFFIXES.search(tag):
            continue
        vt = _parse_version_tuple(tag)
        if vt:
            clean.append((vt, tag))
        else:
            candidates.append(tag)
    if clean:
        clean.sort(key=lambda x: x[0], reverse=True)
        return clean[0][1]
    return candidates[0] if candidates else None


def _get_docker_hub_latest(image: str) -> str | None:
    """Query Docker Hub API for the most recent stable version tag."""
    api_path = _resolve_docker_hub_api_path(image)
    if not api_path:
        return None
    url = (
        f"https://registry.hub.docker.com/v2/repositories/{api_path}/tags"
        f"?page_size=100&ordering=last_updated"
    )
    try:
        with urllib.request.urlopen(url, timeout=15) as response:
            data = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, json.JSONDecodeError, TimeoutError) as exc:
        print(f"  WARNING: Failed to query Docker Hub for {api_path}: {exc}")
        return None
    return _pick_best_tag(_parse_docker_hub_response(data).results)


def _check_image_tag(
    label: str,
    image: str,
    tag: str | None,
    loose: list[LooseDependency],
    outdated: list[OutdatedDependency],
) -> None:
    """Check a single Docker image tag for pinning and staleness."""
    if tag == "pinned-by-digest":
        return
    if tag is None:
        loose.append(LooseDependency(label, f"{image} (no tag)", "pin a version tag"))
        return
    if tag.lower() in _BANNED_TAGS:
        hint = _get_docker_hub_latest(image) or "pin a specific version tag"
        loose.append(LooseDependency(label, f"{image}:{tag}", hint))
        return
    hub_latest = _get_docker_hub_latest(image)
    if not hub_latest or hub_latest == tag:
        return
    current_ver = _parse_version_tuple(tag)
    latest_ver = _parse_version_tuple(hub_latest)
    if current_ver and latest_ver and latest_ver > current_ver:
        outdated.append(OutdatedDependency(label, None, tag, hub_latest))


def check_compose(path: Path, excludes: set[str]) -> DependencyCheckResult:
    """Check docker-compose.yml for unpinned or outdated image tags."""
    with open(path) as f:
        data = yaml.safe_load(f)

    services = data.get("services", {}) if data else {}
    loose_deps: list[LooseDependency] = []
    outdated_deps: list[OutdatedDependency] = []

    for svc_name, svc_config in services.items():
        if not isinstance(svc_config, dict):
            continue
        image_ref = svc_config.get("image")
        if not image_ref or not isinstance(image_ref, str):
            continue
        image, tag = _parse_docker_image(image_ref)
        if not image or image.lower() in excludes:
            continue
        label = f"{svc_name} ({image})"
        _check_image_tag(label, image, tag, loose_deps, outdated_deps)

    return DependencyCheckResult(loose_deps, outdated_deps, data)


def check_dockerfile(path: Path, excludes: set[str]) -> DependencyCheckResult:
    """Check Dockerfile for unpinned or outdated FROM image tags."""
    content = path.read_text()
    loose_deps: list[LooseDependency] = []
    outdated_deps: list[OutdatedDependency] = []

    for line in content.splitlines():
        stripped = line.strip()
        if not stripped.upper().startswith("FROM "):
            continue
        parts = stripped.split()
        _MIN_FROM_PARTS = 2
        if len(parts) < _MIN_FROM_PARTS:
            continue
        image_ref = parts[1]
        if image_ref.lower() == "scratch":
            continue
        image, tag = _parse_docker_image(image_ref)
        if not image or image.lower() in excludes:
            continue
        _check_image_tag(f"FROM {image}", image, tag, loose_deps, outdated_deps)

    return DependencyCheckResult(loose_deps, outdated_deps, None)


def upgrade_compose(
    path: Path,
    loose: list[LooseDependency],
    outdated: list[OutdatedDependency],
) -> None:
    """Upgrade image tags in docker-compose.yml."""
    content = path.read_text()
    skip_hints = {"pin a version tag", "pin a specific version tag"}
    for loose_dep in loose:
        if loose_dep.latest_version in skip_hints:
            continue
        image = loose_dep.name.split("(", 1)[1].rstrip(")")
        old_ref = loose_dep.current_spec.split(" ")[0]
        if "(no tag)" in loose_dep.current_spec:
            content = content.replace(
                f"image: {image}", f"image: {image}:{loose_dep.latest_version}"
            )
        else:
            content = content.replace(old_ref, f"{image}:{loose_dep.latest_version}")
    for outdated_dep in outdated:
        image = outdated_dep.name.split("(", 1)[1].rstrip(")")
        old_tag = outdated_dep.old_version
        new_tag = outdated_dep.new_version
        content = content.replace(f"{image}:{old_tag}", f"{image}:{new_tag}")
    path.write_text(content)


def is_compose_file(path: Path) -> bool:
    return path.name in DOCKER_COMPOSE_NAMES


def is_dockerfile(path: Path) -> bool:
    return isinstance(path.name, str) and bool(DOCKERFILE_NAMES_RE.match(path.name))
