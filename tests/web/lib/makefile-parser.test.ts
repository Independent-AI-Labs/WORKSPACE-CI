import { describe, it, expect } from 'vitest'
import { parseMakefile } from '@/lib/makefile-parser'

describe('parseMakefile', () => {
  it('parses a simple target with description', () => {
    const content = 'help: ## Show this help\n\t@echo "help"'
    const targets = parseMakefile(content)
    expect(targets).toHaveLength(1)
    expect(targets[0].name).toBe('help')
    expect(targets[0].description).toBe('Show this help')
    expect(targets[0].prerequisites).toEqual([])
    expect(targets[0].section).toBe('General')
  })

  it('parses target with prerequisites', () => {
    const content = 'install: preflight install-deps ## Full install'
    const targets = parseMakefile(content)
    expect(targets).toHaveLength(1)
    expect(targets[0].name).toBe('install')
    expect(targets[0].description).toBe('Full install')
    expect(targets[0].prerequisites).toEqual(['preflight', 'install-deps'])
  })

  it('parses target without description', () => {
    const content = 'build: main.c\n\tgcc -o build main.c'
    const targets = parseMakefile(content)
    expect(targets).toHaveLength(1)
    expect(targets[0].name).toBe('build')
    expect(targets[0].description).toBe('')
  })

  it('detects section headers and groups targets', () => {
    const content = [
      '# =============================================================================',
      '# Setup',
      '# =============================================================================',
      '.PHONY: init',
      'init: ## Install deps',
      '',
      '# =============================================================================',
      '# Quality Gates',
      '# =============================================================================',
      '.PHONY: lint',
      'lint: ## Run linter',
    ].join('\n')
    const targets = parseMakefile(content)
    expect(targets).toHaveLength(2)
    expect(targets[0].name).toBe('init')
    expect(targets[0].section).toBe('Setup')
    expect(targets[1].name).toBe('lint')
    expect(targets[1].section).toBe('Quality Gates')
  })

  it('skips private targets (underscore-prefixed)', () => {
    const content = [
      '_lint-impl:',
      '\t$(RUFF) format ci/',
      '',
      'lint: ## Run linter',
    ].join('\n')
    const targets = parseMakefile(content)
    expect(targets).toHaveLength(1)
    expect(targets[0].name).toBe('lint')
  })

  it('skips special targets (dot-prefixed)', () => {
    const content = '.PHONY: help\nhelp: ## Show help'
    const targets = parseMakefile(content)
    expect(targets).toHaveLength(1)
    expect(targets[0].name).toBe('help')
  })

  it('skips variable assignments', () => {
    const content = [
      'SHELL := /bin/bash',
      'RUFF := .venv/bin/ruff',
      'PYTEST := .venv/bin/python -m pytest',
      'help: ## Show help',
    ].join('\n')
    const targets = parseMakefile(content)
    expect(targets).toHaveLength(1)
    expect(targets[0].name).toBe('help')
  })

  it('tracks phony targets', () => {
    const content = [
      '.PHONY: install lint test',
      'install: ## Install deps',
      'lint: ## Run linter',
      'test: ## Run tests',
    ].join('\n')
    const targets = parseMakefile(content)
    expect(targets).toHaveLength(3)
    expect(targets[0].phony).toBe(true)
    expect(targets[1].phony).toBe(true)
    expect(targets[2].phony).toBe(true)
  })

  it('marks non-phony targets as not phony', () => {
    const content = 'build: main.c ## Build project'
    const targets = parseMakefile(content)
    expect(targets).toHaveLength(1)
    expect(targets[0].phony).toBe(false)
  })

  it('handles line continuations in .PHONY declarations', () => {
    const content = [
      '.PHONY: dev-start dev-stop dev-restart \\',
      '        dev-clean dev-shell',
      'dev-start: ## Start dev server',
      'dev-stop: ## Stop dev server',
    ].join('\n')
    const targets = parseMakefile(content)
    expect(targets).toHaveLength(2)
    expect(targets[0].phony).toBe(true)
    expect(targets[1].phony).toBe(true)
  })

  it('skips export and include directives', () => {
    const content = [
      'export PATH := $(PATH):/custom/bin',
      '-include lib/makefile_contract.mk',
      'help: ## Show help',
    ].join('\n')
    const targets = parseMakefile(content)
    expect(targets).toHaveLength(1)
    expect(targets[0].name).toBe('help')
  })

  it('skips ifdef/else/endif conditionals', () => {
    const content = [
      '_lint-impl:',
      'ifdef CI',
      '\t$(RUFF) format --check ci/',
      'else',
      '\t$(RUFF) format ci/',
      'endif',
      'lint: ## Run linter',
    ].join('\n')
    const targets = parseMakefile(content)
    expect(targets).toHaveLength(1)
    expect(targets[0].name).toBe('lint')
  })

  it('uses General as default section when no section headers', () => {
    const content = 'help: ## Show help\nlint: ## Run linter'
    const targets = parseMakefile(content)
    expect(targets).toHaveLength(2)
    expect(targets[0].section).toBe('General')
    expect(targets[1].section).toBe('General')
  })

  it('returns empty array for empty content', () => {
    expect(parseMakefile('')).toEqual([])
  })

  it('returns empty array for content with no targets', () => {
    const content = '# Just a comment\n\nSHELL := /bin/bash\n'
    expect(parseMakefile(content)).toEqual([])
  })

  it('parses the CI Makefile structure correctly', () => {
    const content = [
      'SHELL := /bin/bash',
      '.DEFAULT_GOAL := help',
      '',
      '# =============================================================================',
      '# Help',
      '# =============================================================================',
      '.PHONY: help',
      'help: ## Show this help',
      '\t@grep -hE ...',
      '',
      '# =============================================================================',
      '# Setup',
      '# =============================================================================',
      '.PHONY: init',
      'init: ## Install system deps',
      '\t@echo "Installing..."',
      '.PHONY: install',
      'install: preflight install-deps ## Full install',
      '\t$(MAKE) install-hooks',
      '',
      '# =============================================================================',
      '# Quality Gates',
      '# =============================================================================',
      '.PHONY: check',
      'check: ## Run all quality gates',
      '\t@$(MAKE) _lint-impl && $(MAKE) _type-check-impl && $(MAKE) _test-impl',
      '.PHONY: _lint-impl',
      '_lint-impl:',
      '\t$(RUFF) format ci/',
    ].join('\n')
    const targets = parseMakefile(content)
    expect(targets).toHaveLength(4)
    expect(targets[0]).toEqual({
      name: 'help',
      description: 'Show this help',
      prerequisites: [],
      section: 'Help',
      phony: true,
    })
    expect(targets[1]).toEqual({
      name: 'init',
      description: 'Install system deps',
      prerequisites: [],
      section: 'Setup',
      phony: true,
    })
    expect(targets[2]).toEqual({
      name: 'install',
      description: 'Full install',
      prerequisites: ['preflight', 'install-deps'],
      section: 'Setup',
      phony: true,
    })
    expect(targets[3]).toEqual({
      name: 'check',
      description: 'Run all quality gates',
      prerequisites: [],
      section: 'Quality Gates',
      phony: true,
    })
  })
})
