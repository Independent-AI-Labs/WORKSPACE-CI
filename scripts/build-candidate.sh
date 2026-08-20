#!/bin/bash
set -euxo pipefail

make -C /opt/workspace-ci bootstrap
test -s /opt/workspace-ci/.boot-linux/containers/containers.conf
test -s /opt/workspace-ci/.boot-linux/containers/registries.conf
make -C /opt/workspace-ci install-ci
make -C /opt/workspace-ci check-push
test -s /opt/workspace-ci/.boot-linux/containers/containers.conf
test -s /opt/workspace-ci/.boot-linux/containers/registries.conf
