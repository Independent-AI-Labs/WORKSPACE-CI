# workspace-ci Makefile
# Aliases for all CI operations.

.DEFAULT_GOAL := help

# Platform detection. On macOS, prefer Homebrew bash 5.x over /bin/bash
# (3.2) for nameref support (ci_capture_lines / ci_capture_pipe). The
# Homebrew gnubin directories are prepended to PATH so GNU coreutils,
# gnu-sed, and findutils shadow the BSD equivalents. These parse-time
# PATH entries are harmless if Homebrew is not yet installed (directories
# simply don't exist); after `make init` installs Homebrew, subsequent
# make invocations pick them up automatically.
_OS := $(shell uname -s)
_HB_PREFIX := $(if $(wildcard /opt/homebrew),/opt/homebrew,$(if $(wildcard /usr/local),/usr/local))

SHELL := $(if $(wildcard $(_HB_PREFIX)/bin/bash),$(_HB_PREFIX)/bin/bash,/bin/bash)

export PATH := $(_HB_PREFIX)/opt/coreutils/libexec/gnubin:$(_HB_PREFIX)/opt/gnu-sed/libexec/gnubin:$(_HB_PREFIX)/opt/findutils/libexec/gnubin:$(_HB_PREFIX)/bin:$(PATH)

# uv is used for dependency installation (uv sync). Verification tools
# (ruff, pytest, mypy) are invoked directly from .venv/bin per AGENTS.md §4.1.
UV := uv
RUFF := .venv/bin/ruff
PYTEST := .venv/bin/python -m pytest
MYPY := .venv/bin/mypy

# $(BOOT_NAME)/bin/ holds bootstrapped tools (uv, cargo, rustup, gitleaks).
# On macOS BOOT_NAME=.boot-macos, on Linux .boot-linux--platform-aware via
# ci_boot_name() in lib/ci.sh. After `make install` creates it, prepend
# to PATH so make targets use bootstrapped tools, not system-installed
# ones. Parse-time check: if the boot dir/bin/uv doesn't exist yet
# (fresh install), PATH is not modified: install-python-deps handles it.
BOOT_NAME := $(if $(filter Darwin,$(_OS)),.boot-macos,.boot-linux)
BOOT_BIN := $(CURDIR)/$(BOOT_NAME)/bin

# Local overrides: copy .env.example -> .env (gitignored). KEY=value makefile syntax.
-include .env
export CLOUDFLARED_BIN TUNNEL_CONFIG TUNNEL_TOKEN
export CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_API_TOKEN
export WIKI_TUNNEL_HOSTNAME WIKI_TUNNEL_NAME
export WIKI_HTTP_PORT WIKI_HTTPS_PORT

# Tunnel origin = wiki prod nginx on host (default https://127.0.0.1:443).
ifeq ($(WIKI_HTTPS_PORT),)
_WIKI_HTTPS_PORT := 443
else
_WIKI_HTTPS_PORT := $(WIKI_HTTPS_PORT)
endif
ifeq ($(WIKI_TUNNEL_ORIGIN),)
WIKI_TUNNEL_ORIGIN := https://127.0.0.1:$(_WIKI_HTTPS_PORT)
endif
export WIKI_TUNNEL_ORIGIN

# CORS for wiki API when accessed via public tunnel hostname.
ifeq ($(ALLOWED_ORIGINS),)
ALLOWED_ORIGINS := https://localhost,https://127.0.0.1
ifneq ($(WIKI_TUNNEL_HOSTNAME),)
ALLOWED_ORIGINS := $(ALLOWED_ORIGINS),https://$(WIKI_TUNNEL_HOSTNAME)
endif
endif
export ALLOWED_ORIGINS

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
init: ## Install all system-level dependencies (Homebrew on macOS + apt packages on Linux + Rust toolchain)
	@echo "==> Installing Homebrew + GNU tools (macOS only)..."
	@bash scripts/bootstrap-homebrew
	@echo "==> Installing system packages (from config/system-deps.yaml)..."
	bash scripts/install-system-deps --install
	@echo "==> Installing Rust toolchain (if missing)..."
	@if ! command -v cargo > /dev/null 2>&1; then \
		bash scripts/bootstrap-rust; \
	fi
	@echo "==> System dependencies installed."

