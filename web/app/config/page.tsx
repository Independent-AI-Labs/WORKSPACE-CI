import { WikiShell } from '@/components/wiki/WikiShell'
import { ConfigCard } from '@/components/wiki/ConfigCard'
import { getConfigIndex } from '@/lib/yaml-loader'

export default async function ConfigPage() {
  const configs = await getConfigIndex()

  return (
    <WikiShell>
      <h1>Configuration Reference</h1>
      <p className="page-intro">
        YAML configuration files and their field-level documentation.
        Each config may have an associated schema that documents required
        and optional fields.
      </p>
      {configs.length === 0 ? (
        <p className="empty-state">
          No configuration files found. Check that the config directory is
          accessible at WORKSPACE_CI_CONFIG_ROOT.
        </p>
      ) : (
        <div className="config-grid">
          {configs.map((config) => (
            <ConfigCard key={config.name} config={config} />
          ))}
        </div>
      )}
    </WikiShell>
  )
}
