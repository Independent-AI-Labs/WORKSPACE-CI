import { describe, expect, it } from 'vitest'
import { landingPdfEmbedSrc } from '@/lib/landing-pdf-embed'

describe('landingPdfEmbedSrc', () => {
  it('appends PDF chrome-hiding params to bare pdf paths', () => {
    expect(landingPdfEmbedSrc('/landing/sovereignty/gdpr.pdf')).toBe(
      '/landing/sovereignty/gdpr.pdf#toolbar=0&navpanes=1&scrollbar=0&statusbar=0&view=FitH',
    )
  })

  it('leaves non-pdf sources unchanged', () => {
    expect(landingPdfEmbedSrc('/landing/clankers/grok-bad.png')).toBe('/landing/clankers/grok-bad.png')
  })

  it('merges with an existing hash fragment', () => {
    expect(landingPdfEmbedSrc('/doc.pdf#page=2')).toBe(
      '/doc.pdf#page=2&toolbar=0&navpanes=1&scrollbar=0&statusbar=0&view=FitH',
    )
  })

  it('does not override an existing viewer configuration', () => {
    expect(landingPdfEmbedSrc('/doc.pdf#toolbar=1&navpanes=1')).toBe('/doc.pdf#toolbar=1&navpanes=1')
  })
})