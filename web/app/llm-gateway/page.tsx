import { WikiShell } from '@/components/wiki/WikiShell'
import { GrafanaEmbed } from '@/components/wiki/GrafanaEmbed'

const GRAFANA_URL =
  'http://localhost:3030/d/gateway-overview/gateway-overview?orgId=1&from=now-24h&to=now&timezone=browser&var-model=$__all&var-api_key=$__all&refresh=15s&kiosk'

export default function LLMGatewayPage() {
  return (
    <WikiShell>
      <section className="hero">
        <h1 className="hero__title">LLM Gateway</h1>
        <p className="hero__subtitle">
          Real-time metrics for the multi-tenant LLM gateway - routing,
          token accounting, PII redaction, and provider health across
          all upstream AI models.
        </p>
      </section>

      <div className="gateway-dashboard">
        <GrafanaEmbed
          src={GRAFANA_URL}
          title="LLM Gateway Grafana Dashboard"
        />
      </div>
    </WikiShell>
  )
}
