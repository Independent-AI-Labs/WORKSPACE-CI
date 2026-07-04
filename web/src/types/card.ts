import type { CSSProperties } from 'react'

export interface CardTag {
  label: string
  variant: 'accent' | 'muted' | 'warn' | 'ok'
  style?: CSSProperties
}

export interface CardMeta {
  label: string
  value: string
}

export interface CardItem {
  id: string
  title: string
  subtitle?: string
  description: string
  href?: string
  icon?: string
  monoTitle?: boolean
  category?: string
  tags?: CardTag[]
  meta?: CardMeta[]
  status?: 'ok' | 'warn' | 'info'
  statusLabel?: string
}
