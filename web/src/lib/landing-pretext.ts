import { layout, prepare } from '@chenglou/pretext'

export interface PretextTypography {
  font: string
  lineHeightPx: number
}

const SUBTITLE_GAP_PX = 12

/** Link group prefix + one link pill row. */
export const SLIDE_LINKS_BLOCK_HEIGHT_PX = 76

/** Resources group prefix + two link pills, including wrap on narrow panels. */
export const SLIDE_LINKS_DOUBLE_BLOCK_HEIGHT_PX = 118

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

/** Inner width where slide subtitle/body wrap inside `.landing-stage__copy-panel`. */
export function measureTextColumnWidth(panel: HTMLElement): number {
  const style = getComputedStyle(panel)
  const paddingX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
  return Math.max(0, panel.clientWidth - paddingX)
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
  textColumnWidth: number,
  subtitleType: PretextTypography,
  bodyType: PretextTypography,
  linkCount = 0,
): number {
  const subtitleHeight = measureTextHeight(subtitle, textColumnWidth, subtitleType)
  const bodyHeight = measureTextHeight(body, textColumnWidth, bodyType)
  const linksHeight = linksBlockHeight(linkCount)
  return subtitleHeight + SUBTITLE_GAP_PX + bodyHeight + linksHeight
}