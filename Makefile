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

# uv is the hermetic runner for all Python tooling (FR-2.4).
UV := uv
RUFF := uv run ruff
PYTEST := uv run python -m pytest
MYPY := uv run mypy

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
export WIKI_TUNNEL_HOSTNAME WIKI_TUNNEL_NAME WIKI_TUNNEL_ID
export WIKI_HTTP_PORT WIKI_HTTPS_PORT
export LETSENCRYPT_EMAIL LETSENCRYPT_STAGING LETSENCRYPT_CLOUDFLARE_ZONE
export WIKI_TLS_MODE WIKI_TLS_DIR WIKI_TLS_CN

# Tunnel origin = wiki prod nginx HTTPS (default https://127.0.0.1:8443).
ifeq ($(WIKI_HTTPS_PORT),)
_WIKI_HTTPS_PORT := 8443
else
_WIKI_HTTPS_PORT := $(WIKI_HTTPS_PORT)
endif
ifeq ($(WIKI_TUNNEL_ORIGIN),)
WIKI_TUNNEL_ORIGIN := https://127.0.0.1:$(_WIKI_HTTPS_PORT)
endif

ifeq ($(WIKI_TUNNEL_HOSTNAME),)
_WIKI_TLS_HOST := localhost
else
_WIKI_TLS_HOST := $(WIKI_TUNNEL_HOSTNAME)
endif
ifeq ($(WIKI_TLS_DIR),)
WIKI_TLS_DIR := $(CURDIR)/cloudflare/certs/$(_WIKI_TLS_HOST)
endif
ifeq ($(WIKI_TLS_CN),)
WIKI_TLS_CN := $(_WIKI_TLS_HOST)
endif
ifeq ($(LETSENCRYPT_CLOUDFLARE_ZONE),)
LETSENCRYPT_CLOUDFLARE_ZONE := $(WIKI_TUNNEL_HOSTNAME)
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
	grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# =============================================================================
# Setup
# =============================================================================

# sudo is a no-op when already root (containers, CI agents)
SUDO := $(shell if [ "$$EUID" -eq 0 ]; then echo ""; else echo "sudo"; fi)

.PHONY: init
init: ## Install all system-level dependencies (Homebrew on macOS + apt packages on Linux + Rust toolchain)
	echo "==> Installing Homebrew + GNU tools (macOS only)..."
	bash scripts/bootstrap-homebrew
	echo "==> Installing system packages (from config/system-deps.yaml)..."
	bash scripts/install-system-deps --install
	echo "==> Installing Rust toolchain (if missing)..."
	if ! _cargo_path="$$(command -v cargo 2>&1)"; then \
		bash scripts/bootstrap-rust; \
	fi
	echo "==> System dependencies installed."

.PHONY: preflight
preflight: ## Verify environment (curl + tar for bootstrapping; uv is bootstrapped by install-boot-tools)
	_curl_path="$$(command -v curl 2>&1)" || { echo "ERROR: curl not found: $$_curl_path"; exit 1; }
	_tar_path="$$(command -v tar 2>&1)" || { echo "ERROR: tar not found: $$_tar_path"; exit 1; }
	$(SHELL) -c '[ "$${BASH_VERSINFO[0]}" -gt 4 ] || ([ "$${BASH_VERSINFO[0]}" -eq 4 ] && [ "$${BASH_VERSINFO[1]}" -ge 3 ])' \
		|| { echo "ERROR: bash 4.3+ required (nameref support for portable I/O helpers)."; echo "  On macOS: run 'make init' to install Homebrew bash 5.x, then re-run."; echo "  On Linux: install bash 4.3+ via your package manager."; exit 1; }
	echo "✓ Preflight OK"

.PHONY: install
install: preflight install-deps ## Full install: deps + bootstrap binaries + hooks
	$(MAKE) install-hooks

.PHONY: install-ci
install-ci: preflight install-deps ## CI install: deps + bootstrap binaries, no hooks
	:

.PHONY: install-deps
install-deps: install-boot-tools install-python-deps install-gitleaks install-osv-scanner install-cloc install-moon install-ansible install-node install-web-deps ## Install boot tools + python .venv deps + gitleaks + osv-scanner + cloc + moon + ansible + node + web deps

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

