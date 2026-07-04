import { WikiShell } from '@/components/wiki/WikiShell'
import { PatternList } from '@/components/wiki/PatternList'
import { getBannedPatterns, getSwallowPatterns } from '@/lib/yaml-loader'
import { loadSwallowDetectors } from '@/lib/docs-loader'
import { classifyAll, classifySwallowPatterns } from '@/lib/patterns'
import { getAllFeedbackCounts } from '@/lib/feedback-loader'
import { highlightCode } from '@/lib/highlight'

export default async function PatternsPage() {
  const [config, swallowConfig] = await Promise.all([
    getBannedPatterns(),
    getSwallowPatterns(),
  ])
  const detectorData = loadSwallowDetectors()
  const bannedPatterns = classifyAll(config)
  const swallowPatterns = classifySwallowPatterns(swallowConfig, detectorData)
  const allPatterns = [...bannedPatterns, ...swallowPatterns]
  const feedbackCounts = getAllFeedbackCounts('pattern')

  const highlightedHtml: Record<string, string> = {}
  for (const p of allPatterns) {
    if (p.detectorFunction && p.detectorSource) {
      highlightedHtml[p.detectorFunction] = await highlightCode(
        p.detectorSource,
        'python',
      )
    }
  }

  return (
    <WikiShell>
      <h1>Pattern Library</h1>
      <p className="page-intro">
        Banned word patterns and error-swallowing detection rules. Each
        pattern is categorized by detection type and scoped to content,
        filename, or directory rules.
      </p>
      {allPatterns.length === 0 ? (
        <p className="empty-state">
          No patterns found. Check that the configuration is accessible at
          WORKSPACE_CI_CONFIG_ROOT.
        </p>
      ) : (
        <PatternList
          patterns={allPatterns}
          highlightedHtml={highlightedHtml}
          feedbackCounts={feedbackCounts}
        />
      )}
    </WikiShell>
  )
}
