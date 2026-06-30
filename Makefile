# workspace-ci Makefile
# Aliases for all CI operations.

SHELL := /bin/bash
.DEFAULT_GOAL := help

UV := uv
RUFF := $(UV) run ruff
PYTEST := $(UV) run pytest

# Contract compliance
-include lib/makefile_contract.mk

# =============================================================================
# Help
# =============================================================================

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
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
preflight: ## Verify environment
	@command -v uv > /dev/null 2>&1 || { echo "ERROR: uv not found"; exit 1; }
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
install-deps: install-python-deps install-gitleaks ## Install python .venv deps + bootstrap binaries

.PHONY: install-python-deps
install-python-deps: ## uv sync the Python deps (project-level .venv)
	$(UV) sync --extra dev

.PHONY: install-gitleaks
install-gitleaks: ## Bootstrap the gitleaks binary used by the secret-content scanner
	bash scripts/bootstrap-gitleaks

.PHONY: install-hooks
install-hooks: ## (Re)generate native git hooks
	@if [ -f scripts/cleanup-precommit ]; then bash scripts/cleanup-precommit; else echo "[INFO] cleanup-precommit not found, continuing" >&2; fi
	bash scripts/generate-hooks

.PHONY: sync
sync: ## Sync .venv deps + reinstall hooks
	$(UV) sync --extra dev
	$(MAKE) install-hooks

# =============================================================================
# Quality Gates
# =============================================================================

# Public contract targets — delegate to moon for graph-aware caching.
# Implementation bodies live under private _<target>-impl: targets so
# the moon command field can invoke them directly without recursing
# back through the public shim. INCIDENT-prevention: `make X` shimming
# to `moon run :X` whose command is `make X` would infinite-loop.
# Resolution: moon calls _<target>-impl, public target shims to moon.

.PHONY: check
check: ## Run all quality gates (lint + type-check + test)
	@$(MAKE) _lint-impl && $(MAKE) _type-check-impl && $(MAKE) _test-impl

.PHONY: lint
lint: ## Run ruff format + lint on ci/
	@$(MAKE) _lint-impl

.PHONY: type-check
type-check: ## Run mypy on ci/
	@$(MAKE) _type-check-impl

.PHONY: test
test: ## Run all tests (shell + Python)
	@$(MAKE) _test-impl

# Private implementation targets — invoked by moon's command: field.
# Not part of the contract; do not call directly from CI.

.PHONY: _lint-impl
_lint-impl:
	$(RUFF) format ci/ --config ruff.toml
	$(RUFF) check --fix ci/ --config ruff.toml

.PHONY: _type-check-impl
_type-check-impl:
	$(UV) run mypy ci/

.PHONY: _test-impl
_test-impl:
	./tests/run_tests.sh
	$(PYTEST) tests/ -v --timeout=30

# Convenience targets for selective test runs (not part of the moon
# DAG; call directly when you want to run only one half).
.PHONY: test-shell
test-shell: ## Run shell tests only (no moon caching)
	./tests/run_tests.sh

.PHONY: test-python
test-python: ## Run Python tests only (no moon caching)
	$(PYTEST) tests/ -v --timeout=30

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

# =============================================================================
# WORKSPACE-GUARD — compiled git protection (opt-in)
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
