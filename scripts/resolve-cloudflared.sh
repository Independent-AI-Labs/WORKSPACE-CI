#!/usr/bin/env bash
# Resolve cloudflared binary: CLOUDFLARED_BIN env, boot-dir walk-up, then PATH.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_CI_LIB="${SCRIPT_DIR}/../lib"
# shellcheck source=../lib/ci.sh
if ! source "${_CI_LIB}/ci.sh"; then
    echo "ERROR: failed to source ${_CI_LIB}/ci.sh" >&2
    exit 1
fi

if [[ -n "${CLOUDFLARED_BIN:-}" ]]; then
    if [[ -x "${CLOUDFLARED_BIN}" ]]; then
        printf '%s\n' "${CLOUDFLARED_BIN}"
        exit 0
    fi
    echo "ERROR: CLOUDFLARED_BIN is set but not executable: ${CLOUDFLARED_BIN}" >&2
    exit 1
fi

if ci_resolve_tool_path "${CI_PROJECT_ROOT}" cloudflared; then
    exit 0
fi

echo "ERROR: cloudflared not found. Walked up from ${CI_PROJECT_ROOT} for $(ci_boot_name)/bin/cloudflared; not on PATH." >&2
echo "Set CLOUDFLARED_BIN=/path/to/cloudflared in .env (see .env.example)." >&2
exit 1