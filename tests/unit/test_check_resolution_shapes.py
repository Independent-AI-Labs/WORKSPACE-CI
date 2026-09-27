"""Tests for lib/check_resolution_shapes.py shape detection."""

from __future__ import annotations

from pathlib import Path

from check_resolution_shapes import _filename_violation, _scan_file


def _scan(tmp_path: Path, text: str, name: str = "x.sh") -> list[str]:
    (tmp_path / name).write_text(text, encoding="utf-8")
    return _scan_file(tmp_path, name)


def test_one_line_function_does_not_bleed(tmp_path: Path) -> None:
    """A one-line definition closes on its line; its range must not swallow
    later command probes and boot paths (the bootstrap_go.sh false positive)."""
    text = (
        "#!/usr/bin/env bash\n"
        'log_success() { echo "$1" >&2; }\n'
        'log_info() { echo "$1" >&2; }\n'
        "if command -v curl; then\n"
        "    curl --version\n"
        "fi\n"
        "# Create symlinks in .boot-linux/bin/\n"
    )
    assert _scan(tmp_path, text) == []


def test_multiline_function_boot_then_path_flagged(tmp_path: Path) -> None:
    text = (
        "#!/usr/bin/env bash\n"
        "resolve_tool() {\n"
        "    if command -v tool; then\n"
        '        echo "/opt/workspace-ci/.boot-linux/bin/tool"\n'
        "    fi\n"
        "}\n"
    )
    findings = _scan(tmp_path, text)
    assert any("boot-then-PATH" in f for f in findings)


def test_if_elif_boot_then_path_flagged(tmp_path: Path) -> None:
    text = (
        "#!/usr/bin/env bash\n"
        'if [ -x "/opt/workspace-ci/.boot-linux/bin/podman" ]; then\n'
        '    PODMAN="/opt/workspace-ci/.boot-linux/bin/podman"\n'
        "elif command -v podman; then\n"
        "    PODMAN=podman\n"
        "fi\n"
    )
    findings = _scan(tmp_path, text)
    assert len(findings) == 1
    assert "if/elif chain" in findings[0]


def test_if_elif_command_v_only_passes(tmp_path: Path) -> None:
    text = (
        "#!/usr/bin/env bash\n"
        "if command -v a; then\n"
        "    X=a\n"
        "elif command -v b; then\n"
        "    X=b\n"
        "fi\n"
    )
    assert _scan(tmp_path, text) == []


def test_try_a_then_b_flagged(tmp_path: Path) -> None:
    text = (
        "#!/usr/bin/env bash\n"
        'GIT_REAL=""\n'
        'if [[ -z "$GIT_REAL" || ! -x "$GIT_REAL" ]]; then\n'
        '    GIT_REAL="/usr/bin/git"\n'
        "fi\n"
    )
    findings = _scan(tmp_path, text)
    assert any("try-A-then-B" in f for f in findings)


def test_probe_backed_default_flagged(tmp_path: Path) -> None:
    text = (
        "#!/usr/bin/env bash\n"
        'TOOL="${TOOL_BIN:-$(command -v tool)}"\n'
    )
    findings = _scan(tmp_path, text)
    assert any("probe/boot path" in f for f in findings)


def test_real_podman_reference_flagged(tmp_path: Path) -> None:
    text = (
        "#!/usr/bin/env bash\n"
        'PODMAN="/opt/workspace-ci/.boot-linux/bin/real-podman"\n'
    )
    findings = _scan(tmp_path, text)
    assert any("original-binary access" in f for f in findings)


def test_original_suffix_reference_flagged(tmp_path: Path) -> None:
    text = (
        "#!/usr/bin/env bash\n"
        'GIT_REAL="/usr/bin/git.original"\n'
    )
    findings = _scan(tmp_path, text)
    assert any("original-binary access" in f for f in findings)


def test_distrib_reference_flagged(tmp_path: Path) -> None:
    text = (
        "#!/usr/bin/env bash\n"
        "dpkg-divert --list /usr/lib/git-core/git.distrib\n"
    )
    findings = _scan(tmp_path, text)
    assert any("original-binary access" in f for f in findings)


def test_condition_embedded_probe_assignment_flagged(tmp_path: Path) -> None:
    text = (
        "#!/usr/bin/env bash\n"
        'if ! REAL_GIT="$(command -v git)"; then\n'
        "    REAL_GIT=git\n"
        "fi\n"
    )
    findings = _scan(tmp_path, text)
    assert any("condition-embedded" in f for f in findings)


def test_original_binary_filename_flagged() -> None:
    assert _filename_violation("bin/real-podman") is not None
    assert _filename_violation("bin/git.original") is not None
    assert _filename_violation("bin/bash.real") is not None
    assert _filename_violation("bin/git.distrib") is not None
    assert _filename_violation("bin/podman") is None
