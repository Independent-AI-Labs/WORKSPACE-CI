'use client'

import { ErrorShell } from '@/components/wiki/ErrorShell'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <ErrorShell
      title="Something went wrong"
      description="An unexpected error occurred while loading this page."
      error={error}
      reset={reset}
      logPrefix="Root error boundary"
    />
  )
}
