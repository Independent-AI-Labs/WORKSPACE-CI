# workspace-ci Makefile Contract v1.0
# ──────────────────────────────────────────────────────────────────────────────
# Include at the top of your Makefile:
#
#   CI_DIR := $(shell cd "$$(git rev-parse --show-toplevel 2>/dev/null)/path/to/ci" 2>/dev/null && pwd)
#   -include $(CI_DIR)/lib/makefile_contract.mk
#
# Required targets: init, install, install-ci, install-hooks, sync, check, lint,
#                   type-check, test, clean, preflight
# ──────────────────────────────────────────────────────────────────────────────

CONTRACT_VERSION := 1.0
CONTRACT_TARGETS := init install install-ci install-hooks sync check lint type-check test clean preflight

.PHONY: contract-check
contract-check: ## Verify Makefile implements all required contract targets
	@_missing=""; _count=0; _total=0; \
	for t in $(CONTRACT_TARGETS); do \
		_total=$$((_total + 1)); \
		if ! $(MAKE) -n $$t > /dev/null 2>&1; then \
			_missing="$$_missing $$t"; \
		else \
			_count=$$((_count + 1)); \
		fi; \
	done; \
	if [ -n "$$_missing" ]; then \
		echo ""; \
		echo "⚠  MAKEFILE CONTRACT v$(CONTRACT_VERSION) — VIOLATION"; \
		echo "   Missing required targets:$$_missing"; \
		echo "   Implemented: $$_count / $$_total"; \
		echo ""; \
		echo "   For a full compliance scan run: make compliance PROJECT=."; \
		echo ""; \
	else \
		echo "✓ Makefile contract v$(CONTRACT_VERSION): $$_count/$$_total targets present"; \
		echo "  For a full compliance scan run: make compliance PROJECT=."; \
	fi
