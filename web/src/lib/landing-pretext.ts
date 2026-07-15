import { layout, prepare } from '@chenglou/pretext'

export interface PretextTypography {
  font: string
  lineHeightPx: number
}

const SUBTITLE_GAP_PX = 12

/** Horizontal padding on `.landing-stage__copy-panel` (space-6 × 2). */
export const SLIDE_PANEL_PADDING_X_PX = 48

/** `.landing-stage__links` margin-top (space-4) + one link pill row. */
export const SLIDE_LINKS_BLOCK_HEIGHT_PX = 52

/** Two link pills (download + source), including wrap on narrow panels. */
export const SLIDE_LINKS_DOUBLE_BLOCK_HEIGHT_PX = 96

export function typographyFromComputed(style: CSSStyleDeclaration): PretextTypography {
  const weight = style.fontWeight || '400'
  const size = style.fontSize || '16px'
  const family =
    style.fontFamily
      .split(',')[0]
      ?.trim()
      .replace(/^["']|["']$/g, '') || 'Montserrat'
  const font = `${weight} ${size} ${family}`

  const fontSizePx = parseFloat(size)
  const lineHeightRaw = style.lineHeight
  let lineHeightPx = fontSizePx * 1.25
  if (lineHeightRaw && lineHeightRaw !== 'normal') {
    const parsed = parseFloat(lineHeightRaw)
    lineHeightPx = lineHeightRaw.endsWith('px') ? parsed : parsed * fontSizePx
  }

  return { font, lineHeightPx }
}

export function measureTextHeight(
  text: string,
  width: number,
  typography: PretextTypography,
): number {
  if (!text.trim() || width <= 0) {
    return typography.lineHeightPx
  }

  try {
    const prepared = prepare(text, typography.font)
    const { height } = layout(prepared, width, typography.lineHeightPx)
    return Math.max(typography.lineHeightPx, height)
  } catch {
    return typography.lineHeightPx
  }
}

export function linksBlockHeight(linkCount: number): number {
  if (linkCount <= 0) return 0
  if (linkCount >= 2) return SLIDE_LINKS_DOUBLE_BLOCK_HEIGHT_PX
  return SLIDE_LINKS_BLOCK_HEIGHT_PX
}

export function measureSlideTextHeight(
  subtitle: string,
  body: string,
  contentWidth: number,
  subtitleType: PretextTypography,
  bodyType: PretextTypography,
  linkCount = 0,
): number {
  const bodyTextWidth = panelBodyTextWidth(contentWidth)
  const subtitleHeight = measureTextHeight(subtitle, bodyTextWidth, subtitleType)
  const bodyHeight = measureTextHeight(body, bodyTextWidth, bodyType)
  const linksHeight = linksBlockHeight(linkCount)
  return subtitleHeight + SUBTITLE_GAP_PX + bodyHeight + linksHeight
}

export function panelBodyTextWidth(contentWidth: number): number {
  return Math.max(0, contentWidth - SLIDE_PANEL_PADDING_X_PX)
}