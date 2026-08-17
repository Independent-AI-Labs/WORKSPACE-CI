'use client'

import { ErrorShell } from '@/components/wiki/ErrorShell'

export default function HooksError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <ErrorShell
      title="Failed to load hook reference"
      description="The hook reference data could not be loaded. Please try again."
      error={error}
      reset={reset}
      backHref="/"
      backLabel="Go home"
      logPrefix="Hooks page error"
    />
  )
}
