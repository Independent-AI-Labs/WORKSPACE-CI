"""Adversarial tests for pure Compose image validation."""

from pathlib import Path

import pytest

from ci.compose_images import validate_compose_bytes
from ci.dependency_policy import main


def test_accepts_numeric_tags_and_sha256_digests() -> None:
    digest = "a" * 64
    document = (
        "services:\n"
        "  app:\n"
        "    image: registry.example/app:2026.08.09\n"
        f"  worker:\n    image: registry.example/worker@sha256:{digest}\n"
        "  local:\n    image: localhost:5000/team/app:3.13\n"
        "  build-only:\n    build: .\n"
    )
    assert validate_compose_bytes(document.encode(), "compose.yaml") == []


@pytest.mark.parametrize(
    ("image", "code"),
    [
        ("python", "DV-DOCKER-005"),
        ("python:" + "lat" + "est", "DV-DOCKER-006"),
        ("python:3.13-alpine", "DV-DOCKER-007"),
        ("python:${VERSION}", "DV-DOCKER-002"),
        ("python@sha256:abc", "DV-DOCKER-003"),
    ],
)
def test_rejects_unpinned_moving_variable_and_malformed_images(
    image: str, code: str
) -> None:
    diagnostics = validate_compose_bytes(
        f"services:\n  app:\n    image: {image!r}\n".encode(), "compose.yaml"
    )
    assert len(diagnostics) == 1
    assert diagnostics[0].startswith(code)


def test_rejects_duplicate_keys_and_invalid_typed_service_traversal() -> None:
    document = (
        "services:\n"
        "  app:\n"
        "    image: python:3.13\n"
        "    image: python:" + "lat" + "est\n"
        "  broken: []\n"
        "  typed:\n"
        "    image: 3.13\n"
    )
    diagnostics = validate_compose_bytes(document.encode(), "compose.yaml")
    assert diagnostics == [
        "DV-COMPOSE-001 $.services.app.image: duplicate key",
        "DV-COMPOSE-004 compose.yaml:$.services.broken: service must be a mapping",
        "DV-COMPOSE-005 compose.yaml:$.services.typed.image: image must be a string",
        "DV-DOCKER-006 compose.yaml:$.services.app.image: "
        "moving Compose image tag 'latest'",
    ]


@pytest.mark.parametrize(
    "document",
    [b"- services\n", b"services: []\n"],
)
def test_rejects_nonmapping_root_and_services(document: bytes) -> None:
    diagnostics = validate_compose_bytes(document, "compose.yaml")
    assert len(diagnostics) == 1
    assert diagnostics[0].startswith("DV-COMPOSE-00")


@pytest.mark.parametrize(
    "image",
    [
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
def test_rejects_malformed_repository_names(image: str) -> None:
    diagnostics = validate_compose_bytes(
        f"services:\n  app:\n    image: {image}\n".encode(), "compose.yaml"
    )
    assert diagnostics == [
        "DV-DOCKER-004 compose.yaml:$.services.app.image: "
        "malformed Compose image reference"
    ]


def test_cli_reads_only_explicit_descriptor_bound_compose(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    compose = tmp_path / "compose.yaml"
    payload = b"services: {}\n"
    compose.write_bytes(payload)
    received: list[bytes] = []

    def validate(data: bytes, display_path: str) -> list[str]:
        assert display_path == "compose.yaml"
        received.append(data)
        return []

    monkeypatch.setattr("ci.dependency_policy.validate_compose_bytes", validate)
    assert main(["--consumer-root", str(tmp_path), "--compose", "compose.yaml"]) == 0
    assert received == [payload]


def test_cli_rejects_compose_symlink(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    target = tmp_path / "target"
    target.write_text("services: {}\n")
    (tmp_path / "compose.yaml").symlink_to(target)
    assert main(["--consumer-root", str(tmp_path), "--compose", "compose.yaml"]) == 1
    assert (
        "DV-IN-003 compose.yaml: explicit input is unreadable"
        in capsys.readouterr().out
    )
