"""Integration tests for the deterministic dependency-policy CLI."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
USAGE_ERROR = 2


def run_checker(*arguments: str) -> subprocess.CompletedProcess[str]:
    """Run the public dispatcher without accessing policy implementation APIs."""
    environment = os.environ | {"PYTHONPATH": str(REPOSITORY_ROOT)}
    return subprocess.run(
        [sys.executable, "-m", "ci.check_dependency_versions", *arguments],
        cwd=REPOSITORY_ROOT,
        env=environment,
        text=True,
        capture_output=True,
        check=False,
    )


def run_guarded_checker(*arguments: str) -> subprocess.CompletedProcess[str]:
    """Run the dispatcher after disabling facilities an offline check cannot need."""
    command = f"""
import os
import runpy
import socket
import subprocess
import sys

def forbidden(*args, **kwargs):
    raise AssertionError("FORBIDDEN_FACILITY_REACHED")

socket.socket = forbidden
socket.create_connection = forbidden
socket.getaddrinfo = forbidden
socket.gethostbyaddr = forbidden
socket.gethostbyname = forbidden
socket.gethostbyname_ex = forbidden
socket.getnameinfo = forbidden
subprocess.Popen = forbidden
subprocess.run = forbidden
subprocess.call = forbidden
subprocess.check_call = forbidden
subprocess.check_output = forbidden
os.system = forbidden
if hasattr(os, "posix_spawn"):
    os.posix_spawn = forbidden
if hasattr(os, "posix_spawnp"):
    os.posix_spawnp = forbidden

sys.argv = ["check_dependency_versions.py", *{arguments!r}]
runpy.run_module("ci.check_dependency_versions", run_name="__main__")
"""
    return subprocess.run(
        [sys.executable, "-c", command],
        cwd=REPOSITORY_ROOT,
        env=os.environ | {"PYTHONPATH": str(REPOSITORY_ROOT)},
        text=True,
        capture_output=True,
        check=False,
    )


def write_pyproject(root: Path, dependencies: str) -> None:
    (root / "pyproject.toml").write_text(
        "[build-system]\nrequires = ['wheel==0.46.3']\n"
        f"[project]\ndependencies = [{dependencies}]\n"
        "[project.optional-dependencies]\ntest = ['pytest>=9,<10']\n"
    )


def write_flat_catalog(root: Path) -> None:
    (root / "catalog.yaml").write_text(
        "schema_version: 1\n"
        "example:\n"
        "  source_kind: github_release\n"
        "  version: 1.2.3\n"
        "  source: example/tool\n"
        "  artifacts:\n"
        "    - asset: example.tar.gz\n"
        "      os: linux\n"
        "      architecture: x86_64\n"
        "      sha256: "
        "bf59272455172108072a0a106379f7509fd4349bdcfd85203bac038ccd286d83\n"
        "      archive:\n"
        "        format: tar.gz\n"
        "        member: example\n"
    )


def write_explicit_validation_inputs(root: Path, *, invalid: bool) -> None:
    """Write every input kind accepted by the deterministic validation CLI."""
    pyproject_dependency = "python-package>=1" if invalid else "python-package==1.2.3"
    npm_dependency = "latest" if invalid else "1.2.3"
    npm_lock_dependency = "1.2.4" if invalid else "1.2.3"
    catalog_version = 2 if invalid else 1
    docker_tag = "latest" if invalid else "3.13.1"
    compose_tag = "latest" if invalid else "22.1.0"
    exclusions_version = 2 if invalid else 1
    (root / "pyproject.toml").write_text(
        "[project]\nname = 'consumer'\nversion = '1.0.0'\n"
        f"dependencies = ['{pyproject_dependency}', 'ignored-python>=1']\n"
    )
    (root / "package.json").write_text(
        json.dumps({"dependencies": {"npm-package": npm_dependency}})
    )
    (root / "package-lock.json").write_text(
        json.dumps(
            {
                "lockfileVersion": 3,
                "packages": {
                    "": {"dependencies": {"npm-package": npm_lock_dependency}}
                },
            }
        )
    )
    (root / "uv.lock").write_text(
        "version = 1\nrevision = 3\n"
        "[[package]]\nname = 'consumer'\nversion = '1.0.0'\n"
        "source = { editable = '.' }\n"
        "dependencies = [{ name = 'python-package' }, { name = 'ignored-python' }]\n"
        "[package.metadata]\n"
        "requires-dist = [{ name = 'python-package', specifier = '==1.2.3' }, "
        "{ name = 'ignored-python', specifier = '>=1' }]\n"
        "provides-extras = []\n"
        "[[package]]\nname = 'python-package'\nversion = '1.2.3'\n"
        "[[package]]\nname = 'ignored-python'\nversion = '1.0.0'\n"
    )
    (root / "exclusions.yaml").write_text(
        f"schema_version: {exclusions_version}\n"
        "excludes: [ignored-python]\nnpm_excludes: []\n"
    )
    (root / "catalog.yaml").write_text(
        f"schema_version: {catalog_version}\n"
        "example:\n  source_kind: github_release\n  version: 1.2.3\n"
        "  source: example/tool\n  artifacts:\n    - asset: example.tar.gz\n"
        "      os: linux\n      architecture: x86_64\n"
        "      sha256: "
        "bf59272455172108072a0a106379f7509fd4349bdcfd85203bac038ccd286d83\n"
        "      archive:\n        format: tar.gz\n        member: example\n"
    )
    (root / "Dockerfile").write_text(f"FROM python:{docker_tag}\n")
    (root / "compose.yaml").write_text(
        f"services:\n  app:\n    image: node:{compose_tag}\n"
    )


def explicit_validation_arguments(root: Path) -> list[str]:
    return [
        "validate",
        "--consumer-root",
        str(root),
        "--exclusions",
        "exclusions.yaml",
        "--catalog",
        "catalog.yaml",
        "--npm-lock",
        "package.json",
        "package-lock.json",
        "--uv-lock",
        "pyproject.toml",
        "uv.lock",
        "--dockerfile",
        "Dockerfile",
        "--compose",
        "compose.yaml",
        "pyproject.toml",
        "package.json",
    ]


@pytest.mark.parametrize(
    "arguments",
    [
        ["unknown", "--consumer-root", "relative"],
        ["validate", "--upgrade", "--consumer-root", "relative"],
        ["validate", "--deterministic-only", "--consumer-root", "relative"],
    ],
)
def test_invalid_envelope_rejects_before_importing_policy_or_reading_inputs(
    arguments: list[str],
) -> None:
    command = f"""
