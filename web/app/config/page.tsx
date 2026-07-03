import Link from 'next/link'
import { WikiShell } from '@/components/wiki/WikiShell'
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
      <ul className="config-index">
        {configs.map((config) => (
          <li key={config.name} className="config-index__item">
            <Link href={config.link} className="config-index__link">
              <code>{config.name}</code>
              {config.hasSchema ? (
                <span className="config-index__schema badge--green">
                  has schema
                </span>
              ) : (
                <span className="config-index__schema badge--orange">
                  no schema
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
      )}
    </WikiShell>
  )
}
