import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { EntryPointDialog } from '@/components/wiki/EntryPointDialog'

const mockShowModal = vi.fn()
const mockClose = vi.fn()

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = mockShowModal
  HTMLDialogElement.prototype.close = mockClose
  mockShowModal.mockClear()
  mockClose.mockClear()
})

describe('EntryPointDialog', () => {
  const defaultProps = {
    name: 'detect_python_multiline()',
    sourceFile: 'lib/check_silent_swallow_python.py',
    source: 'def detect_python_multiline():\n    pass',
    highlightedHtml:
      '<pre class="shiki"><code>def detect_python_multiline():\n    pass</code></pre>',
    docstring: 'Detect except-header followed by sole-statement body.',
    titleId: 'pattern-src-test',
  }

  it('renders a clickable name button', () => {
    const { getByRole } = render(<EntryPointDialog {...defaultProps} />)
    const btn = getByRole('button', {
      name: 'Show source code for detect_python_multiline()',
    })
    expect(btn.tagName).toBe('BUTTON')
  })

  it('opens modal dialog on button click', () => {
    const { getByRole } = render(<EntryPointDialog {...defaultProps} />)
    fireEvent.click(
      getByRole('button', {
        name: 'Show source code for detect_python_multiline()',
      }),
    )
    expect(mockShowModal).toHaveBeenCalledTimes(1)
  })

  it('displays source file path in modal', () => {
    const { getByRole, getByText } = render(
      <EntryPointDialog {...defaultProps} />,
    )
    fireEvent.click(
      getByRole('button', {
        name: 'Show source code for detect_python_multiline()',
      }),
    )
    expect(
      getByText('lib/check_silent_swallow_python.py'),
    ).toBeInTheDocument()
  })

  it('displays docstring in modal', () => {
    const { getByRole, getByText } = render(
      <EntryPointDialog {...defaultProps} />,
    )
    fireEvent.click(
      getByRole('button', {
        name: 'Show source code for detect_python_multiline()',
      }),
    )
    expect(
      getByText('Detect except-header followed by sole-statement body.'),
    ).toBeInTheDocument()
  })

  it('renders highlighted HTML in modal', () => {
    const { container, getByRole } = render(
      <EntryPointDialog {...defaultProps} />,
    )
    fireEvent.click(
      getByRole('button', {
        name: 'Show source code for detect_python_multiline()',
      }),
    )
    const codeContainer = container.querySelector(
      '.entry-point-dialog__code',
    )
    expect(codeContainer?.innerHTML).toContain(
      'def detect_python_multiline',
    )
  })

  it('renders without docstring when not provided', () => {
    const { getByRole, getByText } = render(
      <EntryPointDialog
        name="my_func()"
        sourceFile="lib/example.py"
        source="def my_func(): pass"
        highlightedHtml="<pre><code>def my_func(): pass</code></pre>"
        titleId="test-src"
      />,
    )
    fireEvent.click(
      getByRole('button', { name: 'Show source code for my_func()' }),
    )
    expect(getByText('lib/example.py')).toBeInTheDocument()
  })

  it('renders details section when provided', () => {
    const { getByRole, getByText } = render(
      <EntryPointDialog
        {...defaultProps}
        details={<div data-testid="test-details">Extra info</div>}
      />,
    )
    fireEvent.click(
      getByRole('button', {
        name: 'Show source code for detect_python_multiline()',
      }),
    )
    expect(getByText('Extra info')).toBeInTheDocument()
  })
})
