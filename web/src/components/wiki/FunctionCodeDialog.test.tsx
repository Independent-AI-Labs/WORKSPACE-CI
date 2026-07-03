import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { FunctionCodeDialog } from '@/components/wiki/FunctionCodeDialog'

const mockShowModal = vi.fn()
const mockClose = vi.fn()

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = mockShowModal
  HTMLDialogElement.prototype.close = mockClose
  mockShowModal.mockClear()
  mockClose.mockClear()
})

describe('FunctionCodeDialog', () => {
  const defaultProps = {
    functionName: 'detect_python_multiline',
    sourceFile: 'lib/check_silent_swallow_python.py',
    source: 'def detect_python_multiline():\n    pass',
    docstring: 'Detect except-header followed by sole-statement body.',
  }

  it('renders a clickable function name button', () => {
    const { getByText } = render(<FunctionCodeDialog {...defaultProps} />)
    const btn = getByText('detect_python_multiline()')
    expect(btn.tagName).toBe('BUTTON')
    expect(btn).toHaveAttribute(
      'aria-label',
      'Show source code for detect_python_multiline',
    )
  })

  it('opens modal dialog on button click', () => {
    const { getByText } = render(<FunctionCodeDialog {...defaultProps} />)
    fireEvent.click(getByText('detect_python_multiline()'))
    expect(mockShowModal).toHaveBeenCalledTimes(1)
  })

  it('displays source file path in modal', () => {
    const { getByText } = render(<FunctionCodeDialog {...defaultProps} />)
    fireEvent.click(getByText('detect_python_multiline()'))
    expect(
      getByText('lib/check_silent_swallow_python.py'),
    ).toBeInTheDocument()
  })

  it('displays docstring in modal', () => {
    const { getByText } = render(<FunctionCodeDialog {...defaultProps} />)
    fireEvent.click(getByText('detect_python_multiline()'))
    expect(
      getByText('Detect except-header followed by sole-statement body.'),
    ).toBeInTheDocument()
  })

  it('displays source code in modal', () => {
    const { container, getByText } = render(
      <FunctionCodeDialog {...defaultProps} />,
    )
    fireEvent.click(getByText('detect_python_multiline()'))
    const codeElement = container.querySelector('code')
    expect(codeElement?.textContent).toBe(
      'def detect_python_multiline():\n    pass',
    )
  })

  it('renders without docstring when not provided', () => {
    const { getByText } = render(
      <FunctionCodeDialog
        functionName="my_func"
        sourceFile="lib/example.py"
        source="def my_func(): pass"
      />,
    )
    fireEvent.click(getByText('my_func()'))
    expect(getByText('lib/example.py')).toBeInTheDocument()
  })
})
