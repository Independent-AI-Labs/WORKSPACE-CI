import { describe, it, expect } from 'vitest'
import {
  getMermaidThemeConfig,
  getMermaidBackground,
  type MermaidThemeName,
} from '@/lib/mermaid-theme'

describe('getMermaidThemeConfig', () => {
  it('uses the base theme for both light and dark', () => {
    expect(getMermaidThemeConfig('light').theme).toBe('base')
    expect(getMermaidThemeConfig('dark').theme).toBe('base')
  })

  it('includes flowchart config with basis curve and no maxWidth', () => {
    const config = getMermaidThemeConfig('light')
    expect(config.flowchart).toMatchObject({
      curve: 'basis',
      padding: 16,
      useMaxWidth: false,
    })
  })

  it('disables useMaxWidth on sequence, gantt, and journey', () => {
    const config = getMermaidThemeConfig('dark')
    expect(config.sequence?.useMaxWidth).toBe(false)
    expect(config.gantt?.useMaxWidth).toBe(false)
    expect(config.journey?.useMaxWidth).toBe(false)
  })

  it('sets font family and size in themeVariables', () => {
    const config = getMermaidThemeConfig('light')
    const tv = config.themeVariables as Record<string, string>
    expect(tv.fontFamily).toContain('var(--font-montserrat)')
    expect(tv.fontSize).toBe('14px')
  })

  it('uses a heavier font weight for readability', () => {
    const config = getMermaidThemeConfig('light')
    const tv = config.themeVariables as Record<string, string>
    expect(Number(tv.fontWeight)).toBeGreaterThanOrEqual(600)
  })

  it('maps site palette to dark theme variables', () => {
    const config = getMermaidThemeConfig('dark')
    const tv = config.themeVariables as Record<string, string>
    expect(tv.primaryBorderColor).toBe('#247ba0')
    expect(tv.secondaryBorderColor).toBe('#70c1b3')
    expect(tv.tertiaryBorderColor).toBe('#ffe066')
    expect(tv.lineColor).toBe('#8cada7')
    expect(tv.background).toBe('transparent')
  })

  it('maps site palette to light theme variables', () => {
    const config = getMermaidThemeConfig('light')
    const tv = config.themeVariables as Record<string, string>
    expect(tv.primaryBorderColor).toBe('#247ba0')
    expect(tv.primaryColor).toBe('#ffffff')
    expect(tv.lineColor).toBe('#247ba0')
    expect(tv.textColor).toBe('#1a1a1a')
  })

  it('produces different palettes for light vs dark', () => {
    const lightTv = getMermaidThemeConfig('light').themeVariables as Record<string, string>
    const darkTv = getMermaidThemeConfig('dark').themeVariables as Record<string, string>
    expect(lightTv.primaryColor).not.toBe(darkTv.primaryColor)
    expect(lightTv.textColor).not.toBe(darkTv.textColor)
    expect(lightTv.lineColor).not.toBe(darkTv.lineColor)
  })

  it('uses transparent background for both themes', () => {
    expect(
      (getMermaidThemeConfig('light').themeVariables as Record<string, string>).background,
    ).toBe('transparent')
    expect(
      (getMermaidThemeConfig('dark').themeVariables as Record<string, string>).background,
    ).toBe('transparent')
  })
})

describe('getMermaidBackground', () => {
  it('returns white for light theme', () => {
    expect(getMermaidBackground('light')).toBe('#ffffff')
  })

  it('returns dark for dark theme', () => {
    expect(getMermaidBackground('dark')).toBe('#181818')
  })

  it('returns distinct values per theme', () => {
    const light = getMermaidBackground('light' as MermaidThemeName)
    const dark = getMermaidBackground('dark' as MermaidThemeName)
    expect(light).not.toBe(dark)
  })
})
