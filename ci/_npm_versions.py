"""Read-only npm dependency version checking for package.json files."""

from __future__ import annotations

import json
import re
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from ci._registry_common import QUERY_RESULTS, is_strictly_pinned_or_bounded
from ci.models import (
    DependencyCheckResult,
    LooseDependency,
    OutdatedDependency,
    ParsedDependency,
)

_NPM_STRICT_RE = re.compile(r"^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?(\+[a-zA-Z0-9.]+)?$")
_NPM_SKIP_PREFIXES = ("workspace:", "file:", "git:", "git+", "http:", "https:", "link:")


def get_latest_npm_version(package_name: str) -> str | None:
    """Query npm registry for the latest version of a package."""
    encoded = urllib.parse.quote(package_name, safe="@")
    url = f"https://registry.npmjs.org/{encoded}/latest"
    try:
        with urllib.request.urlopen(url, timeout=10) as response:
            data = json.loads(response.read().decode("utf-8"))
            version: str | None = data.get("version")
            QUERY_RESULTS["successes"] += 1
            return version
    except (urllib.error.URLError, json.JSONDecodeError, TimeoutError) as exc:
        QUERY_RESULTS["failures"] += 1
        print(f"  WARNING: Failed to query npm for {package_name}: {exc}")
        return None


def parse_npm_dependency(name: str, version_spec: str) -> ParsedDependency:
    """Parse an npm dependency name and version specifier."""
    spec = version_spec.strip()
    if not spec or spec in ("*", "latest"):
        return ParsedDependency(name, None, None, None)
    for prefix in (">=", "<=", ">", "<", "^", "~"):
        if spec.startswith(prefix):
            return ParsedDependency(name, None, prefix, spec[len(prefix) :].strip())
    if _NPM_STRICT_RE.match(spec):
        return ParsedDependency(name, None, "==", spec)
    return ParsedDependency(name, None, None, spec)


def check_npm_and_collect(
    path: Path, excludes: set[str], *, check_latest: bool = True
) -> DependencyCheckResult:
    """Check package.json and collect issues."""
    with open(path) as f:
        data = json.load(f)

    deps = data.get("dependencies", {})
    dev_deps = data.get("devDependencies", {})
    all_deps = {**deps, **dev_deps}

    loose_deps: list[LooseDependency] = []
    outdated_deps: list[OutdatedDependency] = []

    for name, version_spec in all_deps.items():
        if name.lower() in excludes:
            continue
        if version_spec.startswith(_NPM_SKIP_PREFIXES):
            continue

        parsed = parse_npm_dependency(name, version_spec)
        if not check_latest:
            if not is_strictly_pinned_or_bounded(version_spec):
                current_spec = f"{name}@{version_spec}"
                loose_deps.append(
                    LooseDependency(name, current_spec, "registry lookup disabled")
                )
            continue

        latest = get_latest_npm_version(name)
        if latest is None:
            continue

        if not is_strictly_pinned_or_bounded(version_spec):
            current_spec = f"{name}@{version_spec}"
            loose_deps.append(LooseDependency(name, current_spec, latest))
        elif parsed.version != latest:
            outdated_deps.append(OutdatedDependency(name, None, parsed.version, latest))

    return DependencyCheckResult(loose_deps, outdated_deps, data)
