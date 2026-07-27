# hitl/backend Makefile
# Cargo quality gates for the HITL relay workspace (NFR-3.4).

.DEFAULT_GOAL := help

.PHONY: help
help: ## Show this help
	grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

.PHONY: lint
lint: ## cargo fmt --check + clippy deny-warnings
	cargo fmt --all -- --check
	cargo clippy --workspace --all-targets -- -D warnings

.PHONY: type-check
type-check: ## cargo check across the workspace
	cargo check --workspace --all-targets

.PHONY: test
test: ## cargo test across the workspace
	cargo test --workspace

.PHONY: check
check: lint type-check test ## Run all cargo gates
	:

.PHONY: clean
clean: ## cargo clean
	cargo clean
