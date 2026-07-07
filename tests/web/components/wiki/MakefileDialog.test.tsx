import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { MakefileDialog } from '@/components/wiki/MakefileDialog'
import type { MakefileTarget } from '@/types/makefile'

const mockShowModal = vi.fn()
const mockClose = vi.fn()

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = mockShowModal
  HTMLDialogElement.prototype.close = mockClose
  mockShowModal.mockClear()
  mockClose.mockClear()
})

const targets: MakefileTarget[] = [
  {
    name: 'install',
    description: 'Full install: deps + bootstrap binaries + hooks',
    prerequisites: ['preflight', 'install-deps'],
    section: 'Setup',
    phony: true,
  },
  {
    name: 'lint',
    description: 'Runs ruff format and ruff lint with auto-fix',
    prerequisites: [],
    section: 'Quality Gates',
    phony: true,
  },
  {
    name: 'check',
    description: 'Run all quality gates (lint + type-check + test)',
    prerequisites: [],
    section: 'Quality Gates',
    phony: true,
  },
]

const defaultProps = {
  name: 'WORKSPACE-CI',
  sourceFile: 'Makefile',
  rawContent: 'help: ## Show help\n\t@echo "help"\n',
  highlightedHtml: '<pre class="shiki"><code>help: ## Show help</code></pre>',
  targets,
  titleId: 'makefile-src-workspace-ci',
}

function openDialog(container: HTMLElement) {
  const btn = container.querySelector('.wiki-card__cta') as HTMLButtonElement
  fireEvent.click(btn)
}

describe('MakefileDialog', () => {
  it('renders a Makefile button', () => {
    const { container } = render(<MakefileDialog {...defaultProps} />)
    const btn = container.querySelector('.wiki-card__cta')
    expect(btn).toBeTruthy()
    expect(btn?.tagName).toBe('BUTTON')
    expect(btn?.textContent).toBe('Makefile')
  })

  it('opens modal dialog on button click', () => {
    const { container } = render(<MakefileDialog {...defaultProps} />)
    openDialog(container)
    expect(mockShowModal).toHaveBeenCalledTimes(1)
  })

  it('shows Targets tab as active by default', () => {
    const { container } = render(<MakefileDialog {...defaultProps} />)
    openDialog(container)
    const tabs = container.querySelectorAll('.config-dialog__tab')
    expect(tabs.length).toBe(2)
    expect(tabs[0].classList.contains('is-active')).toBe(true)
    expect(tabs[1].classList.contains('is-active')).toBe(false)
    const cards = container.querySelector('.makefile-cards')
    expect(cards).toBeTruthy()
  })

  it('switches to File tab on click', () => {
    const { container } = render(<MakefileDialog {...defaultProps} />)
    openDialog(container)
    const fileTab = container.querySelectorAll('.config-dialog__tab')[1]
    fireEvent.click(fileTab)
    expect(fileTab.classList.contains('is-active')).toBe(true)
    const codeEl = container.querySelector('.entry-point-dialog__code')
    expect(codeEl?.innerHTML).toContain('help')
  })

  it('renders target cards grouped by section', () => {
    const { container } = render(<MakefileDialog {...defaultProps} />)
    openDialog(container)
    const sections = container.querySelectorAll('.makefile-cards__section')
    expect(sections.length).toBe(2)
    const sectionTitles = container.querySelectorAll('.makefile-cards__section-title')
    expect(sectionTitles[0].textContent).toBe('Setup')
    expect(sectionTitles[1].textContent).toBe('Quality Gates')
  })

  it('renders target name, description, and prerequisites in cards', () => {
    const { container, getByText } = render(
      <MakefileDialog {...defaultProps} />,
    )
    openDialog(container)
    expect(getByText('install')).toBeInTheDocument()
    expect(getByText('Full install: deps + bootstrap binaries + hooks')).toBeInTheDocument()
    expect(getByText('preflight install-deps')).toBeInTheDocument()
  })

  it('renders .PHONY badge for phony targets', () => {
    const { container } = render(<MakefileDialog {...defaultProps} />)
    openDialog(container)
    const badges = container.querySelectorAll('.makefile-card__badge')
    expect(badges.length).toBe(3)
    expect(badges[0].textContent).toBe('.PHONY')
  })

  it('shows warning when no targets found', () => {
    const { container, getByText } = render(
      <MakefileDialog {...defaultProps} targets={[]} />,
    )
    openDialog(container)
    expect(getByText('No public targets found in Makefile.')).toBeInTheDocument()
  })

  it('renders source file path in File tab', () => {
    const { container } = render(
      <MakefileDialog {...defaultProps} />,
    )
    openDialog(container)
    const fileTab = container.querySelectorAll('.config-dialog__tab')[1]
    fireEvent.click(fileTab)
    const fileEl = container.querySelector('.entry-point-dialog__file')
    expect(fileEl?.textContent).toBe('Makefile')
  })

  it('renders modal title with project name', () => {
    const { container } = render(<MakefileDialog {...defaultProps} />)
    openDialog(container)
    const title = container.querySelector('.modal-dialog__title')
    expect(title?.textContent).toBe('WORKSPACE-CI Makefile')
  })
})
