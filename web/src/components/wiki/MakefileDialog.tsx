'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { CopyButton } from '@/components/ui/CopyButton'
import { MakefileTargetCards } from '@/components/wiki/MakefileTargetCards'
import type { MakefileTarget } from '@/types/makefile'

interface MakefileDialogProps {
  name: string
  sourceFile: string
  rawContent: string
  highlightedHtml: string
  targets: MakefileTarget[]
  titleId: string
}

export function MakefileDialog({
  name,
  sourceFile,
  rawContent,
  highlightedHtml,
  targets,
  titleId,
}: MakefileDialogProps) {
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'targets' | 'file'>('targets')

  return (
    <>
      <button
        type="button"
        className="wiki-card__cta"
        onClick={() => setOpen(true)}
        aria-label={`Show Makefile targets for ${name}`}
      >
        Makefile
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`${name} Makefile`}
        titleId={titleId}
        ariaLabel={`Makefile targets for ${name}`}
        className="makefile-dialog"
        toolbar={
          <div className="config-dialog__tabs">
            <button
              type="button"
              className={`config-dialog__tab${activeTab === 'targets' ? ' is-active' : ''}`}
              onClick={() => setActiveTab('targets')}
            >
              Targets
            </button>
            <button
              type="button"
              className={`config-dialog__tab${activeTab === 'file' ? ' is-active' : ''}`}
              onClick={() => setActiveTab('file')}
            >
              File
            </button>
          </div>
        }
      >
        {activeTab === 'targets' ? (
          targets.length > 0 ? (
            <MakefileTargetCards targets={targets} />
          ) : (
            <p className="warning">No public targets found in Makefile.</p>
          )
        ) : (
          <div className="entry-point-dialog__code-wrapper">
            <CopyButton text={rawContent} label="Copy Makefile" />
            <div className="entry-point-dialog__file" style={{ marginBottom: 'var(--space-2)' }}>
              {sourceFile}
            </div>
            <div
              className="entry-point-dialog__code"
              dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            />
          </div>
        )}
      </Modal>
    </>
  )
}
