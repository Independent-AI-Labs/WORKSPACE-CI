'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Icon } from '@/components/ui/Icon'

interface ContactDialogProps {
  title: string
  fullTitle: string
  issuer: string
  price?: string
  purchaseUrl?: string
}

export function ContactDialog({
  title,
  fullTitle,
  issuer,
  price,
  purchaseUrl,
}: ContactDialogProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        className="contact-dialog-trigger"
        onClick={() => setOpen(true)}
        aria-label={`Contact for access to ${title}`}
      >
        <Icon name="ri-mail-line" size="sm" />
        Contact for Access
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Obtaining ${title}`}
        titleId={`contact-${title}`}
        ariaLabel={`Contact information for ${title}`}
        className="contact-dialog"
      >
        <p className="contact-dialog__full-title">{fullTitle}</p>
        <p className="contact-dialog__body">
          <strong>{title}</strong> is a paid standard from{' '}
          <strong>{issuer}</strong>.
        </p>
        {price && (
          <p className="contact-dialog__price">
            <strong>Price:</strong> {price}
          </p>
        )}
        <p className="contact-dialog__body">
          For standardisation and audit-related inquiries, including
          assistance with purchasing, compliance assessment, and
          implementation guidance, contact:
        </p>
        <a
          href="mailto:independentailabs@gmail.com"
          className="contact-dialog__email btn btn--primary"
        >
          <Icon name="ri-mail-line" size="sm" />
          independentailabs@gmail.com
        </a>
        {purchaseUrl && (
          <>
            <p className="contact-dialog__body">
              Or purchase directly from the issuer:
            </p>
            <a
              href={purchaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="contact-dialog__purchase"
            >
              {issuer} Store
              <Icon name="ri-external-link-line" size="sm" />
            </a>
          </>
        )}
      </Modal>
    </>
  )
}
