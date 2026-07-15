/** Client-safe landing slide types and helpers (no Node/fs imports). */

export type SlideType = 'image' | 'iframe' | 'document'

export type LandingSourceUrl = string

export interface LandingSlide {
  type: SlideType
  src: string
  subtitle: string
  content: string
  subtitle_color?: string
  source_url?: LandingSourceUrl
  source_label?: string
  download_label?: string
}

const SUBTITLE_COLOR_TOKENS = new Set([
  'accent',
  'text',
  'warn',
  'error',
  'ok',
  'link',
  'muted',
])

const CSS_COLOR_PATTERN =
  /^(#[0-9a-f]{3,8}|var\(--[a-z0-9-]+\)|rgb\(|rgba\(|hsl\(|hsla\(|oklch\(|oklab\(|color-mix\()/i

export function isInternalSourceUrl(url: string): boolean {
  return url.startsWith('/') && !url.startsWith('//')
}

export function isExternalSourceUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://')
}

export function resolveSubtitleColor(value: string): string {
  const trimmed = value.trim()
  if (SUBTITLE_COLOR_TOKENS.has(trimmed)) {
    return `var(--${trimmed})`
  }
  if (trimmed.startsWith('var(') || CSS_COLOR_PATTERN.test(trimmed)) {
    return trimmed
  }
  throw new Error(
    `landing-posts.yaml: subtitle_color "${value}" must be a semantic token ` +
      `(${[...SUBTITLE_COLOR_TOKENS].join(', ')}), var(--token), or a CSS color`,
  )
}