.PHONY: install-osv-scanner
install-osv-scanner: ## Bootstrap the osv-scanner binary used by the dependency vulnerability scanner
	bash scripts/bootstrap-osv-scanner

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
install-hooks: ## (Re)generate native git hooks (auto unseal/re-lock when root-sealed)
	if [ -f scripts/cleanup-precommit ]; then bash scripts/cleanup-precommit; else echo "[INFO] cleanup-precommit not found, continuing" >&2; fi
	bash scripts/reinstall-hooks

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
	$(MAKE) _lint-impl && $(MAKE) _type-check-impl && $(MAKE) _test-impl

.PHONY: lint
lint: ## Runs ruff format and ruff lint with auto-fix on all ci/ modules. Catches style violations, import sorting issues, and unused variables before they reach the remote. Acts as the first stage of the pre-commit quality gate.
	$(MAKE) _lint-impl

.PHONY: type-check
type-check: ## Runs mypy strict type checking on all ci/ Python modules. Catches type errors, missing annotations, and incompatible signatures before they can break downstream consumers. Acts as the second stage of the pre-commit quality gate after lint passes.
	$(MAKE) _type-check-impl

.PHONY: test
test: ## Run all tests (shell + Python)
	$(MAKE) _test-impl

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

# =============================================================================
# Selective Tests
# =============================================================================
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
	$(MAKE) _lint-impl && $(MAKE) _type-check-impl && $(MAKE) _test-push-impl

.PHONY: _test-push-impl
_test-push-impl:
	./tests/run_tests_unit.sh
	./tests/run_tests_integration.sh
	$(PYTEST) tests/unit --cov=ci --cov-report=term-missing --cov-fail-under=90 --tb=short -q
	$(PYTEST) tests/integration --cov=ci --cov-report=term-missing --cov-fail-under=5 --tb=short -q
	$(MAKE) -C web lint type-check test

# Wiki dev server: delegates to web/Makefile; systemd user service on :4000
# =============================================================================
# Wiki Dev Server
# =============================================================================

.PHONY: start wiki-dev-start wiki-dev wiki-dev-stop wiki-dev-restart wiki-dev-restart-refresh wiki-dev-status wiki-dev-logs
start: wiki-dev-start ## Alias for wiki-dev-start (make start)
	:
wiki-dev-start: extract-wiki-data ## Start wiki dev server (Next.js HMR on :4000)
	$(MAKE) -C web dev-start
wiki-dev: wiki-dev-start ## Alias for wiki-dev-start
	:
wiki-dev-stop: ## Stop wiki dev server
	$(MAKE) -C web dev-stop
wiki-dev-restart: ## Restart wiki dev server (stop + sync content + start; fast, no cloc)
	echo "[wiki-dev-restart] stop + sync WORKSPACE-WEB-CONTENT + start (use wiki-dev-restart-refresh for cloc)"
	$(MAKE) -C web dev-restart
wiki-dev-restart-refresh: ## Restart wiki dev server after regenerating wiki JSON (cloc may take minutes)
	echo "[wiki-dev-restart-refresh] phase 1/2: extract-wiki-data (code-stats/cloc may take several minutes)"
	$(MAKE) extract-wiki-data
	echo "[wiki-dev-restart-refresh] phase 2/2: dev server stop + start"
	$(MAKE) -C web dev-restart
wiki-dev-status: ## Show wiki dev server status
	$(MAKE) -C web dev-status
wiki-dev-logs: ## Tail wiki dev server logs
	$(MAKE) -C web dev-logs

# Wiki production: Podman on :8080/:8443 (no root). Env overrides: PODMAN,
# COMPOSE_CMD, WIKI_HTTP_PORT, WIKI_HTTPS_PORT, PROD_HTTP_PORT, PROD_HTTPS_PORT.
# =============================================================================
# Wiki Production
# =============================================================================