.PHONY: preflight
preflight: ## Verify environment (curl + tar for bootstrapping; uv is bootstrapped by install-boot-tools)
	@command -v curl > /dev/null 2>&1 || { echo "ERROR: curl not found"; exit 1; }
	@command -v tar > /dev/null 2>&1 || { echo "ERROR: tar not found"; exit 1; }
	@$(SHELL) -c '[ "$${BASH_VERSINFO[0]}" -gt 4 ] || ([ "$${BASH_VERSINFO[0]}" -eq 4 ] && [ "$${BASH_VERSINFO[1]}" -ge 3 ])' \
		|| { echo "ERROR: bash 4.3+ required (nameref support for portable I/O helpers)."; echo "  On macOS: run 'make init' to install Homebrew bash 5.x, then re-run."; echo "  On Linux: install bash 4.3+ via your package manager."; exit 1; }
	@echo "✓ Preflight OK"

.PHONY: install
install: preflight install-deps ## Full install: deps + bootstrap binaries + hooks
	$(MAKE) install-hooks

.PHONY: install-ci
install-ci: preflight install-deps ## CI install: deps + bootstrap binaries, no hooks
	@:

.PHONY: install-deps
install-deps: install-boot-tools install-python-deps install-gitleaks install-cloc install-moon install-ansible install-node install-web-deps ## Install boot tools + python .venv deps + gitleaks + cloc + moon + ansible + node + web deps

.PHONY: install-boot-tools
install-boot-tools: ## Bootstrap uv + rust toolchain into $(BOOT_NAME)/bin/ (idempotent)
	bash scripts/bootstrap-uv
	bash scripts/bootstrap-rust

.PHONY: install-python-deps
install-python-deps: install-boot-tools ## uv sync the Python deps (project-level .venv)
	PATH="$(BOOT_BIN):$$PATH" $(UV) sync --extra dev

.PHONY: install-gitleaks
install-gitleaks: ## Bootstrap the gitleaks binary used by the secret-content scanner
	bash scripts/bootstrap-gitleaks

.PHONY: install-cloc
install-cloc: ## Bootstrap the cloc binary (single-file Perl) used by code-stats
	bash scripts/bootstrap-cloc

.PHONY: install-moon
install-moon: ## Bootstrap the moon binary (workspace task runner) into $(BOOT_NAME)/bin
	bash scripts/bootstrap-moon

.PHONY: install-ansible
install-ansible: install-boot-tools ## Bootstrap ansible + passlib into $(BOOT_NAME)/bin
	bash scripts/bootstrap-ansible

.PHONY: install-node
install-node: ## Bootstrap Node.js + npm into $(BOOT_NAME)/node-env/ (idempotent)
	bash scripts/bootstrap-node

.PHONY: install-web-deps
install-web-deps: install-node ## npm install web/ dependencies (Next.js wiki)
	cd web && PATH="$(BOOT_BIN):$$PATH" npm install

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
# back through the public wrapper. INCIDENT-prevention: `make X` delegating
# to `moon run :X` whose command is `make X` would infinite-loop.
# Resolution: moon calls _<target>-impl, public targets delegate to moon.

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
ifdef CI
	$(RUFF) format --check ci/ --config ruff.toml
	$(RUFF) check ci/ --config ruff.toml
else
	$(RUFF) format ci/ --config ruff.toml
	$(RUFF) check --fix ci/ --config ruff.toml
endif

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
check-push: ## Single-pass pre-push gate running ruff lint, mypy, shell unit tests, pytest with per-suite coverage, and web/ JS quality (eslint + tsc + vitest) in one invocation. Eliminates the previous redundancy where the same tests ran two to three times across separate targets. Fails the push if any lint, type, test, or coverage threshold check does not pass.
	@$(MAKE) _lint-impl && $(MAKE) _type-check-impl && $(MAKE) _test-push-impl

.PHONY: _test-push-impl
_test-push-impl:
	./tests/run_tests_unit.sh
	./tests/run_tests_integration.sh
	$(PYTEST) tests/unit --cov=ci --cov-report=term-missing --cov-fail-under=90 --tb=short -q
	$(PYTEST) tests/integration --cov=ci --cov-report=term-missing --cov-fail-under=5 --tb=short -q
	$(MAKE) -C web lint type-check test

# =============================================================================
# Wiki Dev Server (delegates to web/Makefile; systemd user service on :3001)
# =============================================================================

