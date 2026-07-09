#!/usr/bin/env bash
# CI Check Functions: sourced by hooks and test runners.
# Consumers set their own shell flags; this file must stay passive.
# Each function exits 0 on success, 1 on violations found.


_CHECKS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
for _mod in ci.sh checks_core.sh checks_commit.sh checks_files.sh checks_coverage.sh checks_compliance.sh checks_silent.sh checks_secrets.sh checks_quality.sh checks_dead_code.sh; do
    # shellcheck disable=SC1090
    if ! source "$_CHECKS_DIR/$_mod"; then
        echo "ERROR: failed to source $_mod" >&2; exit 1
    fi
done
