'use client'

import type { FeedbackCounts } from '@/types/feedback'
import type { ProjectSummary } from '@/types/projects'
import type { LanguagePercent } from '@/types/code-stats'
import type { MakefileData } from '@/types/makefile'
import { WikiCard } from '@/components/wiki/WikiCard'
import { FeedbackWidget } from '@/components/wiki/FeedbackWidget'
import { MakefileDialog } from '@/components/wiki/MakefileDialog'
import { LanguageFilter } from '@/components/wiki/LanguageFilter'
import { useProjectFilter, type ProjectWithLangs } from '@/hooks/useProjectFilter'
import { projectAdapter } from '@/lib/card-adapters'

interface ProjectListProps {
  projects: ProjectSummary[]
  languagePercents: Record<string, LanguagePercent[]>
  feedbackCounts?: Record<string, FeedbackCounts>
  makefileData?: Record<string, MakefileData>
}

export function ProjectList({
  projects,
  languagePercents,
  feedbackCounts = {},
  makefileData = {},
}: ProjectListProps) {
  const projectsWithLangs: ProjectWithLangs[] = projects.map((p) => ({
    ...p,
    languagePercents: languagePercents[p.repoName] ?? [],
  }))

  const {
    filtered,
    activeLanguages,
    toggleLanguage,
    selectAll,
    deselectAll,
    visibleCount,
    totalCount,
    allLanguages,
  } = useProjectFilter(projectsWithLangs)

  const items = projectAdapter(filtered, languagePercents)

  return (
    <div className="project-list">
      <LanguageFilter
        allLanguages={allLanguages}
        activeLanguages={activeLanguages}
        toggleLanguage={toggleLanguage}
        selectAll={selectAll}
        deselectAll={deselectAll}
      />
      <p className="list-section__count">
        {visibleCount} of {totalCount} projects
      </p>
      <div className="wiki-card-grid">
        {items.map((item, i) => {
          const p = filtered[i]
          const counts = feedbackCounts[p.displayName] ?? { upvotes: 0, downvotes: 0 }
          const mkData = makefileData[p.slug]
          return (
            <WikiCard
                  key={item.id}
                  item={item}
                  viewDetails={
                    mkData ? (
                      <MakefileDialog
                        name={p.displayName}
                        sourceFile="Makefile"
                        rawContent={mkData.rawContent}
                        highlightedHtml={mkData.highlightedHtml}
                        targets={mkData.targets}
                        titleId={`makefile-src-${item.id}`}
                      />
                    ) : undefined
                  }
                >
                  <FeedbackWidget
                    targetId={item.id}
                    targetType="project"
                    upCount={counts.upvotes}
                    downCount={counts.downvotes}
                  />
                </WikiCard>
          )
        })}
      </div>
    </div>
  )
}
