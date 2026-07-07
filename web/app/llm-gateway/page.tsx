import { WikiShell } from '@/components/wiki/WikiShell'
import { GrafanaEmbed } from '@/components/wiki/GrafanaEmbed'
import { getBranding } from '@/lib/branding'

export default function LLMGatewayPage() {
  const branding = getBranding()

  return (
    <WikiShell>
      <section className="hero">
        <h1 className="hero__title">LLM Gateway</h1>
        <p className="hero__subtitle">{branding.grafana_subtitle}</p>
      </section>

      <div className="gateway-dashboard">
        <GrafanaEmbed
          src={branding.grafana_url}
          title={branding.grafana_dashboard_title}
        />
      </div>
    </WikiShell>
  )
}
