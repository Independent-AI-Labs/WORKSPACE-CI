#!/usr/bin/env bash
# CI Check Functions: sourced by hooks and test runners.
# Consumers set their own shell flags; this file must stay passive.
# Each function exits 0 on success, 1 on violations found.

# Enforcement boundary (REQ-WIKI PIPE-5, amended 2026-08-21): config
# override inputs exist only at web content build time. This file is
# sourced by every protected hook; from the moment it loads, override
# variables do not exist, so no checker launched downstream can be
# pointed at policy files outside the deployed artifact.
unset CI_CONFIG_OVERRIDES CI_GUARD_CONFIG_OVERRIDES
for _ci_ov in "${!CI_CONFIG_PATH_@}" "${!CI_GUARD_CONFIG_PATH_@}"; do
    unset "$_ci_ov"
done
unset _ci_ov

_CHECKS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
for _mod in ci.sh ci_exemptions.sh checks_core.sh check_module_size.sh checks_commit.sh checks_files.sh checks_coverage.sh checks_compliance.sh checks_silent.sh checks_secrets.sh checks_security.sh checks_quality.sh checks_dead_code.sh; do
    # shellcheck disable=SC1090
    if ! source "$_CHECKS_DIR/$_mod"; then
        echo "ERROR: failed to source $_mod" >&2; exit 1
    fi
done
