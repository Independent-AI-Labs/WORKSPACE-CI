import type { MermaidConfig } from 'mermaid'

export type MermaidThemeName = 'dark' | 'light'

const FONT_STACK = 'var(--font-montserrat), system-ui, sans-serif'
const FONT_SIZE = '14px'
const FONT_WEIGHT = '600'

type ThemeVars = Record<string, string>

const DARK_PALETTE: ThemeVars = {
  background: 'transparent',
  primaryColor: '#1f1f1f',
  primaryBorderColor: '#247ba0',
  primaryTextColor: '#ededed',
  secondaryColor: '#101010',
  secondaryBorderColor: '#70c1b3',
  secondaryTextColor: '#ededed',
  tertiaryColor: '#2a2a2a',
  tertiaryBorderColor: '#ffe066',
  tertiaryTextColor: '#ededed',
  lineColor: '#8cada7',
  textColor: '#ededed',
  clusterBkg: 'rgba(0, 0, 0, 0.3)',
  clusterBorder: '#50514f',
  edgeLabelBackground: '#181818',
  nodeBorder: '#247ba0',
  nodeTextColor: '#ededed',
  mainBkg: '#1f1f1f',
  secondBkg: '#101010',
  actorBkg: '#1f1f1f',
  actorBorder: '#247ba0',
  actorTextColor: '#ededed',
  actorLineColor: '#8cada7',
  signalColor: '#8cada7',
  signalTextColor: '#ededed',
  labelBoxBkg: '#101010',
  labelBoxBorder: '#70c1b3',
  labelTextColor: '#ededed',
  loopTextColor: '#ededed',
  noteBkg: '#f2f4cb',
  noteBorderColor: '#b7990d',
  noteTextColor: '#1a1a1a',
  activationBkg: '#70c1b3',
  activationBorderColor: '#247ba0',
  sequenceNumberColor: '#181818',
}

const LIGHT_PALETTE: ThemeVars = {
  background: 'transparent',
  primaryColor: '#ffffff',
  primaryBorderColor: '#247ba0',
  primaryTextColor: '#1a1a1a',
  secondaryColor: '#e6e6e6',
  secondaryBorderColor: '#247ba0',
  secondaryTextColor: '#1a1a1a',
  tertiaryColor: '#f7f7f7',
  tertiaryBorderColor: '#b7990d',
  tertiaryTextColor: '#1a1a1a',
  lineColor: '#247ba0',
  textColor: '#1a1a1a',
  clusterBkg: 'rgba(0, 0, 0, 0.04)',
  clusterBorder: '#50514f',
  edgeLabelBackground: '#f0f0f0',
  nodeBorder: '#247ba0',
  nodeTextColor: '#1a1a1a',
  mainBkg: '#ffffff',
  secondBkg: '#e6e6e6',
  actorBkg: '#ffffff',
  actorBorder: '#247ba0',
  actorTextColor: '#1a1a1a',
  actorLineColor: '#50514f',
  signalColor: '#1a1a1a',
  signalTextColor: '#1a1a1a',
  labelBoxBkg: '#e6e6e6',
  labelBoxBorder: '#247ba0',
  labelTextColor: '#1a1a1a',
  loopTextColor: '#1a1a1a',
  noteBkg: '#fff7cc',
  noteBorderColor: '#b7990d',
  noteTextColor: '#1a1a1a',
  activationBkg: '#70c1b3',
  activationBorderColor: '#247ba0',
  sequenceNumberColor: '#ffffff',
}

export function getMermaidThemeConfig(theme: MermaidThemeName): MermaidConfig {
  const themeVariables =
    theme === 'light' ? { ...LIGHT_PALETTE } : { ...DARK_PALETTE }
  themeVariables.fontFamily = FONT_STACK
  themeVariables.fontSize = FONT_SIZE
  themeVariables.fontWeight = FONT_WEIGHT

  return {
    theme: 'base',
    themeVariables,
    flowchart: {
      curve: 'basis',
      padding: 16,
      useMaxWidth: false,
    },
    sequence: {
      useMaxWidth: false,
      actorMargin: 60,
      boxMargin: 12,
      noteMargin: 12,
      messageMargin: 40,
    },
    gantt: { useMaxWidth: false },
    journey: { useMaxWidth: false },
  }
}

export function getMermaidBackground(theme: MermaidThemeName): string {
  return theme === 'light' ? '#ffffff' : '#181818'
}
