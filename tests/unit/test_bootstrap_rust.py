from pathlib import Path


def test_bootstrap_rust_rejects_root_without_real_shell_escape() -> None:
    script = (Path(__file__).parents[2] / "scripts/bootstrap-rust").read_text()
    assert "EUID -eq 0" in script
    assert "refusing to install a downloaded toolchain as root" in script
    assert "bash.real" not in script
    assert "sh.rustup.rs" not in script
    assert "ci_tool_artifact rustup sha256" in script
    assert '"$tmp/rustup-init" -y' in script


def test_automation_has_no_real_shell_escape() -> None:
    root = Path(__file__).parents[2]
    paths = [root / "Makefile", root / "web/Containerfile", *root.glob("scripts/*")]
    # enter-candidate-namespace.sh is an operator root tool that only
    # asserts the bash.real lockdown (0:700 root-owned, not executable
    # by the candidate owner); it never invokes bash.real.
    allowed = {"scripts/enter-candidate-namespace.sh"}
    offenders = [
        path.relative_to(root).as_posix()
        for path in paths
        if path.is_file() and "bash.real" in path.read_text()
    ]
    assert [p for p in offenders if p not in allowed] == []