.PHONY: wiki-prod-check-syntax wiki-prod-build wiki-prod-start wiki-prod-stop wiki-prod-restart wiki-prod-status wiki-prod-logs
.PHONY: wiki-prod-deploy wiki-prod-undeploy wiki-prod-systemd-logs
wiki-prod-check-syntax: ## Verify wiki prod Makefile recipes parse under bash -n
	$(MAKE) -C web prod-check-syntax
wiki-prod-build: ## Build wiki production image (Podman)
	$(MAKE) -C web prod-build
wiki-build-prod: wiki-prod-build ## Alias for wiki-prod-build
wiki-prod-start: ## Start wiki production stack on :8080/:8443
	$(MAKE) -C web prod-start WIKI_HTTP_PORT="$(WIKI_HTTP_PORT)" WIKI_HTTPS_PORT="$(WIKI_HTTPS_PORT)" \
		WIKI_TLS_DIR="$(WIKI_TLS_DIR)" WIKI_TLS_MODE="$(WIKI_TLS_MODE)" WIKI_TLS_CN="$(WIKI_TLS_CN)" \
		ALLOWED_ORIGINS="$(ALLOWED_ORIGINS)" WIKI_HOME_LANDING_ENABLED="$(WIKI_HOME_LANDING_ENABLED)"
wiki-prod-stop: ## Stop wiki production stack
	$(MAKE) -C web prod-stop
wiki-prod-restart: ## Restart wiki production stack
	$(MAKE) -C web prod-restart WIKI_HTTP_PORT="$(WIKI_HTTP_PORT)" WIKI_HTTPS_PORT="$(WIKI_HTTPS_PORT)" \
		WIKI_TLS_DIR="$(WIKI_TLS_DIR)" WIKI_TLS_MODE="$(WIKI_TLS_MODE)" WIKI_TLS_CN="$(WIKI_TLS_CN)" \
		ALLOWED_ORIGINS="$(ALLOWED_ORIGINS)" WIKI_HOME_LANDING_ENABLED="$(WIKI_HOME_LANDING_ENABLED)"
wiki-prod-status: ## Show wiki production stack status
	$(MAKE) -C web prod-status
wiki-prod-logs: ## Tail wiki production stack logs
	$(MAKE) -C web prod-logs
wiki-prod-deploy: ## Install + enable wiki prod on boot (systemd user + linger)
	ansible-playbook res/ansible/prod.yml --tags deploy
wiki-prod-undeploy: ## Disable + remove wiki prod systemd unit
	ansible-playbook res/ansible/prod.yml --tags undeploy
wiki-prod-systemd-logs: ## Tail wiki prod systemd unit logs
	journalctl --user -u wiki-prod-compose -f

# Wiki Cloudflare tunnel: systemd user unit. Configure in .env (see .env.example).
# =============================================================================
# Wiki Cloudflare Tunnel
# =============================================================================

ifeq ($(TUNNEL_CONFIG),)
TUNNEL_CONFIG := $(CURDIR)/cloudflare/config.yml
else ifeq ($(filter /%,$(TUNNEL_CONFIG)),)
TUNNEL_CONFIG := $(CURDIR)/$(TUNNEL_CONFIG)
endif
ANSIBLE_TUNNEL_ENV := TUNNEL_CONFIG="$(TUNNEL_CONFIG)" \
	TUNNEL_TOKEN="$(TUNNEL_TOKEN)" \
	CLOUDFLARE_ACCOUNT_ID="$(CLOUDFLARE_ACCOUNT_ID)" CLOUDFLARE_API_TOKEN="$(CLOUDFLARE_API_TOKEN)" \
	WIKI_TUNNEL_HOSTNAME="$(WIKI_TUNNEL_HOSTNAME)" WIKI_TUNNEL_NAME="$(WIKI_TUNNEL_NAME)" \
	WIKI_TUNNEL_ID="$(WIKI_TUNNEL_ID)" \
	WIKI_TUNNEL_ORIGIN="$(WIKI_TUNNEL_ORIGIN)" WIKI_HTTPS_PORT="$(_WIKI_HTTPS_PORT)" \
	ALLOWED_ORIGINS="$(ALLOWED_ORIGINS)"
