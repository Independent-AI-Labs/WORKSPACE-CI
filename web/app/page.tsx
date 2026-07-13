import { WikiShell } from '@/components/wiki/WikiShell'

// Read sibling repo READMEs from the runtime filesystem (copied into the prod image).
export const dynamic = 'force-dynamic'
import { ProjectList } from '@/components/wiki/ProjectList'
import { loadAllProjectSummaries, loadProjectMakefile, PROJECTS } from '@/lib/project-registry'
import { getAllFeedbackCounts } from '@/lib/feedback-loader'
import { loadCodeStats } from '@/lib/docs-loader'
import { getBranding } from '@/lib/branding'
import { parseMakefile } from '@/lib/makefile-parser'
import { highlightCode } from '@/lib/highlight'
import type { LanguagePercent } from '@/types/code-stats'
import type { MakefileData } from '@/types/makefile'

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

    const mapped = repoLangs.map((r) => ({
      language: r.language,
      code: r.code,
      percent: Math.round((r.code / totalCode) * 1000) / 10,
    }))

    const above = mapped.filter((lp) => lp.percent >= 1)
    const below = mapped.filter((lp) => lp.percent < 1)

    if (below.length > 0) {
      const otherCode = below.reduce((sum, lp) => sum + lp.code, 0)
      above.push({
        language: 'OTHER',
        code: otherCode,
        percent: Math.round((otherCode / totalCode) * 1000) / 10,
      })
    }

    result[repo] = above.sort((a, b) => b.percent - a.percent)
  }
  return result
}

export default async function HomePage() {
  const projects = await loadAllProjectSummaries()
  const feedbackCounts = getAllFeedbackCounts('project')
  const codeStats = loadCodeStats()
  const languagePercents = getLanguagePercentsForAllRepos(codeStats)

  const makefileData: Record<string, MakefileData> = {}
  for (const entry of PROJECTS) {
    const raw = await loadProjectMakefile(entry.slug)
    if (!raw) continue
    const targets = parseMakefile(raw)
    const highlightedHtml = await highlightCode(raw, 'makefile')
    makefileData[entry.slug] = { targets, rawContent: raw, highlightedHtml }
  }

  return (
    <WikiShell>
      <section className="hero">
        <h1 className="hero__title">{getBranding().name}</h1>
        <p className="hero__subtitle">
          Unified wiki for the digital and AI safety stack. Browse git hooks,
          static checks, guard policies, runtime blocks, and LLM gateway
          operations from one catalogue.
        </p>
      </section>
      <h1>Project Catalogue</h1>
      <p className="page-intro">
        Browse README documentation for all backend projects in the workspace.
        Click a project title to read its full README, or click View details to
        explore its Makefile targets.
      </p>
      <ProjectList
        projects={projects}
        languagePercents={languagePercents}
        feedbackCounts={feedbackCounts}
        makefileData={makefileData}
      />
    </WikiShell>
  )
}
