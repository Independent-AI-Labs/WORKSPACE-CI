import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { ConfigDialog } from '@/components/wiki/ConfigDialog'
import type { ConfigSchema } from '@/types/content'

const mockShowModal = vi.fn()
const mockClose = vi.fn()

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = mockShowModal
  HTMLDialogElement.prototype.close = mockClose
  mockShowModal.mockClear()
  mockClose.mockClear()
})

const schema: ConfigSchema = {
  config: 'banned_words',
  description: 'Universal banned-pattern rules and exceptions.',
  fields: [
    {
      path: 'version',
      type: 'string',
      required: true,
      description: 'Schema version of the banned-words config.',
    },
    {
      path: 'banned',
      type: 'list',
      required: false,
      description: 'The universal banned-pattern list.',
    },
    {
      path: 'banned[].pattern',
      type: 'string',
      required: true,
      description: 'Regex pattern to match in file contents.',
    },
    {
      path: 'banned[].reason',
      type: 'string',
      required: true,
      description: 'Human-readable explanation of why the pattern is banned.',
    },
  ],
}

const defaultProps = {
  name: 'banned_words.yaml',
  sourceFile: 'config/banned_words.yaml',
  rawContent: 'version: "1"\nbanned: []\n',
  highlightedHtml:
    '<pre class="shiki"><code>version: "1"\nbanned: []</code></pre>',
  schema,
  values: { version: '1', banned: [] },
  titleId: 'config-src-banned_words',
}

function openDialog(container: HTMLElement) {
  const btn = container.querySelector('.entry-point-link') as HTMLButtonElement
  fireEvent.click(btn)
}

describe('ConfigDialog', () => {
  it('renders a clickable name button', () => {
    const { container } = render(<ConfigDialog {...defaultProps} />)
    const btn = container.querySelector('.entry-point-link')
    expect(btn).toBeTruthy()
    expect(btn?.tagName).toBe('BUTTON')
    expect(btn?.textContent).toBe('banned_words.yaml')
  })

  it('opens modal dialog on button click', () => {
    const { container } = render(<ConfigDialog {...defaultProps} />)
    openDialog(container)
    expect(mockShowModal).toHaveBeenCalledTimes(1)
  })

  it('shows Schema tab as active by default', () => {
    const { container } = render(<ConfigDialog {...defaultProps} />)
    openDialog(container)
    const tabs = container.querySelectorAll('.config-dialog__tab')
    expect(tabs.length).toBe(2)
    expect(tabs[0].classList.contains('is-active')).toBe(true)
    expect(tabs[1].classList.contains('is-active')).toBe(false)
    const schemaCards = container.querySelector('.schema-cards')
    expect(schemaCards).toBeTruthy()
  })

  it('switches to File tab on click', () => {
    const { container } = render(<ConfigDialog {...defaultProps} />)
    openDialog(container)
    const fileTab = container.querySelectorAll('.config-dialog__tab')[1]
    fireEvent.click(fileTab)
    expect(fileTab.classList.contains('is-active')).toBe(true)
    const codeEl = container.querySelector('.entry-point-dialog__code')
    expect(codeEl?.innerHTML).toContain('version')
  })

  it('renders schema field cards with path and description', () => {
    const { container, getByText } = render(
      <ConfigDialog {...defaultProps} />,
    )
    openDialog(container)
    expect(getByText('Universal banned-pattern rules and exceptions.')).toBeInTheDocument()
    expect(getByText('Schema version of the banned-words config.')).toBeInTheDocument()
    expect(getByText('Regex pattern to match in file contents.')).toBeInTheDocument()
  })

  it('groups fields by top-level with nested sub-cards', () => {
    const { container } = render(<ConfigDialog {...defaultProps} />)
    openDialog(container)
    const topCards = container.querySelectorAll(
      '.schema-card:not(.schema-card--nested)',
    )
    expect(topCards.length).toBe(2)
    const nestedCards = container.querySelectorAll('.schema-card--nested')
    expect(nestedCards.length).toBe(2)
  })

  it('shows warning when schema is null', () => {
    const { container, getByText } = render(
      <ConfigDialog {...defaultProps} schema={null} />,
    )
    openDialog(container)
    expect(getByText('No schema file found.')).toBeInTheDocument()
  })

  it('renders source file path in File tab', () => {
    const { container, getByText } = render(
      <ConfigDialog {...defaultProps} />,
    )
    openDialog(container)
    const fileTab = container.querySelectorAll('.config-dialog__tab')[1]
    fireEvent.click(fileTab)
    expect(getByText('config/banned_words.yaml')).toBeInTheDocument()
  })
})
