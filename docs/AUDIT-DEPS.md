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

Gitleaks `8.21.2` does not prune global-allowlisted paths while walking a
directory. It can suppress findings after traversal but still walks ignored
trees. Gitleaks `8.22.0` introduced directory pruning through
`filepath.SkipDir`; the secret scanner therefore requires a Gitleaks feature
floor of `8.22.0` or newer.

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
require them.
