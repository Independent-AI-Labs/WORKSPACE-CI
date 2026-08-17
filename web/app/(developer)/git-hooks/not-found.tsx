import { NotFoundShell } from '@/components/wiki/NotFoundShell'

export default function HooksNotFound() {
  return (
    <NotFoundShell
      title="Not found"
      description="The requested page does not exist."
      backHref="/git-hooks"
      backLabel="View all hooks"
    />
  )
}
