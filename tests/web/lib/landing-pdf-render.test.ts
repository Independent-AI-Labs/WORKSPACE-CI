import { describe, it, expect } from 'vitest'
import { landingPdfDocumentUrl, landingPdfPreviewImageSrc } from '@/lib/landing-pdf-render'

describe('landingPdfDocumentUrl', () => {
  it('strips viewer hash fragments from pdf paths', () => {
    expect(landingPdfDocumentUrl('/landing/sovereignty/gdpr.pdf')).toBe(
      '/landing/sovereignty/gdpr.pdf',
    )
    expect(
      landingPdfDocumentUrl(
        '/landing/sovereignty/gdpr.pdf#toolbar=0&navpanes=1&scrollbar=0&statusbar=0&view=FitH',
      ),
    ).toBe('/landing/sovereignty/gdpr.pdf')
  })
})

describe('landingPdfPreviewImageSrc', () => {
  it('maps landing PDF paths to prerendered preview PNGs', () => {
    expect(landingPdfPreviewImageSrc('/landing/sovereignty/gdpr.pdf')).toBe(
      '/landing/sovereignty/gdpr.preview.png',
    )
    expect(
      landingPdfPreviewImageSrc(
        '/landing/sovereignty/gdpr.pdf#toolbar=0&navpanes=1&scrollbar=0&statusbar=0&view=FitH',
      ),
    ).toBe('/landing/sovereignty/gdpr.preview.png')
  })
})