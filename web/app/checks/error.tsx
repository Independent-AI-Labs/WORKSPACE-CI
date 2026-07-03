'use client'

import { ErrorShell } from '@/components/wiki/ErrorShell'

export default function ChecksError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <ErrorShell
      title="Failed to load check catalog"
      description="The check catalog could not be loaded. Please try again."
      error={error}
      reset={reset}
      backHref="/"
      backLabel="Go home"
      logPrefix="Checks page error"
    />
  )
}
