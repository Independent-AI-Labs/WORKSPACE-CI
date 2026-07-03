import Link from 'next/link'
import { WikiShell } from '@/components/wiki/WikiShell'

interface NotFoundShellProps {
  title: string
  description: string
  backHref: string
  backLabel: string
}

export function NotFoundShell({
  title,
  description,
  backHref,
  backLabel,
}: NotFoundShellProps) {
  return (
    <WikiShell>
      <div className="not-found-state">
        <h1>{title}</h1>
        <p>{description}</p>
        <Link href={backHref} className="btn btn--secondary">
          {backLabel}
        </Link>
      </div>
    </WikiShell>
  )
}
