import { WikiShell } from '@/components/wiki/WikiShell'
import { HookList } from '@/components/wiki/HookList'
import { getRequiredHooks } from '@/lib/yaml-loader'
import { loadHookDescriptions, loadHookSources } from '@/lib/docs-loader'
import { getAllFeedbackCounts } from '@/lib/feedback-loader'
import { highlightCode } from '@/lib/highlight'
import type { HookRecord } from '@/types/hooks'

export default async function HooksPage() {
  const manifest = await getRequiredHooks()
  const descData = loadHookDescriptions()
  const descriptions = descData?.descriptions ?? {}
  const sourceData = loadHookSources()
  const feedbackCounts = getAllFeedbackCounts('hook')

  const sourceMap = new Map(
    (sourceData?.sources ?? []).map((s) => [s.id, s]),
  )

  const hooksWithHighlight: HookRecord[] = []
  const highlightedHtml: Record<string, string> = {}
  for (const hook of manifest.hooks) {
    hooksWithHighlight.push(hook)
    const src = sourceMap.get(hook.id)
    if (src) {
      highlightedHtml[hook.id] = await highlightCode(
        src.source,
        src.language,
      )
    }
  }

  return (
    <WikiShell>
      <h1>Hook Reference</h1>
      <p className="page-intro">
        Required git hooks organized by stage (pre-commit, commit-msg,
        pre-push) and kind (shell, python module, makefile target).
      </p>
      {manifest.hooks.length === 0 ? (
        <p className="empty-state">
          No hooks found. Check that the required hooks manifest is
          accessible at WORKSPACE_CI_CONFIG_ROOT.
        </p>
      ) : (
        <HookList
          hooks={hooksWithHighlight}
          descriptions={descriptions}
          sourceMap={sourceMap}
          highlightedHtml={highlightedHtml}
          feedbackCounts={feedbackCounts}
        />
      )}
    </WikiShell>
  )
}
