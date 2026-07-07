import type { CardItem } from '@/types/card'
import type { ProjectSummary } from '@/types/projects'
import type { ConfigEntry, GuardConfigEntry } from '@/types/content'
import type { ClassifiedPattern } from '@/types/patterns'
import type { ScriptManifestEntry } from '@/types/wiki'
import type { HookRecord } from '@/types/hooks'
import type { LanguagePercent } from '@/types/code-stats'
import type { StandardEntry } from '@/types/standards'
import type { WikiLabelsConfig } from '@/types/wiki-labels'

function capitalizeCategory(cat: string): string {
  return cat
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export function deriveCategories(items: CardItem[]): { id: string; label: string }[] {
  const seen = new Set<string>()
  for (const item of items) {
    if (item.category) seen.add(item.category)
  }
  return Array.from(seen)
    .sort()
    .map((id) => ({ id, label: id }))
}

export function projectAdapter(
  projects: ProjectSummary[],
  languagePercents: Record<string, LanguagePercent[]> = {},
): CardItem[] {
  return projects.map((p) => {
    const langPercents = languagePercents[p.repoName] ?? []
    const maxPercent = langPercents.length > 0 ? langPercents[0].percent : 0
    const tags: CardItem['tags'] = langPercents.map((lp) => {
      const factor = maxPercent > 0 ? lp.percent / maxPercent : 0
      const mixPct = Math.round(factor * 100)
      return {
        label: `${lp.language} ${lp.percent}%`,
        variant: 'accent' as const,
        style: {
          backgroundColor: `color-mix(in oklab, var(--muted), var(--accent) ${mixPct}%)`,
        },
      }
    })

    return {
      id: p.displayName,
      title: p.displayName,
      subtitle: p.title,
      description: p.summary,
      href: `/${p.slug}`,
      repoUrl: p.repoUrl,
      icon: p.icon,
      logoPath: p.logoPath,
      tags: tags.length > 0 ? tags : [{ label: p.language, variant: 'muted' }],
    }
  })
}

export function configAdapter(
  configs: ConfigEntry[],
  labels: WikiLabelsConfig,
): CardItem[] {
  return configs.map((c) => ({
    id: c.name,
    title: c.name,
    description: c.description ?? '',
    icon: 'ri-settings-3-line',
    monoTitle: true,
    category: labels.config_categories[c.name] ?? 'Other',
    meta:
      c.fieldCount !== undefined
        ? [{ label: 'Fields', value: String(c.fieldCount) }]
        : undefined,
  }))
}

export function guardConfigAdapter(
  entries: GuardConfigEntry[],
  labels: WikiLabelsConfig,
): CardItem[] {
  return entries.map((e) => ({
    id: e.name,
    title: e.name,
    description: e.description ?? '',
    icon: 'ri-shield-keyhole-line',
    monoTitle: true,
    category: labels.guard_categories[e.name] ?? 'Other',
    meta:
      e.fieldCount !== undefined
        ? [{ label: 'Fields', value: String(e.fieldCount) }]
        : undefined,
  }))
}

export function patternAdapter(
  patterns: ClassifiedPattern[],
  labels: WikiLabelsConfig,
): CardItem[] {
  return patterns.map((p) => {
    const tags: CardItem['tags'] = []
    if (p.languages) {
      for (const lang of p.languages) {
        tags.push({
          label: labels.swallow_languages[lang] ?? lang,
          variant: 'accent',
        })
      }
    }
    if (p.extensions && p.extensions.length > 0) {
      tags.push({ label: p.extensions.join(' '), variant: 'muted' })
    }
    if (p.detectionType) {
      tags.push({ label: p.detectionType, variant: 'muted' })
    }

    const meta: CardItem['meta'] = []
    if (p.scope !== 'content') {
      meta.push({
        label: 'Scope',
        value:
          p.scope === 'filename' ? 'Filename match' : `Directory: ${p.directory}`,
      })
    }
    return {
      id: p.pattern,
      title: p.pattern,
      description: p.reason,
      icon: 'ri-error-warning-line',
      monoTitle: true,
      category: p.categoryLabel,
      tags: tags.length > 0 ? tags : undefined,
      meta: meta.length > 0 ? meta : undefined,
    }
  })
}

export function scriptAdapter(scripts: ScriptManifestEntry[]): CardItem[] {
  return scripts.map((s) => {
    const catLabel = capitalizeCategory(s.category)
    return {
      id: s.id,
      title: s.id,
      description: s.summary,
      icon: 'ri-tools-line',
      monoTitle: true,
      category: catLabel,
      tags: [{ label: catLabel, variant: 'accent' }],
      meta: s.make_target
        ? [{ label: 'Make target', value: s.make_target }]
        : undefined,
    }
  })
}

export function hookAdapter(
  hooks: HookRecord[],
  descriptions: Record<string, string>,
  labels: WikiLabelsConfig,
): CardItem[] {
  return hooks.map((h) => {
    const tags: CardItem['tags'] = [
      {
        label: labels.hook_stages[h.stage] ?? h.stage,
        variant: 'accent',
      },
      {
        label: labels.hook_kinds[h.kind] ?? h.kind,
        variant: 'muted',
      },
      {
        label: h.safety ? 'Safety tier' : 'Strict only',
        variant: h.safety ? 'ok' : 'warn',
      },
    ]

    const meta: CardItem['meta'] = [
      { label: 'Applicable to', value: h.applicable_to.join(', ') },
    ]

    return {
      id: h.id,
      title: h.id,
      description: descriptions[h.id] ?? h.entry,
      icon: 'ri-git-commit-line',
      monoTitle: true,
      tags,
      meta,
    }
  })
}

export function standardAdapter(
  standards: StandardEntry[],
  labels: WikiLabelsConfig,
): CardItem[] {
  return standards.map((s) => {
    const typeMeta = labels.standard_types[s.type]
    const typeLabel = typeMeta?.label ?? s.type
    const typeIcon = typeMeta?.icon ?? 'ri-book-marked-line'
    const tags: CardItem['tags'] = [
      { label: s.jurisdiction, variant: 'accent' },
      {
        label: typeLabel,
        variant: 'muted',
      },
      {
        label: s.free ? 'FREE' : 'PAID',
        variant: s.free ? 'ok' : 'warn',
      },
      ...s.tags.map((t) => ({ label: t, variant: 'muted' as const })),
    ]

    const meta: CardItem['meta'] = [
      { label: 'Issuer', value: s.issuer },
      { label: 'Date', value: s.date },
      {
        label: 'Status',
        value: s.status.charAt(0).toUpperCase() + s.status.slice(1),
      },
      ...(s.pages ? [{ label: 'Pages', value: String(s.pages) }] : []),
      ...(s.price ? [{ label: 'Price', value: s.price }] : []),
    ]

    return {
      id: s.id,
      title: s.title,
      subtitle: s.fullTitle,
      description: s.summary,
      icon: typeIcon,
      category: typeLabel,
      tags,
      meta,
    }
  })
}
