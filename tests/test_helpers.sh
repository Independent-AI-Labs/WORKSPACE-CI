#!/usr/bin/env bash
# Shared test framework for CI tests.
# Sourced by run_tests.sh. Not executed directly.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LIB_DIR="$PROJECT_DIR/lib"

# ---------------------------------------------------------------------------
# Test framework
# ---------------------------------------------------------------------------
_TESTS_RUN=0
_TESTS_PASSED=0
_TESTS_FAILED=0
_FAILURES=()

# Remove a directory tree. In this sandbox, git init/commit create
# root-owned files inside .git that rm cannot delete. When rm fails,
# relocate the tree to a .trash dir (mv only needs write perms on the
# parent, not the contents) so it does not interfere with the next test.
_scrub_dir() {
    local _target="$1"
    [[ -e "$_target" ]] || return 0
    rm -rf "$_target" 2>/dev/null && return 0
    local _trash="${TEST_TMP:-/tmp}/.trash"
    mkdir -p "$_trash"
    mv "$_target" "$_trash/$(basename "$_target").$$.$RANDOM" 2>/dev/null || true
}

# Set up config files in the tmpdir.
# Most config files are symlinks (read-only by tests). The 3 files
# that tests write fixtures to are COPIES so test writes do not
# corrupt the real config files:
#   banned_words.yaml         (test_checks.sh writes test fixtures)
#   coverage_thresholds.yaml  (test_checks.sh + e2e_checks.sh write)
#   file_length_limits.yaml   (test_core.sh writes test fixtures)
_restore_configs() {
    local _ci_dir="$1"
    shopt -s nullglob
    local yaml_files=("$PROJECT_DIR/config/"*.yaml)
    shopt -u nullglob
    local f
    for f in "${yaml_files[@]}"; do
        local bn; bn="$(basename "$f")"
        case "$bn" in
            banned_words.yaml|coverage_thresholds.yaml|file_length_limits.yaml)
                # Remove first: the guard root-locks coverage/file-length
                # configs after sandbox git commits, and cp onto a locked
                # file fails (directory stays agent-writable, so rm works).
                rm -f "$_ci_dir/config/$bn" 2>/dev/null || true
                cp "$f" "$_ci_dir/config/$bn"
                ;;
            *)
                ln -s "$f" "$_ci_dir/config/$bn"
                ;;
        esac
    done
}

_link_lib_files() {
    local _ci_dir="$1"
    local f src
    for f in ci.sh ci_owner.sh ci_seal.sh ci_deploy_lock.sh ci_helpers.sh ci_config_paths.sh ci_exemptions.sh checks.sh checks_*.sh \
             check_banned_words.py check_silent_swallow.py \
             check_silent_swallow_base.py check_silent_swallow_python.py \
             check_silent_swallow_js.py check_silent_swallow_system.py \
             check_silent_swallow_ansible.py resolve_config_path.py; do
        for src in "$LIB_DIR"/$f; do
            [[ -f "$src" ]] || continue
            local _dest="$_ci_dir/lib/$(basename "$src")"
            [[ -e "$_dest" ]] || ln -s "$src" "$_dest"
        done
    done
    [[ -e "$_ci_dir/pyproject.toml" ]] || ln -s "$PROJECT_DIR/pyproject.toml" "$_ci_dir/pyproject.toml"
    [[ -e "$_ci_dir/ci" ]] || ln -s "$PROJECT_DIR/ci" "$_ci_dir/ci"
}

