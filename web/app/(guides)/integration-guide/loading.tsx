import { WikiShell } from '@/components/wiki/WikiShell'

export default function IntegrationLoading() {
  return (
    <WikiShell>
      <div className="loading-state">
        <div className="loading-line h-6 w-40" />
        <div className="loading-line h-4 w-full" />
        <div className="loading-line h-4 w-3-4" />
        <div className="loading-line h-24 w-full" />
        <div className="loading-line h-4 w-full" />
      </div>
    </WikiShell>
  )
}