ifneq ($(CLOUDFLARED_BIN),)
ANSIBLE_TUNNEL_ENV := CLOUDFLARED_BIN="$(CLOUDFLARED_BIN)" $(ANSIBLE_TUNNEL_ENV)
endif
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

# Wiki TLS: Let's Encrypt DNS-01 via Cloudflare
# =============================================================================
# Wiki TLS
# =============================================================================

ANSIBLE_LETSENCRYPT_ENV := CLOUDFLARE_API_TOKEN="$(CLOUDFLARE_API_TOKEN)" \
	LETSENCRYPT_EMAIL="$(LETSENCRYPT_EMAIL)" \
	LETSENCRYPT_STAGING="$(LETSENCRYPT_STAGING)" \
	LETSENCRYPT_CLOUDFLARE_ZONE="$(LETSENCRYPT_CLOUDFLARE_ZONE)"
ANSIBLE_LETSENCRYPT_EXTRA := \
	-e '{"letsencrypt_domains": ["$(WIKI_TUNNEL_HOSTNAME)"]}' \
	-e "letsencrypt_cert_dir=$(WIKI_TLS_DIR)" \
	-e "letsencrypt_email=$(LETSENCRYPT_EMAIL)" \
	-e "letsencrypt_cloudflare_zone=$(LETSENCRYPT_CLOUDFLARE_ZONE)" \
	-e 'letsencrypt_reload_cmd=podman exec wiki-ci-nginx nginx -s reload' \
	-e "letsencrypt_project_root=$(CURDIR)" \
	-e "letsencrypt_playbook_path=$(CURDIR)/res/ansible/letsencrypt.yml"
ANSIBLE_LETSENCRYPT := $(ANSIBLE_LETSENCRYPT_ENV) ansible-playbook res/ansible/letsencrypt.yml $(ANSIBLE_LETSENCRYPT_EXTRA)

.PHONY: wiki-tls-issue wiki-tls-renew wiki-tls-verify wiki-tls-deploy wiki-tls-undeploy
wiki-tls-issue: ## Issue Let's Encrypt cert (DNS-01; LETSENCRYPT_STAGING=1 to test)
	test -n "$(WIKI_TUNNEL_HOSTNAME)" || (echo "Set WIKI_TUNNEL_HOSTNAME in .env" >&2; exit 1)
	test -n "$(LETSENCRYPT_EMAIL)" || (echo "Set LETSENCRYPT_EMAIL in .env" >&2; exit 1)
	test -n "$(CLOUDFLARE_API_TOKEN)" || (echo "Set CLOUDFLARE_API_TOKEN in .env (Zone:DNS:Edit)" >&2; exit 1)
	$(ANSIBLE_LETSENCRYPT) --tags issue
wiki-tls-renew: ## Renew Let's Encrypt cert and reload nginx
	test -n "$(WIKI_TUNNEL_HOSTNAME)" || (echo "Set WIKI_TUNNEL_HOSTNAME in .env" >&2; exit 1)
	$(ANSIBLE_LETSENCRYPT) --tags renew
wiki-tls-verify: ## Verify TLS cert expiry and SAN
	$(ANSIBLE_LETSENCRYPT) --tags verify
wiki-tls-deploy: ## Install systemd user timer for daily cert renewal
	$(ANSIBLE_LETSENCRYPT) --tags deploy
wiki-tls-undeploy: ## Remove Let's Encrypt renewal timer
	$(ANSIBLE_LETSENCRYPT) --tags undeploy

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
	echo "[extract-wiki-data] code-stats (cloc across workspace; slow)..."
	uv run python scripts/extract-code-stats.py

.PHONY: extract-hook-sources extract-script-sources extract-swallow-source extract-wiki-data
export CI_WEB_DATA_DIR ?= $(HOME)/data/workspace-ci/wiki/data
_WIKI_EXTRACT_ENV = CI_CONFIG_DIR=config

extract-hook-sources: ## Generate web/src/data/hook-sources.json for wiki Hook EntryPointDialog
	echo "[extract-wiki-data] hook-sources..."
	$(_WIKI_EXTRACT_ENV) uv run python scripts/extract-hook-sources.py

