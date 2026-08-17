"""Tests for the offline dependency policy boundary."""

import json
from pathlib import Path

import pytest

from ci.dependency_declarations import validate_pyproject
from ci.dependency_exclusions import parse_exclusions_text
from ci.dependency_npm import validate_package_json_bytes
from ci.dependency_policy import main

USAGE_ERROR = 2


@pytest.mark.parametrize(
    ("document", "diagnostic"),
    [
        ("[", "DV-EXC-000 $: invalid YAML:"),
        (
            "schema_version: 1\nexcludes: []\nexcludes: []\nnpm_excludes: []\n",
            "DV-EXC-001 $.excludes: duplicate key",
        ),
        (
            "schema_version: 1\nexcludes: []\nnpm_excludes: []\nextra: []\n",
            "DV-EXC-002 $.extra: unknown field",
        ),
        ("schema_version: '1'\nexcludes: []\nnpm_excludes: []\n", "DV-EXC-004"),
        ("schema_version: 1\nexcludes: bad\nnpm_excludes: []\n", "DV-EXC-005"),
        (
            "schema_version: 1\nexcludes: [1]\nnpm_excludes: []\n",
            "DV-EXC-006 $.excludes[0]: expected a string",
        ),
        (
            "schema_version: 1\nexcludes: ['']\nnpm_excludes: []\n",
            "DV-EXC-007 $.excludes[0]: expected a nonempty string",
        ),
    ],
)
def test_exclusions_parser_rejects_invalid_closed_schema(
    document: str, diagnostic: str
) -> None:
    exclusions, diagnostics = parse_exclusions_text(document, Path("exclusions.yaml"))

    assert exclusions is None
    assert any(item.startswith(diagnostic) for item in diagnostics)


def test_exclusions_apply_only_to_successfully_parsed_declarations(
    tmp_path: Path, capsys
) -> None:
    (tmp_path / "exclusions.yaml").write_text(
        "schema_version: 1\nexcludes: [python-ignored]\nnpm_excludes: [npm-ignored]\n"
    )
    (tmp_path / "pyproject.toml").write_text(
        "[project]\ndependencies = ['python-ignored>=1', 'broken @ @']\n"
    )
    (tmp_path / "package.json").write_text(
        '{"dependencies":{"npm-ignored":"^1.0.0","wrong":1}}'
    )
    (tmp_path / "catalog.yaml").write_text("schema_version: 2\n")

    assert (
        main(
            [
                "--consumer-root",
                str(tmp_path),
                "--exclusions",
                "exclusions.yaml",
                "--catalog",
                "catalog.yaml",
                "pyproject.toml",
                "package.json",
            ]
        )
        == 1
    )

    output = capsys.readouterr().out
    assert "DV-DECL-005" in output
    assert "DV-NPM-004" in output
    assert "DV-CAT-003 $.schema_version" in output
    assert "DV-DECL-006" not in output
    assert "DV-NPM-005" not in output


def test_exclusions_are_read_from_the_explicit_descriptor(
    tmp_path: Path, capsys
) -> None:
    (tmp_path / "exclusions.yaml").write_text(
        "schema_version: 1\nexcludes: [ignored]\nnpm_excludes: []\n"
    )
    (tmp_path / "pyproject.toml").write_text(
        "[project]\ndependencies = ['ignored>=1']\n"
    )

    assert (
        main(
            [
                "--consumer-root",
                str(tmp_path),
                "--exclusions",
                "exclusions.yaml",
                "pyproject.toml",
            ]
        )
        == 0
    )
    assert capsys.readouterr().out == ""


def test_validate_requires_explicit_consumer_root() -> None:
    with pytest.raises(SystemExit) as error:
        main([])
    assert error.value.code == USAGE_ERROR


def test_validate_reports_all_python_occurrences(tmp_path: Path, capsys) -> None:
    (tmp_path / "pyproject.toml").write_text(
        "[build-system]\nrequires = ['wheel']\n"
        "[project]\ndependencies = ['Example_Pkg==1.0', 'bad>=1']\n"
        "[project.optional-dependencies]\ndev = ['example-pkg==1.0']\n"
    )

    assert main(["--consumer-root", str(tmp_path), "pyproject.toml"]) == 1

    output = capsys.readouterr().out
    assert "DV-DECL-006" in output
    assert "DV-DECL-007" in output


