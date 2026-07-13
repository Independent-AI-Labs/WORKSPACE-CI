'use client'

import { appendGrafanaEmbedParams } from '@/lib/grafana-url'
import { useThemeStore } from '@/stores/theme-store'

interface GrafanaEmbedProps {
  src: string
  title: string
  className?: string
}

export function GrafanaEmbed({ src, title, className }: GrafanaEmbedProps) {
  const theme = useThemeStore((s) => s.theme)
  const themedSrc = appendGrafanaEmbedParams(src, theme)

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
    />
  )
}
