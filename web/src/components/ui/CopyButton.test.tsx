import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CopyButton } from '@/components/ui/CopyButton'

afterEach(() => {
  vi.useRealTimers()
})

function mockClipboard(writeText: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    writable: true,
    configurable: true,
  })
}

describe('CopyButton', () => {
  it('renders with idle label', () => {
    render(<CopyButton text="hello" />)
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
  })

  it('calls navigator.clipboard.writeText on click', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    mockClipboard(writeText)

    render(<CopyButton text="hello" />)
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('hello')
    })
  })

  it('shows copied label after successful copy', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    mockClipboard(writeText)

    render(<CopyButton text="hello" />)
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
    })
  })

  it('resets to idle after timeout', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockResolvedValue(undefined)
    mockClipboard(writeText)

    render(<CopyButton text="hello" />)
    fireEvent.click(screen.getByRole('button'))
    await vi.advanceTimersByTimeAsync(2100)
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
  })

  it('shows failed label on clipboard error', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    mockClipboard(writeText)

    render(<CopyButton text="hello" />)
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Copy failed' })).toBeInTheDocument()
    })
  })

  it('has live region for screen reader announcement', () => {
    render(<CopyButton text="hello" />)
    const liveRegion = document.querySelector('[role="status"]')
    expect(liveRegion).not.toBeNull()
    expect(liveRegion).toHaveAttribute('aria-live', 'polite')
  })

  it('button is disabled during copying', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockReturnValue(new Promise(() => {}))
    mockClipboard(writeText)

    render(<CopyButton text="hello" />)
    fireEvent.click(screen.getByRole('button'))
    await vi.advanceTimersByTimeAsync(0)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('supports custom labels', () => {
    render(
      <CopyButton
        text="hello"
        label="Copy code"
        copiedLabel="Copied!"
        failedLabel="Failed"
      />,
    )
    expect(screen.getByRole('button', { name: 'Copy code' })).toBeInTheDocument()
  })
})
