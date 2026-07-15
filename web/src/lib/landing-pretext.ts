import { layout, prepare } from '@chenglou/pretext'

export interface PretextTypography {
  font: string
  lineHeightPx: number
}

const SUBTITLE_GAP_PX = 12

/** Horizontal padding on `.landing-stage__slide-panel` (space-6 × 2). */
export const SLIDE_PANEL_PADDING_X_PX = 48

/** Vertical padding on `.landing-stage__slide-panel` (space-5 × 2). */
export const SLIDE_PANEL_PADDING_Y_PX = 40

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

export function measureSlideTextHeight(
  subtitle: string,
  body: string,
  contentWidth: number,
  subtitleType: PretextTypography,
  bodyType: PretextTypography,
): number {
  const bodyTextWidth = panelBodyTextWidth(contentWidth)
  const subtitleHeight = measureTextHeight(subtitle, contentWidth, subtitleType)
  const bodyHeight = measureTextHeight(body, bodyTextWidth, bodyType)
  return subtitleHeight + SUBTITLE_GAP_PX + SLIDE_PANEL_PADDING_Y_PX + bodyHeight
}

export function panelBodyTextWidth(contentWidth: number): number {
  return Math.max(0, contentWidth - SLIDE_PANEL_PADDING_X_PX)
}