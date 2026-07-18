#!/usr/bin/env bash
# CI Coverage Checks: test suite verification with coverage thresholds.
# Sourced by checks.sh. Requires ci.sh to be loaded first.

# --- ci_verify_coverage [config-path] ---
ci_verify_coverage() {
    # Project MUST define its own coverage config. No defaults.
    local config="${1:-}"
    if [[ -z "$config" ]]; then
        if [[ -f "./config/coverage_thresholds.yaml" ]]; then
            config="./config/coverage_thresholds.yaml"
        elif [[ -f "./coverage_thresholds.yaml" ]]; then
            config="./coverage_thresholds.yaml"
        else
            config="$(ci_config_path coverage_thresholds)"
        fi
    fi

    if [[ -z "$config" || ! -f "$config" ]]; then
        ci_fail "No coverage_thresholds.yaml found. Each project must define its own test suites."
        echo "  Create config/coverage_thresholds.yaml with your test suites."
        echo "  See CI docs for format."
        return 1
    fi

    ci_validate_exemption_file "$config" "coverage_thresholds.yaml" || return 1

    # Parse suites (each has: path, min_coverage, source_path, runner)
    local suites=()
    ci_capture_lines suites -- awk '/^[a-z][a-z_]*:/ { sub(/:.*/, ""); print }' "$config"

    if [[ ${#suites[@]} -eq 0 ]]; then
        ci_warn "No test suites found in $config"
        return 0
    fi

    local all_pass=0

    for suite in "${suites[@]}"; do
        # Skip non-suite top-level keys
        [[ "$suite" == "version" ]] && continue

        local path min_cov source_path runner coverage
        path="$(ci_read_yaml "$config" "${suite}.path")"
        min_cov="$(ci_read_yaml "$config" "${suite}.min_coverage")"
        source_path="$(ci_read_yaml "$config" "${suite}.source_path")"
        runner="$(ci_read_yaml "$config" "${suite}.runner")"
        coverage="$(ci_read_yaml "$config" "${suite}.coverage")"

        [[ -z "$path" || -z "$min_cov" ]] && continue
        [[ -z "$source_path" ]] && source_path="."
        [[ -z "$runner" ]] && runner="uv run python -m pytest"
        [[ -z "$coverage" ]] && coverage="true"

        # Check if test path exists
        if [[ ! -d "$path" ]]; then
            ci_warn "Test path $path not found for suite '$suite', skipping."
            continue
        fi

        # Check if source path exists (skip if config points to wrong module)
        if [[ "$source_path" != "." && ! -d "$source_path" ]]; then
            ci_warn "Source path $source_path not found for suite '$suite', skipping."
            continue
        fi

        local suite_label
        suite_label="$(echo "${suite:0:1}" | tr '[:lower:]' '[:upper:]')${suite:1}"

        echo ""
        if [[ "$coverage" == "false" ]]; then
            ci_info "--- Running $suite_label Tests (coverage disabled) ---"
        else
            ci_info "--- Running $suite_label Tests (Threshold: ${min_cov}%) ---"
        fi

        # Build command based on runner. The `coverage: false` setting is
        # honoured by EVERY branch: when coverage is off, no coverage-specific
        # flags (--min-coverage, --cov-fail-under, --coverage.thresholds, etc.)
        # are appended, regardless of which branch matched. Only the runner's
        # own native args + the test path go through. This prevents the
        # historical bug where the `*)` catch-all branch appended `--min-coverage=N
        # --source=...` to bare `cargo test` runners, breaking them with
        # "unexpected argument '--min-coverage'".
        local cmd
        case "$runner" in
            *pytest*)
                if [[ "$coverage" == "false" ]]; then
                    cmd="$runner $path --no-cov --tb=short -q"
                else
                    cmd="$runner $path --cov=$source_path --cov-report=term-missing --cov-fail-under=$min_cov --tb=short -q"
                fi
                ;;
            *cargo*llvm-cov*)
                if [[ "$coverage" == "false" ]]; then
                    cmd="$runner --manifest-path ${source_path}/Cargo.toml"
                else
                    cmd="$runner --manifest-path ${source_path}/Cargo.toml --fail-under-lines $min_cov"
                fi
                ;;
            *cargo*)
                # Bare cargo test/build runner (no llvm-cov). `cargo test`
                # takes neither `--min-coverage` nor `--source`, and the
                # YAML `path:` field is a pytest-style directory concept
                # that does NOT map to cargo (cargo filters by test-name
                # substring, not by directory). When coverage is off, run
                # the runner verbatim with no appended args so `--workspace`
                # enumerates every crate (unit + integration tests).
                # When coverage is on, the `*cargo*llvm-cov*` branch above
                # handles it via the manifest path.
                cmd="$runner"
                ;;
            *vitest*)
                if [[ "$coverage" == "false" ]]; then
                    cmd="cd ${source_path} && ${runner}"
                else
                    cmd="cd ${source_path} && ${runner} --coverage --coverage.thresholds.lines=${min_cov} --coverage.thresholds.functions=${min_cov} --coverage.thresholds.branches=${min_cov} --coverage.thresholds.statements=${min_cov}"
                fi
                ;;
            "npm test"*|"npx tsx"*|"node --test"*)
                # Node.js runners: no coverage args, just run the command as-is
                cmd="$runner"
                ;;
            *)
                # Generic catch-all. Only append coverage flags when coverage
                # is explicitly enabled; for `coverage: false` runs, emit
                # just the runner + path so non-coverage-aware runners
                # (bare cargo test, go test, etc.) don't choke on flags
                # they don't understand.
                if [[ "$coverage" == "false" ]]; then
                    cmd="$runner $path"
                else
                    cmd="$runner $path --min-coverage=$min_cov --source=$source_path"
                fi
                ;;
        esac

        # Per-suite timeout (default 600s = 10min). Override via
        # CI_COVERAGE_TIMEOUT env var or `${suite}.timeout` in YAML.
        # No unmonitored hangs: heartbeat every 30s while running; loud
        # failure with the suite name + elapsed time on timeout.
        local timeout_s
        timeout_s="$(ci_read_yaml "$config" "${suite}.timeout")"
        [[ -z "$timeout_s" ]] && timeout_s="${CI_COVERAGE_TIMEOUT:-600}"

        local rc=0
        local _started _heartbeat_pid
        _started=$SECONDS
        ci_info "Running $suite_label (timeout=${timeout_s}s, heartbeat every 30s)..."

        # Heartbeat: every 30s emit elapsed-seconds so the operator
        # knows the hook is alive. Slow environments can stall I/O for
        # minutes; without a heartbeat the operator sees nothing.
        ( while sleep 30; do
            local _e=$((SECONDS - _started))
            printf '[ci-coverage] %s still running (%ds elapsed)\n' "$suite_label" "$_e" >&2
          done ) &
        _heartbeat_pid=$!

        # vitest needs cd+&&; use bash -c. All others: direct execution.
        # `timeout --kill-after=10s ${timeout_s}s` ensures we get a final
        # SIGKILL if the suite ignores SIGTERM.
        if [[ "$runner" == *vitest* ]]; then
            timeout --signal=TERM --kill-after=10s "${timeout_s}s" bash -c "$cmd" || rc=$?
        else
            timeout --signal=TERM --kill-after=10s "${timeout_s}s" $cmd || rc=$?
        fi

        if ps -p "$_heartbeat_pid"; then kill "$_heartbeat_pid"; fi
        local _elapsed=$((SECONDS - _started))

        # `timeout` exits 124 on TERM-kill, 137 on KILL-kill. Loud failure.
        if [[ $rc -eq 124 || $rc -eq 137 ]]; then
            ci_fail "$suite_label TIMED OUT after ${timeout_s}s (elapsed: ${_elapsed}s, exit $rc)"
            echo "  Test runner did not exit within the budget."
            echo "  Override: CI_COVERAGE_TIMEOUT=NNN git push origin main"
            echo "  Per-suite override: ${suite}.timeout: NNN in coverage_thresholds.yaml"
            echo "  Common cause: networked test fixture, broken venv import,"
            echo "    or pytest-xdist worker stuck on a socket."
            all_pass=1
            continue
        fi

        # SIGSEGV is a hard failure: no quiet retries
        if [[ $rc -eq 139 || $rc -eq 245 ]]; then
            ci_fail "$suite_label CRASHED (SIGSEGV, exit $rc, elapsed ${_elapsed}s): investigate the crash, do not retry"
            all_pass=1
            continue
        fi

        if [[ $rc -ne 0 ]]; then
            if [[ $rc -eq 2 && "$coverage" != "false" ]]; then
                ci_fail "$suite_label Coverage FAILED (Required: ${min_cov}%)"
            else
                ci_fail "$suite_label Tests FAILED (exit code $rc)"
            fi
            all_pass=1
        elif [[ "$coverage" == "false" ]]; then
            ci_pass "$suite_label Tests Passed (coverage disabled)"
        else
            ci_pass "$suite_label Tests and Coverage Passed (>=${min_cov}%)"
        fi
    done

    if [[ $all_pass -ne 0 ]]; then
        echo ""
        ci_fail "PRE-PUSH CHECK FAILED: Coverage thresholds not met."
        return 1
    fi

    echo ""
    ci_pass "ALL COVERAGE CHECKS PASSED."
    return 0
}

