# Dependency Audit

## Scope

This audit covers CI-owned bootstrap tools, hook dependencies, workflows, and
the dependency checker. Language dependencies remain owned by `pyproject.toml`
and `uv.lock`, `package.json` and `package-lock.json`, or Cargo manifests and
locks.

## Current Registries

| Registry | Current purpose | Gap |
|---|---|---|
| `config/system-deps.yaml` | Host package names and validation metadata | Does not own release pins |
| `config/dependency_excludes.yaml` | Dependency-check exclusions | Does not own versions |
| `scripts/manifest.yaml` | Script documentation/index metadata | Does not own versions |
| `res/dependency-pins.yaml` | CI bootstrap release pins, source metadata, and feature floors | Artifact checksum freshness is checked during bootstrap |

## Current Bootstrap Pins

`res/dependency-pins.yaml` owns release selections for UV, Gitleaks, OSV
Scanner, Node, cloc, Moon, Podman, podman-compose, conmon, netavark, and
aardvark-dns. Rust declares its moving `stable` channel there. Bootstrap
scripts resolve their values through `ci_tool_version`; workflows do not
duplicate bootstrap release values.

## Secret-Scan Finding

The umbrella VM hook can scan a parent Git root containing sibling consumer
trees. A generated allowlist based on a nested consumer root cannot protect
those sibling paths, and a permission failure can occur before the scanner can
report a finding. The secret wrapper therefore stages only
`git ls-files -co --exclude-standard` candidates into a temporary sparse tree
and runs one Gitleaks process against that tree. Ignored directories are absent
from the traversal regardless of Gitleaks path-allowlist behavior.

Gitleaks `8.22.0` or newer remains the minimum catalog floor for the deployed
scanner, but version upgrades alone are not the traversal fix.

## Dependency Checker Finding

`ci/check_dependency_versions.py` defaults to checking only:

```text
pyproject.toml
web/package.json
```

It validates the catalog schema, checks GitHub-release pins and the selected
Node major stream for freshness, and enforces declared feature floors. Artifact
checksums remain verified by the corresponding bootstrap scripts.

## Required End State

`res/dependency-pins.yaml` is the canonical CI artifact-pin catalog. Bootstrap
scripts resolve pins from it and the dependency checker audits release
freshness and feature floors. Entries declare their source kind, source, and
version or channel; artifact checksums are retained where bootstrap downloads
require them. Secret scanning uses a candidate-only temporary tree so ignored
filesystem permissions cannot break an umbrella-root scan.
