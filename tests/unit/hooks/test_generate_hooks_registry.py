"""Registry-driven hook rendering and inline rejection."""

from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).parents[3]


def _config(entry: str, hook_id: str = "check-unstaged") -> str:
    return (
        "repos:\n"
        "  - repo: local\n"
        "    hooks:\n"
        f"      - id: {hook_id}\n"
        "        name: Test Hook\n"
        f"        entry: \"{entry}\"\n"
        "        language: system\n"
        "        pass_filenames: false\n"
        "        always_run: true\n"
    )


def _run(config: str, output: Path) -> None:
    path = output / "config.yaml"
    path.write_text(config, encoding="utf-8")
    subprocess.check_call(
        [str(ROOT / "scripts" / "generate-hooks"), "--config", str(path),
         "--output-dir", str(output / "hooks")],
        cwd=ROOT,
        text=True,
    )


def _run_expect_fail(config: str, output: Path) -> str:
    path = output / "config.yaml"
    path.write_text(config, encoding="utf-8")
    err = output / "stderr.txt"
    try:
        with err.open("w", encoding="utf-8") as handle:
            subprocess.check_call(
                [str(ROOT / "scripts" / "generate-hooks"),
                 "--config", str(path), "--output-dir", str(output / "hooks")],
                cwd=ROOT,
                text=True,
                stderr=handle,
            )
    except subprocess.CalledProcessError:
        return err.read_text(encoding="utf-8")
    raise AssertionError("expected generation failure")


def test_registered_shell_ignores_stale_inline_entry() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        _run(_config("bash -c 'ci_check_unstaged'"), Path(tmp))
        body = (Path(tmp) / "hooks" / "pre-commit").read_text(encoding="utf-8")
        assert "/opt/workspace-ci/scripts/run-hook ci_check_unstaged" in body
        assert "bash -c" not in body


def test_custom_inline_entry_rejected() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        stderr = _run_expect_fail(_config("bash -c 'echo hi'", "local-hook"), Path(tmp))
        assert "inline interpreter" in stderr
        assert not (Path(tmp) / "hooks" / "pre-commit").exists()


def test_registry_args_parsed() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        registry = Path(tmp) / "required_hooks.yaml"
        registry.write_text(
            "hooks:\n"
            "  - id: sample\n"
            "    kind: shell\n"
            "    entry: ci_sample\n"
            "    stage: pre-commit\n"
            "    args: [--flag, value]\n",
            encoding="utf-8",
        )
        parsed = Path(tmp) / "parsed.txt"
        with parsed.open("w", encoding="utf-8") as handle:
            subprocess.check_call(
                ["awk", "-v", "mode=registry",
                 "-f", str(ROOT / "lib" / "parse_hook_yaml.awk"), str(registry)],
                text=True,
                stdout=handle,
            )
        fields = parsed.read_text(encoding="utf-8").rstrip("\n").split("\x1c")
        assert fields[0] == "sample"
        assert fields[-1] == "--flag value"