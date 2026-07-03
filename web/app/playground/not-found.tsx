import { NotFoundShell } from '@/components/wiki/NotFoundShell'

export default function PlaygroundNotFound() {
  return (
    <NotFoundShell
      title="Not found"
      description="The requested page does not exist."
      backHref="/playground"
      backLabel="Go to playground"
    />
  )
}
