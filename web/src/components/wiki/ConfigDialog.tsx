'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { CopyButton } from '@/components/ui/CopyButton'
import type { ConfigSchema } from '@/types/content'
import { SchemaFieldCards } from '@/components/wiki/SchemaFieldCards'

interface ConfigDialogProps {
  name: string
  sourceFile: string
  rawContent: string
  highlightedHtml: string
  schema: ConfigSchema | null
  values: Record<string, unknown>
  titleId: string
}

export function ConfigDialog({
  name,
  sourceFile,
  rawContent,
  highlightedHtml,
  schema,
  values,
  titleId,
}: ConfigDialogProps) {
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'schema' | 'file'>('schema')

  return (
    <>
      <button
        type="button"
        className="entry-point-link"
        onClick={() => setOpen(true)}
        aria-label={`Show details for ${name}`}
      >
        {name}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={name}
        titleId={titleId}
        ariaLabel={`Configuration details for ${name}`}
        className="config-dialog"
      >
        <div className="config-dialog__tabs">
          <button
            type="button"
            className={`config-dialog__tab${activeTab === 'schema' ? ' is-active' : ''}`}
            onClick={() => setActiveTab('schema')}
          >
            Schema
          </button>
          <button
            type="button"
            className={`config-dialog__tab${activeTab === 'file' ? ' is-active' : ''}`}
            onClick={() => setActiveTab('file')}
          >
            File
          </button>
        </div>
        <div className="config-dialog__body">
          {activeTab === 'schema' ? (
            schema ? (
              <SchemaFieldCards schema={schema} values={values} />
            ) : (
              <p className="warning">No schema file found.</p>
            )
          ) : (
            <div className="entry-point-dialog__code-wrapper">
              <CopyButton text={rawContent} label="Copy YAML" />
              <div className="entry-point-dialog__file" style={{ marginBottom: 'var(--space-2)' }}>
                {sourceFile}
              </div>
              <div
                className="entry-point-dialog__code"
                dangerouslySetInnerHTML={{ __html: highlightedHtml }}
              />
            </div>
          )}
        </div>
      </Modal>
    </>
  )
}
