#!/usr/bin/env python3
"""npm lockfile drift gate: verifies package-lock.json is in sync with every
workspace package.json it serves.

npm ci hard-fails when a manifest spec disagrees with the lockfile, so drift
created by editing package.json without regenerating the lock (or vice versa)
surfaces late, in deploy pipelines. This gate fails the commit instead.

Checks, for the root manifest and every workspace declared in its
"workspaces" field:
  - the manifest has an entry in the lock's "packages" map
  - dependencies / devDependencies / optionalDependencies specs match the
    lock entry exactly (same names, same spec strings)
  - every registry-sourced dep has a resolved node_modules/<name> entry
    (workspace-local or hoisted)

Repositories without a package-lock.json pass trivially (nothing to sync).

Usage:
    python -m ci.check_npm_lock_sync [ROOT]
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Literal, NamedTuple, cast

from typing_extensions import TypedDict

_Section = Literal["dependencies", "devDependencies", "optionalDependencies"]
_DEP_SECTIONS: tuple[_Section, ...] = (
    "dependencies",
    "devDependencies",
    "optionalDependencies",
)
_NON_REGISTRY_PREFIXES = (
    "workspace:",
    "file:",
    "git:",
    "git+",
    "http:",
    "https:",
    "link:",
)

SpecMap = dict[str, str]


class PackageManifest(TypedDict, total=False):
    """The subset of package.json this gate reads."""

    dependencies: SpecMap
    devDependencies: SpecMap
    optionalDependencies: SpecMap
    workspaces: list[str] | dict[str, list[str]]


class LockEntry(TypedDict, total=False):
    """One packages[<key>] record in package-lock.json."""

    dependencies: SpecMap
    devDependencies: SpecMap
    optionalDependencies: SpecMap


class LockFile(TypedDict, total=False):
    """The subset of package-lock.json this gate reads."""

    packages: dict[str, LockEntry]


class LockDrift(NamedTuple):
    manifest: str
    message: str


class _SectionCtx(NamedTuple):
    label: str
    key: str
    section: _Section
    packages: dict[str, LockEntry]


def _validate_with_npm(root: Path, lock_path: Path) -> LockDrift | None:
    """Use npm's resolver to catch transitive and resolved-version drift."""
    npm = shutil.which("npm")
    if npm is None:
        boot_dir = os.environ.get("CI_BOOT_DIR", "")
        if boot_dir:
            for candidate in (
                Path(boot_dir) / "bin/npm",
                Path(boot_dir) / "node-env/bin/npm",
            ):
                if candidate.is_file() and os.access(candidate, os.X_OK):
                    npm = str(candidate)
                    break
    if npm is None:
        return LockDrift(str(lock_path), "npm executable not found for lock validation")

    env = os.environ.copy()
    boot_dir = os.environ.get("CI_BOOT_DIR", "")
    if boot_dir:
        boot_paths = (
            str(Path(boot_dir) / "node-env/bin"),
            str(Path(boot_dir) / "bin"),
        )
        env["PATH"] = os.pathsep.join((*boot_paths, env.get("PATH", "")))

    try:
        subprocess.run(
            [
                npm,
                "ci",
                "--dry-run",
                "--ignore-scripts",
                "--no-audit",
                "--no-fund",
            ],
            cwd=root,
            check=True,
            timeout=120,
            env=env,
        )
    except subprocess.CalledProcessError as exc:
        return LockDrift(
            str(lock_path),
            f"npm ci --dry-run failed (exit {exc.returncode}); "
            "see npm diagnostics above",
        )
    except OSError as exc:
        return LockDrift(str(lock_path), f"npm lock validation could not run: {exc}")
    except subprocess.TimeoutExpired:
        return LockDrift(str(lock_path), "npm lock validation timed out")

    return None


def _load_json_dict(path: Path) -> object:
    """Parse a JSON file and require a top-level object."""
    with open(path) as f:
        data: object = json.load(f)
    if not isinstance(data, dict):
        msg = f"{path}: expected a JSON object"
        raise TypeError(msg)
    return data


def _load_manifest(path: Path) -> PackageManifest:
    return cast("PackageManifest", _load_json_dict(path))


def _load_lockfile(path: Path) -> LockFile:
    return cast("LockFile", _load_json_dict(path))


def find_workspace_dirs(root: Path, root_manifest: PackageManifest) -> list[Path]:
    """Resolve the root manifest's "workspaces" globs to manifest dirs."""
    workspaces: object = root_manifest.get("workspaces", [])
    if isinstance(workspaces, dict):
        workspaces = workspaces.get("packages", [])
    if not isinstance(workspaces, list):
        return []
    dirs: list[Path] = []
    for pattern in workspaces:
        if not isinstance(pattern, str) or pattern.startswith("!"):
            continue
        for match in sorted(glob.glob(str(root / pattern))):
            candidate = Path(match)
            if candidate.is_dir() and (candidate / "package.json").is_file():
                dirs.append(candidate)
    return dirs


