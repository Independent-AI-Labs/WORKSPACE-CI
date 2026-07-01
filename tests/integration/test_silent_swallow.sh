# CI tests: ci_check_silent_swallow
# Sourced by run_tests.sh, requires test_helpers.sh loaded first.

echo ""
echo "=== ci_check_silent_swallow tests ==="

# ---------------------------------------------------------------------------
# _setup_silent_repo: build a fresh git repo with one initial commit, then
# leave the caller a clean tree to stage new content into.
# ---------------------------------------------------------------------------
_setup_silent_repo() {
    cd "$TEST_TMP/workspace/projects/CI"
    if [[ ! -d ".git" ]]; then
        git init -q .
        git config user.email "test@example.com"
        git config user.name "test"
        git add -A 2>/dev/null
        git commit -q -m "init" --allow-empty
    fi
    source lib/checks.sh
}

# Helper: invoke check_silent_swallow.py directly with a synthesised diff
# (so we can test patterns without needing a real git stage).
_run_silent_py() {
    "$PROJECT_DIR/.venv/bin/python" "$LIB_DIR/check_silent_swallow.py"
}

# ---------------------------------------------------------------------------
# Direct unit tests against the python helper (synthesised diffs).
# ---------------------------------------------------------------------------
test_silent_py_except_pass_blocked() {
    _setup_silent_repo
    local out rc=0
    out="$(printf 'diff --git a/x.py b/x.py\n--- a/x.py\n+++ b/x.py\n@@ -0,0 +1,4 @@\n+try:\n+    foo()\n+except Exception:\n+    pass\n' | _run_silent_py)" || rc=$?
    [[ $rc -ne 0 ]] || { echo "expected nonzero rc, got 0; out=$out"; return 1; }
    echo "$out" | grep -q 'py-except-' || { echo "no py-except violation in output: $out"; return 1; }
}
_run_test "silent: python except+pass blocked" test_silent_py_except_pass_blocked

test_silent_py_except_pass_allowed_with_marker() {
    _setup_silent_repo
    local rc=0
    printf 'diff --git a/x.py b/x.py\n--- a/x.py\n+++ b/x.py\n@@ -0,0 +1,4 @@\n+try:\n+    foo()\n+except Exception:  # silent-ok: tested\n+    pass\n' | _run_silent_py >/dev/null || rc=$?
    [[ $rc -ne 0 ]] || { echo "expected nonzero rc, got 0"; return 1; }
}
_run_test "silent: silent-ok no longer exempts python except" test_silent_py_except_pass_allowed_with_marker

test_silent_py_inline_except_pass_blocked() {
    _setup_silent_repo
    local rc=0
    printf 'diff --git a/x.py b/x.py\n--- a/x.py\n+++ b/x.py\n@@ -0,0 +1,1 @@\n+except Exception: pass\n' | _run_silent_py >/dev/null || rc=$?
    [[ $rc -ne 0 ]] || { echo "expected nonzero rc"; return 1; }
}
_run_test "silent: inline 'except: pass' blocked" test_silent_py_inline_except_pass_blocked

test_silent_py_contextlib_suppress_blocked() {
    _setup_silent_repo
    local rc=0
    printf 'diff --git a/x.py b/x.py\n--- a/x.py\n+++ b/x.py\n@@ -0,0 +1,2 @@\n+import contextlib\n+with contextlib.suppress(Exception):\n' | _run_silent_py >/dev/null || rc=$?
    [[ $rc -ne 0 ]] || { echo "expected nonzero rc"; return 1; }
}
_run_test "silent: contextlib.suppress blocked" test_silent_py_contextlib_suppress_blocked

test_silent_py_from_import_suppress_blocked() {
    _setup_silent_repo
    local rc=0
    printf 'diff --git a/x.py b/x.py\n--- a/x.py\n+++ b/x.py\n@@ -0,0 +1,1 @@\n+from contextlib import suppress\n' | _run_silent_py >/dev/null || rc=$?
    [[ $rc -ne 0 ]] || { echo "expected nonzero rc"; return 1; }
}
_run_test "silent: 'from contextlib import suppress' blocked" test_silent_py_from_import_suppress_blocked

