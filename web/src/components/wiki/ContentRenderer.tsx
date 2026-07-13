import { marked } from 'marked'
import { sanitizeHtml } from '@/lib/sanitize'
import { highlightCode, escapeHtml } from '@/lib/highlight'
import { buildReadmeMarked, type ReadmeLinkContext } from '@/lib/markdown-links'
import clsx from 'clsx'

const FENCE_RE = /```(\w+)?[ \t]*\n([\s\S]*?)```[ \t]*\n?/g
const MERMAID_FENCE_RE = /```mermaid[ \t]*\n([\s\S]*?)```[ \t]*\n?/g

interface ContentRendererProps extends ReadmeLinkContext {
  content: string
  className?: string
}

type Renderer = typeof marked | ReturnType<typeof buildReadmeMarked>

async function processMarkdownSegment(
  md: string,
  renderer: Renderer,
): Promise<string> {
  const parts: string[] = []
  let lastIndex = 0

  for (let match = FENCE_RE.exec(md); match; match = FENCE_RE.exec(md)) {
    const lang = match[1] || ''
    const code = match[2]
    if (lang === 'mermaid') {
      parts.push(md.slice(lastIndex, match.index + match[0].length))
      lastIndex = match.index + match[0].length
      continue
    }
    parts.push(md.slice(lastIndex, match.index))
    const highlighted = lang
      ? await highlightCode(code, lang)
      : `<pre><code>${escapeHtml(code)}</code></pre>`
    parts.push(highlighted)
    lastIndex = match.index + match[0].length
  }
  parts.push(md.slice(lastIndex))

  const rawHtml = renderer.parse(parts.join('')) as string
  return sanitizeHtml(rawHtml)
}

export async function ContentRenderer({
  content,
  className,
  repoUrl,
  branch,
}: ContentRendererProps) {
  const segments = content.split(MERMAID_FENCE_RE)
  const renderer: Renderer = repoUrl
    ? buildReadmeMarked({ repoUrl, branch })
    : marked

  const htmlParts: string[] = []
  let diagramIndex = 0
  for (let i = 0; i < segments.length; i++) {
    if (i % 2 === 0) {
      const html = await processMarkdownSegment(segments[i], renderer)
      htmlParts.push(html)
    } else {
      htmlParts.push(
        `<div class="mermaid-frame" data-mermaid><pre class="mermaid" id="mermaid-diagram-${diagramIndex}">${escapeHtml(segments[i])}</pre></div>`,
      )
      diagramIndex += 1
    }
  }

  const html = htmlParts.join('')

  return (
    <div
      className={clsx('prose', className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
