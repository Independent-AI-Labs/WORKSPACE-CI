import type { Branding } from '@/lib/branding'

interface WikiFooterProps {
  branding: Branding
}

export function WikiFooter({ branding }: WikiFooterProps) {
  return (
    <footer className="wiki-footer">
      <span className="wiki-footer__text">
        {branding.footer_tagline}
      </span>
      <span className="wiki-footer__version">
        {branding.footer_copyright}
      </span>
    </footer>
  )
}
