# Hook Installation

Run `make deploy-ci` as root to install WORKSPACE-CI. It builds and verifies
`/opt/.workspace-ci.candidate`, atomically publishes it at
`/opt/workspace-ci`, verifies and seals the artifact, then installs protected
hooks. A hook-installation failure does not alter or restore the artifact;
rerun `make deploy-ci` after correcting the failure.

Protected hooks resolve `/opt/workspace-ci` directly. Source-development hooks
may still be generated from a writable checkout, but they are not protected
deployment hooks.
