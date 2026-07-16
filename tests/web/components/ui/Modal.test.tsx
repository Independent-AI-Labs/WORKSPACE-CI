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

  it('renders header outside scrollable body', () => {
    render(
      <Modal open={true} onClose={() => {}} title="Pinned header">
        <p>Scrollable content</p>
      </Modal>,
    )
    const header = screen.getByText('Pinned header').closest('header')
    const body = screen.getByText('Scrollable content').closest('.modal-dialog__body')
    expect(header).toHaveClass('modal-dialog__header')
    expect(body).toBeTruthy()
    expect(header?.parentElement).toBe(body?.parentElement)
    expect(body?.contains(header!)).toBe(false)
  })

  it('renders toolbar between header and body', () => {
    render(
      <Modal
        open={true}
        onClose={() => {}}
        title="With toolbar"
        toolbar={<div data-testid="toolbar">Tabs</div>}
      >
        <p>Body content</p>
      </Modal>,
    )
    const dialog = screen.getByText('Body content').closest('dialog')!
    const children = Array.from(dialog.children)
    expect(children[0].tagName).toBe('HEADER')
    expect(children[1]).toHaveAttribute('data-testid', 'toolbar')
    expect(children[2]).toHaveClass('modal-dialog__body')
  })
})
