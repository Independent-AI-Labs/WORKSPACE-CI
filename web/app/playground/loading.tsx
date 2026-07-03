import { WikiShell } from '@/components/wiki/WikiShell'

export default function PlaygroundLoading() {
  return (
    <WikiShell>
      <div className="loading-state" style={{ minHeight: '400px' }}>
        <div className="loading-line h-6 w-40" />
        <div className="loading-line h-32 w-full" />
      </div>
    </WikiShell>
  )
}
