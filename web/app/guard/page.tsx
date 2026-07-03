import { WikiShell } from '@/components/wiki/WikiShell'
import { GuardConfigCard } from '@/components/wiki/GuardConfigCard'
import { getGuardConfigIndex } from '@/lib/yaml-loader'
import { getGuardConfigEntries } from '@/lib/yaml-loader'

export default async function GuardPage() {
  const names = await getGuardConfigIndex()
  const entries = getGuardConfigEntries(names)

  return (
    <WikiShell>
      <h1>Guard Policy Reference</h1>
      <p className="page-intro">
        Guard policy configurations from the sibling WORKSPACE-GUARD repository.
        The guard tree is a soft dependency; configs appear here when available.
      </p>
      {entries.length === 0 ? (
        <p className="empty-state">
          No guard policy configs found at WORKSPACE_GUARD_CONFIG_ROOT.
          The guard tree is a soft dependency; check that the sibling
          WORKSPACE-GUARD repo is checked out.
        </p>
      ) : (
        <div className="config-grid">
          {entries.map((entry) => (
            <GuardConfigCard key={entry.name} entry={entry} />
          ))}
        </div>
      )}
    </WikiShell>
  )
}
