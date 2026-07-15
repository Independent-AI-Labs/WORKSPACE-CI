import { marked } from 'marked'
import { sanitizeHtml } from '@/lib/sanitize'
import { highlightCode, escapeHtml } from '@/lib/highlight'
import { buildReadmeMarked, type ReadmeLinkContext } from '@/lib/markdown-links'
import { parseCodeFences, splitMermaidBlocks } from '@/lib/markdown-fences'
import clsx from 'clsx'

interface ContentRendererProps extends ReadmeLinkContext {
  content: string
  className?: string
}

type Renderer = typeof marked | ReturnType<typeof buildReadmeMarked>

function parseMarkdown(md: string, renderer: Renderer): string {
  if (!md) return ''
  return sanitizeHtml(renderer.parse(md) as string)
}

async function processMarkdownSegment(
  md: string,
  renderer: Renderer,
): Promise<string> {
  const segments = parseCodeFences(md)
  const parts: string[] = []

  for (const segment of segments) {
    if (segment.type === 'md') {
      parts.push(parseMarkdown(segment.text, renderer))
      continue
    }

    const highlighted = segment.lang
      ? await highlightCode(segment.code, segment.lang)
      : `<pre><code>${escapeHtml(segment.code)}</code></pre>`
    parts.push(sanitizeHtml(highlighted))
  }

  return parts.join('')
}

export async function ContentRenderer({
  content,
  className,
  repoUrl,
  branch,
}: ContentRendererProps) {
  const segments = splitMermaidBlocks(content)
  const renderer: Renderer = repoUrl
    ? buildReadmeMarked({ repoUrl, branch })
    : marked

  const htmlParts: string[] = []
  let diagramIndex = 0
  for (const segment of segments) {
    if (segment.type === 'md') {
      htmlParts.push(await processMarkdownSegment(segment.body, renderer))
    } else {
      htmlParts.push(
        `<div class="mermaid-frame" data-mermaid><pre class="mermaid" id="mermaid-diagram-${diagramIndex}">${escapeHtml(segment.body)}</pre></div>`,
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