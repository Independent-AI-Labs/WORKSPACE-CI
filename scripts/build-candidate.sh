#!/bin/bash
set -euxo pipefail

make -C /opt/workspace-ci bootstrap
test -s /opt/workspace-ci/.boot-linux/containers/containers.conf
test -s /opt/workspace-ci/.boot-linux/containers/registries.conf
make -C /opt/workspace-ci install-ci
# Producer gate: validate the candidate's own catalog before check-push.
# Invoked directly here, not only through candidate-controlled Makefile logic.
/opt/workspace-ci/.boot-linux/bin/uv run --project /opt/workspace-ci \
    --no-sync python -P -m ci.check_required_hooks_present \
    --producer --project /opt/workspace-ci
make -C /opt/workspace-ci check-push
test -s /opt/workspace-ci/.boot-linux/containers/containers.conf
test -s /opt/workspace-ci/.boot-linux/containers/registries.conf
