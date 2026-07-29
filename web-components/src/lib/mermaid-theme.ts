import type { MermaidConfig } from 'mermaid'
import { requireCssVar } from './mermaid-export'

export type MermaidThemeName = 'dark' | 'light'

const FONT_STACK = 'var(--font-montserrat), system-ui, sans-serif'
const FONT_SIZE = '14px'
const FONT_WEIGHT = '600'

type ThemeVars = Record<string, string>

function resolvePalette(theme: MermaidThemeName): ThemeVars {
  const docTheme = document.documentElement.getAttribute('data-theme')
  if (docTheme !== null && docTheme !== theme) {
    throw new Error(
      `mermaid theme "${theme}" requested but the document theme is "${docTheme}"`,
    )
  }
  const primaryColor = requireCssVar('--mermaid-primary-color')
  const secondaryColor = requireCssVar('--mermaid-secondary-color')
  const tertiaryColor = requireCssVar('--mermaid-tertiary-color')
  const primaryBorderColor = requireCssVar('--mermaid-primary-border')
  const secondaryBorderColor = requireCssVar('--mermaid-secondary-border')
  const tertiaryBorderColor = requireCssVar('--mermaid-tertiary-border')
  const textColor = requireCssVar('--mermaid-text-color')
  const lineColor = requireCssVar('--mermaid-line-color')
  return {
    background: 'transparent',
    primaryColor,
    primaryBorderColor,
    primaryTextColor: textColor,
    secondaryColor,
    secondaryBorderColor,
    secondaryTextColor: textColor,
    tertiaryColor,
    tertiaryBorderColor,
    tertiaryTextColor: textColor,
    lineColor,
    textColor,
    clusterBkg: requireCssVar('--mermaid-cluster-bkg'),
    clusterBorder: requireCssVar('--mermaid-cluster-border'),
    edgeLabelBackground: requireCssVar('--mermaid-edge-label-bg'),
    nodeBorder: primaryBorderColor,
    nodeTextColor: textColor,
    mainBkg: primaryColor,
    secondBkg: secondaryColor,
    actorBkg: primaryColor,
    actorBorder: primaryBorderColor,
    actorTextColor: textColor,
    actorLineColor: requireCssVar('--mermaid-actor-line-color'),
    signalColor: requireCssVar('--mermaid-signal-color'),
    signalTextColor: textColor,
    labelBoxBkg: secondaryColor,
    labelBoxBorder: secondaryBorderColor,
    labelTextColor: textColor,
    loopTextColor: textColor,
    noteBkg: requireCssVar('--mermaid-note-bkg'),
    noteBorderColor: requireCssVar('--mermaid-note-border'),
    noteTextColor: requireCssVar('--mermaid-note-text'),
    activationBkg: requireCssVar('--mermaid-activation-bkg'),
    activationBorderColor: primaryBorderColor,
    sequenceNumberColor: requireCssVar('--mermaid-sequence-number-color'),
  }
}

export function getMermaidThemeConfig(theme: MermaidThemeName): MermaidConfig {
  const themeVariables = resolvePalette(theme)
  themeVariables.fontFamily = FONT_STACK
  themeVariables.fontSize = FONT_SIZE
  themeVariables.fontWeight = FONT_WEIGHT

  return {
    theme: 'base',
    themeVariables,
    flowchart: {
      curve: 'basis',
      padding: 16,
      useMaxWidth: true,
    },
    sequence: {
      useMaxWidth: true,
      actorMargin: 60,
      boxMargin: 12,
      noteMargin: 12,
      messageMargin: 40,
    },
    gantt: { useMaxWidth: true },
    journey: { useMaxWidth: true },
  }
}