test_silent_py_except_ellipsis_blocked() {
    _setup_silent_repo
    local rc=0
    printf 'diff --git a/x.py b/x.py\n--- a/x.py\n+++ b/x.py\n@@ -0,0 +1,1 @@\n+except Exception: ...\n' | _run_silent_py >/dev/null || rc=$?
    [[ $rc -ne 0 ]] || { echo "expected nonzero rc"; return 1; }
}
_run_test "silent: 'except: ...' blocked" test_silent_py_except_ellipsis_blocked

test_silent_js_empty_catch_blocked() {
    _setup_silent_repo
    local rc=0
    printf 'diff --git a/x.ts b/x.ts\n--- a/x.ts\n+++ b/x.ts\n@@ -0,0 +1,1 @@\n+try { foo(); } catch (e) {}\n' | _run_silent_py >/dev/null || rc=$?
    [[ $rc -ne 0 ]] || { echo "expected nonzero rc"; return 1; }
}
_run_test "silent: JS empty catch block blocked" test_silent_js_empty_catch_blocked

test_silent_js_empty_arrow_catch_blocked() {
    _setup_silent_repo
    local rc=0
    printf 'diff --git a/x.ts b/x.ts\n--- a/x.ts\n+++ b/x.ts\n@@ -0,0 +1,1 @@\n+p.catch(() => {})\n' | _run_silent_py >/dev/null || rc=$?
    [[ $rc -ne 0 ]] || { echo "expected nonzero rc"; return 1; }
}
_run_test "silent: JS empty arrow catch blocked" test_silent_js_empty_arrow_catch_blocked

test_silent_js_marker_allows() {
    _setup_silent_repo
    local rc=0
    printf 'diff --git a/x.ts b/x.ts\n--- a/x.ts\n+++ b/x.ts\n@@ -0,0 +1,1 @@\n+try { foo(); } catch (e) {} // silent-ok: optional cleanup\n' | _run_silent_py >/dev/null || rc=$?
    [[ $rc -ne 0 ]] || { echo "expected nonzero rc, got 0"; return 1; }
}
_run_test "silent: JS // silent-ok no longer exempts" test_silent_js_marker_allows

test_silent_js_empty_catch_noparam_blocked() {
    # TS 4.0+ optional binding: `catch {}` (no parameter) is just as silent as catch (e) {}.
    _setup_silent_repo
    local rc=0
    printf 'diff --git a/x.ts b/x.ts\n--- a/x.ts\n+++ b/x.ts\n@@ -0,0 +1,1 @@\n+try { foo(); } catch {}\n' | _run_silent_py >/dev/null || rc=$?
    [[ $rc -ne 0 ]] || { echo "expected nonzero rc (catch without binding)"; return 1; }
}
_run_test "silent: JS 'catch {}' no-binding blocked" test_silent_js_empty_catch_noparam_blocked

test_silent_js_comment_only_catch_blocked() {
    _setup_silent_repo
    local rc=0
    printf 'diff --git a/x.ts b/x.ts\n--- a/x.ts\n+++ b/x.ts\n@@ -0,0 +1,1 @@\n+try { foo(); } catch (e) { /* nothing */ }\n' | _run_silent_py >/dev/null || rc=$?
    [[ $rc -ne 0 ]] || { echo "expected nonzero rc (comment-only catch body)"; return 1; }
}
_run_test "silent: JS 'catch (e) { /* x */ }' comment-only blocked" test_silent_js_comment_only_catch_blocked

test_silent_js_catch_returns_null_blocked() {
    _setup_silent_repo
    local rc=0
    printf 'diff --git a/x.ts b/x.ts\n--- a/x.ts\n+++ b/x.ts\n@@ -0,0 +1,1 @@\n+const v = await foo().catch(() => null);\n' | _run_silent_py >/dev/null || rc=$?
    [[ $rc -ne 0 ]] || { echo "expected nonzero rc ('.catch(() => null)' masks failure)"; return 1; }
}
_run_test "silent: JS '.catch(() => null)' blocked" test_silent_js_catch_returns_null_blocked

