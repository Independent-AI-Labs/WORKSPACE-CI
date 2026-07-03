import { NotFoundShell } from '@/components/wiki/NotFoundShell'

export default function TiersNotFound() {
  return (
    <NotFoundShell
      title="Not found"
      description="The requested page does not exist."
      backHref="/tiers"
      backLabel="View all tiers"
    />
  )
}
