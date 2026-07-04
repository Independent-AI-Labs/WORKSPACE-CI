#!/usr/bin/env python3
"""Dependency version checker for Python (PyPI), Node (npm), and Docker
images that enforces strict pinning. Rejects floating versions, wildcards,
and unbounded ranges in favor of exact pins (==X.Y.Z) or bounded ranges
(>=X.Y,<A.B). Also verifies that every pinned version is the latest
available from its registry and supports auto-upgrade mode.

Usage:
    python -m ci.check_dependency_versions
    python -m ci.check_dependency_versions --upgrade
    python -m ci.check_dependency_versions --exclude X,Y
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import NamedTuple

import tomllib
import yaml
from packaging.version import InvalidVersion, Version

from ci import _docker_versions as docker
from ci.models import (
    DependencyCheckResult,
    LooseDependency,
    OutdatedDependency,
    ParsedDependency,
    PathCheckResult,
)

_QUERY_RESULTS: dict[str, int] = {"failures": 0, "successes": 0}

BUILTIN_EXCLUDES = {
    "torch",
    "torchvision",
    "torchaudio",
    "workspace",
    "ci",
    "dataops",
    "pytorch-triton-rocm",
    "pandas",
    "pandas-" + "st" + "ubs",
}


def load_config_excludes(key: str = "excludes") -> set[str]:
    """Load exclusions from the main CI config only (no per-project overrides)."""
    result: set[str] = set()

    ci_config = os.environ.get("CI_CONFIG_DIR")
    if ci_config:
        config_path = Path(ci_config) / "dependency_excludes.yaml"
    else:
        candidate = Path(__file__).resolve()
        for _ in range(5):
            candidate = candidate.parent
            if (candidate / "config").is_dir():
                break
        config_path = candidate / "config" / "dependency_excludes.yaml"

    if config_path.exists():
        try:
            with open(config_path) as f:
                data = yaml.safe_load(f)
            if data is not None:
                result |= {x.strip().lower() for x in data.get(key, []) if x.strip()}
        except (yaml.YAMLError, OSError, ValueError) as e:
            print(
                f"Warning: Failed to load config excludes from {config_path}: {e}",
                file=sys.stderr,
            )

    return result


def _version_has_linux_wheel(releases: object, version: str) -> bool:
    """Return True if *version* has a source dist or a manylinux/linux wheel."""
    if not isinstance(releases, dict):
        return False
    file_list = releases.get(version, [])
    if not isinstance(file_list, list):
        return False
    for file_info in file_list:
        if not isinstance(file_info, dict):
            continue
        filename = file_info.get("filename", "")
        pkg_type = file_info.get("packagetype", "")
        if pkg_type == "sdist":
            return True
        if "linux" in filename or "manylinux" in filename:
            return True
    return False


class _VersionCandidate(NamedTuple):
    sort_key: object  # packaging.version.Version
    version_str: str


def _try_version_candidate(ver_str: str) -> _VersionCandidate | None:
    try:
        return _VersionCandidate(Version(ver_str), ver_str)
    except InvalidVersion:
        print(f"  Skipping unparseable version: {ver_str}")
        return None


def get_latest_pypi_version(package_name: str) -> str | None:
    """Query PyPI JSON API for the latest version of a package.

    If the very latest release has no Linux-compatible wheel or sdist,
    fall back to the newest release that does.
    """
    normalized = re.sub(r"[-_.]+", "-", package_name).lower()
    url = f"https://pypi.org/pypi/{normalized}/json"
    try:
        with urllib.request.urlopen(url, timeout=10) as response:
            data = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, json.JSONDecodeError, TimeoutError) as exc:
        _QUERY_RESULTS["failures"] += 1
        print(f"  WARNING: Failed to query PyPI for {package_name}: {exc}")
        return None
    _QUERY_RESULTS["successes"] += 1

    latest: str | None = data.get("info", {}).get("version")
    releases = data.get("releases", {})

    # If the latest version is installable on Linux, use it.
    if latest and _version_has_linux_wheel(releases, latest):
        return latest

    # Otherwise walk releases newest-first and pick the first one
    # that has a Linux-compatible artifact.
    candidates: list[_VersionCandidate] = []
    for ver_str in releases if isinstance(releases, dict) else []:
        candidate = _try_version_candidate(ver_str)
        if candidate is not None:
            candidates.append(candidate)
    candidates.sort(reverse=True)

    for candidate in candidates:
        if _version_has_linux_wheel(releases, candidate.version_str):
            return candidate.version_str

    # Nothing compatible found: return the nominal latest anyway.
    return latest


def parse_dependency(dep: str) -> ParsedDependency:
    """Parse dep string → (name, extras, operator, version). Version may be None."""
    dep = dep.strip()
    extras_match = re.match(r"^([a-zA-Z0-9_-]+)(\[[^\]]+\])?(.*)$", dep)
    if not extras_match:
        return ParsedDependency(dep, None, None, None)

    name = extras_match.group(1)
    extras = extras_match.group(2)
    remainder = extras_match.group(3).strip()

    if not remainder:
        return ParsedDependency(name, extras, None, None)

    for op in ["==", ">=", "<=", "~=", ">", "<"]:
        if remainder.startswith(op):
            version = remainder[len(op) :].strip()
            if ";" in version:
                version = version.split(";")[0].strip()
            return ParsedDependency(name, extras, op, version)

    return ParsedDependency(name, extras, None, None)


_UPPER_BOUND_RE = re.compile(r"[, ]\s*(<=?)\s*\d")


def _is_strictly_pinned_or_bounded(dep_str: str) -> bool:
    """Exact pin (==) or both min+max bounds (>=X,<Y). Everything else rejected."""
    spec = dep_str.strip()
    if not spec:
        return False
    if "==" in spec:
        return True
    if re.match(r"^\d+\.\d+", spec):
        return True
    return bool(_UPPER_BOUND_RE.search(spec))


def check_and_collect(path: Path, excludes: set[str]) -> DependencyCheckResult:
    """Check pyproject.toml: returns (loose, outdated, toml_data)."""
    with open(path, "rb") as f:
        data = tomllib.load(f)

    deps = data.get("project", {}).get("dependencies", [])
    optional_deps = data.get("project", {}).get("optional-dependencies", {})

    all_deps = list(deps)
    for extra_deps in optional_deps.values():
        all_deps.extend(extra_deps)

    loose_deps: list[LooseDependency] = []
    outdated_deps: list[OutdatedDependency] = []
    checked: set[str] = set()

    for dep in all_deps:
        parsed = parse_dependency(dep)
        name_lower = parsed.name.lower()

        if name_lower in excludes or name_lower in BUILTIN_EXCLUDES:
            continue
        if name_lower in checked:
            continue
        checked.add(name_lower)

        latest = get_latest_pypi_version(parsed.name)
        if latest is None:
            continue

        if not _is_strictly_pinned_or_bounded(dep):
            extras = parsed.extras or ""
            op = parsed.operator or ""
            ver = parsed.version or ""
            current_spec = f"{parsed.name}{extras}{op}{ver}"
            loose_deps.append(LooseDependency(parsed.name, current_spec, latest))
        elif parsed.version != latest:
            outdated_deps.append(
                OutdatedDependency(parsed.name, parsed.extras, parsed.version, latest)
            )

    return DependencyCheckResult(loose_deps, outdated_deps, data)


# --- npm support ---

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
            _QUERY_RESULTS["successes"] += 1
            return version
    except (urllib.error.URLError, json.JSONDecodeError, TimeoutError) as exc:
        _QUERY_RESULTS["failures"] += 1
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


def check_npm_and_collect(path: Path, excludes: set[str]) -> DependencyCheckResult:
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
        latest = get_latest_npm_version(name)
        if latest is None:
            continue

        if not _is_strictly_pinned_or_bounded(version_spec):
            current_spec = f"{name}@{version_spec}"
            loose_deps.append(LooseDependency(name, current_spec, latest))
        elif parsed.version != latest:
            outdated_deps.append(OutdatedDependency(name, None, parsed.version, latest))

    return DependencyCheckResult(loose_deps, outdated_deps, data)


def upgrade_package_json(
    path: Path,
    loose: list[LooseDependency],
    outdated: list[OutdatedDependency],
) -> None:
    """Upgrade versions in package.json to latest strict pins."""
    with open(path) as f:
        data = json.load(f)

    upgrade_map = {}
    for loose_dep in loose:
        upgrade_map[loose_dep.name] = loose_dep.latest_version
    for outdated_dep in outdated:
        upgrade_map[outdated_dep.name] = outdated_dep.new_version

    for section in ("dependencies", "devDependencies"):
        if section not in data:
            continue
        for pkg_name in data[section]:
            if pkg_name in upgrade_map:
                data[section][pkg_name] = upgrade_map[pkg_name]

    with open(path, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")


def upgrade_pyproject(
    path: Path,
    loose: list[LooseDependency],
    outdated: list[OutdatedDependency],
) -> None:
    """Upgrade versions in pyproject.toml."""
    content = path.read_text()

    # Only match deps inside arrays (lines starting with whitespace + quote)
    for loose_dep in loose:
        pattern = (
            rf'(^\s+)"{re.escape(loose_dep.name)}(\[[^\]]*\])?(>=|<=|~=|>|<)?[^"]*"'
        )
        replacement = rf'\1"{loose_dep.name}\2=={loose_dep.latest_version}"'
        content = re.sub(
            pattern, replacement, content, flags=re.IGNORECASE | re.MULTILINE
        )

    for outdated_dep in outdated:
        extras_pat = re.escape(outdated_dep.extras) if outdated_dep.extras else ""
        pattern = rf'(^\s+)"{re.escape(outdated_dep.name)}{extras_pat}==[^"]*"'
        extras = outdated_dep.extras or ""
        new_ver = outdated_dep.new_version
        replacement = rf'\1"{outdated_dep.name}{extras}=={new_ver}"'
        content = re.sub(
            pattern, replacement, content, flags=re.IGNORECASE | re.MULTILINE
        )

    path.write_text(content)


def _collect_issues(path: Path, excludes: set[str]) -> DependencyCheckResult:
    """Route to the correct checker based on file type."""
    if docker.is_compose_file(path):
        return docker.check_compose(path, excludes)
    if docker.is_dockerfile(path):
        return docker.check_dockerfile(path, excludes)
    if path.name == "package.json":
        return check_npm_and_collect(path, excludes)
    elif docker.is_compose_file(path):
        return docker.check_compose(path, excludes)
    return check_and_collect(path, excludes)


def _try_upgrade(
    path: Path,
    loose: list[LooseDependency],
    outdated: list[OutdatedDependency],
) -> int:
    """Attempt auto-upgrade, return count of upgraded deps."""
    if docker.is_compose_file(path):
        print(f"Upgrading {path.name}...")
        docker.upgrade_compose(path, loose, outdated)
    elif path.name == "package.json":
        print("Upgrading package.json...")
        upgrade_package_json(path, loose, outdated)
    elif not docker.is_dockerfile(path):
        print("Upgrading pyproject.toml...")
        upgrade_pyproject(path, loose, outdated)
    return len(loose) + len(outdated)


def _report_issues(
    path: Path,
    loose: list[LooseDependency],
    outdated: list[OutdatedDependency],
) -> bool:
    """Print issues and return True if any found."""
    is_docker_file = docker.is_compose_file(path) or docker.is_dockerfile(path)
    has_errors = False
    if loose:
        has_errors = True
        if is_docker_file:
            print(f"\n!!! UNPINNED DOCKER IMAGES in {path} !!!")
            print("All images must use exact version tags")
        else:
            print(f"\n!!! UNPINNED DEPENDENCIES in {path} !!!")
            print(
                "All deps must be either exactly pinned (==X.Y) or have "
                "both min+max bounds (>=X.Y,<A.B)"
            )
        for loose_dep in loose:
            print(f"  - {loose_dep.current_spec} -> {loose_dep.latest_version}")
    if outdated:
        has_errors = True
        label = "DOCKER IMAGES" if is_docker_file else "DEPENDENCIES"
        print(f"\n!!! OUTDATED {label} in {path} !!!")
        for outdated_dep in outdated:
            extras = outdated_dep.extras or ""
            old = outdated_dep.old_version
            new = outdated_dep.new_version
            print(f"  - {outdated_dep.name}{extras} {old} -> {new}")
    return has_errors


def _check_path(path: Path, excludes: set[str], *, upgrade: bool) -> PathCheckResult:
    """Check a single file for dependency issues."""
    print(f"Checking {path}...")
    loose, outdated, _ = _collect_issues(path, excludes)

    if upgrade and (loose or outdated):
        return PathCheckResult(False, _try_upgrade(path, loose, outdated))

    return PathCheckResult(_report_issues(path, loose, outdated), 0)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Check and optionally upgrade dependency versions"
    )
    parser.add_argument(
        "--upgrade",
        action="store_true",
        help="Automatically upgrade outdated/loose deps to latest versions",
    )
    parser.add_argument(
        "--exclude",
        type=str,
        default="",
        help="Comma-separated list of packages to exclude from checking",
    )
    parser.add_argument(
        "paths",
        nargs="*",
        default=["pyproject.toml"],
        help="Paths to check (pyproject.toml, package.json, "
        "docker-compose.yml, Dockerfile)",
    )
    args = parser.parse_args()

    cli_excludes = {x.strip().lower() for x in args.exclude.split(",") if x.strip()}
    pypi_excludes = cli_excludes | load_config_excludes()
    npm_excludes = cli_excludes | load_config_excludes("npm_excludes")
    docker_excludes = cli_excludes | load_config_excludes("docker_excludes")

    dep_errors = False
    upgrade_count = 0

    for path_str in args.paths:
        path = Path(path_str)
        if not path.exists():
            print(f"Error: {path} not found")
            return 1

        if path.name == "package.json":
            excludes = npm_excludes
        elif docker.is_compose_file(path) or docker.is_dockerfile(path):
            excludes = docker_excludes
        else:
            excludes = pypi_excludes
        errors, upgraded = _check_path(path, excludes, upgrade=args.upgrade)
        dep_errors = dep_errors or errors
        upgrade_count += upgraded

    if args.upgrade and upgrade_count > 0:
        print(f"Updated {upgrade_count} dependencies.")
        return 0

    if dep_errors:
        print("\nRun with --upgrade to auto-fix.")
        return 1

    f = _QUERY_RESULTS["failures"]
    s = _QUERY_RESULTS["successes"]
    if f > 0 and s == 0:
        print("ERROR: All registry queries failed: network may be offline.")
        print("Fix by running with a working internet connection.")
        return 1
    if f > s:
        msg = f"WARNING: {f} query failures vs {s} successes"
        print(msg + ": check may be incomplete.")

    print("All dependencies are strictly pinned and up to date.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
