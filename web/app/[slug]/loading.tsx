import { WikiShell } from '@/components/wiki/WikiShell'

export default function ProjectLoading() {
  return (
    <WikiShell>
      <div className="loading-state">
        <div className="loading-line h-8 w-48" />
        <div className="loading-line h-4 w-full" />
        <div className="loading-line h-4 w-3-4" />
        <div className="loading-line h-32 w-full" />
        <div className="loading-line h-4 w-full" />
        <div className="loading-line h-4 w-1-2" />
      </div>
    </WikiShell>
  )
}