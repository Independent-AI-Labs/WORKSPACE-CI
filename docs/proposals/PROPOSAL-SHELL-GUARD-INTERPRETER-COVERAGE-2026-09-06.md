# Proposal: shell-guard interpreter-coverage hardening (2026-09-06)

Status: PROPOSAL (WORKSPACE-GUARD is a root trust domain; execution is
an operator decision). CI-side contract tests that pin the behavior the
guard should mirror live in
`tests/unit/test_shell_guard_coverage.py` (79-test combined suite
green, 2026-09-06).

Ledger: TODO-POLICY-EXEMPTION-REMEDIATION items 139-151.

## Findings from the CI-side implementation

1. The historical code-resident interpreter regex allowed wrappers then
   assignments in that order only; `env MODE=1 timeout 5
   /usr/bin/python` (wrapper, assignment, wrapper) evaded it. The
   normalized-path engine now strips interleaved wrapper/assignment
   prefixes in one bounded pass (`view_wrappers`).
2. `/bin`, `/usr/bin`, and `/usr/local/bin` must be one equivalence
   class (REQ-BANNED-PATTERN-MATCHING 8.7); `view_bindirs`
   canonicalizes them before matching.
3. Case-folded absolute paths (`/USR/BIN/PYTHON3.13`) are caught by
   fold, not by the raw regex's case flag alone.

## Requested guard changes (root domain)

- alt-interp: match absolute interpreter paths for every family
  (python/perl/ruby/node/lua/php), case-insensitive, with
  wrapper/assignment prefixes stripped and bin-directory equivalence
  (/bin, /usr/bin, /usr/local/bin).
- Extend enforcement from command scope to untrusted script scope: the
  body of an untrusted script is scanned for absolute interpreter
  invocations, not only the guarded command line.
- `ScriptClass::Trusted` bypass of body scans must require exact
  immutable identity (content digest of the reviewed artifact), not a
  path heuristic.
- Document the exact allowed boundary of `Invocation::PassThrough` and
  add it to the audit surface.
- Prohibit every repository-provisioning reference to `/bin/bash.real`
  (host authority only); add an integration test that guarded
  `/bin/bash` stays usable while the candidate owner cannot execute
  `/bin/bash.real`.
- Inventory commands allowed only because the guard uses a denylist;
  decide whether deployment needs an exact system-tool allowlist
  enforced independently of command regexes (see
  docs/audits/AUDIT-DEPLOY-TOOL-INVENTORY-2026-09-06.md, which
  proposes `ci/check_deploy_tools.py` + a reviewed allowlist manifest).

## Acceptance the CI-side tests already pin

- absolute + bare protected interpreters detected in every tested
  family and command context (if/while/$()/&&/sudo/env-timeout);
- case-folded paths detected;
- separator/dot-segment path forms detected after normalization;
- hermetic deployed-uv forms pass untouched.
