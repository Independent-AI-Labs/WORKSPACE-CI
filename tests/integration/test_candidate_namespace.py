import os
import pwd
import subprocess
from pathlib import Path

import pytest


@pytest.mark.skipif(os.geteuid() != 0, reason="mount namespaces require root")
def test_candidate_uses_final_path_without_replacing_host_artifact(
    tmp_path: Path,
) -> None:
    repo = Path(__file__).parents[2]
    owner_entry = pwd.getpwuid(repo.stat().st_uid)
    if owner_entry.pw_name == "root":
        pytest.skip("source checkout owner is root; candidate owner must be unprivileged")
    candidate = tmp_path / "candidate"
    candidate.mkdir()
    candidate.chmod(0o777)
    output = candidate / "observed-path"
    config_probe = candidate / ".boot-linux/containers/probe"
    script = repo / "scripts/run-candidate-namespace"
    entry = repo / "scripts/enter-candidate-namespace.sh"
    host = Path("/opt/workspace-ci")
    before = host.stat() if host.exists() else None

    result = subprocess.run(
        [
            script,
            candidate,
            owner_entry.pw_name,
            owner_entry.pw_dir,
            entry,
            "/bin/sh",
            "-c",
            "test ! -x /bin/bash.real && test \"$HOME\" = /mnt/user && "
            "touch \"$HOME/.config/containers/probe\" && "
            "cd /opt/workspace-ci && pwd -P > observed-path",
        ],
        cwd=candidate,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, (
        f"run-candidate-namespace failed rc={result.returncode}\n"
        f"stdout: {result.stdout}\nstderr: {result.stderr}"
    )

    assert output.read_text(encoding="utf-8").strip() == "/opt/workspace-ci"
    assert config_probe.is_file()
    assert (host.stat() if host.exists() else None) == before
