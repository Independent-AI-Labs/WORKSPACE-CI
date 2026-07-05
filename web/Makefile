# Makefile for workspace-ci Wiki (Next.js 16)
# Manages the dev server via systemd user services.
# Pattern copied from WORKSPACE-PORTAL.

SHELL := /bin/bash

# Wiki lives at WORKSPACE-VM/projects/CI/web (3 levels under WORKSPACE-VM),
# so .boot-linux/node-env (which holds Node) is reached via ../../.. .
# WORKSPACE-PORTAL uses ../.. because it sits at projects/WORKSPACE-PORTAL (2 levels).
AGENTS_ROOT := $(abspath ../../..)
AGENTS_BOOT := $(AGENTS_ROOT)/.boot-linux
NODE_BIN := $(AGENTS_BOOT)/node-env/bin
NODE := $(NODE_BIN)/node
NPM := $(NODE_BIN)/npm

export PATH := $(NODE_BIN):$(PATH)

DEV_PORT := 3001
SYSTEMD_UNIT := wiki-ci-dev.service
SYSTEMD_DIR := $(HOME)/.config/systemd/user
PROJECT_ROOT := $(abspath .)

.PHONY: help
help: ## Show this help
	@echo "workspace-ci Wiki Makefile"
	@echo ""
	@echo "Development targets:"
	@echo "  dev-start    Start dev server (Next.js HMR on 0.0.0.0:$(DEV_PORT))"
	@echo "  dev          Alias for dev-start"
	@echo "  dev-stop     Stop dev server"
	@echo "  dev-restart  Restart dev server (stop + start)"
	@echo "  dev-status   Show dev server status"
	@echo "  dev-logs     Tail dev server logs"
	@echo ""
	@echo "Code quality:"
	@echo "  lint         Run eslint"
	@echo "  type-check   Run tsc --noEmit"
	@echo "  test         Run vitest"
	@echo "  check        Run lint + type-check + test"
	@echo ""
	@echo "Cleanup:"
	@echo "  clean        Remove .next and node_modules"
	@echo "  clean-build  Remove .next only"

# =============================================================================
# Development Targets
# =============================================================================

.PHONY: dev-start
dev-start: ## Start dev server (Next.js HMR)
	@if [ ! -x "$(NODE)" ]; then \
		echo "ERROR: Bootstrapped Node.js not found at $(NODE)"; \
		echo "  Run the workspace bootstrap (cd $(AGENTS_ROOT) && ...), or fix AGENTS_ROOT in this Makefile."; \
		exit 1; \
	fi
	@mkdir -p $(SYSTEMD_DIR)
	@echo "[dev-start] Installing systemd user unit -> $(SYSTEMD_DIR)/$(SYSTEMD_UNIT)"
	@sed \
		-e 's|__PROJECT_ROOT__|$(PROJECT_ROOT)|g' \
		-e 's|__NODE_BIN__|$(NODE_BIN)|g' \
		-e 's|__NODE__|$(NODE)|g' \
		-e 's|__DEV_PORT__|$(DEV_PORT)|g' \
		res/wiki-ci-dev.service.tmpl > $(SYSTEMD_DIR)/$(SYSTEMD_UNIT)
	@systemctl --user daemon-reload
	@if systemctl --user is-failed $(SYSTEMD_UNIT) 2>&1; then \
		systemctl --user reset-failed $(SYSTEMD_UNIT); \
	fi
	@echo "[dev-start] systemctl --user restart $(SYSTEMD_UNIT)"
	@systemctl --user restart $(SYSTEMD_UNIT)
	@systemctl --user enable $(SYSTEMD_UNIT)
	@echo "[dev-start] startup log snapshot (last 30 lines):"
	@journalctl --user -u $(SYSTEMD_UNIT) -n 30 --no-pager
	@sleep 3
	@result=$$(systemctl --user show $(SYSTEMD_UNIT) -p Result --value 2>&1); \
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
	@echo "[dev-start] process alive, waiting for HTTP on port $(DEV_PORT) (max 40s)..."
	@for i in $$(seq 1 20); do \
		state=$$(systemctl --user is-active $(SYSTEMD_UNIT) 2>&1); \
		nrest=$$(systemctl --user show $(SYSTEMD_UNIT) -p NRestarts --value 2>&1); \
		code=$$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://127.0.0.1:$(DEV_PORT)/ 2>&1); \
		echo "[dev-start] attempt $$i/20: state=$$state http=$$code restarts=$$nrest"; \
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
		if echo "$$code" | grep -qE '^[2-5]'; then \
			echo ""; \
			echo "[dev-start] Dev server ready - http://0.0.0.0:$(DEV_PORT)"; \
			echo "[dev-start] Logs:  make dev-logs"; \
			echo "[dev-start] Stop:  make dev-stop"; \
			exit 0; \
		fi; \
		sleep 2; \
	done; \
	echo ""; \
	echo "ERROR: Dev server did not respond within 40s (process alive but no HTTP)."; \
	echo "----- journalctl --user -u $(SYSTEMD_UNIT) -n 80 --no-pager -----"; \
	journalctl --user -u $(SYSTEMD_UNIT) -n 80 --no-pager; \
	echo "----- end journal -----"; \
	exit 1

