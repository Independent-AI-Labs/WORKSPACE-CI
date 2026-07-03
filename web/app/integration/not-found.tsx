import { NotFoundShell } from '@/components/wiki/NotFoundShell'

export default function IntegrationNotFound() {
  return (
    <NotFoundShell
      title="Not found"
      description="The requested page does not exist."
      backHref="/integration"
      backLabel="View integration guide"
    />
  )
}
