'use client'

import { ErrorShell } from '@/components/wiki/ErrorShell'

export default function ToolingError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <ErrorShell
      title="Failed to load tooling reference"
      description="The tooling reference could not be loaded. Please try again."
      error={error}
      reset={reset}
      logPrefix="Tooling page error"
    />
  )
}