extract-script-sources: ## Generate web/src/data/script-sources.json for wiki Tooling EntryPointDialog
	echo "[extract-wiki-data] script-sources..."
	$(_WIKI_EXTRACT_ENV) uv run python scripts/extract-script-sources.py

extract-swallow-source: ## Generate web/src/data/swallow-detectors.json for wiki Silent Swallow Detectors
	echo "[extract-wiki-data] swallow-detectors..."
	$(_WIKI_EXTRACT_ENV) uv run python scripts/extract-swallow-source.py

extract-wiki-data: extract-code-stats extract-hook-sources extract-script-sources extract-swallow-source ## Regenerate all wiki JSON data files

.PHONY: scaffold-ci
scaffold-ci: ## Generate CI integration files for a consumer project
	bash scripts/scaffold-ci $(ARGS)

.PHONY: lock-exemptions
lock-exemptions: ## (sudo) Create + root-lock all manifest exemption files in a consumer repo
	scripts/lock-exemptions "$(or $(CONSUMER),$(PWD))"

.PHONY: unseal-exemptions
unseal-exemptions: ## (sudo) Remove immutable flag (unseal) on manifest exemption files in a consumer repo (re-lock after editing)
	scripts/unseal-exemptions "$(or $(CONSUMER),$(PWD))"

.PHONY: lock-hooks
lock-hooks: ## (sudo) Root-lock generated native git hooks in a consumer repo
	scripts/lock-hooks "$(or $(CONSUMER),$(PWD))"

.PHONY: unseal-hooks
unseal-hooks: ## (sudo) Remove immutable flag (unseal) on generated hooks so generate-hooks can rewrite them (re-lock afterwards)
	scripts/unseal-hooks "$(or $(CONSUMER),$(PWD))"

# System hardening (requires sudo)
# =============================================================================
# System Hardening
# =============================================================================

.PHONY: enforce-syslog-limits
enforce-syslog-limits: ## Enforce system-level log ceilings: logrotate maxsize + journald rate limiting (prevents /var/log/syslog filling root disk)
	echo "==> Enforcing system log ceilings..."
	$(SUDO) bash scripts/enforce-syslog-limits

# WORKSPACE-GUARD: compiled git protection (opt-in)
# =============================================================================
# WORKSPACE-GUARD
# =============================================================================

.PHONY: build-guard install-guard install-guard-host-exec reconcile-guard-host-exec uninstall-guard purge-guard-state check-guard check-guard-host-exec

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

install-guard: ## REMOVED: use install-guard-host-exec
	echo "ERROR: make install-guard is removed. Use: make install-guard-host-exec" >&2
	exit 1

install-guard-host-exec: build-guard ## Install git-guard (host-exec; operator: sudo --preserve-env=HOME,SSH_AUTH_SOCK make install-guard-host-exec)
	$(SUDO) bash scripts/bootstrap-workspace-guard install-host-exec

uninstall-guard: ## Uninstall git-guard, restore stock git; preserve provision state (operator: sudo make uninstall-guard)
	$(SUDO) bash scripts/bootstrap-workspace-guard uninstall

purge-guard-state: ## Destroy all guard state (requires GUARD_PURGE_CONFIRM=1)
	$(SUDO) bash scripts/bootstrap-workspace-guard purge-guard-state

reconcile-guard-host-exec: build-guard ## Force rebuild + reinstall git guard and aux artifacts (operator: sudo --preserve-env=HOME,SSH_AUTH_SOCK make reconcile-guard-host-exec)
	GUARD_FORCE_RECONCILE=1 GUARD_SKIP_BUILD=1 $(MAKE) install-guard-host-exec

check-guard: ## REMOVED: use check-guard-host-exec
	echo "ERROR: make check-guard is removed. Use: make check-guard-host-exec" >&2
	exit 1

check-guard-host-exec: ## Check host-exec git-guard installation (read-only, runs as agent)
	bash scripts/bootstrap-workspace-guard check-host-exec

deploy-ci: ## Promote WORKSPACE-CI to locked projects/CI (operator: sudo --preserve-env=HOME,SSH_AUTH_SOCK make deploy-ci)
	bash scripts/deploy-ci
