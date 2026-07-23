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

export PATH := $(NODE_ENV_BIN):$(BOOT_BIN):$(PATH)

DEV_PORT := 4000
DEV_START_INITIAL_SLEEP ?= 3
DEV_START_CURL_TIMEOUT ?= 10
DEV_START_POLL_INTERVAL ?= 2
DEV_START_MAX_ATTEMPTS ?= 45
DEV_SKIP_PREFLIGHT ?= 0
SYSTEMD_UNIT := wiki-ci-dev.service
SYSTEMD_DIR := $(HOME)/.config/systemd/user
PROJECT_ROOT := $(abspath .)
PROJECTS_ROOT := $(abspath ../..)
CI_REPO := $(abspath ..)
PROD_IMAGE := localhost/workspace-ci-wiki:prod
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
	echo "  prod-build    Build workspace-ci-wiki:prod image"
	echo "  prod-start    Start nginx + Next.js stack"
	echo "  prod-stop     Stop production stack"
	echo "  prod-restart  Restart production stack"
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
	if [ ! -x "$(NODE)" ]; then \
		echo "ERROR: Bootstrapped Node.js not found at $(NODE)"; \
		exit 1; \
	fi
	mkdir -p $(SYSTEMD_DIR)
	if [ ! -f $$HOME/.config/wiki-ci-dev.env ] && [ -f grafana.env.example ]; then \
		echo "[dev-start] Creating $$HOME/.config/wiki-ci-dev.env from grafana.env.example"; \
		cp grafana.env.example $$HOME/.config/wiki-ci-dev.env; \
		echo "[dev-start] Edit it to set GRAFANA_BASE_URL to the reachable Grafana origin."; \
	fi
	if [ -f $$HOME/.config/wiki-ci-dev.env ]; then \
		_grafana_url=$$(grep -E '^GRAFANA_BASE_URL=' $$HOME/.config/wiki-ci-dev.env | tail -1 | cut -d= -f2-); \
		if [ -n "$$_grafana_url" ]; then \
			_health_url=$${_grafana_url%/}/api/health; \
			_health_tmp=$$(mktemp); \
			_health_err=$$(mktemp); \
			if ! curl -fsS --max-time 3 "$$_health_url" -o "$$_health_tmp" 2>"$$_health_err"; then \
				echo "[dev-start] WARNING: Grafana health probe failed at $$_health_url"; \
				[ -s "$$_health_err" ] && cat "$$_health_err" >&2; \
				echo "[dev-start] Dev wiki proxies /grafana to loopback :3030; leave GRAFANA_BASE_URL unset"; \
			fi; \
			rm -f "$$_health_tmp" "$$_health_err"; \
		fi; \
	fi
	echo "[dev-start] Installing systemd user unit -> $(SYSTEMD_DIR)/$(SYSTEMD_UNIT)"
	_skip_env=; \
	if [ "$(DEV_SKIP_PREFLIGHT)" = "1" ]; then \
		_skip_env='Environment="WIKI_DEV_SKIP_PREFLIGHT=1"'; \
		echo "[dev-start] preflight sync skipped (content synced by caller)"; \
	fi; \
	sed \
		-e 's|__PROJECT_ROOT__|$(PROJECT_ROOT)|g' \
		-e 's|__NODE_BIN__|$(NODE_ENV_BIN)|g' \
		-e 's|__NODE__|$(NODE)|g' \
		-e 's|__DEV_PORT__|$(DEV_PORT)|g' \
		-e "s|__SKIP_PREFLIGHT_ENV__|$$_skip_env|g" \
		res/wiki-ci-dev.service.tmpl > $(SYSTEMD_DIR)/$(SYSTEMD_UNIT)
	systemctl --user daemon-reload
	if systemctl --user is-failed $(SYSTEMD_UNIT) 2>&1; then \
		systemctl --user reset-failed $(SYSTEMD_UNIT); \
	fi
	echo "[dev-start] systemctl --user restart $(SYSTEMD_UNIT)"
	systemctl --user restart $(SYSTEMD_UNIT)
	if systemctl --user is-enabled $(SYSTEMD_UNIT) 2>&1; then \
		echo "[dev-start] NOTE: $(SYSTEMD_UNIT) is enabled (autostart on login). Run 'make dev-disable-autostart' to turn off."; \
	fi
	echo "[dev-start] startup log snapshot (last 30 lines):"
	journalctl --user -u $(SYSTEMD_UNIT) -n 30 --no-pager
	sleep $(DEV_START_INITIAL_SLEEP)
	result=$$(systemctl --user show $(SYSTEMD_UNIT) -p Result --value 2>&1); \
	nrest=$$(systemctl --user show $(SYSTEMD_UNIT) -p NRestarts --value 2>&1); \
	echo "[dev-start] post-start: Result=$$result NRestarts=$$nrest"; \
	if [ "$$result" != "success" ] || [ "$$nrest" != "0" ]; then \
		echo ""; \
		echo "ERROR: $(SYSTEMD_UNIT) failed to start (Result=$$result, NRestarts=$$nrest) - aborting, no HTTP poll."; \
		echo "----- journalctl --user -u $(SYSTEMD_UNIT) -n 80 --no-pager -----"; \
		journalctl --user -u $(SYSTEMD_UNIT) -n 80 --no-pager; \
		echo "----- end journal -----"; \
		echo "Hint: Result=exec/203 = binary path wrong or not executable; start-limit-hit = crash-looped."; \
		exit 1; \
	fi
	echo "[dev-start] process alive, waiting for HTTP on port $(DEV_PORT) (curl timeout $(DEV_START_CURL_TIMEOUT)s, max $(DEV_START_MAX_ATTEMPTS) attempts)..."
	for i in $$(seq 1 $(DEV_START_MAX_ATTEMPTS)); do \
		state=$$(systemctl --user is-active $(SYSTEMD_UNIT) 2>&1); \
		nrest=$$(systemctl --user show $(SYSTEMD_UNIT) -p NRestarts --value 2>&1); \
		_curl_tmp=$$(mktemp); _curl_err=$$(mktemp); \
		code=$$(curl -sS -o "$$_curl_tmp" -w "%{http_code}" --max-time $(DEV_START_CURL_TIMEOUT) http://127.0.0.1:$(DEV_PORT)/ 2>"$$_curl_err"); _curl_rc=$$?; \
		if [ $$_curl_rc -ne 0 ]; then echo "[dev-start] curl probe (rc=$$_curl_rc): $$(cat "$$_curl_err")" >&2; fi; \
		rm -f "$$_curl_tmp" "$$_curl_err"; \
		echo "[dev-start] attempt $$i/$(DEV_START_MAX_ATTEMPTS): state=$$state http=$$code restarts=$$nrest"; \
		if [ "$$state" = "failed" ] || [ "$$state" = "inactive" ]; then \
			echo ""; \
			echo "ERROR: $(SYSTEMD_UNIT) is $$state - not retrying further."; \
			echo "----- journalctl --user -u $(SYSTEMD_UNIT) -n 80 --no-pager -----"; \
			journalctl --user -u $(SYSTEMD_UNIT) -n 80 --no-pager; \
			echo "----- end journal -----"; \
			exit 1; \
		fi; \
		if [ "$$nrest" != "0" ]; then \
			echo ""; \
			echo "ERROR: process restarted ($$nrest times) during startup - crash loop detected."; \
			echo "----- journalctl --user -u $(SYSTEMD_UNIT) -n 80 --no-pager -----"; \
			journalctl --user -u $(SYSTEMD_UNIT) -n 80 --no-pager; \
			echo "----- end journal -----"; \
			exit 1; \
		fi; \
		if echo "$$code" | grep -qE '^2'; then \
			echo ""; \
			echo "[dev-start] Dev server ready - http://0.0.0.0:$(DEV_PORT)"; \
			echo "[dev-start] Logs:  make dev-logs"; \
			echo "[dev-start] Stop:  make dev-stop"; \
			exit 0; \
		fi; \
		sleep $(DEV_START_POLL_INTERVAL); \
	done; \
	echo ""; \
	echo "ERROR: Dev server did not respond within probe window (process alive but no HTTP)."; \
	echo "----- journalctl --user -u $(SYSTEMD_UNIT) -n 80 --no-pager -----"; \
	journalctl --user -u $(SYSTEMD_UNIT) -n 80 --no-pager; \
	echo "----- end journal -----"; \
	exit 1

.PHONY: dev
dev: dev-start ## Alias for dev-start

.PHONY: dev-disable-autostart
dev-disable-autostart: ## Disable wiki-ci-dev autostart on login (stops systemd resurrecting old runs)
	systemctl --user disable $(SYSTEMD_UNIT) 2>&1; rc=$$?; if [ $$rc -ne 0 ]; then \
		echo "[dev-disable-autostart] disable returned $$rc (ok if unit missing)"; \
	fi
	echo "[dev-disable-autostart] $(SYSTEMD_UNIT) will not start on login until 'make dev-start' runs again."

.PHONY: dev-stop
dev-stop: ## Stop dev server
	echo "[dev-stop] systemctl --user stop $(SYSTEMD_UNIT)"
	systemctl --user stop $(SYSTEMD_UNIT) 2>&1; rc=$$?; if [ $$rc -ne 0 ]; then \
		echo "[dev-stop] stop returned $$rc (ok if not running)"; \
	fi
	echo "[dev-stop] systemctl --user disable $(SYSTEMD_UNIT)"
	systemctl --user disable $(SYSTEMD_UNIT) 2>&1; rc=$$?; if [ $$rc -ne 0 ]; then \
		echo "[dev-stop] disable returned $$rc (ok if not enabled)"; \
	fi
	if systemctl --user is-failed $(SYSTEMD_UNIT) 2>&1; then \
		systemctl --user reset-failed $(SYSTEMD_UNIT); \
	fi
	rm -f $(SYSTEMD_DIR)/$(SYSTEMD_UNIT)
	systemctl --user daemon-reload
	echo "[dev-stop] Done. Unit file removed."

.PHONY: dev-sync-content
dev-sync-content: ## Mirror WORKSPACE-WEB-CONTENT into content/ and public/landing/
	$(NODE) scripts/sync-web-content.mjs

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
	if [ $$_curl_rc -ne 0 ]; then echo "[dev-status] curl probe (rc=$$_curl_rc): $$(cat "$$_curl_err")" >&2; fi; \
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

.PHONY: prod-build prod-start prod-stop prod-restart prod-status prod-logs
prod-build: ## Build production wiki image (context: projects root)
	./scripts/prod.sh build
prod-start: ## Start production stack (HTTP :$(PROD_HTTP_PORT), HTTPS :$(PROD_HTTPS_PORT))
	./scripts/prod.sh start
prod-stop: ## Stop production stack
	./scripts/prod.sh stop
prod-restart: ## Restart production stack
	./scripts/prod.sh restart
prod-status: ## Show production stack status + HTTP probe
	./scripts/prod.sh status
prod-logs: ## Tail production stack logs
	./scripts/prod.sh logs

# =============================================================================
# Code Quality
# =============================================================================

.PHONY: lint
lint: ## Run eslint
	npx eslint .

.PHONY: type-check
type-check: ## Run tsc --noEmit
	ln -sfn ../../web/node_modules ../tests/web/node_modules
	npx tsc --noEmit

.PHONY: test
test: ## Run vitest
	npx vitest run

.PHONY: check
check: ## Run lint + type-check + test
	$(MAKE) lint && $(MAKE) type-check && $(MAKE) test

# =============================================================================
# Cleanup
# =============================================================================

.PHONY: clean
clean: ## Remove .next and node_modules
	rm -rf .next node_modules

.PHONY: clean-build
clean-build: ## Remove .next only
	rm -rf .next
