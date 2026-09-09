# Checker Optimisation TODO

**Status:** Planned
**Execution order:** Begin only after
`docs/TODO-POLICY-EXEMPTION-REMEDIATION.md` completes its planned policy
replacement and acceptance work.
**Scope:** Banned-pattern checker runtime, shared checker process overhead,
parallel execution, performance budgets, and regression evidence.
**Rule:** Do not claim an optimisation or mark an item complete without
before-and-after measurements on WORKSPACE-CI and the largest protected
consumer repository.
**Contract:** `docs/requirements/REQ-BANNED-PATTERN-MATCHING.md` sections 16
and 18 are mandatory.

## Recorded Baseline

- [x] Record the 2026-09-05 WORKSPACE-CI baseline: 740 scanned files, 232
  banned rules, 6.415 seconds wall time, 6.154 seconds user CPU without the
  profiler.
- [x] Record the 2026-09-05 profile: 37,750,358 calls in 11.332 seconds under
  `cProfile`.
- [x] Record the dominant matching cost: 22,881,965
  `re.Pattern.search` calls consumed 6.381 seconds of internal time.
- [x] Record the dominant exemption cost: 4,549,702 module-level
  `re.search` calls and 4,550,067 `_compile` cache lookups; 171,087
  `_is_exempt` calls consumed 3.078 seconds cumulatively.
- [x] Confirm rule regexes are already compiled once in `main`; rule
  compilation is not the current bottleneck.
- [ ] Record the same wall, CPU, peak-RSS, file-count, byte-count, line-count,
  and rule-count baseline for the largest protected consumer repository.
- [ ] Store reproducible benchmark commands and raw outputs with the
  implementation audit.

## P0: Remove Measured Checker Waste

- [ ] Compile every exemption path regex once while loading policy, as required
  by REQ-BANNED-PATTERN-MATCHING section 16.6.
- [ ] Resolve each file's exempt rule-ID set once before content matching;
  never call path matching once per rule.
- [ ] Short-circuit rules covered by an exact whole-file classification or
  exemption before decoding or normalization where the requirements permit it.
- [ ] Replace the Python-level rule-by-line loop with whole-content rule
  searches; calculate line and column only after a match.
- [ ] Preserve reporting of every violation when one rule matches multiple
  locations; optimisation MUST NOT reduce output to the first match.
- [ ] Add a safe mandatory-literal prefilter for rules with a provable
  contiguous literal; rules without such a literal continue through the full
  matcher.
- [ ] Never infer a mandatory literal from regex syntax unless the extractor
  can prove it is required in every branch.
- [ ] Split rules by declared matching mode so `raw-regex` rules do not pay for
  token, path, Unicode, or variant normalization.
- [ ] Read each file once and compute each required raw, NFC, NFKC, case-folded,
  path, multiline, or escaped view at most once.
- [ ] Create normalized views lazily; do not build a view unless at least one
  applicable rule requires it.
- [ ] Compile all rule, exemption, classifier, and combined-prefilter regexes
  once per checker process.
- [ ] Keep policy loading, rule compilation, file classification, and exception
  resolution outside per-line loops.

## P1: Reduce Matching Passes

- [ ] Benchmark a combined alternation for normalized-token rules against
  individual compiled patterns.
- [ ] Use combined alternation only when it preserves exact rule-ID attribution,
  match location, timeout diagnostics, and negative controls.
- [ ] On a combined-prefilter hit, run only candidate rules needed to produce
  exact diagnostics; do not rescan every rule.
- [ ] Partition combined patterns by matching mode, case behavior, boundary
  behavior, and normalized view rather than building one uncontrolled regex.
- [ ] Reject combined regex construction that introduces catastrophic
  backtracking or exceeds the documented compile/runtime budget.
- [ ] Benchmark a simple standard-library literal prefilter before considering
  a trie, Aho-Corasick implementation, or new dependency.
- [ ] Avoid memory mapping, custom automata, native extensions, or third-party
  regex engines unless measured results show the standard library misses the
  accepted budget.

## P2: File Discovery And Work Selection

- [ ] Use one NUL-delimited `git ls-files` process per scan, as required by
  REQ-BANNED-PATTERN-MATCHING section 13.
- [ ] Pass an explicit file list from hook callers when their contract permits
  staged-file-only enforcement; retain mandatory full-repository scans for
  path-independent and push acceptance rules.
- [ ] Measure staged-only versus full-tree behavior before changing hook scope;
  optimisation MUST NOT weaken newly-created, renamed, or unstaged-file
  enforcement.
- [ ] Classify exact binary, generated, lock, fixture, and reference files before
  text decoding; run their dedicated validators instead of normalized content
  matching.
- [ ] Measure generated JSON and other large tracked files separately so one
  verified generated artifact cannot dominate every commit scan.
- [ ] Avoid repeated `Path.resolve`, environment lookup, basename extraction,
  and repository-root calculation inside per-rule or per-line loops.

## P3: Incremental Cache

- [ ] Benchmark after P0-P2 before implementing a cache.
- [ ] If still needed, key cached findings by checker version, complete effective
  policy digest, Git blob ID, normalized path, file classification, and matching
  mode.
- [ ] Never accept a path-only, timestamp-only, size-only, or writable-source
  cache key.
- [ ] Treat cache corruption, unreadable cache state, and key mismatch as a
  cache miss; never suppress scanning or fail open.
