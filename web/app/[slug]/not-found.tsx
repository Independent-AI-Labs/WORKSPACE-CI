import { NotFoundShell } from '@/components/wiki/NotFoundShell'

export default function ProjectNotFound() {
  return (
    <NotFoundShell
      title="Project not found"
      description="The requested project does not exist in the catalogue."
      backHref="/"
      backLabel="Back to catalogue"
    />
  )
}