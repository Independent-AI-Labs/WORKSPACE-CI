import { sanitizeHtml } from '@/lib/sanitize'
import { marked } from 'marked'
import clsx from 'clsx'

interface ContentRendererProps {
  content: string
  className?: string
}

export function ContentRenderer({ content, className }: ContentRendererProps) {
  const rawHtml = marked(content, { gfm: true, breaks: false }) as string
  const html = sanitizeHtml(rawHtml)

  return (
    <div
      className={clsx('prose', className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
