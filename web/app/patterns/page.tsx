import { WikiShell } from '@/components/wiki/WikiShell'
import { PatternList } from '@/components/wiki/PatternList'
import { getBannedPatterns, getSwallowPatterns } from '@/lib/yaml-loader'
import { loadSwallowDetectors } from '@/lib/docs-loader'
import { classifyAll, classifySwallowPatterns } from '@/lib/patterns'
import { getAllFeedbackCounts } from '@/lib/feedback-loader'

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
        <PatternList patterns={allPatterns} feedbackCounts={feedbackCounts} />
      )}
    </WikiShell>
  )
}