test_silent_js_catch_returns_undefined_blocked() {
    _setup_silent_repo
    local rc=0
    printf 'diff --git a/x.ts b/x.ts\n--- a/x.ts\n+++ b/x.ts\n@@ -0,0 +1,1 @@\n+const v = await foo().catch(_ => undefined);\n' | _run_silent_py >/dev/null || rc=$?
    [[ $rc -ne 0 ]] || { echo "expected nonzero rc ('.catch(_ => undefined)' masks failure)"; return 1; }
}
_run_test "silent: JS '.catch(_ => undefined)' blocked" test_silent_js_catch_returns_undefined_blocked

test_silent_js_catch_returns_void_zero_blocked() {
    _setup_silent_repo
    local rc=0
    printf 'diff --git a/x.ts b/x.ts\n--- a/x.ts\n+++ b/x.ts\n@@ -0,0 +1,1 @@\n+await foo().catch(e => void 0);\n' | _run_silent_py >/dev/null || rc=$?
    [[ $rc -ne 0 ]] || { echo "expected nonzero rc ('.catch(e => void 0)' masks failure)"; return 1; }
}
_run_test "silent: JS '.catch(e => void 0)' blocked" test_silent_js_catch_returns_void_zero_blocked

test_silent_js_catch_with_real_handler_passes() {
    _setup_silent_repo
    local rc=0
    printf 'diff --git a/x.ts b/x.ts\n--- a/x.ts\n+++ b/x.ts\n@@ -0,0 +1,1 @@\n+await foo().catch(e => log.error(e));\n' | _run_silent_py >/dev/null || rc=$?
    [[ $rc -eq 0 ]] || { echo "expected rc=0 (real handler is fine)"; return 1; }
}
_run_test "silent: JS '.catch(e => log.error(e))' passes" test_silent_js_catch_with_real_handler_passes

test_silent_sh_pipe_true_blocked() {
    _setup_silent_repo
    local rc=0
    printf 'diff --git a/x.sh b/x.sh\n--- a/x.sh\n+++ b/x.sh\n@@ -0,0 +1,1 @@\n+rm something || true\n' | _run_silent_py >/dev/null || rc=$?
    [[ $rc -ne 0 ]] || { echo "expected nonzero rc"; return 1; }
}
_run_test "silent: shell '|| true' blocked" test_silent_sh_pipe_true_blocked

test_silent_sh_pipe_colon_blocked() {
    _setup_silent_repo
    local rc=0
    printf 'diff --git a/x.sh b/x.sh\n--- a/x.sh\n+++ b/x.sh\n@@ -0,0 +1,1 @@\n+rm something || :\n' | _run_silent_py >/dev/null || rc=$?
    [[ $rc -ne 0 ]] || { echo "expected nonzero rc"; return 1; }
}
_run_test "silent: shell '|| :' blocked" test_silent_sh_pipe_colon_blocked

test_silent_sh_marker_allows() {
    _setup_silent_repo
    local rc=0
    printf 'diff --git a/x.sh b/x.sh\n--- a/x.sh\n+++ b/x.sh\n@@ -0,0 +1,1 @@\n+rm /tmp/foo || true # silent-ok: best-effort cleanup\n' | _run_silent_py >/dev/null || rc=$?
    [[ $rc -ne 0 ]] || { echo "expected nonzero rc, got 0"; return 1; }
}
_run_test "silent: shell silent-ok no longer exempts" test_silent_sh_marker_allows

test_silent_sh_devnull_no_fallback_blocked() {  # silent-ok: 2>/dev/null appears in the test fixture diff payload below
    _setup_silent_repo
    local rc=0
    printf 'diff --git a/x.sh b/x.sh\n--- a/x.sh\n+++ b/x.sh\n@@ -0,0 +1,1 @@\n+somecmd 2>/dev/null\n' | _run_silent_py >/dev/null || rc=$?  # silent-ok: 2>/dev/null is inside the printf fixture string
    [[ $rc -ne 0 ]] || { echo "expected nonzero rc"; return 1; }
}
_run_test "silent: shell '2>/dev/null' without fallback blocked" test_silent_sh_devnull_no_fallback_blocked  # silent-ok: name describes the fixture pattern

