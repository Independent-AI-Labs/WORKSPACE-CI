import { WikiShell } from '@/components/wiki/WikiShell'
import { GatewayTabs } from '@/components/wiki/GatewayTabs'
import { getBrandingForRequest } from '@/lib/branding'

export const dynamic = 'force-dynamic'

export default async function LLMGatewayPage() {
  const branding = await getBrandingForRequest()

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