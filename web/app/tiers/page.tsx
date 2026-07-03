import { WikiShell } from '@/components/wiki/WikiShell'
import { TierComparison } from '@/components/wiki/TierComparison'
import { getRequiredHooks } from '@/lib/yaml-loader'

export default async function TiersPage() {
  const manifest = await getRequiredHooks()

  return (
    <WikiShell>
      <h1>Enforcement Tiers</h1>
      <p>
        Hooks are organized into tiers based on enforcement scope:
        safety (POC subset) and strict (full set).
      </p>
      <TierComparison hooks={manifest.hooks} />
    </WikiShell>
  )
}
