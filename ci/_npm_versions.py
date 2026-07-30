"""npm dependency version checking for package.json files, plus lockfile
re-synchronisation after --upgrade so npm ci never sees manifest drift."""

from __future__ import annotations

import json
import re
import shutil
import subprocess
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

        if not is_strictly_pinned_or_bounded(version_spec):
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

    sync_lockfile_after_upgrade(path)


def _print_lockfile_fix(lock_root: Path, why: str) -> None:
    print(f"  WARNING: npm lockfile sync failed: {why}")
    print(
        f"  Fix: (cd {lock_root} && npm install --package-lock-only) "
        f"&& git add package-lock.json"
    )


def sync_lockfile_after_upgrade(manifest_path: Path) -> None:
    """Regenerate package-lock.json after an upgrade so npm ci stays green.

    Walks up from the manifest to the nearest package-lock.json (workspace
    root) and re-resolves spec-only via npm. Without this the upgraded
    manifest and the stale lock disagree and every later npm ci fails.
    """
    lock_root: Path | None = None
    for candidate in (manifest_path.resolve().parent, *manifest_path.resolve().parents):
        if (candidate / "package-lock.json").is_file():
            lock_root = candidate
            break
    if lock_root is None:
        return

    npm = shutil.which("npm")
    if npm is None:
        print(
            "  WARNING: npm not found; regenerate the lockfile manually:\n"
            f"  Fix: (cd {lock_root} && npm install --package-lock-only) "
            "&& git add package-lock.json"
        )
        return
    try:
        subprocess.run(
            [npm, "install", "--package-lock-only"],
            cwd=lock_root,
            capture_output=True,
            text=True,
            check=True,
        )
    except FileNotFoundError as exc:
        _print_lockfile_fix(lock_root, str(exc))
        return
    except subprocess.CalledProcessError as exc:
        detail = exc.stderr.strip() if exc.stderr else str(exc)
        _print_lockfile_fix(lock_root, detail)
        return
    print(f"  Synced {lock_root / 'package-lock.json'}")