# --- ci_check_coverage_thresholds_no_devolution ---
# Compares the staged coverage_thresholds.yaml against HEAD and fails the
# commit if any suite's min_coverage value is being lowered.
# Thresholds are earned and may only stay the same or increase over time.
# An exception applies when a suite's path changes, since the new path tests
# a different set of code.
ci_check_coverage_thresholds_no_devolution() {
    local config="config/coverage_thresholds.yaml"
    if [[ ! -f "$config" ]]; then
        ci_pass "No $config: nothing to guard."
        return 0
    fi

    if ! _git_dir="$(git rev-parse --git-dir 2>&1)"; then
        ci_pass "Not a git repo, skipping."
        return 0
    fi

    if git diff --cached --quiet -- "$config"; then
        ci_pass "Coverage thresholds: unchanged, OK."
        return 0
    fi

    # Parse HEAD version: suite keys are at column 0 (no indent)
    # Track both min_coverage and path per suite.
    declare -A old_thresholds old_paths
    local _head_output _suite="" _val=""
    _head_output="$(git show HEAD:"$config")"
    if [[ $? -eq 0 ]]; then
        while IFS= read -r line; do
            if echo "$line" | grep -qE '^[a-z][a-z_]*:'; then
                _suite="$(echo "$line" | cut -d: -f1)"
            elif echo "$line" | grep -q 'min_coverage:'; then
                _val="$(echo "$line" | sed 's/.*min_coverage:[[:space:]]*//')"
                if [[ -n "$_suite" && -n "$_val" ]]; then
                    old_thresholds["$_suite"]="$_val"
                fi
            elif echo "$line" | grep -q '^\s*path:'; then
                _val="$(echo "$line" | sed 's/.*path:[[:space:]]*//')"
                if [[ -n "$_suite" && -n "$_val" ]]; then
                    old_paths["$_suite"]="$_val"
                fi
            fi
        done <<< "$_head_output"
    fi

    # Parse staged version
    declare -A new_thresholds new_paths
    local _staged_output
    _suite="" _val=""
    _staged_output="$(git show :"$config")"
    if [[ $? -eq 0 ]]; then
        while IFS= read -r line; do
            if echo "$line" | grep -qE '^[a-z][a-z_]*:'; then
                _suite="$(echo "$line" | cut -d: -f1)"
            elif echo "$line" | grep -q 'min_coverage:'; then
                _val="$(echo "$line" | sed 's/.*min_coverage:[[:space:]]*//')"
                if [[ -n "$_suite" && -n "$_val" ]]; then
                    new_thresholds["$_suite"]="$_val"
                fi
            elif echo "$line" | grep -q '^\s*path:'; then
                _val="$(echo "$line" | sed 's/.*path:[[:space:]]*//')"
                if [[ -n "$_suite" && -n "$_val" ]]; then
                    new_paths["$_suite"]="$_val"
                fi
            fi
        done <<< "$_staged_output"
    fi

    local violations=0
    for suite in "${!old_thresholds[@]}"; do
        local _old="${old_thresholds[$suite]}"
        local _new="${new_thresholds[$suite]:-}"
        if [[ -z "$_new" ]]; then
            ci_fail "Coverage devolution: $suite removed (was ${_old}%)"
            violations=$((violations + 1))
            continue
        fi
        local _old_path="${old_paths[$suite]:-}"
        local _new_path="${new_paths[$suite]:-}"
        if [[ "$_old_path" != "$_new_path" ]]; then
            ci_info "Coverage suite $suite restructured"
            ci_info "  path: ${_old_path} -> ${_new_path}"
            ci_info "  threshold ${_old}% -> ${_new}% (path changed, threshold"
            ci_info "  comparison skipped: different test set)"
            continue
        fi
        if [[ "$_new" -lt "$_old" ]]; then
            ci_fail "Coverage devolution: $suite lowered from ${_old}% to ${_new}%"
            violations=$((violations + 1))
        fi
    done

    if [[ $violations -ne 0 ]]; then
        echo ""
        ci_fail "COVERAGE DE-EVOLUTION BLOCKED: Thresholds must only increase."
        echo "  Lowering coverage thresholds is forbidden."
        echo "  Raise the actual coverage to the target level, not the threshold."
        return 1
    fi

    ci_pass "Coverage thresholds: no de-evolution detected."
    return 0
}
