import { WikiShell } from '@/components/wiki/WikiShell'

export default function LLMGatewayLoading() {
  return (
    <WikiShell>
      <section className="hero">
        <h1 className="hero__title">LLM Gateway</h1>
        <p className="hero__subtitle">Loading dashboard…</p>
      </section>
      <div className="gateway-dashboard gateway-dashboard--loading" />
    </WikiShell>
  )
}