test_silent_sh_devnull_with_fallback_blocked() {
    _setup_silent_repo
    local rc=0
    printf 'diff --git a/x.sh b/x.sh\n--- a/x.sh\n+++ b/x.sh\n@@ -0,0 +1,1 @@\n+somecmd 2>/dev/null || echo "missing"\n' | _run_silent_py >/dev/null || rc=$?
    [[ $rc -ne 0 ]] || { echo "expected nonzero rc (devnull + ||echo fallback both blocked)"; return 1; }
}
_run_test "silent: shell 2>/dev/null||echo fallback blocked" test_silent_sh_devnull_with_fallback_blocked

test_silent_sh_pipefail_mask_tail_blocked() {
    _setup_silent_repo
    local rc=0
    printf 'diff --git a/x.sh b/x.sh\n--- a/x.sh\n+++ b/x.sh\n@@ -0,0 +1,1 @@\n+somecmd 2>&1 | tail -1\n' | _run_silent_py >/dev/null || rc=$?
    [[ $rc -ne 0 ]] || { echo "expected nonzero rc (pipe rc = tail rc, masks upstream)"; return 1; }
}
_run_test "silent: shell '| tail -1' pipe rc-mask blocked" test_silent_sh_pipefail_mask_tail_blocked  # silent-ok: test name describes the fixture pattern

test_silent_sh_pipefail_mask_head_blocked() {
    _setup_silent_repo
    local rc=0
    printf 'diff --git a/x.sh b/x.sh\n--- a/x.sh\n+++ b/x.sh\n@@ -0,0 +1,1 @@\n+somecmd 2>&1 | head -1\n' | _run_silent_py >/dev/null || rc=$?
    [[ $rc -ne 0 ]] || { echo "expected nonzero rc"; return 1; }
}
_run_test "silent: shell '| head -1' pipe rc-mask blocked" test_silent_sh_pipefail_mask_head_blocked  # silent-ok: test name describes the fixture pattern

test_silent_sh_pipefail_mask_true_blocked() {
    _setup_silent_repo
    local rc=0
    printf 'diff --git a/x.sh b/x.sh\n--- a/x.sh\n+++ b/x.sh\n@@ -0,0 +1,1 @@\n+somecmd | true\n' | _run_silent_py >/dev/null || rc=$?
    [[ $rc -ne 0 ]] || { echo "expected nonzero rc (| true is the most blatant mask)"; return 1; }  # silent-ok: error message describes the fixture
}
_run_test "silent: shell '| true' pipe rc-mask blocked" test_silent_sh_pipefail_mask_true_blocked  # silent-ok: test name describes the fixture pattern

test_silent_sh_pipefail_real_consumer_passes() {
    # `| jq .` is a real consumer; we don't blanket-flag every pipe.
    _setup_silent_repo
    local rc=0
    printf 'diff --git a/x.sh b/x.sh\n--- a/x.sh\n+++ b/x.sh\n@@ -0,0 +1,1 @@\n+somecmd | jq .\n' | _run_silent_py >/dev/null || rc=$?
    [[ $rc -eq 0 ]] || { echo "expected rc=0 (real consumer)"; return 1; }
}
_run_test "silent: shell '| jq' real-consumer passes" test_silent_sh_pipefail_real_consumer_passes

test_silent_sh_pipe_true_continuation_blocked() {
    # `cmd \\\n    true` -- backslash line continuation is functionally `cmd || true`.  # silent-ok: doc comment refers to the fixture
    _setup_silent_repo
    local rc=0
    printf 'diff --git a/x.sh b/x.sh\n--- a/x.sh\n+++ b/x.sh\n@@ -0,0 +1,2 @@\n+rm something ||\\\n+    true\n' | _run_silent_py >/dev/null || rc=$?
    [[ $rc -ne 0 ]] || { echo "expected nonzero rc (line-continuation '|| true')"; return 1; }  # silent-ok: error message describes the fixture
}
_run_test "silent: shell '|| \\\\' continuation blocked" test_silent_sh_pipe_true_continuation_blocked

