import { Marked, type Tokens, type RendererObject } from 'marked'

export interface ReadmeLinkContext {
  repoUrl?: string
  branch?: string
}

const ENTITY_RE = /&[a-z]+;|&#\d+;/gi
const PUNCT_RE = /[^\w\s-]/g
const WHITESPACE_RE = /\s+/g
const HYPHEN_RUN_RE = /-+/g
const TRIM_HYPHEN_RE = /^-|-$/g
const ABSOLUTE_URL_RE = /^[a-z][a-z0-9+.-]*:/i

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(ENTITY_RE, ' ')
    .replace(PUNCT_RE, '')
    .trim()
    .replace(WHITESPACE_RE, '-')
    .replace(HYPHEN_RUN_RE, '-')
    .replace(TRIM_HYPHEN_RE, '')
}

export function rewriteRelativeHref(
  href: string,
  ctx: ReadmeLinkContext,
): string {
  if (!ctx.repoUrl) return href
  if (href.startsWith('#')) return href
  if (href.startsWith('//')) return href
  if (ABSOLUTE_URL_RE.test(href)) return href
  if (href.startsWith('mailto:') || href.startsWith('tel:')) return href

  const branch = ctx.branch || 'main'
  const path = href.replace(/^\.\//, '')
  const segment = path.endsWith('/') ? 'tree' : 'blob'
  return `${ctx.repoUrl}/${segment}/${branch}/${path}`
}

function isExternalUrl(href: string): boolean {
  return /^(https?:|mailto:|tel:)/i.test(href)
}

export function buildReadmeMarked(ctx: ReadmeLinkContext): Marked {
  const seen = new Map<string, number>()

  const renderer: RendererObject = {
    heading({ tokens, depth }: Tokens.Heading) {
      const inner = this.parser.parseInline(tokens)
      const base = slugifyHeading(inner)
      const count = seen.get(base) ?? 0
      seen.set(base, count + 1)
      const slug = count === 0 ? base : `${base}-${count}`
      return `<h${depth} id="${slug}">${inner}</h${depth}>\n`
    },
    link({ href, title, tokens }: Tokens.Link) {
      const inner = this.parser.parseInline(tokens)
      const rewritten = rewriteRelativeHref(href, ctx)
      const titleAttr = title ? ` title="${title}"` : ''
      const targetAttr = isExternalUrl(rewritten)
        ? ' target="_blank" rel="noopener noreferrer"'
        : ''
      return `<a href="${rewritten}"${titleAttr}${targetAttr}>${inner}</a>`
    },
  }

  return new Marked({ gfm: true, breaks: false, renderer })
}
