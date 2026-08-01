# Makefile for @workspace-ci/web-components shared package

SHELL := /bin/bash

# The guard's alt-interp rule blocks interpreter names (and paths
# containing them, like node-env/bin) in command text, so recipes cannot
# invoke boot node tools directly. Script bodies are exempt by design
# (shell_guard_policy_matrix: script-interp-ok): route through the
# dispatcher script (same pattern as web/Makefile).
WEB_TOOL := bash $(abspath ..)/scripts/web-tool

.PHONY: lint
lint: ## Run eslint
	$(WEB_TOOL) lint web-components

.PHONY: type-check
type-check: ## Run tsc --noEmit
	$(WEB_TOOL) typecheck web-components

.PHONY: test
test: ## Run vitest
	$(WEB_TOOL) test web-components

.PHONY: check
check: ## Run lint + type-check + test
	$(MAKE) lint && $(MAKE) type-check && $(MAKE) test

.PHONY: clean
clean: ## Remove coverage and node_modules
	rm -rf coverage node_modules
