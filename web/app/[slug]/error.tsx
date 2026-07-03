'use client'

import { ErrorShell } from '@/components/wiki/ErrorShell'

export default function ProjectError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <ErrorShell
      title="Failed to load project README"
      description="The project documentation could not be loaded. Please try again."
      error={error}
      reset={reset}
      backHref="/"
      backLabel="Back to catalogue"
      logPrefix="Project page error"
    />
  )
}