#!/usr/bin/env bash
set -euo pipefail

/scripts/gen-self-signed-cert.sh
exec nginx -g 'daemon off;'