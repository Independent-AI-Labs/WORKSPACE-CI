#!/bin/bash
set -euo pipefail

candidate=${1:?candidate}
owner=${2:?owner}
home=${3:?home}
shift 3

mount -t tmpfs -o mode=0755,nosuid,nodev tmpfs /mnt
install -d -m 0755 /mnt/candidate
mount --bind "$candidate" /mnt/candidate
install -d -o "$owner" -m 0755 \
    /mnt/user \
    /mnt/user/.config \
    /mnt/user/.config/containers \
    /mnt/candidate/.boot-linux/containers
mount --bind \
    /mnt/candidate/.boot-linux/containers \
    /mnt/user/.config/containers
mount -t tmpfs -o mode=0755,nosuid,nodev tmpfs /opt
install -d -m 0755 /opt/workspace-ci
mount --bind /mnt/candidate /opt/workspace-ci
[[ $(stat -c '%u:%a' /bin/bash.real) == 0:700 ]]
/usr/sbin/runuser -u "$owner" -- test ! -x /bin/bash.real
exec /usr/sbin/runuser -u "$owner" -- /usr/bin/env HOME=/mnt/user "$@"
