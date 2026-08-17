"""Adversarial tests for pure Dockerfile image validation."""

from pathlib import Path

import pytest

from ci.dependency_policy import main
from ci.dockerfile_images import validate_dockerfile_bytes, validate_image_reference


def test_accepts_numeric_tags_digests_options_continuations_and_stage_aliases() -> None:
    digest = "a" * 64
    document = (
        "FROM --platform=linux/amd64 python:3.13 AS builder\n"
        "FROM builder AS final\n"
        "FROM \\\n"
        f"  registry.example/app@sha256:{digest}\n"
        "FROM localhost:5000/team/app:3.13\n"
        "FROM scratch\n"
    )
    assert validate_dockerfile_bytes(document.encode(), "Dockerfile") == []


def test_resolves_literal_global_args_in_complete_image_components() -> None:
    digest = "a" * 64
    document = (
        "ARG REGISTRY=registry.example\n"
        "ARG IMAGE=python\n"
        "ARG VERSION=3.13\n"
        "ARG DIGEST=sha256:" + digest + "\n"
        "FROM $REGISTRY/${IMAGE}:$VERSION\n"
        "FROM $REGISTRY/app@${DIGEST}\n"
    )
    assert validate_dockerfile_bytes(document.encode(), "Dockerfile") == []


@pytest.mark.parametrize(
    "document",
    [
        "FROM ${IMAGE}:3.13\n",
        "ARG IMAGE=\nFROM ${IMAGE}:3.13\n",
        "ARG IMAGE=${OTHER}\nFROM ${IMAGE}:3.13\n",
        "ARG IMAGE=python\nARG IMAGE=alpine\nFROM ${IMAGE}:3.13\n",
        "ARG IMAGE=python\nFROM ${IMAGE}-slim:3.13\n",
        "ARG IMAGE=python\nFROM registry.${IMAGE}:3.13\n",
        (
            "ARG IMAGE=python\nFROM ${IMAGE}:3.13\n"
            "ARG VERSION=3.14\nFROM python:$VERSION\n"
        ),
    ],
)
def test_rejects_unsupported_arg_expansions(document: str) -> None:
    diagnostics = validate_dockerfile_bytes(document.encode(), "Dockerfile")
    assert any(diagnostic.startswith("DV-DOCKER-002") for diagnostic in diagnostics)


@pytest.mark.parametrize(
    ("reference", "code"),
    [
        ("python", "DV-DOCKER-005"),
        ("python:" + "lat" + "est", "DV-DOCKER-006"),
        ("python:stable", "DV-DOCKER-006"),
        ("python:3.13-alpine", "DV-DOCKER-007"),
        ("python:v3.13", "DV-DOCKER-007"),
        ("python:${PYTHON_VERSION}", "DV-DOCKER-002"),
        ("python@sha256:abc", "DV-DOCKER-003"),
        ("python@sha512:" + "a" * 64, "DV-DOCKER-003"),
    ],
)
def test_rejects_unpinned_moving_variable_and_malformed_references(
    reference: str, code: str
) -> None:
    diagnostics = validate_dockerfile_bytes(
        f"FROM {reference}\n".encode(), "Dockerfile"
    )
    assert len(diagnostics) == 1
    assert diagnostics[0].startswith(code)


def test_rejects_unknown_stage_and_malformed_alias() -> None:
    diagnostics = validate_dockerfile_bytes(
        b"FROM unknown\nFROM python:3.13 AS ../../escape\n", "Dockerfile"
    )
    assert diagnostics == [
        "DV-DOCKER-005 Dockerfile:1: FROM image requires a tag or digest",
        "DV-DOCKER-004 Dockerfile:2: malformed stage alias",
    ]


def test_rejects_unresolved_variable_in_from_option() -> None:
    assert validate_dockerfile_bytes(
        b"FROM --platform=${BUILDPLATFORM} python:3.13\n", "Dockerfile"
    ) == ["DV-DOCKER-002 Dockerfile:1: unresolved variable in FROM option"]


@pytest.mark.parametrize(
    "reference",
    [
        " registry.example/app:3.13",
        "registry.example/app name:3.13",
        "registry.example//app:3.13",
        "/registry.example/app:3.13",
        "registry.example/app/:3.13",
        "registry.example/App:3.13",
        "registry_.example/app:3.13",
        "registry.example:port/app:3.13",
        "registry.example/app_name-:3.13",
    ],
)
def test_rejects_malformed_repository_names(reference: str) -> None:
    assert validate_image_reference(reference, "Dockerfile:1", "FROM image") == [
        "DV-DOCKER-004 Dockerfile:1: malformed FROM image reference"
    ]


def test_cli_reads_only_explicit_descriptor_bound_dockerfile(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    dockerfile = tmp_path / "Dockerfile"
    payload = b"FROM python:3.13\n"
    dockerfile.write_bytes(payload)
    received: list[bytes] = []

    def validate(data: bytes, display_path: str) -> list[str]:
        assert display_path == "Dockerfile"
        received.append(data)
        return []

    monkeypatch.setattr("ci.dependency_policy.validate_dockerfile_bytes", validate)
    assert main(["--consumer-root", str(tmp_path), "--dockerfile", "Dockerfile"]) == 0
    assert received == [payload]


def test_cli_rejects_dockerfile_symlink(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    target = tmp_path / "target"
    target.write_text("FROM python:3.13\n")
    (tmp_path / "Dockerfile").symlink_to(target)
    assert main(["--consumer-root", str(tmp_path), "--dockerfile", "Dockerfile"]) == 1
    assert (
        "DV-IN-003 Dockerfile: explicit input is unreadable" in capsys.readouterr().out
    )
