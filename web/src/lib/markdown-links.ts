import { Marked, type Tokens, type RendererObject } from 'marked'

export interface ReadmeLinkContext {
  repoUrl?: string
  branch?: string
  projectSlug?: string
}

const ENTITY_RE = /&[a-z]+;|&#\d+;/gi
const PUNCT_RE = /[^\w\s-]/g
const WHITESPACE_RE = /\s+/g
const HYPHEN_RUN_RE = /-+/g
const TRIM_HYPHEN_RE = /^-|-$/g
const ABSOLUTE_URL_RE = /^[a-z][a-z0-9+.-]*:/i

function escapeAttr(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

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

export function rewriteRelativeImageSrc(
  href: string,
  ctx: ReadmeLinkContext,
): string {
  if (href.startsWith('#')) return href
  if (href.startsWith('//')) return href
  if (ABSOLUTE_URL_RE.test(href)) return href
  if (href.startsWith('mailto:') || href.startsWith('tel:')) return href

  const path = href.replace(/^\.\//, '')

  if (ctx.projectSlug) {
    return `/api/project-asset?project=${encodeURIComponent(ctx.projectSlug)}&path=${encodeURIComponent(path)}`
  }

  if (ctx.repoUrl) {
    const branch = ctx.branch || 'main'
    return `${ctx.repoUrl}/raw/${branch}/${path}`
  }

  return href
}

function isExternalUrl(href: string): boolean {
  return /^(https?:|mailto:|tel:)/i.test(href)
}

interface TableRenderer {
  tablerow(opts: { text: string }): string
  tablecell(cell: Tokens.TableCell): string
}

function renderTable(this: RendererObject, token: Tokens.Table): string {
  const r = this as unknown as TableRenderer
  const headerRow = r.tablerow({
    text: token.header.map((cell) => r.tablecell(cell)).join(''),
  })
  const body = token.rows
    .map((row) =>
      r.tablerow({
        text: row.map((cell) => r.tablecell(cell)).join(''),
      }),
    )
    .join('')
  return `<div class="table-wrapper"><table>\n<thead>\n${headerRow}</thead>\n${body ? `<tbody>${body}</tbody>` : ''}</table>\n</div>`
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
      const titleAttr = title ? ` title="${escapeAttr(title)}"` : ''
      const targetAttr = isExternalUrl(rewritten)
        ? ' target="_blank" rel="noopener noreferrer"'
        : ''
      return `<a href="${escapeAttr(rewritten)}"${titleAttr}${targetAttr}>${inner}</a>`
    },
    image({ href, title, text }: Tokens.Image) {
      const src = rewriteRelativeImageSrc(href, ctx)
      const titleAttr = title ? ` title="${escapeAttr(title)}"` : ''
      return `<img src="${escapeAttr(src)}" alt="${escapeAttr(text)}"${titleAttr}>`
    },
    table(token: Tokens.Table) {
      return renderTable.call(this, token)
    },
  }

  return new Marked({ gfm: true, breaks: false, renderer })
}

export function buildProseMarked(): Marked {
  return new Marked({
    gfm: true,
    breaks: false,
    renderer: {
      table(token: Tokens.Table) {
        return renderTable.call(this, token)
      },
    },
  })
}
