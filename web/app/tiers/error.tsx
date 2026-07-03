'use client'

import { ErrorShell } from '@/components/wiki/ErrorShell'

export default function TiersError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <ErrorShell
      title="Failed to load tier comparison"
      description="The tier comparison could not be loaded. Please try again."
      error={error}
      reset={reset}
      logPrefix="Tiers page error"
    />
  )
}
