import type { CardItem } from '@/types/card'
import type { ProjectSummary } from '@/types/projects'
import type { ConfigEntry, GuardConfigEntry } from '@/types/content'
import type { ClassifiedPattern, SwallowLanguage } from '@/types/patterns'
import type { ScriptManifestEntry } from '@/types/wiki'
import { slugify } from '@/lib/utils'

const LANGUAGE_LABELS: Record<SwallowLanguage, string> = {
  shell: 'Shell',
  python: 'Python',
  js_ts: 'JS/TS',
  ansible: 'Ansible',
  cron: 'Cron',
}

export function projectAdapter(projects: ProjectSummary[]): CardItem[] {
  return projects.map((p) => ({
    id: p.slug,
    title: p.displayName,
    subtitle: p.title,
    description: p.summary,
    href: `/${p.slug}`,
    icon: p.icon,
    tags: [{ label: p.language, variant: 'muted' }],
  }))
}

export function configAdapter(configs: ConfigEntry[]): CardItem[] {
  return configs.map((c) => ({
    id: c.name,
    title: c.name,
    description: c.description ?? '',
    href: c.link,
    icon: 'ri-settings-3-line',
    monoTitle: true,
    meta:
      c.fieldCount !== undefined
        ? [{ label: 'Fields', value: String(c.fieldCount) }]
        : undefined,
  }))
}

export function guardConfigAdapter(entries: GuardConfigEntry[]): CardItem[] {
  return entries.map((e) => ({
    id: e.name,
    title: e.name,
    description: e.description ?? '',
    href: e.link,
    icon: 'ri-shield-keyhole-line',
    monoTitle: true,
    meta:
      e.fieldCount !== undefined
        ? [{ label: 'Fields', value: String(e.fieldCount) }]
        : undefined,
  }))
}

export function patternAdapter(patterns: ClassifiedPattern[]): CardItem[] {
  return patterns.map((p) => {
    const tags: CardItem['tags'] = []
    if (p.languages) {
      for (const lang of p.languages) {
        tags.push({
          label: LANGUAGE_LABELS[lang] ?? lang,
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
      id: slugify(p.pattern),
      title: p.pattern,
      description: p.reason,
      monoTitle: true,
      category: p.categoryLabel,
      tags: tags.length > 0 ? tags : undefined,
      meta: meta.length > 0 ? meta : undefined,
    }
  })
}

export function scriptAdapter(scripts: ScriptManifestEntry[]): CardItem[] {
  return scripts.map((s) => ({
    id: s.id,
    title: s.id,
    description: s.summary,
    monoTitle: true,
    tags: [{ label: s.category, variant: 'accent' }],
    meta: s.make_target
      ? [{ label: 'Make target', value: s.make_target }]
      : undefined,
  }))
}
