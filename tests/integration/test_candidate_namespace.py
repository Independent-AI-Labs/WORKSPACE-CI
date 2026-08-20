import os
import subprocess
from pathlib import Path

import pytest


@pytest.mark.skipif(os.geteuid() != 0, reason="mount namespaces require root")
def test_candidate_uses_final_path_without_replacing_host_artifact(
    tmp_path: Path,
) -> None:
    candidate = tmp_path / "candidate"
    candidate.mkdir()
    output = candidate / "observed-path"
    config_probe = candidate / ".boot-linux/containers/probe"
    script = Path(__file__).parents[2] / "scripts/run-candidate-namespace"
    entry = Path(__file__).parents[2] / "scripts/enter-candidate-namespace.sh"
    host = Path("/opt/workspace-ci")
    before = host.stat() if host.exists() else None

    subprocess.run(
        [
            script,
            candidate,
            "root",
            "/root",
            entry,
            "/bin/sh",
            "-c",
            "test ! -x /bin/bash.real && test \"$HOME\" = /mnt/user && "
            "touch \"$HOME/.config/containers/probe\" && "
            "cd /opt/workspace-ci && pwd -P > observed-path",
        ],
        cwd=candidate,
        check=True,
    )

    assert output.read_text(encoding="utf-8").strip() == "/opt/workspace-ci"
    assert config_probe.is_file()
    assert (host.stat() if host.exists() else None) == before