- [ ] Do not cache exemption resolution across path changes; rename and move
  semantics must remain exact.
- [ ] Keep cache deletion safe and optional; correctness MUST be identical with
  no cache present.
- [ ] Record hit rate, cold-run time, warm-run time, cache size, and invalidation
  behavior before enabling it in protected hooks.

## P4: Process Consolidation

- [ ] Measure interpreter startup, `uv run`, YAML parsing, and module import time
  separately from checker execution.
- [ ] Inventory every Python process launched by pre-commit and pre-push hooks;
  current hooks include direct `uv run python` entries and Python checks reached
  through `ci_uv_run`.
- [ ] Design one protected Python check driver that imports and invokes compatible
  checks in a single interpreter process.
- [ ] Preserve each check's identity, ordering dependency, exit status,
  diagnostic output, advisory/blocking status, and fail-closed behavior.
- [ ] Share parsed immutable policy and repository discovery only between checks
  with identical authority, scan root, and policy digest.
- [ ] Do not consolidate checks that require isolated environments, consume
  incompatible arguments, mutate state, or rely on process isolation.
- [ ] Update `.pre-commit-config.yaml`, `required_hooks.yaml`, generated hooks,
  hook verification, runbooks, and wiki data together if hook identities or
  entries change.
- [ ] Benchmark the consolidated driver against separate processes before
  changing protected hooks.
- [ ] Prefer process consolidation over cross-process compiled-regex caching;
  compiled regex objects are process-local and YAML-only caching does not
  justify its invalidation surface.

## P5: Parallel Execution

- [ ] Benchmark the serial implementation after P0-P4 before adding
  parallelism.
- [ ] If file scanning still exceeds its budget, benchmark bounded worker
  processes over deterministic file chunks with rules compiled once per worker.
- [ ] Preserve stable diagnostic ordering independent of worker completion
  order.
- [ ] Bound worker count by measured CPU, memory, file count, and repository
  size; never spawn one process per file, rule, or line.
- [ ] Account for duplicate normalized views and compiled rules in each worker's
  peak-RSS budget.
- [ ] Do not use threads for CPU-bound Python regex work without evidence that
  the selected operations release the GIL enough to help.
- [ ] If checks are consolidated, benchmark parallel execution only between
  independent checks and retain prerequisite ordering for policy integrity,
  policy loading, and ordinary scanning.
- [ ] Audit `make check-push` targets for safe parallel groups such as lint and
  type checking; do not parallelize targets that share mutable output or test
  state.
- [ ] Prefer no parallelism when serial execution already meets the accepted
  budget.

## P6: Resource Safety And Observability

- [ ] Define measured maximum wall-time, CPU-time, and peak-RSS budgets for
  WORKSPACE-CI and representative small, medium, and largest protected repos.
- [ ] Fail closed with a specific rule ID and phase when regex compilation,
  matching, normalization, or a resource budget fails.
- [ ] Add per-rule timeout enforcement without spawning one process per match.
- [ ] Reject known catastrophic-backtracking structures during policy integrity
  validation.
- [ ] Report phase timings for config load, file discovery, classification,
  decode, normalization, exemption resolution, matching, and diagnostics in an
  opt-in benchmark mode.
- [ ] Keep normal hook output concise; benchmark telemetry MUST NOT alter the
  ordinary scanner result.
- [ ] Ensure performance instrumentation has negligible disabled-mode overhead.

## Regression Evidence

- [ ] Add a benchmark fixture representing current rule count, line count,
  exception count, generated-file size, and long-line behavior.
- [ ] Add correctness tests proving whole-content matching reports original line
  and column for every match.
- [ ] Add tests proving literal prefilters cannot hide alternation, optional,
  escaped, multiline, Unicode, or boundary-sensitive matches.
- [ ] Add tests proving exemption precomputation gives exactly the same result as
  exact rule-ID/path evaluation, including rename and zero/multiple-match
  failures.
- [ ] Add tests for files with no trailing newline, CRLF, long lines, embedded
  NUL, invalid UTF-8, spaces/tabs/newlines in filenames, and symlinks.
- [ ] Add a mutation test for every normalization stage required by the matching
  contract.
- [ ] Compare complete ordered findings before and after each optimisation on a
  frozen corpus; no finding may disappear or move without an explicit contract
  change.
- [ ] Run focused checker tests, full Python tests, shell tests, `make
  check-push`, protected commit hooks, and protected push hooks.

## Acceptance

- [ ] P0 removes the measured per-line and repeated exemption-path bottlenecks.
- [ ] Warm and cold benchmark results meet documented wall, CPU, and RSS budgets
  on every representative repository.
- [ ] The optimized checker reports the same complete ordered findings as the
  reference corpus.
- [ ] No optimization weakens strict decoding, normalization, path-independent
  scanning, exact exemptions, non-exemptible rules, or fail-closed behavior.
- [ ] No process consolidation weakens protected hook identity or authority.
- [ ] Parallel execution, if retained, is deterministic and demonstrably faster
  after accounting for startup and memory cost.
- [ ] No new dependency, native extension, custom regex engine, or cache daemon
  is introduced without benchmark evidence that the standard-library design
  cannot meet the accepted budget.
- [ ] Final benchmark evidence and implementation effects are recorded in a
  dated audit document.
