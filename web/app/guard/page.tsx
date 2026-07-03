import { WikiShell } from '@/components/wiki/WikiShell'
import { GuardConfigList } from '@/components/wiki/GuardConfigList'
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
      <GuardConfigList entries={entries} />
    </WikiShell>
  )
}
