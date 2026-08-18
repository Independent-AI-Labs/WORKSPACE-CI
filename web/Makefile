# Makefile for workspace-ci Wiki (Next.js 16)
# Manages the dev server via systemd user services.

SHELL := /bin/bash

# Wiki lives at projects/CI/web. Node.js is read from CI's own boot dir
# (projects/CI/.boot-linux or .boot-macos), installed by sudo prereqs.
# Restart/dev targets never write boot; they only resolve and execute node.
_OS := $(shell uname -s)
_BOOT_NAME := $(if $(filter Darwin,$(_OS)),.boot-macos,.boot-linux)
CI_ROOT := $(abspath ..)
NODE_ENV_BIN := $(CI_ROOT)/$(_BOOT_NAME)/node-env/bin
BOOT_BIN := $(CI_ROOT)/$(_BOOT_NAME)/bin
NODE := $(NODE_ENV_BIN)/node
NPM := $(NODE_ENV_BIN)/npm
# The guard's alt-interp rule blocks interpreter names (and paths
# containing them, like node-env/bin) in command text, so recipes cannot
# invoke boot node tools directly. Script bodies are exempt by design
# (shell_guard_policy_matrix: script-interp-ok): route through the
# wrapper script. $(NODE)/$(NPM) stay for data-only uses (unit files,
# existence checks); executing recipes go through WEB_TOOL (recipe command
# text is scanned, so even the tool-name arg to run-boot-js is blocked).
WEB_TOOL := bash $(CI_ROOT)/scripts/web-tool

export PATH := $(NODE_ENV_BIN):$(BOOT_BIN):$(PATH)

DEV_PORT := 4000
DEV_START_INITIAL_SLEEP ?= 3
DEV_START_CURL_TIMEOUT ?= 10
DEV_START_POLL_INTERVAL ?= 2
DEV_START_MAX_ATTEMPTS ?= 45
DEV_SKIP_PREFLIGHT ?= 0
SYSTEMD_UNIT := wiki-ci-dev.service
SYSTEMD_DIR := $(HOME)/.config/systemd/user

# dev-server.sh reads these from the environment; export so CLI overrides
# (make dev-start DEV_SKIP_PREFLIGHT=1 ...) reach the script.
export DEV_PORT DEV_START_INITIAL_SLEEP DEV_START_CURL_TIMEOUT
export DEV_START_POLL_INTERVAL DEV_START_MAX_ATTEMPTS DEV_SKIP_PREFLIGHT
PROJECT_ROOT := $(abspath .)
PROJECTS_ROOT := $(abspath ../..)
CI_REPO := $(abspath ..)
PROD_IMAGE := localhost/workspace-ci-wiki:0.1.0
COMPOSE_FILE := compose.prod.yaml
# Override on the command line or in the environment if needed:
#   COMPOSE_CMD=podman-compose PODMAN=podman make prod-start
COMPOSE_CMD ?= podman-compose
PODMAN ?= podman
# `export COMPOSE_CMD` with no value defines an empty var; ?= will not override it.
ifeq ($(COMPOSE_CMD),)
COMPOSE_CMD := podman-compose
endif
ifeq ($(PODMAN),)
PODMAN := podman
endif
export PROD_HTTP_PORT ?= 8080
export PROD_HTTPS_PORT ?= 8443
export WIKI_TLS_DIR ?=
export WIKI_TLS_MODE ?= auto
export WIKI_TLS_CN ?= localhost
ifneq ($(WIKI_HTTP_PORT),)
export PROD_HTTP_PORT := $(WIKI_HTTP_PORT)
endif
ifneq ($(WIKI_HTTPS_PORT),)
export PROD_HTTPS_PORT := $(WIKI_HTTPS_PORT)
endif
export PROD_IMAGE COMPOSE_CMD PODMAN ALLOWED_ORIGINS
.PHONY: help
help: ## Show this help
	echo "workspace-ci Wiki Makefile"
	echo ""
	echo "Development targets:"
	echo "  dev-start    Start dev server (Next.js HMR on 0.0.0.0:$(DEV_PORT))"
	echo "  dev          Alias for dev-start"
	echo "  dev-stop     Stop dev server"
	echo "  dev-restart  Restart dev server (stop + start)"
	echo "  dev-status   Show dev server status"
	echo "  dev-logs     Tail dev server logs"
	echo ""
	echo "Code quality:"
	echo "  lint         Run eslint"
	echo "  type-check   Run tsc --noEmit"
	echo "  test         Run vitest"
	echo "  check        Run lint + type-check + test"
	echo ""
	echo "Production (Podman; ports $(PROD_HTTP_PORT)/$(PROD_HTTPS_PORT)):"
	echo "  prod-build    Build workspace-ci-wiki:0.1.0 image"
	echo "  prod-start    Start nginx + Next.js stack"
	echo "  prod-stop     Stop production stack"
	echo "  prod-redeploy  Restart production stack + verify health"
	echo "  prod-verify   Health report (containers, probes, TLS, public URL)"
	echo "  prod-status   Show stack status + HTTP probe"
	echo "  prod-logs     Tail production logs"
	echo ""
	echo "Cleanup:"
	echo "  clean        Remove .next and node_modules"
	echo "  clean-build  Remove .next only"

