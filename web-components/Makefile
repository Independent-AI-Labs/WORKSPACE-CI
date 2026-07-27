# Makefile for @workspace-ci/web-components shared package

SHELL := /bin/bash

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
	$(MAKE) lint && $(MAKE) type-check && $(MAKE) test

.PHONY: clean
clean: ## Remove coverage and node_modules
	rm -rf coverage node_modules
