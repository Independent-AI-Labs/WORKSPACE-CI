import { WikiShell } from '@/components/wiki/WikiShell'
import { ConfigTableLoadingState } from '@workspace-ci/web-components/components/ConfigTableLoadingState'

export default function GuardLoading() {
  return (
    <WikiShell>
      <ConfigTableLoadingState />
    </WikiShell>
  )
}
