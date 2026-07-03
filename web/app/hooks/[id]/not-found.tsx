import { NotFoundShell } from '@/components/wiki/NotFoundShell'

export default function HookNotFound() {
  return (
    <NotFoundShell
      title="Hook not found"
      description="The requested hook does not exist in the manifest."
      backHref="/hooks"
      backLabel="View all hooks"
    />
  )
}
