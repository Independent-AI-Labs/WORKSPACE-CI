'use client'

import { ErrorShell } from '@/components/wiki/ErrorShell'

export default function PlaygroundError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <ErrorShell
      title="Failed to load playground"
      description="The playground could not be loaded. Please try again."
      error={error}
      reset={reset}
      logPrefix="Playground page error"
    />
  )
}
