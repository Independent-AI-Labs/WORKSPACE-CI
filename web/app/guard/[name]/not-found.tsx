import { NotFoundShell } from '@/components/wiki/NotFoundShell'

export default function GuardNotFound() {
  return (
    <NotFoundShell
      title="Guard config not found"
      description="The requested guard policy config does not exist."
      backHref="/guard"
      backLabel="View all guard configs"
    />
  )
}
