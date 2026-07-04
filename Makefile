# workspace-ci Makefile
# Aliases for all CI operations.

SHELL := /bin/bash
.DEFAULT_GOAL := help

# uv is used for dependency installation (uv sync). Verification tools
# (ruff, pytest, mypy) are invoked directly from .venv/bin per AGENTS.md §4.1.
UV := uv
RUFF := .venv/bin/ruff
PYTEST := .venv/bin/python -m pytest
MYPY := .venv/bin/mypy

# .boot-linux/bin/ holds bootstrapped tools (uv, cargo, rustup, gitleaks).
# After `make install` creates it, prepend to PATH so make targets use
# bootstrapped tools, not system-installed ones. Parse-time check: if
# .boot-linux/bin/uv doesn't exist yet (fresh install), PATH is not
# modified: install-python-deps handles it in its recipe.
BOOT_BIN := $(CURDIR)/.boot-linux/bin
ifneq ($(wildcard $(BOOT_BIN)/uv),)
    export PATH := $(BOOT_BIN):$(PATH)
endif

# Contract compliance
-include lib/makefile_contract.mk

# =============================================================================
# Help
# =============================================================================

.PHONY: help
help: ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# =============================================================================
# Setup
# =============================================================================

# sudo is a no-op when already root (containers, CI agents)
SUDO := $(shell if [ "$$EUID" -eq 0 ]; then echo ""; else echo "sudo"; fi)

.PHONY: init
init: ## Install all system-level dependencies (apt packages + Rust toolchain)
	@echo "==> Installing system packages..."
	$(SUDO) apt-get update -qq
	$(SUDO) apt-get install -y --no-install-recommends \
		curl tar ca-certificates \
		libcap2-bin e2fsprogs file \
		build-essential pkg-config
	@echo "==> Installing Rust toolchain (if missing)..."
	@if ! command -v cargo > /dev/null 2>&1; then \
		curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable --profile minimal; \
	fi
	@echo "==> System dependencies installed."

.PHONY: preflight
preflight: ## Verify environment (curl + tar for bootstrapping; uv is bootstrapped by install-boot-tools)
	@command -v curl > /dev/null 2>&1 || { echo "ERROR: curl not found"; exit 1; }
	@command -v tar > /dev/null 2>&1 || { echo "ERROR: tar not found"; exit 1; }
	@bash -c '[ "$${BASH_VERSINFO[0]}" -gt 4 ] || ([ "$${BASH_VERSINFO[0]}" -eq 4 ] && [ "$${BASH_VERSINFO[1]}" -ge 3 ])' \
		|| { echo "ERROR: bash 4.3+ required (nameref support for portable I/O helpers)"; exit 1; }
	@echo "✓ Preflight OK"

.PHONY: install
install: preflight install-deps ## Full install: deps + bootstrap binaries + hooks
	$(MAKE) install-hooks

.PHONY: install-ci
install-ci: preflight install-deps ## CI install: deps + bootstrap binaries, no hooks
	@:

.PHONY: install-deps
install-deps: install-boot-tools install-python-deps install-gitleaks ## Install boot tools + python .venv deps + gitleaks

.PHONY: install-boot-tools
install-boot-tools: ## Bootstrap uv + rust toolchain into .boot-linux/bin/ (idempotent)
	bash scripts/bootstrap-uv
	bash scripts/bootstrap-rust

.PHONY: install-python-deps
install-python-deps: install-boot-tools ## uv sync the Python deps (project-level .venv)
	PATH="$(BOOT_BIN):$$PATH" $(UV) sync --extra dev

.PHONY: install-gitleaks
install-gitleaks: ## Bootstrap the gitleaks binary used by the secret-content scanner
	bash scripts/bootstrap-gitleaks

.PHONY: install-hooks
install-hooks: ## (Re)generate native git hooks
	@if [ -f scripts/cleanup-precommit ]; then bash scripts/cleanup-precommit; else echo "[INFO] cleanup-precommit not found, continuing" >&2; fi
	bash scripts/generate-hooks

.PHONY: sync
sync: ## Sync .venv deps + reinstall hooks
	PATH="$(BOOT_BIN):$$PATH" $(UV) sync --extra dev
	$(MAKE) install-hooks

# =============================================================================
# Quality Gates
# =============================================================================

# Public contract targets: delegate to moon for graph-aware caching.
# Implementation bodies live under private _<target>-impl: targets so
# the moon command field can invoke them directly without recursing
# back through the public shim. INCIDENT-prevention: `make X` shimming
# to `moon run :X` whose command is `make X` would infinite-loop.
# Resolution: moon calls _<target>-impl, public target shims to moon.

.PHONY: check
check: ## Run all quality gates (lint + type-check + test)
	@$(MAKE) _lint-impl && $(MAKE) _type-check-impl && $(MAKE) _test-impl

.PHONY: lint
lint: ## Runs ruff format and ruff lint with auto-fix on all ci/ modules. Catches style violations, import sorting issues, and unused variables before they reach the remote. Acts as the first stage of the pre-commit quality gate.
	@$(MAKE) _lint-impl

