# Hook Installation

Run `make deploy-ci` as root to invoke the root-owned Ansible deployment. Ansible
builds and verifies `/opt/.workspace-ci.candidate`, atomically publishes it at
`/opt/workspace-ci`, verifies and seals the artifact, then installs protected
hooks. A hook-installation failure does not alter or restore the artifact;
rerun the same Ansible-owned `make deploy-ci` flow after correcting the failure.

Candidate runtimes are created in a private mount namespace where the candidate
is visible at `/opt/workspace-ci`. This does not replace or expose the host's
current artifact. Candidate-path metadata is a deployment failure and must not
be repaired by editing generated environments.

Protected hooks resolve `/opt/workspace-ci` directly. Source-development hooks
may still be generated from a writable checkout, but they are not protected
deployment hooks.

Ansible construction and verification never source or execute the current
`/opt/workspace-ci`. If the deployed artifact is absent or unusable, rerunning
normal provisioning constructs a fresh reviewed candidate and replaces it. Do
not repair hook runtimes or virtual-environment links directly below `/opt`.
