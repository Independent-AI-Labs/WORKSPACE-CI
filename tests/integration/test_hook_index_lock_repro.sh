#!/usr/bin/env bash
# Persistent reproduction: hook-context `git add -A` fails with
#   fatal: Unable to create '<repo>/.git/index.lock': Permission denied
# ONLY when the pre-commit hook is spawned by a real `git commit`
# (guard -> git.original -> hook -> /usr/bin/git), never when the same
# hook is run directly from an agent shell.
#
# Measured context facts (2026-07-28, this repo):
#   - agent shell:      CapAmb=0; direct .git/hooks/pre-commit run: git add -A OK
#   - git.original:     CapInh=CapPrm=0x11b, CapAmb=0x2 (CAP_DAC_OVERRIDE loan,
#                       WORKSPACE-GUARD src/exec.rs raise_child_dac_override)
#   - hook bash (child of git.original): CapInh=0 CapEff=0 CapAmb=0
#     => ambient AND inheritable caps are stripped at hook spawn, so the
#        hook's nested /usr/bin/git exec re-gains file caps but its child
#        git.original cannot write the root-owned .git directory (755 root).
#
# Usage: tests/integration/test_hook_index_lock_repro.sh
# Exit:  0 = bug REPRODUCED (index.lock EACCES observed in hook context)
#        2 = NOT reproduced (hook staged cleanly; bug may be fixed)
#        1 = unexpected outcome (hook passed and committed, or no hook)
#
# Safety: the planted unstaged change is a deliberate silent-swallow
# violation appended to a scratch copy of web/scripts/prod.sh, so even if
# the index.lock bug is fixed the hook still fails (Block error-swallow)
# and NO commit is created. The worktree file is restored afterwards and
# re-staged from the pre-test staged version.

set -u

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${REPO_ROOT}" || exit 1

VICTIM="web/scripts/prod.sh"
OUT="$(mktemp)"
GOOD="$(mktemp)"
cp "${VICTIM}" "${GOOD}"

cleanup() {
  cp "${GOOD}" "${VICTIM}"
  rm -f "${GOOD}" "${OUT}"
  git add "${VICTIM}" >/dev/null 2>&1
}
trap cleanup EXIT

printf '\necho hook-repro || true\n' >> "${VICTIM}"

git commit -m "hook-index-lock repro probe (never created)" >"${OUT}" 2>&1
commit_rc=$?

if grep -q "index.lock': Permission denied" "${OUT}"; then
  echo "REPRODUCED: hook-context git add -A hit index.lock EACCES (commit_rc=${commit_rc})"
  exit 0
fi

if grep -q "Silent-swallow: violations found" "${OUT}"; then
  echo "NOT REPRODUCED: hook staged cleanly and failed only on the planted"
  echo "silent-swallow violation (commit_rc=${commit_rc}); index.lock bug appears fixed"
  exit 2
fi

if [ "${commit_rc}" -eq 0 ]; then
  echo "UNEXPECTED: commit succeeded (rc=0); inspect git log and revert manually" >&2
  exit 1
fi

echo "UNEXPECTED: neither index.lock EACCES nor silent-swallow failure observed:" >&2
tail -n 20 "${OUT}" >&2
exit 1
