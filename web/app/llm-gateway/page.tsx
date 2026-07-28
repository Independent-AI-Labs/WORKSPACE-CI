import { WikiShell } from '@/components/wiki/WikiShell'
import { GatewayTabs } from '@/components/wiki/GatewayTabs'
import { HeroBanner } from '@/components/wiki/HeroBanner'
import { ServiceUnavailable } from '@workspace-ci/web-components/components/ServiceUnavailable'
import { getBrandingForRequest } from '@/lib/branding'
import { getGrafanaProject } from '@/lib/project-registry'
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
  const gatewayProject = getGrafanaProject()
  const startHint = gatewayProject?.startCommand
    ? ` Start the ${gatewayProject.displayName} stack (${gatewayProject.startCommand}) and refresh this page.`
    : ' Start the gateway stack and refresh this page.'

  return (
    <WikiShell>
      <HeroBanner title="LLM Gateway" subtitle={branding.grafana_subtitle} dynamic />

      <div className="gateway-dashboard">
        {grafanaHealthy ? (
          <GatewayTabs dashboards={branding.grafana_dashboards} />
        ) : (
          <ServiceUnavailable
            compact
            title="Grafana Unavailable"
            description={`Live gateway metrics are temporarily offline.${startHint}`}
          />
        )}
      </div>
    </WikiShell>
  )
}