.PHONY: type-check
type-check: ## Runs mypy strict type checking on all ci/ Python modules. Catches type errors, missing annotations, and incompatible signatures before they can break downstream consumers. Acts as the second stage of the pre-commit quality gate after lint passes.
	@$(MAKE) _type-check-impl

.PHONY: test
test: ## Run all tests (shell + Python)
	@$(MAKE) _test-impl

# Private implementation targets: invoked by moon's command: field.
# Not part of the contract; do not call directly from CI.

.PHONY: _lint-impl
_lint-impl:
	$(RUFF) format ci/ --config ruff.toml
	$(RUFF) check --fix ci/ --config ruff.toml

.PHONY: _type-check-impl
_type-check-impl:
	$(MYPY) ci/

.PHONY: _test-impl
_test-impl:
	./tests/run_tests.sh
	$(PYTEST) tests/unit tests/integration -v --timeout=30

# Convenience targets for selective test runs (not part of the moon
# DAG; call directly when you want to run only one half).
.PHONY: test-shell
test-shell: ## Run shell tests only (no moon caching)
	./tests/run_tests.sh

.PHONY: test-python
test-python: ## Run Python tests only (no moon caching)
	$(PYTEST) tests/unit tests/integration -v --timeout=30

# =============================================================================
# Pre-push Quality Gate
# =============================================================================
# Single-pass gate for pre-push hooks: lint + type-check + shell tests +
# pytest with per-suite coverage. Eliminates the previous redundancy where
# run_tests.sh, pytest, and make check each ran the same tests 2-3x.
# The pre-push hook invokes this target directly (see .pre-commit-config.yaml).

.PHONY: check-push
check-push: ## Single-pass pre-push gate running ruff lint, mypy, shell unit tests, and pytest with per-suite coverage in one invocation. Eliminates the previous redundancy where the same tests ran two to three times across separate targets. Fails the push if any lint, type, test, or coverage threshold check does not pass.
	@$(MAKE) _lint-impl && $(MAKE) _type-check-impl && $(MAKE) _test-push-impl

.PHONY: _test-push-impl
_test-push-impl:
	./tests/run_tests_unit.sh
	./tests/run_tests_integration.sh
	$(PYTEST) tests/unit --cov=ci --cov-report=term-missing --cov-fail-under=90 --tb=short -q
	$(PYTEST) tests/integration --cov=ci --cov-report=term-missing --cov-fail-under=5 --tb=short -q

# =============================================================================
# Wiki Dev Server (delegates to web/Makefile; systemd user service on :3001)
# =============================================================================

.PHONY: wiki-dev-start wiki-dev wiki-dev-stop wiki-dev-restart wiki-dev-status wiki-dev-logs
wiki-dev-start: ## Start wiki dev server (Next.js HMR on :3001)
	$(MAKE) -C web dev-start
wiki-dev: wiki-dev-start ## Alias for wiki-dev-start
	@:
wiki-dev-stop: ## Stop wiki dev server
	$(MAKE) -C web dev-stop
wiki-dev-restart: ## Restart wiki dev server (stop + start)
	$(MAKE) -C web dev-restart
wiki-dev-status: ## Show wiki dev server status
	$(MAKE) -C web dev-status
wiki-dev-logs: ## Tail wiki dev server logs
	$(MAKE) -C web dev-logs

# =============================================================================
# Cleanup
# =============================================================================

.PHONY: clean
clean: ## Remove build artifacts
	rm -rf build/ dist/ *.egg-info
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete

.PHONY: clean-precommit
clean-precommit: ## Remove pre-commit framework traces
	bash scripts/cleanup-precommit

# =============================================================================
# Workspace Tools
# =============================================================================

.PHONY: audit
audit: ## Audit workspace repos for CI integration
	bash scripts/audit-workspace

.PHONY: compliance
compliance: ## Deep compliance score for a project (usage: make compliance PROJECT=path)
	bash scripts/compliance-report $${PROJECT:-.}

.PHONY: compliance-all
compliance-all: ## Recursive compliance audit of all repos in workspace
	bash scripts/compliance-report --recursive

.PHONY: rewrite-history
rewrite-history: ## Strip blocked patterns from git history (dangerous)
	bash scripts/rewrite-history

.PHONY: code-stats
code-stats: ## Codebase statistics across the workspace via cloc (lines, files, per-repo, per-language)
	bash scripts/code-stats $(ARGS)

.PHONY: extract-code-stats
extract-code-stats: ## Generate web/src/data/code-stats.json for wiki Project Catalogue badges
	uv run python scripts/extract-code-stats.py

# =============================================================================
# WORKSPACE-GUARD: compiled git protection (opt-in)
# =============================================================================

.PHONY: build-guard install-guard uninstall-guard check-guard

build-guard: ## Build git-guard binary from sibling WORKSPACE-GUARD repo (no root needed)
	bash scripts/bootstrap-workspace-guard build-only

install-guard: ## Install git-guard to /usr/bin/git (requires root, binary must be pre-built)
	$(SUDO) bash scripts/bootstrap-workspace-guard install-only

uninstall-guard: ## Uninstall git-guard, restore original /usr/bin/git (requires root)
	$(SUDO) bash scripts/bootstrap-workspace-guard uninstall

check-guard: ## Check git-guard installation status
	bash scripts/bootstrap-workspace-guard check