test_silent_cron_devnull_double_redirect_blocked() {
    # The double-devnull pattern: `>> /dev/null 2>&1` looks like a log redirect, isn't.
    _setup_silent_repo
    local rc=0
    printf 'diff --git a/foo.cron b/foo.cron\n--- a/foo.cron\n+++ b/foo.cron\n@@ -0,0 +1,1 @@\n+*/5 * * * * /usr/bin/run-task.sh >> /dev/null 2>&1\n' | _run_silent_py >/dev/null || rc=$?
    [[ $rc -ne 0 ]] || { echo "expected nonzero rc (>> /dev/null is not a real log target)"; return 1; }
}
_run_test "silent: cron '>> /dev/null' (double-devnull pattern) blocked" test_silent_cron_devnull_double_redirect_blocked

test_silent_cron_devnull_single_redirect_blocked() {
    _setup_silent_repo
    local rc=0
    printf 'diff --git a/foo.cron b/foo.cron\n--- a/foo.cron\n+++ b/foo.cron\n@@ -0,0 +1,1 @@\n+*/5 * * * * /usr/bin/run-task.sh > /dev/null 2>&1\n' | _run_silent_py >/dev/null || rc=$?
    [[ $rc -ne 0 ]] || { echo "expected nonzero rc"; return 1; }
}
_run_test "silent: cron '> /dev/null 2>&1' blocked" test_silent_cron_devnull_single_redirect_blocked

test_silent_cron_devnull_no_space_blocked() {
    _setup_silent_repo
    local rc=0
    printf 'diff --git a/foo.cron b/foo.cron\n--- a/foo.cron\n+++ b/foo.cron\n@@ -0,0 +1,1 @@\n+*/5 * * * * /usr/bin/run-task.sh >>/dev/null 2>&1\n' | _run_silent_py >/dev/null || rc=$?
    [[ $rc -ne 0 ]] || { echo "expected nonzero rc"; return 1; }
}
_run_test "silent: cron '>>/dev/null' (no space) blocked" test_silent_cron_devnull_no_space_blocked

test_silent_cron_no_redirect_blocked() {
    _setup_silent_repo
    local rc=0
    printf 'diff --git a/foo.cron b/foo.cron\n--- a/foo.cron\n+++ b/foo.cron\n@@ -0,0 +1,1 @@\n+*/5 * * * * /usr/bin/run-task.sh\n' | _run_silent_py >/dev/null || rc=$?
    [[ $rc -ne 0 ]] || { echo "expected nonzero rc"; return 1; }
}
_run_test "silent: cron line without log redirect blocked" test_silent_cron_no_redirect_blocked

test_silent_cron_with_redirect_passes() {
    _setup_silent_repo
    local rc=0
    printf 'diff --git a/foo.cron b/foo.cron\n--- a/foo.cron\n+++ b/foo.cron\n@@ -0,0 +1,1 @@\n+*/5 * * * * /usr/bin/run-task.sh >> /var/log/task.log 2>&1\n' | _run_silent_py >/dev/null || rc=$?
    [[ $rc -eq 0 ]] || { echo "expected rc=0 (has >>)"; return 1; }
}
_run_test "silent: cron with >> redirect allowed" test_silent_cron_with_redirect_passes

test_silent_cron_with_systemd_cat_passes() {
    _setup_silent_repo
    local rc=0
    printf 'diff --git a/foo.cron b/foo.cron\n--- a/foo.cron\n+++ b/foo.cron\n@@ -0,0 +1,1 @@\n+*/5 * * * * /usr/bin/run-task.sh | systemd-cat -t mytask\n' | _run_silent_py >/dev/null || rc=$?
    [[ $rc -eq 0 ]] || { echo "expected rc=0 (systemd-cat)"; return 1; }
}
_run_test "silent: cron with systemd-cat allowed" test_silent_cron_with_systemd_cat_passes

test_silent_cron_env_lines_skipped() {
    _setup_silent_repo
    local rc=0
    printf 'diff --git a/foo.cron b/foo.cron\n--- a/foo.cron\n+++ b/foo.cron\n@@ -0,0 +1,4 @@\n+SHELL=/bin/bash\n+PATH=/usr/bin:/bin\n+MAILTO=ops@example.com\n+# regular comment\n' | _run_silent_py >/dev/null || rc=$?
    [[ $rc -eq 0 ]] || { echo "expected rc=0 (env lines)"; return 1; }
}
_run_test "silent: cron env/comment lines skipped" test_silent_cron_env_lines_skipped