.PHONY: start wiki-dev-start wiki-dev wiki-dev-stop wiki-dev-restart wiki-dev-status wiki-dev-logs
start: wiki-dev-start ## Alias for wiki-dev-start (make start)
	@:
wiki-dev-start: extract-wiki-data ## Start wiki dev server (Next.js HMR on :3001)
	$(MAKE) -C web dev-start
wiki-dev: wiki-dev-start ## Alias for wiki-dev-start
	@:
wiki-dev-stop: ## Stop wiki dev server
	$(MAKE) -C web dev-stop
wiki-dev-restart: extract-wiki-data ## Restart wiki dev server (stop + start)
	$(MAKE) -C web dev-restart
wiki-dev-status: ## Show wiki dev server status
	$(MAKE) -C web dev-status
wiki-dev-logs: ## Tail wiki dev server logs
	$(MAKE) -C web dev-logs

# =============================================================================
# Wiki Production (Podman; ports 80/443)
# Env overrides: PODMAN, COMPOSE_CMD, WIKI_HTTP_PORT, WIKI_HTTPS_PORT, PROD_HTTP_PORT, PROD_HTTPS_PORT
# Runs as your user; sudo prompts once for sysctl when binding :80/:443.
# =============================================================================

.PHONY: wiki-prod-check-syntax wiki-prod-build wiki-prod-start wiki-prod-stop wiki-prod-restart wiki-prod-status wiki-prod-logs
wiki-prod-check-syntax: ## Verify wiki prod Makefile recipes parse under bash -n
	$(MAKE) -C web prod-check-syntax
wiki-prod-build: ## Build wiki production image (Podman)
	$(MAKE) -C web prod-build
wiki-prod-start: ## Start wiki production stack on :80/:443
	$(MAKE) -C web prod-start WIKI_HTTP_PORT="$(WIKI_HTTP_PORT)" WIKI_HTTPS_PORT="$(WIKI_HTTPS_PORT)" ALLOWED_ORIGINS="$(ALLOWED_ORIGINS)"
wiki-prod-stop: ## Stop wiki production stack
	$(MAKE) -C web prod-stop
wiki-prod-restart: ## Restart wiki production stack
	$(MAKE) -C web prod-restart
wiki-prod-status: ## Show wiki production stack status
	$(MAKE) -C web prod-status
wiki-prod-logs: ## Tail wiki production stack logs
	$(MAKE) -C web prod-logs

# =============================================================================
# Wiki Cloudflare Tunnel (systemd user; no VM tunnel wrapper)
# Configure in .env (see .env.example) or override on command line.
# =============================================================================

ifeq ($(CLOUDFLARED_BIN),)
CLOUDFLARED_BIN := $(BOOT_BIN)/cloudflared
endif
ifeq ($(TUNNEL_CONFIG),)
TUNNEL_CONFIG := $(CURDIR)/cloudflare/config.yml
else ifeq ($(filter /%,$(TUNNEL_CONFIG)),)
TUNNEL_CONFIG := $(CURDIR)/$(TUNNEL_CONFIG)
endif
ANSIBLE_TUNNEL_ENV := CLOUDFLARED_BIN="$(CLOUDFLARED_BIN)" TUNNEL_CONFIG="$(TUNNEL_CONFIG)" \
	TUNNEL_TOKEN="$(TUNNEL_TOKEN)" \
	CLOUDFLARE_ACCOUNT_ID="$(CLOUDFLARE_ACCOUNT_ID)" CLOUDFLARE_API_TOKEN="$(CLOUDFLARE_API_TOKEN)" \
	WIKI_TUNNEL_HOSTNAME="$(WIKI_TUNNEL_HOSTNAME)" WIKI_TUNNEL_NAME="$(WIKI_TUNNEL_NAME)" \
	WIKI_TUNNEL_ORIGIN="$(WIKI_TUNNEL_ORIGIN)" WIKI_HTTPS_PORT="$(_WIKI_HTTPS_PORT)" \
	ALLOWED_ORIGINS="$(ALLOWED_ORIGINS)"
ANSIBLE_TUNNEL := $(ANSIBLE_TUNNEL_ENV) ansible-playbook res/ansible/tunnel.yml

.PHONY: wiki-tunnel-start wiki-tunnel-stop wiki-tunnel-restart wiki-tunnel-status
.PHONY: wiki-tunnel-deploy wiki-tunnel-undeploy wiki-tunnel-logs wiki-tunnel-route-dns
wiki-tunnel-start: ## Start Cloudflare tunnel (requires cloudflare/config.yml + credentials)
	$(ANSIBLE_TUNNEL) --tags start