def _resolved_entry_exists(packages: dict[str, LockEntry], key: str, name: str) -> bool:
    """A dep resolves workspace-local (<key>/node_modules/<name>) or hoisted."""
    local = f"{key}/node_modules/{name}" if key else f"node_modules/{name}"
    hoisted = f"node_modules/{name}"
    return local in packages or hoisted in packages


def _spec_map(entry: LockEntry | PackageManifest, section: _Section) -> SpecMap:
    """Extract a dependency section as a spec map (empty if absent/mistyped)."""
    raw: SpecMap = entry.get(section, {})
    if not isinstance(raw, dict):
        return {}
    return {str(k): str(v) for k, v in raw.items()}


def _check_manifest(
    key: str,
    manifest_path: Path,
    packages: dict[str, LockEntry],
) -> list[LockDrift]:
    label = str(manifest_path)
    drift: list[LockDrift] = []
    try:
        manifest = _load_manifest(manifest_path)
    except (OSError, ValueError) as exc:
        return [LockDrift(label, f"unreadable manifest: {exc}")]

    lock_entry = packages.get(key)
    if lock_entry is None:
        where = "root package" if key == "" else f"workspace '{key}'"
        return [LockDrift(label, f"{where} has no entry in package-lock.json")]
    if not isinstance(lock_entry, dict):
        return [LockDrift(label, f"lock entry for '{key}' is not an object")]

    for section in _DEP_SECTIONS:
        manifest_specs = _spec_map(manifest, section)
        lock_specs = _spec_map(lock_entry, section)
        ctx = _SectionCtx(label, key, section, packages)
        for name in sorted(set(manifest_specs) | set(lock_specs)):
            issue = _check_dep(ctx, name, manifest_specs, lock_specs)
            if issue is not None:
                drift.append(issue)
    return drift


def _check_dep(
    ctx: _SectionCtx,
    name: str,
    manifest_specs: SpecMap,
    lock_specs: SpecMap,
) -> LockDrift | None:
    """Compare one dep's manifest spec against the lock entry."""
    where = f"{ctx.section}.{name}"
    if name not in lock_specs:
        return LockDrift(ctx.label, f"{where}: missing from lockfile")
    if name not in manifest_specs:
        return LockDrift(ctx.label, f"{where}: stale entry in lockfile")
    if manifest_specs[name] != lock_specs[name]:
        return LockDrift(
            ctx.label,
            f"{where}: manifest '{manifest_specs[name]}' != lock '{lock_specs[name]}'",
        )
    spec = manifest_specs[name]
    if not spec.startswith(_NON_REGISTRY_PREFIXES) and not _resolved_entry_exists(
        ctx.packages, ctx.key, name
    ):
        return LockDrift(ctx.label, f"{where}: no resolved entry in lockfile")
    return None


def find_drift(root: Path) -> list[LockDrift]:
    """Return all manifest/lock disagreements under *root* (empty if in sync).

    A root with no package-lock.json has nothing to sync and returns empty.
    """
    lock_path = root / "package-lock.json"
    if not lock_path.is_file():
        return []
    manifest_root = root / "package.json"
    if not manifest_root.is_file():
        return [LockDrift(str(lock_path), "lockfile present but no package.json")]

    try:
        lock = _load_lockfile(lock_path)
        root_manifest = _load_manifest(manifest_root)
    except (OSError, ValueError) as exc:
        return [LockDrift(str(lock_path), f"unreadable: {exc}")]

    packages = lock.get("packages")
    if not isinstance(packages, dict):
        return [
            LockDrift(
                str(lock_path),
                "no 'packages' map (lockfileVersion >= 2 required)",
            )
        ]

    drift = _check_manifest("", manifest_root, packages)
    for ws_dir in find_workspace_dirs(root, root_manifest):
        key = ws_dir.relative_to(root).as_posix()
        drift.extend(_check_manifest(key, ws_dir / "package.json", packages))
    return drift


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Verify package-lock.json is in sync with workspace manifests"
    )
    parser.add_argument(
        "root",
        nargs="?",
        default=".",
        help="Repository root containing package-lock.json (default: cwd)",
    )
    args = parser.parse_args(argv)

    root = Path(args.root).resolve()
    if not (root / "package-lock.json").is_file():
        print(f"No package-lock.json under {root}; nothing to check.")
        return 0

    lock_path = root / "package-lock.json"
    print(f"Checking npm lockfile sync under {root}...")
    drift = find_drift(root)
    if not drift:
        npm_drift = _validate_with_npm(root, lock_path)
        if npm_drift is not None:
            drift.append(npm_drift)
    if drift:
        print(f"\n!!! PACKAGE LOCK DRIFT under {root} !!!")
        for issue in drift:
            print(f"  - {issue.manifest}: {issue.message}")
        print("\nFix: npm install --package-lock-only && git add package-lock.json")
        return 1
    print("package-lock.json is in sync with all workspace manifests.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
