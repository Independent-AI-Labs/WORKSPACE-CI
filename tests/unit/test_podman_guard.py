from pathlib import Path


def test_podman_bootstrap_uses_repository_guard() -> None:
    root = Path(__file__).parents[2]
    bootstrap = (root / "scripts/bootstrap-podman").read_text()
    assert '${CI_PROJECT_ROOT}/res/podman-guard' in bootstrap
    assert "CI_WORKSPACE_ROOT" not in bootstrap
    assert (root / "res/podman-guard").is_file()
