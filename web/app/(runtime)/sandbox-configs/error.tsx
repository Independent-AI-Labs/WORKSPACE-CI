'use client'

import { ErrorShell } from '@/components/wiki/ErrorShell'

export default function GuardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <ErrorShell
      title="Failed to load guard configs"
      description="The guard configuration data could not be loaded. Please try again."
      error={error}
      reset={reset}
      backHref="/"
      backLabel="Go home"
      logPrefix="Guard page error"
    />
  )
}