# ---------------------------------------------------------------------------
# End-to-end: the actual `ci_check_silent_swallow` bash function via a real
# git stage.
# ---------------------------------------------------------------------------
test_silent_e2e_blocks_staged_violation() {
    _setup_silent_repo
    cat > bad.py <<'EOF'
def f():
    try:
        foo()
    except Exception:
        pass
EOF
    git add bad.py
    ! ci_check_silent_swallow
}
_run_test "silent: e2e blocks staged python silent except" test_silent_e2e_blocks_staged_violation

test_silent_e2e_passes_with_clean_diff() {
    _setup_silent_repo
    cat > clean.py <<'EOF'
def f():
    return 1 + 2
EOF
    git add clean.py
    ci_check_silent_swallow
}
_run_test "silent: e2e passes with clean diff" test_silent_e2e_passes_with_clean_diff

test_silent_py_except_debug_only_blocked() {
    _setup_silent_repo
    local rc=0
    printf 'diff --git a/x.py b/x.py\n--- a/x.py\n+++ b/x.py\n@@ -0,0 +1,2 @@\n+except Exception as e:\n+    logger.debug(e)\n' | _run_silent_py >/dev/null || rc=$?
    [[ $rc -ne 0 ]] || { echo "expected nonzero rc (logger.debug-only is silent at WARNING level)"; return 1; }
}
_run_test "silent: 'except: logger.debug(e)' blocked" test_silent_py_except_debug_only_blocked

test_silent_py_except_log_debug_blocked() {
    _setup_silent_repo
    local rc=0
    printf 'diff --git a/x.py b/x.py\n--- a/x.py\n+++ b/x.py\n@@ -0,0 +1,2 @@\n+except Exception as e:\n+    log.debug(f"oops: {e}")\n' | _run_silent_py >/dev/null || rc=$?
    [[ $rc -ne 0 ]] || { echo "expected nonzero rc (log.debug-only)"; return 1; }
}
_run_test "silent: 'except: log.debug(...)' blocked" test_silent_py_except_log_debug_blocked

test_silent_py_except_self_logger_debug_blocked() {
    _setup_silent_repo
    local rc=0
    printf 'diff --git a/x.py b/x.py\n--- a/x.py\n+++ b/x.py\n@@ -0,0 +1,2 @@\n+except Exception as e:\n+    self.logger.debug(e)\n' | _run_silent_py >/dev/null || rc=$?
    [[ $rc -ne 0 ]] || { echo "expected nonzero rc (self.logger.debug-only)"; return 1; }
}
_run_test "silent: 'except: self.logger.debug(e)' blocked" test_silent_py_except_self_logger_debug_blocked

test_silent_py_except_debug_then_raise_passes() {
    # Multi-statement body: log.debug followed by `raise` is fine.
    _setup_silent_repo
    local rc=0
    printf 'diff --git a/x.py b/x.py\n--- a/x.py\n+++ b/x.py\n@@ -0,0 +1,3 @@\n+except Exception as e:\n+    log.debug(e)\n+    raise\n' | _run_silent_py >/dev/null || rc=$?
    [[ $rc -eq 0 ]] || { echo "expected rc=0 (real re-raise after log)"; return 1; }
}
_run_test "silent: multi-stmt except (debug + raise) passes" test_silent_py_except_debug_then_raise_passes

test_silent_py_except_raise_no_from_blocked() {
    _setup_silent_repo
    local rc=0
    printf 'diff --git a/x.py b/x.py\n--- a/x.py\n+++ b/x.py\n@@ -0,0 +1,2 @@\n+except Exception:\n+    raise RuntimeError("bad")\n' | _run_silent_py >/dev/null || rc=$?
    [[ $rc -ne 0 ]] || { echo "expected nonzero rc (raise X without 'from e' loses traceback)"; return 1; }
}
_run_test "silent: 'except: raise X(...)' (no 'from e') blocked" test_silent_py_except_raise_no_from_blocked

