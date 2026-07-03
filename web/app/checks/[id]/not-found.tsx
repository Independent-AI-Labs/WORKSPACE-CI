import { NotFoundShell } from '@/components/wiki/NotFoundShell'

export default function CheckNotFound() {
  return (
    <NotFoundShell
      title="Check not found"
      description="The requested check does not exist in the catalog."
      backHref="/checks"
      backLabel="View all checks"
    />
  )
}
