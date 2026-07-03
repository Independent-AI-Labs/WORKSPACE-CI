import { NotFoundShell } from '@/components/wiki/NotFoundShell'

export default function ConfigNotFound() {
  return (
    <NotFoundShell
      title="Configuration not found"
      description="The requested configuration file does not exist."
      backHref="/config"
      backLabel="View all configs"
    />
  )
}
