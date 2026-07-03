'use client'

import { useState, type ReactNode } from 'react'
import clsx from 'clsx'

interface CardDetailsProps {
  label: string
  children: ReactNode
  defaultOpen?: boolean
}

export function CardDetails({ label, children, defaultOpen = false }: CardDetailsProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className="card-details">
      <button
        type="button"
        className="card-details__toggle"
        aria-expanded={isOpen}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setIsOpen(!isOpen)
        }}
      >
        <i
          className={clsx('ri-arrow-right-s-line', isOpen && 'is-rotated')}
          aria-hidden="true"
        />
        {label}
      </button>
      {isOpen && (
        <div className="card-details__content">
          {children}
        </div>
      )}
    </div>
  )
}
