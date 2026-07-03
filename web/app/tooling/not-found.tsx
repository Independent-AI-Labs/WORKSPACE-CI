import { NotFoundShell } from '@/components/wiki/NotFoundShell'

export default function ToolingNotFound() {
  return (
    <NotFoundShell
      title="Not found"
      description="The requested page does not exist."
      backHref="/tooling"
      backLabel="View all tools"
    />
  )
}
