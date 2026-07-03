import { WikiShell } from '@/components/wiki/WikiShell'
import { CheckListLoadingState } from '@/components/loading-states/CheckListLoadingState'

export default function ChecksLoading() {
  return (
    <WikiShell>
      <CheckListLoadingState />
    </WikiShell>
  )
}
