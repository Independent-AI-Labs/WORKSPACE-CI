import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Modal } from '@/components/ui/Modal'

describe('Modal', () => {
  it('dialog is not open when closed', () => {
    render(
      <Modal open={false} onClose={() => {}}>
        <p>Hidden content</p>
      </Modal>,
    )
    const dialog = screen.getByText('Hidden content').closest('dialog')
    expect(dialog).not.toBeNull()
    expect(dialog!.open).toBe(false)
  })

  it('renders children when open', () => {
    render(
      <Modal open={true} onClose={() => {}}>
        <p>Modal content</p>
      </Modal>,
    )
    expect(screen.getByText('Modal content')).toBeInTheDocument()
    const dialog = screen.getByText('Modal content').closest('dialog')
    expect(dialog!.open).toBe(true)
  })

  it('renders title with id for aria-labelledby', () => {
    render(
      <Modal open={true} onClose={() => {}} title="My Modal">
        <p>Content</p>
      </Modal>,
    )
    const heading = screen.getByText('My Modal')
    const dialog = screen.getByText('Content').closest('dialog')
    expect(dialog).toHaveAttribute('aria-labelledby', heading.id)
  })

  it('renders close button with aria-label', () => {
    render(
      <Modal open={true} onClose={() => {}} title="Test">
        <p>Content</p>
      </Modal>,
    )
    expect(screen.getByLabelText('Close dialog')).toBeInTheDocument()
  })

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn()
    render(
      <Modal open={true} onClose={onClose} title="Test">
        <p>Content</p>
      </Modal>,
    )
    fireEvent.click(screen.getByLabelText('Close dialog'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose on cancel event', () => {
    const onClose = vi.fn()
    render(
      <Modal open={true} onClose={onClose}>
        <p>Content</p>
      </Modal>,
    )
    const dialog = screen.getByText('Content').closest('dialog')
    expect(dialog).not.toBeNull()
    dialog!.dispatchEvent(new Event('cancel'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
