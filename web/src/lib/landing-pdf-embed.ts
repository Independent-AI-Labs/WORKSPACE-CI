/** Chrome / Firefox built-in PDF viewer open parameters. */
const PDF_EMBED_FRAGMENT = 'toolbar=0&navpanes=1&scrollbar=0&statusbar=0&view=FitH'

export function landingPdfEmbedSrc(src: string): string {
  if (!/\.pdf(?:$|[?#])/i.test(src)) return src

  const hashIndex = src.indexOf('#')
  if (hashIndex === -1) return `${src}#${PDF_EMBED_FRAGMENT}`

  const base = src.slice(0, hashIndex)
  const hash = src.slice(hashIndex + 1)
  if (/toolbar=|navpanes=/.test(hash)) return src

  return hash ? `${base}#${hash}&${PDF_EMBED_FRAGMENT}` : `${base}#${PDF_EMBED_FRAGMENT}`
}