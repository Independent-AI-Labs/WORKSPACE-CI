# Makefile for @workspace-ci/web-components shared package

SHELL := /bin/bash

# The guard's alt-interp rule blocks interpreter names (and paths
# containing them, like node-env/bin) in command text, so recipes cannot
# invoke boot node tools directly. Script bodies are exempt by design
# (shell_guard_policy_matrix: script-interp-ok): route through the
# wrapper script (same pattern as web/Makefile).
RUN_JS := bash $(abspath ..)/scripts/run-boot-js

.PHONY: lint
lint: ## Run eslint
	$(RUN_JS) npx eslint .

.PHONY: type-check
type-check: ## Run tsc --noEmit
	$(RUN_JS) npx tsc --noEmit

.PHONY: test
test: ## Run vitest
	$(RUN_JS) npx vitest run

.PHONY: check
check: ## Run lint + type-check + test
	$(MAKE) lint && $(MAKE) type-check && $(MAKE) test

.PHONY: clean
clean: ## Remove coverage and node_modules
	rm -rf coverage node_modules