test_silent_py_except_raise_from_none_blocked() {
    _setup_silent_repo
    local rc=0
    printf 'diff --git a/x.py b/x.py\n--- a/x.py\n+++ b/x.py\n@@ -0,0 +1,2 @@\n+except Exception:\n+    raise RuntimeError("bad") from None\n' | _run_silent_py >/dev/null || rc=$?
    [[ $rc -ne 0 ]] || { echo "expected nonzero rc ('from None' explicitly drops chain)"; return 1; }
}
_run_test "silent: 'except: raise X(...) from None' blocked" test_silent_py_except_raise_from_none_blocked

test_silent_py_except_raise_from_e_passes() {
    _setup_silent_repo
    local rc=0
    printf 'diff --git a/x.py b/x.py\n--- a/x.py\n+++ b/x.py\n@@ -0,0 +1,2 @@\n+except Exception as e:\n+    raise RuntimeError("bad") from e\n' | _run_silent_py >/dev/null || rc=$?
    [[ $rc -eq 0 ]] || { echo "expected rc=0 ('from e' preserves chain)"; return 1; }
}
_run_test "silent: 'except: raise X(...) from e' passes" test_silent_py_except_raise_from_e_passes

test_silent_py_except_bare_reraise_passes() {
    _setup_silent_repo
    local rc=0
    printf 'diff --git a/x.py b/x.py\n--- a/x.py\n+++ b/x.py\n@@ -0,0 +1,2 @@\n+except Exception:\n+    raise\n' | _run_silent_py >/dev/null || rc=$?
    [[ $rc -eq 0 ]] || { echo "expected rc=0 (bare 'raise' re-raises)"; return 1; }
}
_run_test "silent: 'except: raise' (bare) passes" test_silent_py_except_bare_reraise_passes

test_silent_py_except_sys_exit_zero_blocked() {
    _setup_silent_repo
    local rc=0
    printf 'diff --git a/x.py b/x.py\n--- a/x.py\n+++ b/x.py\n@@ -0,0 +1,2 @@\n+except Exception:\n+    sys.exit(0)\n' | _run_silent_py >/dev/null || rc=$?
    [[ $rc -ne 0 ]] || { echo "expected nonzero rc (sys.exit(0) silently terminates)"; return 1; }
}
_run_test "silent: 'except: sys.exit(0)' blocked" test_silent_py_except_sys_exit_zero_blocked

test_silent_py_except_os_exit_zero_blocked() {
    _setup_silent_repo
    local rc=0
    printf 'diff --git a/x.py b/x.py\n--- a/x.py\n+++ b/x.py\n@@ -0,0 +1,2 @@\n+except Exception:\n+    os._exit(0)\n' | _run_silent_py >/dev/null || rc=$?
    [[ $rc -ne 0 ]] || { echo "expected nonzero rc (os._exit(0) silently terminates)"; return 1; }
}
_run_test "silent: 'except: os._exit(0)' blocked" test_silent_py_except_os_exit_zero_blocked

test_silent_py_subprocess_check_false_blocked() {
    _setup_silent_repo
    local rc=0
    printf 'diff --git a/x.py b/x.py\n--- a/x.py\n+++ b/x.py\n@@ -0,0 +1,1 @@\n+r = subprocess.run(cmd, check=False)\n' | _run_silent_py >/dev/null || rc=$?
    [[ $rc -ne 0 ]] || { echo "expected nonzero rc (check=False masks failure)"; return 1; }
}
_run_test "silent: 'subprocess.run(check=False)' blocked" test_silent_py_subprocess_check_false_blocked

test_silent_py_subprocess_check_true_passes() {
    _setup_silent_repo
    local rc=0
    printf 'diff --git a/x.py b/x.py\n--- a/x.py\n+++ b/x.py\n@@ -0,0 +1,1 @@\n+r = subprocess.run(cmd, check=True)\n' | _run_silent_py >/dev/null || rc=$?
    [[ $rc -eq 0 ]] || { echo "expected rc=0 (check=True raises on nonzero)"; return 1; }
}
_run_test "silent: 'subprocess.run(check=True)' passes" test_silent_py_subprocess_check_true_passes
