import { WikiShell } from '@/components/wiki/WikiShell'
import { PatternGridLoadingState } from '@/components/loading-states/PatternGridLoadingState'

export default function PatternsLoading() {
  return (
    <WikiShell>
      <PatternGridLoadingState />
    </WikiShell>
  )
}
