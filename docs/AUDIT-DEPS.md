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
aardvark-dns. Rust declares its fixed toolchain there. Bootstrap
scripts resolve their values through `ci_tool_version`; workflows do not
duplicate bootstrap release values.

## Secret-Scan Finding

The umbrella VM hook can scan a parent Git root containing sibling consumer
trees. The secret wrapper must resolve Gitleaks from the CI owner root, generate
its global allowlist from the actual scan root, and use Gitleaks' directory
allowlist pruning before opening ignored paths. This keeps the scan as one
direct `gitleaks dir .` process without copying or staging files.

Gitleaks `8.22.0` or newer is required for directory allowlist pruning. Version
and tool-root resolution must both be correct for umbrella-root hooks.

## Dependency Checker Finding

`ci/check_dependency_versions.py` checks these explicit inputs:

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
require them. Secret scanning uses the actual scan root and a generated global
allowlist; it does not copy or stage files.
