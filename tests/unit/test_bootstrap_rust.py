from pathlib import Path


def test_bootstrap_rust_rejects_root_without_real_shell_escape() -> None:
    script = (Path(__file__).parents[2] / "scripts/bootstrap-rust").read_text()
    assert "EUID -eq 0" in script
    assert "refusing to install a downloaded toolchain as root" in script
    assert "bash.real" not in script


def test_automation_has_no_real_shell_escape() -> None:
    root = Path(__file__).parents[2]
    paths = [root / "Makefile", root / "web/Containerfile", *root.glob("scripts/*")]
    offenders = [
        path.relative_to(root)
        for path in paths
        if path.is_file() and "bash.real" in path.read_text()
    ]
    assert offenders == []