import builtins
import runpy
import sys

original_import = builtins.__import__
def guarded_import(name, *args, **kwargs):
    if name == 'ci.dependency_policy':
        raise AssertionError('policy implementation was imported')
    return original_import(name, *args, **kwargs)

builtins.__import__ = guarded_import
sys.argv = ['check_dependency_versions.py', *{arguments!r}]
runpy.run_module('ci.check_dependency_versions', run_name='__main__')
"""
    result = subprocess.run(
        [sys.executable, "-c", command],
        cwd=REPOSITORY_ROOT,
        env=os.environ | {"PYTHONPATH": str(REPOSITORY_ROOT)},
        text=True,
        capture_output=True,
        check=False,
    )

    assert result.returncode == USAGE_ERROR
    assert "usage: check_dependency_versions.py validate ..." in result.stderr
    assert "policy implementation was imported" not in result.stderr


def test_validate_requires_an_absolute_consumer_root() -> None:
    result = run_checker("validate", "--consumer-root", "relative")

    assert result.returncode == USAGE_ERROR
    assert "--consumer-root must be an absolute path" in result.stderr


def test_validate_accepts_strict_declarations_and_a_canonical_flat_catalog(
    tmp_path: Path,
) -> None:
    write_pyproject(tmp_path, "'example==1.2.3'")
    write_flat_catalog(tmp_path)

    result = run_checker(
        "validate",
        "--consumer-root",
        str(tmp_path),
        "--catalog",
        "catalog.yaml",
        "pyproject.toml",
    )

    assert result.returncode == 0, result.stdout + result.stderr
    assert result.stdout == ""


def test_validate_rejects_non_strict_declarations_and_noncanonical_catalog(
    tmp_path: Path,
) -> None:
    write_pyproject(tmp_path, "'example>=1.2.3'")
    (tmp_path / "catalog.yaml").write_text("schema_version: 1\ntools:\n  example: {}\n")

    result = run_checker(
        "validate",
        "--consumer-root",
        str(tmp_path),
        "--catalog",
        "catalog.yaml",
        "pyproject.toml",
    )

    assert result.returncode == 1
    assert "DV-CAT-002 $.tools: unknown field" in result.stdout
    assert "DV-DECL-006 pyproject.toml:project.dependencies[0]" in result.stdout


def test_validate_allows_an_absent_optional_catalog(tmp_path: Path) -> None:
    write_pyproject(tmp_path, "'example==1.2.3'")

    result = run_checker(
        "validate",
        "--consumer-root",
        str(tmp_path),
        "--catalog-if-present",
        "missing.yaml",
        "pyproject.toml",
    )

    assert result.returncode == 0
    assert result.stdout == "DV-IN-004-CATALOG-ABSENT missing.yaml: not applicable\n"


def test_validate_json_result_preserves_structured_diagnostics(tmp_path: Path) -> None:
    write_pyproject(tmp_path, "'example>=1.2.3'")

    result = run_checker(
        "validate", "--consumer-root", str(tmp_path), "--json-result", "pyproject.toml"
    )

    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["mode"] == "validate"
    assert payload["summary"]["status"] == "invalid"
    assert payload["diagnostics"][0]["rule_id"] == "DV-DECL-006"
    assert payload["diagnostics"][0]["path"] == "pyproject.toml"


@pytest.mark.parametrize("path", ["/etc/passwd", "../pyproject.toml", "nested//file"])
def test_validate_rejects_unsafe_explicit_paths(tmp_path: Path, path: str) -> None:
    result = run_checker("validate", "--consumer-root", str(tmp_path), path)

    assert result.returncode == 1
    assert (
        f"DV-IN-002 {path!r}: input must be a normalized relative path" in result.stdout
    )


def test_validate_rejects_symlinked_explicit_paths(tmp_path: Path) -> None:
    write_pyproject(tmp_path, "'example==1.2.3'")
    (tmp_path / "linked.toml").symlink_to(tmp_path / "pyproject.toml")

    result = run_checker("validate", "--consumer-root", str(tmp_path), "linked.toml")

    assert result.returncode == 1
    assert "DV-IN-003 linked.toml: explicit input is unreadable" in result.stdout


def test_validate_reads_complete_explicit_input_set_without_network_or_subprocesses(
    tmp_path: Path,
) -> None:
    write_explicit_validation_inputs(tmp_path, invalid=False)

    result = run_guarded_checker(*explicit_validation_arguments(tmp_path))

    assert result.returncode == 0, result.stdout + result.stderr
    assert result.stdout == ""
    assert "FORBIDDEN_FACILITY_REACHED" not in result.stderr


def test_validate_reports_complete_explicit_input_set_from_bytes_without_forbidden_io(
    tmp_path: Path,
) -> None:
    write_explicit_validation_inputs(tmp_path, invalid=True)

    result = run_guarded_checker(*explicit_validation_arguments(tmp_path))

    assert result.returncode == 1, result.stdout + result.stderr
    for diagnostic in (
        "DV-EXC-004 $.schema_version: expected integer 1",
        "DV-CAT-003 $.schema_version: expected integer 1",
        "DV-DECL-006 pyproject.toml:project.dependencies[0]",
        "DV-NPM-005 package.json:/dependencies/npm-package",
        "DV-LOCK-007 package.json:/dependencies/npm-package",
        "DV-UVL-008 uv.lock:package[consumer].metadata.requires-dist: "
        "declaration drift",
        "DV-DOCKER-006 Dockerfile:1: moving FROM image tag 'latest'",
        "DV-DOCKER-006 compose.yaml:$.services.app.image: moving "
        "Compose image tag 'latest'",
    ):
        assert diagnostic in result.stdout
    assert "FORBIDDEN_FACILITY_REACHED" not in result.stderr


def test_validate_production_compose_images_are_numeric_versions() -> None:
    result = run_checker(
        "validate",
        "--consumer-root",
        str(REPOSITORY_ROOT),
        "--compose",
        "web/compose.prod.yaml",
    )

    assert result.returncode == 0
    assert result.stdout == ""


def test_configured_validators_include_the_web_containerfile() -> None:
    expected_pre_commit_command = (
            'entry: "uv run python -m ci.check_dependency_versions validate '
            '--consumer-root \\"$PWD\\" --exclusions config/dependency_excludes.yaml '
            "--catalog res/dependency-pins.yaml --npm-workspace-lock package.json "
            "package-lock.json --uv-lock pyproject.toml "
        "uv.lock --dockerfile web/Containerfile --compose web/compose.prod.yaml "
        'pyproject.toml"'
    )
    expected_workflow_command = (
        "run: uv run python -m ci.check_dependency_versions validate "
            '--consumer-root "$GITHUB_WORKSPACE" '
            "--exclusions config/dependency_excludes.yaml "
            "--catalog res/dependency-pins.yaml "
            "--npm-workspace-lock package.json package-lock.json --uv-lock "
            "pyproject.toml "
        "uv.lock --dockerfile web/Containerfile --compose web/compose.prod.yaml "
        "pyproject.toml"
    )

    assert (
        expected_pre_commit_command
        in (REPOSITORY_ROOT / ".pre-commit-config.yaml").read_text()
    )
    assert (
        expected_workflow_command
        in (REPOSITORY_ROOT / ".github" / "workflows" / "ci.yml").read_text()
    )


def test_validate_shipped_exclusions_are_versioned_and_valid() -> None:
    result = run_checker(
        "validate",
        "--consumer-root",
        str(REPOSITORY_ROOT),
        "--exclusions",
        "config/dependency_excludes.yaml",
    )

    assert result.returncode == 0
    assert result.stdout == ""


def test_validate_shipped_catalog_is_clean() -> None:
    result = run_checker(
        "validate",
        "--consumer-root",
        str(REPOSITORY_ROOT),
        "--catalog",
        "res/dependency-pins.yaml",
    )

    assert result.returncode == 0
    assert result.stdout == ""
