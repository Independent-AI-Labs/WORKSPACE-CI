import { NotFoundShell } from '@/components/wiki/NotFoundShell'

export default function NotFound() {
  return (
    <NotFoundShell
      title="404"
      description="Page not found"
      backHref="/"
      backLabel="Go home"
    />
  )
}
