"""Lockfile and workspace tests for the offline dependency policy."""

import json
from pathlib import Path

import pytest

from ci import dependency_policy
from ci.dependency_locks import (
    validate_npm_lock_bytes,
    validate_npm_workspace_lock_bytes,
    validate_uv_lock_bytes,
)
from ci.dependency_policy import main


def test_validate_passes_descriptor_bytes_to_parsers(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    declaration = b"[project]\ndependencies = []\n"
    catalog = b"schema_version: 1\ntools: {}\n"
    (tmp_path / "pyproject.toml").write_bytes(declaration)
    (tmp_path / "catalog.yaml").write_bytes(catalog)
    received: list[bytes] = []

    def validate_declaration(data: bytes, display_path: str) -> list[str]:
        assert display_path == "pyproject.toml"
        received.append(data)
        return []

    def validate_catalog(text: str, path: Path) -> list[str]:
        assert path == Path("catalog.yaml")
        received.append(text.encode("utf-8"))
        return []

    monkeypatch.setattr(
        dependency_policy, "validate_pyproject_bytes", validate_declaration
    )
    monkeypatch.setattr(dependency_policy, "validate_catalog_text", validate_catalog)

    assert (
        main(
            [
                "--consumer-root",
                str(tmp_path),
                "--catalog",
                "catalog.yaml",
                "pyproject.toml",
            ]
        )
        == 0
    )
    assert received == [catalog, declaration]


def test_validate_compares_only_explicit_npm_lock_association(
    tmp_path: Path, capsys
) -> None:
    (tmp_path / "package.json").write_text('{"dependencies":{"one":"1.2.3"}}')
    (tmp_path / "package-lock.json").write_text(
        '{"lockfileVersion":3,"packages":{"":{"dependencies":{"one":"1.2.4"}}}}'
    )

    assert (
        main(
            [
                "--consumer-root",
                str(tmp_path),
                "--npm-lock",
                "package.json",
                "package-lock.json",
            ]
        )
        == 1
    )

    assert capsys.readouterr().out == (
        "DV-LOCK-007 package.json:/dependencies/one: does not match "
        "package-lock.json:/packages//dependencies/one ('1.2.3' != '1.2.4')\n"
    )


@pytest.mark.parametrize("version", [1, 2, 4, "3", None])
def test_validate_rejects_unsupported_npm_lockfile_versions(version: object) -> None:
    package = b'{"dependencies":{}}'
    lock = json.dumps({"lockfileVersion": version, "packages": {"": {}}}).encode()

    assert validate_npm_lock_bytes(
        package, "package.json", lock, "package-lock.json"
    ) == [
        "DV-LOCK-003 package-lock.json:/lockfileVersion: unsupported "
        f"lockfileVersion {version!r}; expected 3"
    ]


def test_validate_npm_lock_reports_sorted_missing_and_extra_dependencies() -> None:
    package = b'{"dependencies":{"b":"1.0.0"},"devDependencies":{"a":"2.0.0"}}'
    lock = (
        b'{"lockfileVersion":3,"packages":{"":{"dependencies":{"c":"3.0.0"},'
        b'"devDependencies":{"a":"2.0.0"}}}}'
    )

    assert validate_npm_lock_bytes(
        package, "package.json", lock, "package-lock.json"
    ) == [
        "DV-LOCK-007 package.json:/dependencies/b: does not match "
        "package-lock.json:/packages//dependencies/b ('1.0.0' != None)",
        "DV-LOCK-007 package.json:/dependencies/c: does not match "
        "package-lock.json:/packages//dependencies/c (None != '3.0.0')",
    ]


def test_validate_npm_workspace_lock_binds_members_and_local_links() -> None:
    root = b'{"workspaces":["packages/one"]}'
    member = b'{"name":"@scope/one","dependencies":{"dep":"1.2.3"}}'
    lock = b"""{
      "lockfileVersion": 3,
      "packages": {
        "": {},
        "packages/one": {"dependencies": {"dep": "1.2.4"}},
        "node_modules/@scope/one": {"resolved": "packages/wrong", "link": false}
      }
    }"""

    assert validate_npm_workspace_lock_bytes(
        root,
        "package.json",
        [("packages/one", "packages/one/package.json", member, "@scope/one")],
        lock,
        "package-lock.json",
    ) == [
        "DV-LOCK-007 packages/one/package.json:/dependencies/dep: does not match "
        "package-lock.json:/packages/packages/one/dependencies/dep "
        "('1.2.3' != '1.2.4')",
        "DV-LOCK-009 package-lock.json:/packages/node_modules/@scope/one: expected "
        "local link to 'packages/one'",
    ]


def test_validate_explicit_npm_workspace_lock_association(
    tmp_path: Path, capsys
) -> None:
    member = tmp_path / "packages" / "one"
    member.mkdir(parents=True)
    (tmp_path / "package.json").write_text(
        '{"workspaces":["packages/*"],"dependencies":{"@scope/one":"workspace:*"}}'
    )
    (member / "package.json").write_text(
        '{"name":"@scope/one","dependencies":{"dep":"1.2.3"}}'
    )
    (tmp_path / "package-lock.json").write_text(
        '{"lockfileVersion":3,"packages":{"":{"dependencies":'
        '{"@scope/one":"workspace:*"}},"packages/one":{"dependencies":'
        '{"dep":"1.2.3"}},"node_modules/@scope/one":{"resolved":'
        '"packages/one","link":true}}}'
    )

    assert (
        main(
            [
                "--consumer-root",
                str(tmp_path),
                "--npm-workspace-lock",
                "package.json",
                "package-lock.json",
            ]
        )
        == 0
    )
    assert capsys.readouterr().out == ""


def test_validate_uv_lock_compares_project_and_optional_dependency_versions() -> None:
    pyproject = b"""[build-system]
requires = ["build-root==1.0"]
[project]
name = "example"
version = "1.0"
dependencies = ["main-root==2.0"]
[project.optional-dependencies]
dev = ["optional-root==3.0"]
"""
    lock = b"""version = 1
revision = 3
[[package]]
name = "example"
version = "1.0"
source = { editable = "." }
dependencies = [{ name = "main-root" }]
[package.optional-dependencies]
dev = [{ name = "optional-root" }]
[package.metadata]
requires-dist = [
  { name = "main-root", specifier = "==2.0" },
  { name = "optional-root", marker = "extra == 'dev'", specifier = "==3.0" },
]
provides-extras = ["dev"]
[[package]]
name = "main-root"
version = "2.0"
[[package]]
name = "optional-root"
version = "3.0"
[[package]]
name = "build-root"
version = "1.0"
"""

    assert validate_uv_lock_bytes(pyproject, "pyproject.toml", lock, "uv.lock") == []


@pytest.mark.parametrize(
    ("declaration", "locked_version", "expected"),
    [
        (
            'dependencies = ["main-root==2.0"]',
            "2.1",
            "DV-UVL-009 pyproject.toml:project.dependencies: main-root ==2.0 "
            "does not admit uv.lock:package[main-root].version '2.1'",
        ),
        (
            'dependencies = ["main-root>=2.0,<3.0"]',
            "3.0",
            "DV-UVL-009 pyproject.toml:project.dependencies: main-root <3.0,>=2.0 "
            "does not admit uv.lock:package[main-root].version '3.0'",
        ),
    ],
)
def test_validate_uv_lock_reports_declared_dependency_version_mismatch(
    declaration: str, locked_version: str, expected: str
) -> None:
    pyproject = (
        f'[project]\nname = "example"\nversion = "1.0"\n{declaration}\n'
    ).encode()
    lock = f"""version = 1
revision = 3
[[package]]
name = "example"
version = "1.0"
source = {{ editable = "." }}
dependencies = [{{ name = "main-root" }}]
[package.metadata]
requires-dist = [{{ name = "main-root", specifier = "" }}]
provides-extras = []
[[package]]
name = "main-root"
version = "{locked_version}"
""".encode()

    assert validate_uv_lock_bytes(pyproject, "pyproject.toml", lock, "uv.lock") == [
        "DV-UVL-008 uv.lock:package[example].metadata.requires-dist: declaration drift",
        expected,
    ]


def test_validate_uv_lock_reports_missing_roots_and_metadata_drift() -> None:
    pyproject = b"""[project]
name = "example"
version = "1.0"
dependencies = ["main-root==2.0"]
[project.optional-dependencies]
dev = ["optional-root==3.0"]
"""
    lock = b"""version = 1
revision = 3
[[package]]
name = "example"
version = "2.0"
source = { editable = "." }
dependencies = []
[package.metadata]
requires-dist = []
provides-extras = []
"""

    assert validate_uv_lock_bytes(pyproject, "pyproject.toml", lock, "uv.lock") == [
        "DV-UVL-006 uv.lock:package: missing locked root main-root",
        "DV-UVL-006 uv.lock:package: missing locked root optional-root",
        "DV-UVL-006 uv.lock:package[example].dependencies: missing main-root",
        "DV-UVL-006 uv.lock:package[example].optional-dependencies.dev: "
        "missing optional-root",
        "DV-UVL-007 uv.lock:package[example]: project metadata drift",
        "DV-UVL-008 uv.lock:package[example].metadata.provides-extras: "
        "declaration drift",
        "DV-UVL-008 uv.lock:package[example].metadata.requires-dist: declaration drift",
    ]


@pytest.mark.parametrize(("version", "revision"), [(2, 3), (1, 2), ("1", 3)])
def test_validate_uv_lock_rejects_unsupported_schema(
    version: object, revision: object
) -> None:
    pyproject = b'[project]\nname = "example"\nversion = "1.0"\n'
    lock = f"version = {version!r}\nrevision = {revision!r}\n".encode()

    assert validate_uv_lock_bytes(pyproject, "pyproject.toml", lock, "uv.lock") == [
        "DV-UVL-003 uv.lock: unsupported uv.lock schema "
        f"version={version!r}, revision={revision!r}; expected version=1, revision=3"
    ]


def test_validate_compares_only_explicit_uv_lock_association(
    tmp_path: Path, capsys
) -> None:
    (tmp_path / "pyproject.toml").write_text(
        '[project]\nname = "example"\nversion = "1.0"\ndependencies = []\n'
    )
    (tmp_path / "uv.lock").write_text(
        'version = 1\nrevision = 3\n[[package]]\nname = "example"\n'
        'version = "1.0"\nsource = { editable = "." }\n'
        "[package.metadata]\nrequires-dist = []\nprovides-extras = []\n"
    )

    assert (
        main(
            ["--consumer-root", str(tmp_path), "--uv-lock", "pyproject.toml", "uv.lock"]
        )
        == 0
    )
    assert capsys.readouterr().out == ""


def test_workspace_patterns_are_ordered_and_prove_exact_local_dependencies(
    tmp_path: Path, capsys
) -> None:
    (tmp_path / "packages").mkdir()
    for name in ("one", "skip"):
        member = tmp_path / "packages" / name
        member.mkdir()
        (member / "package.json").write_text(json.dumps({"name": f"@scope/{name}"}))
    (tmp_path / "package.json").write_text(
        json.dumps(
            {
                "workspaces": ["packages/*", "!packages/skip", "packages/skip"],
                "dependencies": {"@scope/one": "workspace:*"},
            }
        )
    )

    assert (
        main(["--consumer-root", str(tmp_path), "--npm-workspaces", "package.json"])
        == 0
    )
    assert capsys.readouterr().out == ""


def test_workspace_rejects_escaping_patterns(tmp_path: Path, capsys) -> None:
    packages = tmp_path / "packages"
    packages.mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "package.json").write_text('{"name":"outside"}')
    (tmp_path / "package.json").write_text(
        '{"workspaces":["../outside"],"dependencies":{"missing":"workspace:*"}}'
    )

    assert (
        main(["--consumer-root", str(tmp_path), "--npm-workspaces", "package.json"])
        == 1
    )
    output = capsys.readouterr().out
    assert "DV-NPM-008" in output
    assert "../outside" in output


