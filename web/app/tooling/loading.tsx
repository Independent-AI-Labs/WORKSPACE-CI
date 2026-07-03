import { WikiShell } from '@/components/wiki/WikiShell'

export default function ToolingLoading() {
  return (
    <WikiShell>
      <div className="loading-state">
        <div className="loading-line h-6 w-40" />
        <div className="loading-line h-24 w-full" />
        <div className="loading-line h-24 w-full" />
        <div className="loading-line h-24 w-full" />
      </div>
    </WikiShell>
  )
}
