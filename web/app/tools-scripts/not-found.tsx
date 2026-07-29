import { NotFoundShell } from '@/components/wiki/NotFoundShell'

export default function ToolingNotFound() {
  return (
    <NotFoundShell
      title="Not found"
      description="The requested page does not exist."
      backHref="/tools-scripts"
      backLabel="View all tools"
    />
  )
}
