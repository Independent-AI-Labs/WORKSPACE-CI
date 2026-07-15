/** Bare PDF path (strip viewer hash fragments). */
export function landingPdfDocumentUrl(src: string): string {
  const hashIndex = src.indexOf('#')
  return hashIndex === -1 ? src : src.slice(0, hashIndex)
}

/** Prerendered first-page PNG served beside each landing PDF. */
export function landingPdfPreviewImageSrc(src: string): string {
  return landingPdfDocumentUrl(src).replace(/\.pdf$/i, '.preview.png')
}