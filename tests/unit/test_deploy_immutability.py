from unittest.mock import patch

from ci import deploy_immutability as MODULE

MODULE_PATH = MODULE.__file__
assert MODULE_PATH


def test_rejects_unknown_action() -> None:
    with (
        patch.object(MODULE.os, "geteuid", return_value=0),
        patch.object(MODULE.sys, "argv", [str(MODULE_PATH), "anything"]),
    ):
        assert MODULE.main() == MODULE.EXIT_USAGE


def test_action_uses_fixed_path() -> None:
    with (
        patch.object(MODULE.os, "geteuid", return_value=0),
        patch.object(MODULE.sys, "argv", [str(MODULE_PATH), "seal-deployed"]),
        patch.object(MODULE.subprocess, "run") as run,
    ):
        assert MODULE.main() == 0
        run.assert_called_once_with(
            ("/usr/bin/chattr", "+i", "/opt/workspace-ci"), check=True
        )


def test_recursive_action_skips_symlinks() -> None:
    with (
        patch.object(MODULE.os, "geteuid", return_value=0),
        patch.object(MODULE.sys, "argv", [str(MODULE_PATH), "unseal-candidate"]),
        patch.object(MODULE.subprocess, "run") as run,
    ):
        assert MODULE.main() == 0
        command = run.call_args.args[0]
        assert command[:3] == (
            "/usr/bin/find",
            "/opt/.workspace-ci.candidate",
            "-xdev",
        )
        assert command[3:7] == ("!", "-type", "l", "-exec")
