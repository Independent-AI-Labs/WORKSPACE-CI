import { WikiShell } from '@/components/wiki/WikiShell'

export default function Loading() {
  return (
    <WikiShell>
      <div className="loading-line h-8 w-48" />
      <div className="loading-line h-4 w-72" />
      <div className="project-grid">
        <div className="loading-line h-40 w-full" />
        <div className="loading-line h-40 w-full" />
      </div>
    </WikiShell>
  )
}