wiki-tunnel-stop: ## Stop Cloudflare tunnel
	$(ANSIBLE_TUNNEL) --tags stop
wiki-tunnel-restart: ## Restart Cloudflare tunnel
	$(ANSIBLE_TUNNEL) --tags restart
wiki-tunnel-status: ## Show Cloudflare tunnel status
	$(ANSIBLE_TUNNEL) --tags status
wiki-tunnel-deploy: ## Install + enable wiki tunnel on boot (systemd user + linger)
	$(ANSIBLE_TUNNEL) --tags deploy
wiki-tunnel-undeploy: ## Disable + remove wiki tunnel systemd unit
	$(ANSIBLE_TUNNEL) --tags undeploy
wiki-tunnel-logs: ## Tail wiki tunnel logs
	journalctl --user -u wiki-ci-tunnel -f
wiki-tunnel-route-dns: ## Route DNS (WIKI_TUNNEL_HOSTNAME from .env)
	$(ANSIBLE_TUNNEL) --tags route-dns

# =============================================================================
# Cleanup
# =============================================================================

.PHONY: clean
clean: ## Remove build artifacts
	rm -rf -- build/ dist/ ./*.egg-info
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

.PHONY: extract-hook-sources extract-script-sources extract-swallow-source extract-wiki-data
extract-hook-sources: ## Generate web/src/data/hook-sources.json for wiki Hook EntryPointDialog
	uv run python scripts/extract-hook-sources.py

extract-script-sources: ## Generate web/src/data/script-sources.json for wiki Tooling EntryPointDialog
	uv run python scripts/extract-script-sources.py

extract-swallow-source: ## Generate web/src/data/swallow-detectors.json for wiki Silent Swallow Detectors
	uv run python scripts/extract-swallow-source.py

extract-wiki-data: extract-code-stats extract-hook-sources extract-script-sources extract-swallow-source ## Regenerate all wiki JSON data files

.PHONY: scaffold-ci
scaffold-ci: ## Generate CI integration files for a consumer project
	bash scripts/scaffold-ci $(ARGS)

# =============================================================================
# System Hardening (requires sudo)
# =============================================================================

.PHONY: enforce-syslog-limits
enforce-syslog-limits: ## Enforce system-level log ceilings: logrotate maxsize + journald rate limiting (prevents /var/log/syslog filling root disk)
	@echo "==> Enforcing system log ceilings..."
	$(SUDO) bash scripts/enforce-syslog-limits

# =============================================================================
# WORKSPACE-GUARD: compiled git protection (opt-in)
# =============================================================================

.PHONY: build-guard install-guard uninstall-guard check-guard

# Operator invocation contract: guard targets depend on `ensure-repos`
# (upstream `make` chain) which pulls every workspace repo over SSH. The
# guard re-pins HOME and SSH_AUTH_SOCK from the calling env; it does NOT
# manufacture SSH credentials. So the operator MUST run:
#   sudo --preserve-env=HOME,SSH_AUTH_SOCK make build-guard
#   sudo --preserve-env=HOME,SSH_AUTH_SOCK make install-guard
# build-guard writes only to WORKSPACE-GUARD/target/; bootstrap-workspace-guard
# chowns that tree back to SUDO_USER when run under sudo, so agent-uid
# rebuilds stay usable. check-guard is read-only and runs as the agent.
build-guard: ## Build git-guard binary (operator: sudo --preserve-env=HOME,SSH_AUTH_SOCK make build-guard)
	bash scripts/bootstrap-workspace-guard build-only

install-guard: ## Install git-guard to /usr/bin/git (operator: sudo --preserve-env=HOME,SSH_AUTH_SOCK make install-guard; binary must be pre-built)
	$(SUDO) bash scripts/bootstrap-workspace-guard install-only

uninstall-guard: ## Uninstall git-guard, restore original /usr/bin/git (operator: sudo --preserve-env=HOME,SSH_AUTH_SOCK make uninstall-guard)
	$(SUDO) bash scripts/bootstrap-workspace-guard uninstall

check-guard: ## Check git-guard installation status (read-only, runs as agent)
	bash scripts/bootstrap-workspace-guard check
