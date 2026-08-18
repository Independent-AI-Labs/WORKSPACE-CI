# hitl/backend Makefile
# Cargo quality gates for the HITL relay workspace (NFR-3.4).

# Absolute cargo from CI's boot dir: the shell guard resets PATH on
# every exec, so a bare `cargo` cannot be found and cargo could not
# locate rustc/rustfmt/clippy-driver anyway. Prefix the boot bin dir on
# PATH per invocation (same pattern as WORKSPACE-GUARD's Makefile).
_OS := $(shell uname -s)
_BOOT_NAME := $(if $(filter Darwin,$(_OS)),.boot-macos,.boot-linux)
CARGO_BOOT_BIN := $(abspath ../..)/$(_BOOT_NAME)/bin
RUSTUP_BOOT_HOME := $(abspath ../..)/$(_BOOT_NAME)/rust
CARGO_CACHE_HOME := /tmp/workspace-ci-cargo-$(shell id -u)
CARGO := RUSTUP_HOME="$(RUSTUP_BOOT_HOME)" CARGO_HOME="$(CARGO_CACHE_HOME)" PATH="$(CARGO_BOOT_BIN):$$PATH" $(CARGO_BOOT_BIN)/cargo

.DEFAULT_GOAL := help

.PHONY: help
help: ## Show this help
	grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

.PHONY: lint
lint: ## cargo fmt --check + clippy deny-warnings
	$(CARGO) fmt --all -- --check
	$(CARGO) clippy --workspace --all-targets -- -D warnings

.PHONY: type-check
type-check: ## cargo check across the workspace
	$(CARGO) check --workspace --all-targets

.PHONY: test
test: ## cargo test across the workspace
	$(CARGO) test --workspace

.PHONY: check
check: lint type-check test ## Run all cargo gates
	:

.PHONY: clean
clean: ## cargo clean
	$(CARGO) clean
