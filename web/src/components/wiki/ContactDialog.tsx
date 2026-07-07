'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Icon } from '@/components/ui/Icon'
import type { Branding } from '@/lib/branding'

interface ContactDialogProps {
  title: string
  fullTitle: string
  issuer: string
  price?: string
  purchaseUrl?: string
  branding: Branding
}

function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '')
}

export function ContactDialog({
  title,
  fullTitle,
  issuer,
  price,
  purchaseUrl,
  branding,
}: ContactDialogProps) {
  const [open, setOpen] = useState(false)
  const contactEmail = branding.contact_email

  return (
    <>
      <button
        type="button"
        className="contact-dialog-trigger"
        onClick={() => setOpen(true)}
        aria-label={`Contact for access to ${title}`}
      >
        <Icon name="ri-mail-line" size="sm" />
        {branding.contact_button_label}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={fillTemplate(branding.contact_modal_title_template, { title })}
        titleId={`contact-${title}`}
        ariaLabel={`Contact information for ${title}`}
        className="contact-dialog"
      >
        <p className="contact-dialog__full-title">{fullTitle}</p>
        <p className="contact-dialog__body">
          {fillTemplate(branding.contact_body_template, { title, issuer })}
        </p>
        {price && (
          <p className="contact-dialog__price">
            <strong>Price:</strong> {price}
          </p>
        )}
        <p className="contact-dialog__body">
          {branding.contact_instruction}
        </p>
        <a
          href={`mailto:${contactEmail}`}
          className="contact-dialog__email btn btn--primary"
        >
          <Icon name="ri-mail-line" size="sm" />
          {contactEmail}
        </a>
        {purchaseUrl && (
          <>
            <p className="contact-dialog__body">
              {branding.contact_alt_purchase}
            </p>
            <a
              href={purchaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="contact-dialog__purchase"
            >
              {fillTemplate(branding.contact_issuer_store_template, { issuer })}
              <Icon name="ri-external-link-line" size="sm" />
            </a>
          </>
        )}
      </Modal>
    </>
  )
}
