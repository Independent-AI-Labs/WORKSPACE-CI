"""POSIX shell plugin that is safe under the sealed shell guard.

The guard scans every command string /bin/sh runs. Two builtin ``sh``
behaviours trip it:

* Ansible wraps each low-level command in a second /bin/sh invocation and
  runs that through /bin/sh again (``inline-shell``). Plays avoid this by
  setting ``ansible_shell_executable: ''``; the local connection still runs
  each command once through ``/bin/sh``.
* Temp-dir cleanup appends ``> /dev/null 2>&1`` (``suppress-null``), so the
  cleanup is blocked and temp dirs leak. This plugin keeps the cleanup
  output; Ansible reports a failed cleanup as a warning with its stderr.

Loaded from the playbook-adjacent ``shell_plugins`` directory and selected
with ``ansible_shell_type: guarded_sh``.
"""

from __future__ import annotations

DOCUMENTATION = """
name: guarded_sh
short_description: POSIX shell whose temp cleanup keeps its output
description:
  - Same as the builtin C(sh) plugin, except temp-dir removal does not
    discard its output, so the sealed shell guard allows it.
extends_documentation_fragment:
  - shell_common
"""

from ansible.plugins.shell.sh import ShellModule as _ShModule


class ShellModule(_ShModule):
    """Builtin sh plugin without the ``> /dev/null 2>&1`` cleanup suffix."""

    _SHELL_REDIRECT_ALLNULL = ""
