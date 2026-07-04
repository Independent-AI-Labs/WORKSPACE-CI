import { WikiShell } from '@/components/wiki/WikiShell'
import { ProjectList } from '@/components/wiki/ProjectList'
import { loadAllProjectSummaries } from '@/lib/project-registry'
import { getAllFeedbackCounts } from '@/lib/feedback-loader'
import { loadCodeStats } from '@/lib/docs-loader'
import type { LanguagePercent } from '@/types/code-stats'

function getLanguagePercentsForAllRepos(
  stats: ReturnType<typeof loadCodeStats>,
): Record<string, LanguagePercent[]> {
  if (!stats) return {}
  const result: Record<string, LanguagePercent[]> = {}
  const repos = new Set(stats.repo_languages.map((r) => r.repo))
  for (const repo of repos) {
    const repoLangs = stats.repo_languages.filter((r) => r.repo === repo)
    const totalCode = repoLangs.reduce((sum, r) => sum + r.code, 0)
    if (totalCode === 0) continue
    result[repo] = repoLangs
      .map((r) => ({
        language: r.language,
        code: r.code,
        percent: Math.round((r.code / totalCode) * 1000) / 10,
      }))
      .sort((a, b) => b.percent - a.percent)
  }
  return result
}

export default async function HomePage() {
  const projects = await loadAllProjectSummaries()
  const feedbackCounts = getAllFeedbackCounts('project')
  const codeStats = loadCodeStats()
  const languagePercents = getLanguagePercentsForAllRepos(codeStats)

  return (
    <WikiShell>
      <h1>Project Catalogue</h1>
      <p className="page-intro">
        Browse README documentation for all backend projects in the workspace.
        Click a project to read its full README.
      </p>
      <ProjectList
        projects={projects}
        languagePercents={languagePercents}
        feedbackCounts={feedbackCounts}
      />
    </WikiShell>
  )
}
