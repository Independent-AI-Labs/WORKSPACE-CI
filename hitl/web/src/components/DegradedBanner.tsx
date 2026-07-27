'use client'

export function DegradedBanner({
  state,
}: {
  state: 'healthy' | 'degraded' | 'disconnected'
}) {
  if (state === 'healthy') return null

  return (
    <div className="degraded-banner" role="status" aria-live="polite">
      {state === 'degraded'
        ? 'Relay is degraded; decisions are disabled.'
        : 'Disconnected; reconnecting…'}
    </div>
  )
}