_setup_tmpdir() {
    if [[ -n "${TEST_TMP:-}" && -d "${TEST_TMP:-}/workspace/projects/WORKSPACE-CI/lib" ]]; then
        # Reuse existing tmpdir: reset git state and remove test-created
        # regular files (preserving symlinked lib originals).
        local _ci_dir="$TEST_TMP/workspace/projects/WORKSPACE-CI"
        _link_lib_files "$_ci_dir"
        _scrub_dir "$_ci_dir/.git"
        # Remove regular files in CI dir (not symlinks). find without -L
        # does not follow symlinks, so symlinked lib files are preserved.
        # Guard-locked (root-owned) leftovers cannot be deleted; tolerate.
        find "$_ci_dir" -type f -delete 2>/dev/null || true
        # Remove config symlinks so _restore_configs can re-create them
        find "$_ci_dir/config" -maxdepth 1 -type l -delete 2>/dev/null || true
        _restore_configs "$_ci_dir"
        # Remove extra project dirs created by compliance tests
        local _d
        for _d in "$TEST_TMP/workspace/projects"/*; do
            [[ -d "$_d" && "$(basename "$_d")" != "WORKSPACE-CI" ]] && _scrub_dir "$_d"
        done
        # Remove extra dirs/files at workspace root (e.g. repos from
        # test_blocked_patterns)
        local _w
        for _w in "$TEST_TMP/workspace"/*; do
            [[ "$_w" == "$TEST_TMP/workspace/projects" ]] && continue
            [[ "$_w" == "$TEST_TMP/workspace/pyproject.toml" ]] && continue
            _scrub_dir "$_w"
        done
        # Remove test repos at tmpdir root (test_blocked_patterns)
        for _w in "$TEST_TMP"/*; do
            [[ "$_w" == "$TEST_TMP/workspace" ]] && continue
            [[ "$_w" == "$TEST_TMP/.trash" ]] && continue
            _scrub_dir "$_w"
        done
        # Reset workspace pyproject.toml (may have been overwritten)
        echo '[project]' > "$TEST_TMP/workspace/pyproject.toml"
        echo 'name = "workspace"' >> "$TEST_TMP/workspace/pyproject.toml"
        echo 'version = "0.0.0"' >> "$TEST_TMP/workspace/pyproject.toml"
        return
    fi
    TEST_TMP="$(mktemp -d)"
    local _ci_dir="$TEST_TMP/workspace/projects/WORKSPACE-CI"
    # Create a minimal workspace structure so ci.sh doesn't bail
    mkdir -p "$_ci_dir/lib" "$_ci_dir/config"
    # Symlink library files instead of copying: eliminates ~25 file copies
    # per test (the dominant cost under PRoot's slow filesystem). Tests that
    # create NEW files in lib/ (e.g. test_portable_shell.sh's evil_test.sh)
    # write regular files into the symlinked directory; the new files are
    # real, the symlinked originals are read-only references.
    _link_lib_files "$_ci_dir"
    # Copy config files (not symlinks): tests write fixtures to them.
    _restore_configs "$_ci_dir"
    # Minimal pyproject.toml at workspace root
    echo '[project]' > "$TEST_TMP/workspace/pyproject.toml"
    echo 'name = "workspace"' >> "$TEST_TMP/workspace/pyproject.toml"
    echo 'version = "0.0.0"' >> "$TEST_TMP/workspace/pyproject.toml"
    # Symlink the real .venv/ so ci_check_silent_swallow's e2e tests can
    # find bin/python (the classifier requires a working interpreter).
    ln -s "$PROJECT_DIR/.venv" "$_ci_dir/.venv"
}

_teardown_tmpdir() {
    # No-op: tmpdir is reused across tests. Cleaned in _setup_tmpdir
    # on the next call. Final cleanup happens when the script exits.
    :
}

# Final cleanup: remove the shared tmpdir at end of test suite.
_final_cleanup() {
    if [[ -n "${TEST_TMP:-}" && -d "${TEST_TMP:-}" ]]; then
        rm -rf "$TEST_TMP" 2>/dev/null
    fi
}
trap '_final_cleanup' EXIT

_assert_eq() {
    local expected="$1" actual="$2" msg="${3:-}"
    if [[ "$expected" != "$actual" ]]; then
        echo "  ASSERTION FAILED: expected='$expected' actual='$actual' $msg"
        return 1
    fi
}

_run_test() {
    local name="$1"
    shift
    _TESTS_RUN=$((_TESTS_RUN + 1))

    _setup_tmpdir

    local rc=0
    "$@" > "$TEST_TMP/stdout" 2>"$TEST_TMP/stderr" || rc=$?

    if [[ $rc -eq 0 ]]; then
        _TESTS_PASSED=$((_TESTS_PASSED + 1))
        echo -e "  \033[32mPASS\033[0m $name"
    else
        _TESTS_FAILED=$((_TESTS_FAILED + 1))
        _FAILURES+=("$name")
        echo -e "  \033[31mFAIL\033[0m $name"
        # Show stdout and stderr on failure
        sed 's/^/    | /' "$TEST_TMP/stdout"
        sed 's/^/    | /' "$TEST_TMP/stderr"
    fi

    _teardown_tmpdir
}

# Helper: source checks.sh from the fake workspace
_source_lib() {
    cd "$TEST_TMP/workspace/projects/WORKSPACE-CI"
    # Re-initialize git so ci_file_list works
    if [[ ! -d ".git" ]]; then
        git init -q .
    fi
    # Unit tests must not inherit CI path env from the host shell (hooks export these).
    unset CI_CONFIG_DIR CI_PROJECT_ROOT CI_LIB_DIR CI_SCAN_ROOT
    unset CI_CONFIG_OVERRIDES WORKSPACE_CI_CONFIG_ROOT
    unset CI_GUARD_CONFIG_OVERRIDES WORKSPACE_GUARD_CONFIG_ROOT
    source lib/checks.sh
    _stub_exemption_provenance
}

# _stub_exemption_provenance: neutralize the root-owned + immutable
# provenance gate for tests. Tmp-workspace config files are symlinks/copies
# owned by the test user, so they can never satisfy it. Mirrors the
# monkeypatch fixtures used by the python unit tests. No shell test asserts
# provenance behavior. Must be re-applied after every `source lib/checks.sh`.
_stub_exemption_provenance() {
    ci_validate_exemption_file() { return 0; }

    # Same stub for python checker subprocesses: auto-imported sitecustomize
    # patches ci.paths.validate_exemption_file when ci is importable.
    local _site="$TEST_TMP/testsite"
    if [[ ! -f "$_site/sitecustomize.py" ]]; then
        mkdir -p "$_site"
        cat > "$_site/sitecustomize.py" <<'EOF'
try:
    import ci.paths as _ci_paths
except ImportError:
    _ci_paths = None

if _ci_paths is not None:

    def _validate_exemption_file_noop(path, description="exemption file"):
        return None

    _ci_paths.validate_exemption_file = _validate_exemption_file_noop
EOF
    fi
    export PYTHONPATH="$_site${PYTHONPATH:+:$PYTHONPATH}"
}

# _make_mock_dangle <bindir> <fixture_file> [exit_code] [stderr_msg]
#   Creates a fake `dangle` binary in <bindir> that:
#     - cats <fixture_file> to stdout (nothing if file missing/empty)
#     - echoes <stderr_msg> to stderr if provided
#     - exits with <exit_code> (default 0)
#   The fixture path must be absolute. Ensures <bindir> exists.
_make_mock_dangle() {
    local _mmd_bindir="$1" _mmd_fixture="$2" _mmd_rc="${3:-0}" _mmd_err="${4:-}"
    mkdir -p "$_mmd_bindir"
    cat > "$_mmd_bindir/dangle" <<MOCK_EOF
#!/usr/bin/env bash
${_mmd_err:+echo "$_mmd_err" >&2}
cat "$_mmd_fixture" 2>/dev/null
exit $_mmd_rc
MOCK_EOF
    chmod +x "$_mmd_bindir/dangle"
}
