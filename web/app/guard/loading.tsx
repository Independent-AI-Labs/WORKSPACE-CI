import { WikiShell } from '@/components/wiki/WikiShell'
import { ConfigTableLoadingState } from '@/components/loading-states/ConfigTableLoadingState'

export default function GuardLoading() {
  return (
    <WikiShell>
      <ConfigTableLoadingState />
    </WikiShell>
  )
}