def test_validate_reports_all_npm_occurrences(tmp_path: Path, capsys) -> None:
    (tmp_path / "package.json").write_text(
        '{"dependencies":{"react":"19.1.1","bad":"^1.0.0"},'
        '"devDependencies":{"react":">=18.0.0 <20.0.0"}}'
    )

    assert main(["--consumer-root", str(tmp_path), "package.json"]) == 1

    output = capsys.readouterr().out
    assert "DV-NPM-005" in output
    assert "DV-NPM-006 package.json: duplicate react at " in output
    assert "/dependencies/react, package.json:/devDependencies/react" in output


@pytest.mark.parametrize(
    ("document", "diagnostic"),
    [
        ("[]", "DV-NPM-002 package.json:$: expected an object"),
        (
            '{"dependencies":[]}',
            "DV-NPM-003 package.json:/dependencies: expected an object",
        ),
        (
            '{"dependencies":{"one":1}}',
            "DV-NPM-004 package.json:/dependencies/one: expected a string",
        ),
    ],
)
def test_validate_rejects_malformed_npm_types(document: str, diagnostic: str) -> None:
    assert validate_package_json_bytes(document.encode(), "package.json") == [
        diagnostic
    ]


@pytest.mark.parametrize(
    "specifier",
    [
        "latest",
        "workspace:*",
        "file:../local",
        "git+https://example.test/pkg.git",
        "*",
        "1.x",
        ">=1.0.0",
        ">=1.0.0<2.0.0",
        ">=1.0.0,,<2.0.0",
        ">=1.0.0,",
        ">=1.0.0 <2.0.0,",
        ">=1.0.0 >=1.0.0 <2.0.0",
        ">=1.0.0 <2.0.0 || >=3.0.0 <4.0.0",
        ">=2.0.0 <1.0.0",
    ],
)
def test_validate_rejects_non_strict_npm_specifiers(specifier: str) -> None:
    document = json.dumps({"dependencies": {"one": specifier}})
    assert validate_package_json_bytes(document.encode(), "package.json") == [
        "DV-NPM-005 package.json:/dependencies/one: dependency must be exactly "
        "pinned or bounded"
    ]


@pytest.mark.parametrize(
    "specifier", [">=1.0.0 <2.0.0", ">=1.0.0,<2.0.0", ">=1.0.0, <2.0.0"]
)
def test_validate_accepts_exact_and_complete_bounded_npm_versions(
    specifier: str,
) -> None:
    document = (
        b'{"dependencies":{"one":"1.2.3-beta.1"},'
        + json.dumps({"peerDependencies": {"two": specifier}}).encode()[1:]
    )
    assert validate_package_json_bytes(document, "package.json") == []


def test_catalog_is_explicit_and_has_no_default(tmp_path: Path) -> None:
    assert main(["--consumer-root", str(tmp_path)]) == 0


def test_json_result_is_versioned_and_invocation_local(tmp_path: Path, capsys) -> None:
    (tmp_path / "pyproject.toml").write_text("[project]\ndependencies = ['bad>=1']\n")

    assert (
        main(
            [
                "--consumer-root",
                str(tmp_path),
                "--catalog-if-present",
                "missing.yaml",
                "--json-result",
                "pyproject.toml",
            ]
        )
        == 1
    )

    result = json.loads(capsys.readouterr().out)
    assert result["schema_version"] == 1
    assert result["mode"] == "validate"
    assert set(result["consumer_root_identity"]) == {"device", "inode"}
    assert result["validator_generation_identity"] is None
    assert result["inputs"] == [
        {
            "applicable": False,
            "content_identity": None,
            "kind": "catalog",
            "relative_path": "missing.yaml",
            "status": "absent",
        },
        {
            "applicable": True,
            "content_identity": "edf3d99441e8430129eabba224bbcae76774612918c906b75cf458"
            "cbc2486f93",
            "kind": "declaration",
            "relative_path": "pyproject.toml",
            "status": "read",
        },
    ]
    assert result["diagnostics"] == [
        {
            "location": "project.dependencies[0]",
            "message": "dependency must be exactly pinned or bounded",
            "path": "pyproject.toml",
            "remediation_code": "correct-python-declaration",
            "rule_id": "DV-DECL-006",
            "severity": "error",
        }
    ]
    assert result["summary"] == {
        "declarations_checked": 1,
        "errors": 1,
        "files_checked": 1,
        "status": "invalid",
    }


