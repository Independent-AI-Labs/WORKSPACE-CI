'use client'

import { ErrorShell } from '@/components/wiki/ErrorShell'

export default function ConfigError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <ErrorShell
      title="Failed to load configuration"
      description="The configuration data could not be loaded. Please try again."
      error={error}
      reset={reset}
      logPrefix="Config page error"
    />
  )
}
