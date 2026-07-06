import type { MakefileTarget } from '@/types/makefile'

interface MakefileTargetCardsProps {
  targets: MakefileTarget[]
}

interface SectionGroup {
  section: string
  targets: MakefileTarget[]
}

function groupBySection(targets: MakefileTarget[]): SectionGroup[] {
  const groups = new Map<string, SectionGroup>()
  for (const target of targets) {
    if (!groups.has(target.section)) {
      groups.set(target.section, { section: target.section, targets: [] })
    }
    groups.get(target.section)!.targets.push(target)
  }
  return Array.from(groups.values())
}

export function MakefileTargetCards({ targets }: MakefileTargetCardsProps) {
  const groups = groupBySection(targets)

  return (
    <div className="makefile-cards">
      {groups.map((group) => (
        <div key={group.section} className="makefile-cards__section">
          <h3 className="makefile-cards__section-title">{group.section}</h3>
          <div className="makefile-cards__grid">
            {group.targets.map((target) => (
              <div key={target.name} className="makefile-card">
                <div className="makefile-card__header">
                  <code className="makefile-card__name">{target.name}</code>
                  {target.phony && (
                    <span className="makefile-card__badge">.PHONY</span>
                  )}
                </div>
                {target.description && (
                  <p className="makefile-card__desc">{target.description}</p>
                )}
                {target.prerequisites.length > 0 && (
                  <div className="makefile-card__prereqs">
                    <span className="makefile-card__prereqs-label">Depends on:</span>
                    <code className="makefile-card__prereqs-value">
                      {target.prerequisites.join(' ')}
                    </code>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
