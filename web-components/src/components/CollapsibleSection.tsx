'use client'

import { useId, useState, ReactNode } from 'react'
import clsx from 'clsx'

interface CollapsibleSectionProps {
  title: string
  children: ReactNode
  defaultOpen?: boolean
}

export function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const panelId = useId()
  const headerId = useId()
  return (
    <section className="collapsible-section">
      <button
        type="button"
        className="collapsible-section__header"
        id={headerId}
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen(!isOpen)}
      >
        <i
          className={clsx('ri-arrow-right-s-line', isOpen && 'is-rotated')}
          aria-hidden="true"
        />
        {title}
      </button>
      <div
        className="collapsible-section__content"
        id={panelId}
        role="region"
        aria-labelledby={headerId}
        hidden={!isOpen}
      >
        {children}
      </div>
    </section>
  )
}
