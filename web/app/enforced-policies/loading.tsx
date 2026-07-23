import { WikiShell } from '@/components/wiki/WikiShell'

export default function RuntimeHooksLoading() {
  return (
    <WikiShell>
      <div className="coming-soon">
        <i className="ri-hammer-line coming-soon__icon" aria-hidden="true" />
        <h1>Loading…</h1>
      </div>
    </WikiShell>
  )
}