# =============================================================================
# Development Targets
# =============================================================================

.PHONY: dev-start
dev-start: ## Start dev server (Next.js HMR)
	./scripts/dev-server.sh start

.PHONY: dev
dev: dev-start ## Alias for dev-start

.PHONY: dev-disable-autostart
dev-disable-autostart: ## Disable wiki-ci-dev autostart on login (stops systemd resurrecting old runs)
	./scripts/dev-server.sh disable-autostart

.PHONY: dev-stop
dev-stop: ## Stop dev server
	./scripts/dev-server.sh stop

.PHONY: dev-sync-content
dev-sync-content: ## Mirror WORKSPACE-WEB-CONTENT into content/ and public/landing/
	$(WEB_TOOL) sync-content

.PHONY: dev-restart
dev-restart: ## Restart dev server (stop, sync content, wipe .next, start)
	$(MAKE) dev-stop
	$(MAKE) dev-sync-content
	$(MAKE) clean-build
	echo "[dev-restart] wiped .next (fixes stale @swc/helpers turbopack chunks)"
	$(MAKE) dev-start DEV_SKIP_PREFLIGHT=1 DEV_START_INITIAL_SLEEP=2 DEV_START_CURL_TIMEOUT=15

.PHONY: dev-status
dev-status: ## Show dev server status
	svc=$$(systemctl --user is-active $(SYSTEMD_UNIT) 2>&1); echo "Service: $$svc"
	_curl_tmp=$$(mktemp); _curl_err=$$(mktemp); \
	code=$$(curl -sS -o "$$_curl_tmp" -w '%{http_code}' http://127.0.0.1:$(DEV_PORT)/ 2>"$$_curl_err"); _curl_rc=$$?; \
	if [ $$_curl_rc -ne 0 ]; then echo "[dev-status] curl probe (exit=$$_curl_rc): $$(cat "$$_curl_err")" >&2; fi; \
	rm -f "$$_curl_tmp" "$$_curl_err"; echo "HTTP:    $$code"
	echo "Port:    $(DEV_PORT)"
	echo "Logs:    journalctl --user -u $(SYSTEMD_UNIT) -f"

.PHONY: dev-logs
dev-logs: ## Print dev server logs (last 100 lines)
	journalctl --user -u $(SYSTEMD_UNIT) --no-pager -n 100

# =============================================================================
# Production Targets (Podman; default ports 8080/8443, no root)
# =============================================================================

.PHONY: prod-check-syntax
prod-check-syntax: ## Verify prod shell scripts parse under bash -n
	bash -n scripts/prod.sh
	echo "OK  scripts/prod.sh"

.PHONY: prod-build prod-start prod-stop prod-redeploy prod-verify prod-status prod-logs
prod-build: ## Build production wiki image (context: projects root)
	./scripts/prod.sh build
prod-start: ## Start production stack (HTTP :$(PROD_HTTP_PORT), HTTPS :$(PROD_HTTPS_PORT))
	./scripts/prod.sh start
prod-stop: ## Stop production stack
	./scripts/prod.sh stop
prod-redeploy: ## Restart production stack + verify health
	./scripts/prod.sh restart
prod-verify: ## Health report: containers, probes, TLS, public URL, settle check
	./scripts/prod.sh verify
prod-status: ## Show production stack status + HTTP probe
	./scripts/prod.sh status
prod-logs: ## Tail production stack logs
	./scripts/prod.sh logs

# =============================================================================
# Code Quality
# =============================================================================

.PHONY: lint
lint: ## Run eslint
	$(WEB_TOOL) lint

.PHONY: type-check
type-check: ## Run tsc --noEmit
	$(WEB_TOOL) typecheck

.PHONY: test
test: ## Run vitest
	$(WEB_TOOL) test

.PHONY: check-generated
check-generated: ## Verify generated registry/dashboard/nav data is fresh
	$(WEB_TOOL) check-generated

.PHONY: check
check: ## Run lint + type-check + test
	$(MAKE) check-generated && $(MAKE) lint && $(MAKE) type-check && $(MAKE) test

# =============================================================================
# Cleanup
# =============================================================================

.PHONY: clean
clean: ## Remove .next and node_modules
	rm -rf .next node_modules

.PHONY: clean-build
clean-build: ## Remove .next only
	rm -rf .next
