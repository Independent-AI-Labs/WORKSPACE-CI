'use client'

import { ErrorShell } from '@/components/wiki/ErrorShell'

export default function PatternsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <ErrorShell
      title="Failed to load pattern library"
      description="The pattern library could not be loaded. Please try again."
      error={error}
      reset={reset}
      backHref="/"
      backLabel="Go home"
      logPrefix="Patterns page error"
    />
  )
}