def test_workspace_rejects_symlinks_and_duplicate_names(tmp_path: Path, capsys) -> None:
    packages = tmp_path / "packages"
    packages.mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "package.json").write_text('{"name":"outside"}')
    (packages / "link").symlink_to(outside, target_is_directory=True)
    for name in ("one", "two"):
        member = packages / name
        member.mkdir()
        (member / "package.json").write_text('{"name":"duplicate"}')
    (tmp_path / "package.json").write_text(
        '{"workspaces":["packages/*"],"dependencies":{"missing":"workspace:*"}}'
    )

    assert (
        main(["--consumer-root", str(tmp_path), "--npm-workspaces", "package.json"])
        == 1
    )
    output = capsys.readouterr().out
    assert "DV-NPM-009" in output
    assert "DV-NPM-011" in output


def test_workspace_requires_an_exact_selected_package_name(
    tmp_path: Path, capsys
) -> None:
    member = tmp_path / "member"
    member.mkdir()
    (member / "package.json").write_text('{"name":"@scope/present"}')
    (tmp_path / "package.json").write_text(
        '{"workspaces":["member"],"dependencies":'
        '{"@scope/missing":"workspace:*","@scope/present":"workspace:^1.0.0"}}'
    )

    assert (
        main(["--consumer-root", str(tmp_path), "--npm-workspaces", "package.json"])
        == 1
    )
    output = capsys.readouterr().out
    assert "DV-NPM-005 package.json:/dependencies/@scope~1missing" in output
