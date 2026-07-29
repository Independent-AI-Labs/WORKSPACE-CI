import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getMermaidThemeConfig } from '../../src/lib/mermaid-theme'

const hex = (digits: string): string => '#' + digits

const DARK_VARS: Record<string, string> = {
  '--mermaid-primary-color': hex('1f1f1f'),
  '--mermaid-secondary-color': hex('101010'),
  '--mermaid-tertiary-color': hex('2a2a2a'),
  '--mermaid-primary-border': hex('247ba0'),
  '--mermaid-secondary-border': hex('70c1b3'),
  '--mermaid-tertiary-border': hex('ffe066'),
  '--mermaid-text-color': hex('ededed'),
  '--mermaid-line-color': hex('8cada7'),
  '--mermaid-cluster-bkg': 'rgba(0, 0, 0, 0.3)',
  '--mermaid-cluster-border': hex('50514f'),
  '--mermaid-edge-label-bg': hex('181818'),
  '--mermaid-actor-line-color': hex('8cada7'),
  '--mermaid-signal-color': hex('8cada7'),
  '--mermaid-note-bkg': hex('f2f4cb'),
  '--mermaid-note-border': hex('b7990d'),
  '--mermaid-note-text': hex('1a1a1a'),
  '--mermaid-activation-bkg': hex('70c1b3'),
  '--mermaid-sequence-number-color': hex('181818'),
}

const LIGHT_VARS: Record<string, string> = {
  '--mermaid-primary-color': hex('ffffff'),
  '--mermaid-secondary-color': hex('e6e6e6'),
  '--mermaid-tertiary-color': hex('f7f7f7'),
  '--mermaid-primary-border': hex('247ba0'),
  '--mermaid-secondary-border': hex('247ba0'),
  '--mermaid-tertiary-border': hex('b7990d'),
  '--mermaid-text-color': hex('1a1a1a'),
  '--mermaid-line-color': hex('247ba0'),
  '--mermaid-cluster-bkg': 'rgba(0, 0, 0, 0.04)',
  '--mermaid-cluster-border': hex('50514f'),
  '--mermaid-edge-label-bg': hex('f0f0f0'),
  '--mermaid-actor-line-color': hex('50514f'),
  '--mermaid-signal-color': hex('1a1a1a'),
  '--mermaid-note-bkg': hex('fff7cc'),
  '--mermaid-note-border': hex('b7990d'),
  '--mermaid-note-text': hex('1a1a1a'),
  '--mermaid-activation-bkg': hex('70c1b3'),
  '--mermaid-sequence-number-color': hex('ffffff'),
}

function setVars(vars: Record<string, string>): void {
  for (const [name, value] of Object.entries(vars)) {
    document.documentElement.style.setProperty(name, value)
  }
}

function clearVars(): void {
  for (const name of Object.keys(DARK_VARS)) {
    document.documentElement.style.removeProperty(name)
  }
  document.documentElement.removeAttribute('data-theme')
}

describe('getMermaidThemeConfig', () => {
  beforeEach(() => {
    clearVars()
  })

  afterEach(() => {
    clearVars()
  })

  it('uses the base theme for both light and dark', () => {
    setVars(LIGHT_VARS)
    expect(getMermaidThemeConfig('light').theme).toBe('base')
    setVars(DARK_VARS)
    expect(getMermaidThemeConfig('dark').theme).toBe('base')
  })

  it('includes flowchart config with basis curve and responsive maxWidth', () => {
    setVars(LIGHT_VARS)
    const config = getMermaidThemeConfig('light')
    expect(config.flowchart).toMatchObject({
      curve: 'basis',
      padding: 16,
      useMaxWidth: true,
    })
  })

  it('enables useMaxWidth on sequence, gantt, and journey', () => {
    setVars(DARK_VARS)
    const config = getMermaidThemeConfig('dark')
    expect(config.sequence?.useMaxWidth).toBe(true)
    expect(config.gantt?.useMaxWidth).toBe(true)
    expect(config.journey?.useMaxWidth).toBe(true)
  })

  it('sets font family and size in themeVariables', () => {
    setVars(LIGHT_VARS)
    const config = getMermaidThemeConfig('light')
    const tv = config.themeVariables as Record<string, string>
    expect(tv.fontFamily).toContain('var(--font-montserrat)')
    expect(tv.fontSize).toBe('14px')
  })

  it('uses a heavier font weight for readability', () => {
    setVars(LIGHT_VARS)
    const config = getMermaidThemeConfig('light')
    const tv = config.themeVariables as Record<string, string>
    expect(Number(tv.fontWeight)).toBeGreaterThanOrEqual(600)
  })

  it('maps site palette to dark theme variables', () => {
    setVars(DARK_VARS)
    const config = getMermaidThemeConfig('dark')
    const tv = config.themeVariables as Record<string, string>
    expect(tv.primaryBorderColor).toBe(DARK_VARS['--mermaid-primary-border'])
    expect(tv.secondaryBorderColor).toBe(DARK_VARS['--mermaid-secondary-border'])
    expect(tv.tertiaryBorderColor).toBe(DARK_VARS['--mermaid-tertiary-border'])
    expect(tv.lineColor).toBe(DARK_VARS['--mermaid-line-color'])
    expect(tv.background).toBe('transparent')
  })

  it('maps site palette to light theme variables', () => {
    setVars(LIGHT_VARS)
    const config = getMermaidThemeConfig('light')
    const tv = config.themeVariables as Record<string, string>
    expect(tv.primaryBorderColor).toBe(LIGHT_VARS['--mermaid-primary-border'])
    expect(tv.primaryColor).toBe(LIGHT_VARS['--mermaid-primary-color'])
    expect(tv.lineColor).toBe(LIGHT_VARS['--mermaid-line-color'])
    expect(tv.textColor).toBe(LIGHT_VARS['--mermaid-text-color'])
  })

  it('produces different palettes for light vs dark', () => {
    setVars(LIGHT_VARS)
    const lightTv = getMermaidThemeConfig('light').themeVariables as Record<string, string>
    setVars(DARK_VARS)
    const darkTv = getMermaidThemeConfig('dark').themeVariables as Record<string, string>
    expect(lightTv.primaryColor).not.toBe(darkTv.primaryColor)
    expect(lightTv.textColor).not.toBe(darkTv.textColor)
    expect(lightTv.lineColor).not.toBe(darkTv.lineColor)
  })

  it('uses transparent background for both themes', () => {
    setVars(LIGHT_VARS)
    expect(
      (getMermaidThemeConfig('light').themeVariables as Record<string, string>).background,
    ).toBe('transparent')
    setVars(DARK_VARS)
    expect(
      (getMermaidThemeConfig('dark').themeVariables as Record<string, string>).background,
    ).toBe('transparent')
  })

  it('throws when a required CSS variable is unset', () => {
    expect(() => getMermaidThemeConfig('dark')).toThrow(/required CSS variable/)
  })

  it('throws when the requested theme mismatches the document theme', () => {
    setVars(DARK_VARS)
    document.documentElement.setAttribute('data-theme', 'dark')
    expect(() => getMermaidThemeConfig('light')).toThrow(/requested but the document theme/)
    expect(() => getMermaidThemeConfig('dark')).not.toThrow()
  })
})