def test_json_result_does_not_expose_unsafe_input_paths(tmp_path: Path, capsys) -> None:
    assert (
        main(["--consumer-root", str(tmp_path), "--json-result", "../outside.toml"])
        == 1
    )

    result = json.loads(capsys.readouterr().out)
    assert result["inputs"][0]["relative_path"] is None
    assert result["diagnostics"][0]["path"] is None


def test_json_result_preserves_repeated_typed_input_descriptors(
    tmp_path: Path, capsys
) -> None:
    (tmp_path / "pyproject.toml").write_text("[project]\ndependencies = []\n")

    assert (
        main(
            [
                "--consumer-root",
                str(tmp_path),
                "--json-result",
                "pyproject.toml",
                "pyproject.toml",
            ]
        )
        == 0
    )

    result = json.loads(capsys.readouterr().out)
    assert [item["kind"] for item in result["inputs"]] == [
        "declaration",
        "declaration",
    ]
    assert [item["relative_path"] for item in result["inputs"]] == [
        "pyproject.toml",
        "pyproject.toml",
    ]
    assert result["summary"] == {
        "status": "valid",
        "files_checked": 2,
        "declarations_checked": 2,
        "errors": 0,
    }


def test_validate_reports_malformed_top_level_sections_deterministically(
    tmp_path: Path,
) -> None:
    declaration = tmp_path / "pyproject.toml"
    declaration.write_text('project = []\nbuild-system = "not-a-table"\n')

    assert validate_pyproject(declaration, "pyproject.toml") == [
        "DV-DECL-008 pyproject.toml:build-system: expected a TOML table",
        "DV-DECL-008 pyproject.toml:project: expected a TOML table",
    ]


def test_validate_does_not_suppress_a_single_malformed_top_level_section(
    tmp_path: Path,
) -> None:
    declaration = tmp_path / "pyproject.toml"
    declaration.write_text('project = "not-a-table"\n')

    assert validate_pyproject(declaration, "pyproject.toml") == [
        "DV-DECL-008 pyproject.toml:project: expected a TOML table"
    ]


@pytest.mark.parametrize(
    "requirement",
    [
        "example>=2,<1",
        "example>=1,<2,===arbitrary",
        "example>=1,<2,!=1.5",
        "example>=1",
        "example==1.*",
    ],
)
def test_validate_rejects_non_effective_or_unsupported_python_ranges(
    tmp_path: Path, requirement: str, capsys
) -> None:
    (tmp_path / "pyproject.toml").write_text(
        f"[project]\ndependencies = [{requirement!r}]\n"
    )

    assert main(["--consumer-root", str(tmp_path), "pyproject.toml"]) == 1
    assert "DV-DECL-006" in capsys.readouterr().out


@pytest.mark.parametrize("value", ["/etc/passwd", "../pyproject.toml", "a//b"])
def test_validate_rejects_bad_explicit_paths(
    tmp_path: Path, value: str, capsys
) -> None:
    assert main(["--consumer-root", str(tmp_path), value]) == 1
    assert "DV-IN-002" in capsys.readouterr().out


def test_validate_rejects_final_component_symlinks(tmp_path: Path, capsys) -> None:
    target = tmp_path / "target.toml"
    target.write_text("[project]\ndependencies = []\n")
    (tmp_path / "pyproject.toml").symlink_to(target)
    catalog_target = tmp_path / "catalog-target.yaml"
    catalog_target.write_text("schema_version: 1\ntools: {}\n")
    (tmp_path / "catalog.yaml").symlink_to(catalog_target)

    assert (
        main(
            [
                "--consumer-root",
                str(tmp_path),
                "--catalog-if-present",
                "catalog.yaml",
                "pyproject.toml",
            ]
        )
        == 1
    )

    output = capsys.readouterr().out
    assert "DV-IN-003 catalog.yaml: explicit input is unreadable" in output
    assert "DV-IN-003 pyproject.toml: explicit input is unreadable" in output
    assert "DV-IN-004-CATALOG-ABSENT" not in output
