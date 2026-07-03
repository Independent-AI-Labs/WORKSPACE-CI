'use client'

import { useEffect } from 'react'
import Link from 'next/link'

interface ErrorShellProps {
  title: string
  description: string
  error: Error & { digest?: string }
  reset: () => void
  backHref?: string
  backLabel?: string
  logPrefix?: string
}

export function ErrorShell({
  title,
  description,
  error,
  reset,
  backHref = '/',
  backLabel = 'Go home',
  logPrefix = 'ErrorBoundary',
}: ErrorShellProps) {
  useEffect(() => {
    console.error(`${logPrefix}:`, error)
  }, [error, logPrefix])

  return (
    <div className="error-state" role="alert">
      <h1>{title}</h1>
      <p className="text-muted">{description}</p>
      {error.digest && (
        <p className="text-muted">Error reference: {error.digest}</p>
      )}
      <div className="error-state__actions">
        <button onClick={reset} className="btn btn--primary">
          Try again
        </button>
        <Link href={backHref} className="btn btn--secondary">
          {backLabel}
        </Link>
      </div>
    </div>
  )
}
