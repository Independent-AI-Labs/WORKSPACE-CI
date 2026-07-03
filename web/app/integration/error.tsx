'use client'

import { ErrorShell } from '@/components/wiki/ErrorShell'

export default function IntegrationError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <ErrorShell
      title="Failed to load integration guide"
      description="The integration guide could not be loaded. Please try again."
      error={error}
      reset={reset}
      logPrefix="Integration page error"
    />
  )
}
