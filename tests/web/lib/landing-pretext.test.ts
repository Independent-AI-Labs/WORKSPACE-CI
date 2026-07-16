import { describe, it, expect } from 'vitest'
import { measureTextColumnWidth } from '@/lib/landing-pretext'

describe('measureTextColumnWidth', () => {
  it('subtracts horizontal padding from client width', () => {
    const panel = document.createElement('div')
    Object.defineProperty(panel, 'clientWidth', { value: 400, configurable: true })
    panel.style.paddingLeft = '24px'
    panel.style.paddingRight = '16px'
    document.body.appendChild(panel)

    expect(measureTextColumnWidth(panel)).toBe(360)

    document.body.removeChild(panel)
  })

  it('never returns negative width', () => {
    const panel = document.createElement('div')
    Object.defineProperty(panel, 'clientWidth', { value: 10, configurable: true })
    panel.style.paddingLeft = '24px'
    panel.style.paddingRight = '24px'
    document.body.appendChild(panel)

    expect(measureTextColumnWidth(panel)).toBe(0)

    document.body.removeChild(panel)
  })
})