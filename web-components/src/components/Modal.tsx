'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { Icon } from './Icon'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  titleId?: string
  ariaLabel?: string
  className?: string
  toolbar?: ReactNode
  children: ReactNode
}

export function Modal({
  open,
  onClose,
  title,
  titleId,
  ariaLabel,
  className,
  toolbar,
  children,
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return

    if (open && !dialog.open) {
      previousFocus.current = document.activeElement as HTMLElement
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return

    function handleClose() {
      previousFocus.current?.focus()
    }

    function handleCancel(e: Event) {
      e.preventDefault()
      onClose()
    }

    dialog.addEventListener('close', handleClose)
    dialog.addEventListener('cancel', handleCancel)
    return () => {
      dialog.removeEventListener('close', handleClose)
      dialog.removeEventListener('cancel', handleCancel)
    }
  }, [onClose])

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === ref.current) {
      onClose()
    }
  }

  const resolvedTitleId = title ? (titleId ?? 'modal-title') : undefined
  const labelledBy = resolvedTitleId

  return (
    <dialog
      ref={ref}
      className={`modal-dialog${className ? ' ' + className : ''}`}
      aria-label={ariaLabel}
      aria-labelledby={labelledBy}
      onClick={handleBackdropClick}
    >
      {title && (
        <header className="modal-dialog__header">
          <h2 id={resolvedTitleId} className="modal-dialog__title">
            {title}
          </h2>
          <button
            type="button"
            className="modal-dialog__close icon-btn"
            onClick={onClose}
            aria-label="Close dialog"
            autoFocus
          >
            <Icon name="ri-close-line" size="sm" />
          </button>
        </header>
      )}
      {toolbar}
      <div className="modal-dialog__body">{children}</div>
    </dialog>
  )
}