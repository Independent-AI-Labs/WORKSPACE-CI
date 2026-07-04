'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { CopyButton } from '@/components/ui/CopyButton'

interface FunctionCodeDialogProps {
  functionName: string
  sourceFile: string
  source: string
  docstring?: string
}

export function FunctionCodeDialog({
  functionName,
  sourceFile,
  source,
  docstring,
}: FunctionCodeDialogProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        className="pattern-card__function-ref"
        onClick={() => setOpen(true)}
        aria-label={`Show source code for ${functionName}`}
      >
        {functionName}()
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={functionName}
        titleId={`fn-code-title-${functionName}`}
        ariaLabel={`Source code for detector function ${functionName}`}
        className="function-code-dialog"
      >
        <div className="function-code-dialog__meta">
          <span className="function-code-dialog__file">{sourceFile}</span>
          {docstring && (
            <p className="function-code-dialog__docstring">{docstring}</p>
          )}
        </div>
        <div className="function-code-dialog__code-wrapper">
          <CopyButton text={source} label="Copy code" />
          <pre className="function-code-dialog__code">
            <code>{source}</code>
          </pre>
        </div>
      </Modal>
    </>
  )
}
