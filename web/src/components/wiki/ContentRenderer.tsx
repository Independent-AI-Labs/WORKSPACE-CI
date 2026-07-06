import { marked } from 'marked'
import { sanitizeHtml } from '@/lib/sanitize'
import { highlightCode, escapeHtml } from '@/lib/highlight'
import clsx from 'clsx'

const fenceRe = /```(\w+)?[ \t]*\n([\s\S]*?)```[ \t]*\n?/g

interface ContentRendererProps {
  content: string
  className?: string
}

export async function ContentRenderer({ content, className }: ContentRendererProps) {
  // Pre-process code fences before marked: syntax-highlight lang blocks,
  // wrap mermaid in <pre> (marked handles <pre> as raw HTML across blank lines,
  // unlike <div> which stops at the first blank line).
  let lastIndex = 0
  const parts: string[] = []

  for (let match = fenceRe.exec(content); match; match = fenceRe.exec(content)) {
    const lang = match[1] || ''
    const code = match[2]
    const before = content.slice(lastIndex, match.index)

    if (lang === 'mermaid') {
      parts.push(before, `<pre class="mermaid">${escapeHtml(code)}</pre>`)
    } else {
      const highlighted = lang
        ? await highlightCode(code, lang)
        : `<pre><code>${escapeHtml(code)}</code></pre>`
      parts.push(before, highlighted)
    }
    lastIndex = match.index + match[0].length
  }
  parts.push(content.slice(lastIndex))

  const rawHtml = marked(parts.join(''), { gfm: true, breaks: false }) as string
  const html = sanitizeHtml(rawHtml)

  return (
    <div
      className={clsx('prose', className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
