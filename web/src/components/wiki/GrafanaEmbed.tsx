'use client'

import { useCallback, useEffect, useState } from 'react'
import { appendGrafanaEmbedParams, checkGrafanaHealthViaApi } from '@/lib/grafana-url'
import { useThemeStore } from '@/stores/theme-store'
import { ServiceUnavailable } from './ServiceUnavailable'

const EMBED_LOAD_TIMEOUT_MS = 10_000

interface GrafanaEmbedProps {
  src: string
  title: string
  className?: string
}

export function GrafanaEmbed({ src, title, className }: GrafanaEmbedProps) {
  const theme = useThemeStore((s) => s.theme)
  const themedSrc = appendGrafanaEmbedParams(src, theme)
  const [status, setStatus] = useState<'checking' | 'ready' | 'unavailable'>('checking')
  const [loaded, setLoaded] = useState(false)

  const probe = useCallback(async () => {
    setLoaded(false)
    setStatus('checking')
    const ok = await checkGrafanaHealthViaApi()
    setStatus(ok ? 'ready' : 'unavailable')
  }, [])

  useEffect(() => {
    let cancelled = false
    void checkGrafanaHealthViaApi().then((ok) => {
      if (!cancelled) setStatus(ok ? 'ready' : 'unavailable')
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (status !== 'ready' || loaded) return
    const timer = window.setTimeout(() => setStatus('unavailable'), EMBED_LOAD_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [status, loaded, themedSrc])

  if (status === 'checking') {
    return (
      <div className={'grafana-embed grafana-embed--checking' + (className ? ` ${className}` : '')}>
        <div className="coming-soon coming-soon--compact" role="status">
          <i className="ri-loader-4-line coming-soon__icon" aria-hidden="true" />
          <p className="coming-soon__description">Loading dashboard…</p>
        </div>
      </div>
    )
  }

  if (status === 'unavailable') {
    return (
      <ServiceUnavailable
        compact
        title="Grafana Unavailable"
        description="The metrics dashboard could not be reached. The gateway stack may be stopped or still starting."
        onRetry={probe}
      />
    )
  }

  return (
    <iframe
      src={themedSrc}
      title={title}
      className={className}
      width="100%"
      height="600"
      style={{ height: 'clamp(400px, 80vh, 1200px)' }}
      frameBorder="0"
      allow="fullscreen"
      onLoad={() => setLoaded(true)}
    />
  )
}