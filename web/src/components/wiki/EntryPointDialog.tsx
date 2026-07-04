'use client'

import { useState, type ReactNode } from 'react'
import { Modal } from '@/components/ui/Modal'
import { CopyButton } from '@/components/ui/CopyButton'

interface EntryPointDialogProps {
  name: string
  sourceFile: string
  source: string
  highlightedHtml: string
  docstring?: string
  details?: ReactNode
  titleId: string
}

export function EntryPointDialog({
  name,
  sourceFile,
  source,
  highlightedHtml,
  docstring,
  details,
  titleId,
}: EntryPointDialogProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        className="entry-point-link"
        onClick={() => setOpen(true)}
        aria-label={`Show source code for ${name}`}
      >
        {name}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={name}
        titleId={titleId}
        ariaLabel={`Source code for ${name}`}
        className="entry-point-dialog"
      >
        <div className="entry-point-dialog__meta">
          <span className="entry-point-dialog__file">{sourceFile}</span>
          {docstring && (
            <p className="entry-point-dialog__docstring">{docstring}</p>
          )}
        </div>
        {details && (
          <div className="entry-point-dialog__details">{details}</div>
        )}
        <div className="entry-point-dialog__code-wrapper">
          <CopyButton text={source} label="Copy code" />
          <div
            className="entry-point-dialog__code"
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          />
        </div>
      </Modal>
    </>
  )
}
