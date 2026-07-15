import { WikiShell } from '@/components/wiki/WikiShell'
import { GatewayTabs } from '@/components/wiki/GatewayTabs'
import { ServiceUnavailable } from '@/components/wiki/ServiceUnavailable'
import { getBrandingForRequest } from '@/lib/branding'
import {
  checkGrafanaHealth,
  resolveGrafanaBaseUrl,
  resolveGrafanaHealthUrlForServerProbe,
} from '@/lib/grafana-url'

export const dynamic = 'force-dynamic'

export default async function LLMGatewayPage() {
  const branding = await getBrandingForRequest()
  const grafanaBase = await resolveGrafanaBaseUrl()
  const probeUrl = resolveGrafanaHealthUrlForServerProbe(grafanaBase)
  const grafanaHealthy = await checkGrafanaHealth(probeUrl)

  return (
    <WikiShell>
      <section className="hero">
        <h1 className="hero__title">LLM Gateway</h1>
        <p className="hero__subtitle">{branding.grafana_subtitle}</p>
      </section>

      <div className="gateway-dashboard">
        {grafanaHealthy ? (
          <GatewayTabs dashboards={branding.grafana_dashboards} />
        ) : (
          <ServiceUnavailable
            compact
            title="Grafana Unavailable"
            description="Live gateway metrics are temporarily offline. Start the WORKSPACE-GATEWAY stack (make gateway-start) and refresh this page."
          />
        )}
      </div>
    </WikiShell>
  )
}