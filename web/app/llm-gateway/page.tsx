import { WikiShell } from '@/components/wiki/WikiShell'
import { GatewayTabs } from '@/components/wiki/GatewayTabs'
import { getBranding } from '@/lib/branding'

export const dynamic = 'force-dynamic'

export default function LLMGatewayPage() {
  const branding = getBranding()

  return (
    <WikiShell>
      <section className="hero">
        <h1 className="hero__title">LLM Gateway</h1>
        <p className="hero__subtitle">{branding.grafana_subtitle}</p>
      </section>

      <div className="gateway-dashboard">
        <GatewayTabs dashboards={branding.grafana_dashboards} />
      </div>
    </WikiShell>
  )
}