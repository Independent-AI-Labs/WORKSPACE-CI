# CI tests: check_init_files, verify_coverage
# Sourced by run_tests.sh, requires test_helpers.sh loaded first.

# =========================================================================
# ci_check_init_files tests
# =========================================================================
echo ""
echo "=== ci_check_init_files tests ==="

test_init_empty_passes() {
    _source_lib
    touch __init__.py
    ci_check_init_files __init__.py
}
_run_test "init_files: empty file passes" test_init_empty_passes

test_init_imports_fail() {
    _source_lib
    cat > __init__.py <<'EOF'
import os
from pathlib import Path

__all__ = ["something"]
__version__ = "1.0.0"
EOF
    ! ci_check_init_files __init__.py
}
_run_test "init_files: imports + dunders blocked" test_init_imports_fail

test_init_function_fails() {
    _source_lib
    cat > __init__.py <<'EOF'
def setup():
    pass
EOF
    ! ci_check_init_files __init__.py
}
_run_test "init_files: function def blocked" test_init_function_fails

test_init_class_fails() {
    _source_lib
    cat > __init__.py <<'EOF'
class Foo:
    pass
EOF
    ! ci_check_init_files __init__.py
}
_run_test "init_files: class def blocked" test_init_class_fails

test_init_assignment_fails() {
    _source_lib
    cat > __init__.py <<'EOF'
registry = {}
EOF
    ! ci_check_init_files __init__.py
}
_run_test "init_files: variable assignment blocked" test_init_assignment_fails

test_init_non_init_skipped() {
    _source_lib
    cat > main.py <<'EOF'
def main():
    pass
EOF
    ci_check_init_files main.py
}
_run_test "init_files: non-init file skipped" test_init_non_init_skipped

test_init_comments_fail() {
    _source_lib
    cat > __init__.py <<'EOF'
# This is a comment
# Another comment
EOF
    ! ci_check_init_files __init__.py
}
_run_test "init_files: comments blocked" test_init_comments_fail

test_init_if_block_fails() {
    _source_lib
    cat > __init__.py <<'EOF'
if True:
    x = 1
EOF
    ! ci_check_init_files __init__.py
}
_run_test "init_files: if block blocked" test_init_if_block_fails
