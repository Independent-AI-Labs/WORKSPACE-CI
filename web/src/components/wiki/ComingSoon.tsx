import Link from 'next/link'
import { WikiShell } from '@/components/wiki/WikiShell'

interface ComingSoonLink {
  href: string
  label: string
}

interface ComingSoonProps {
  title: string
  description: string
  links?: ComingSoonLink[]
}

export function ComingSoon({ title, description, links }: ComingSoonProps) {
  return (
    <WikiShell>
      <div className="coming-soon">
        <i className="ri-hammer-line coming-soon__icon" aria-hidden="true" />
        <span className="coming-soon__badge">Coming Soon</span>
        <h1>{title}</h1>
        <p className="coming-soon__description">{description}</p>
        {links && links.length > 0 && (
          <div className="coming-soon__links">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className="btn btn--secondary">
                {link.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </WikiShell>
  )
}