.PHONY: dev
dev: dev-start ## Alias for dev-start

.PHONY: dev-stop
dev-stop: ## Stop dev server
	@echo "[dev-stop] systemctl --user stop $(SYSTEMD_UNIT)"
	@systemctl --user stop $(SYSTEMD_UNIT) 2>&1; rc=$$?; if [ $$rc -ne 0 ]; then \
		echo "[dev-stop] stop returned $$rc (ok if not running)"; \
	fi
	@echo "[dev-stop] systemctl --user disable $(SYSTEMD_UNIT)"
	@systemctl --user disable $(SYSTEMD_UNIT) 2>&1; rc=$$?; if [ $$rc -ne 0 ]; then \
		echo "[dev-stop] disable returned $$rc (ok if not enabled)"; \
	fi
	@if systemctl --user is-failed $(SYSTEMD_UNIT) 2>&1; then \
		systemctl --user reset-failed $(SYSTEMD_UNIT); \
	fi
	@rm -f $(SYSTEMD_DIR)/$(SYSTEMD_UNIT)
	@systemctl --user daemon-reload
	@echo "[dev-stop] Done. Unit file removed."

.PHONY: dev-restart
dev-restart: ## Restart dev server (stop + start)
	@$(MAKE) dev-stop
	@$(MAKE) dev-start

.PHONY: dev-status
dev-status: ## Show dev server status
	@svc=$$(systemctl --user is-active $(SYSTEMD_UNIT) 2>&1); echo "Service: $$svc"
	@code=$$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$(DEV_PORT)/ 2>&1); echo "HTTP:    $$code"
	@echo "Port:    $(DEV_PORT)"
	@echo "Logs:    journalctl --user -u $(SYSTEMD_UNIT) -f"

.PHONY: dev-logs
dev-logs: ## Print dev server logs (last 100 lines)
	@journalctl --user -u $(SYSTEMD_UNIT) --no-pager -n 100

# =============================================================================
# Code Quality
# =============================================================================

.PHONY: lint
lint: ## Run eslint
	npx eslint .

.PHONY: type-check
type-check: ## Run tsc --noEmit
	npx tsc --noEmit

.PHONY: test
test: ## Run vitest
	npx vitest run

.PHONY: check
check: ## Run lint + type-check + test
	@$(MAKE) lint && $(MAKE) type-check && $(MAKE) test

# =============================================================================
# Cleanup
# =============================================================================

.PHONY: clean
clean: ## Remove .next and node_modules
	rm -rf .next node_modules

.PHONY: clean-build
clean-build: ## Remove .next only
	rm -rf .next
