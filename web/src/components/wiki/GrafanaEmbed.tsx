'use client'

import { useThemeStore } from '@/stores/theme-store'

interface GrafanaEmbedProps {
  src: string
  title: string
  className?: string
}

export function GrafanaEmbed({ src, title, className }: GrafanaEmbedProps) {
  const theme = useThemeStore((s) => s.theme)
  const themedSrc = `${src}&theme=${theme}`

  return (
    <iframe
      src={themedSrc}
      title={title}
      className={className}
      width="100%"
      height="1200"
      frameBorder="0"
      allow="fullscreen"
    />
  )
}
