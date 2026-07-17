import { marked } from 'marked'
import clsx from 'clsx'
import { sanitizeHtml } from '@/lib/sanitize'

function renderInlineMarkdown(text: string): string {
  return sanitizeHtml(marked.parseInline(text, { gfm: true }) as string)
}

interface HeroBannerProps {
  title: string
  subtitle?: string
  dynamic?: boolean
}

export function HeroBanner({ title, subtitle, dynamic = false }: HeroBannerProps) {
  return (
    <section className={clsx('hero', dynamic && 'hero--dynamic')}>
      <h1
        className="hero__title"
        dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(title) }}
      />
      {subtitle && (
        <p
          className="hero__subtitle"
          dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(subtitle) }}
        />
      )}
    </section>
  )
}
