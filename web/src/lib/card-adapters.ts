import type { CardItem } from '@/types/card'
import type { ProjectSummary } from '@/types/projects'
import type { ConfigEntry, GuardConfigEntry } from '@/types/content'
import type { ClassifiedPattern, SwallowLanguage } from '@/types/patterns'
import type { ScriptManifestEntry } from '@/types/wiki'
import type { HookRecord, HookKind } from '@/types/hooks'
import type { LanguagePercent } from '@/types/code-stats'
import type { StandardEntry, StandardType } from '@/types/standards'

const CONFIG_CATEGORY_MAP: Record<string, string> = {
  banned_words: 'Content Rules',
  banned_words_exceptions: 'Content Rules',
  blocked_commit_patterns: 'Content Rules',
  sensitive_files: 'Content Rules',
  silent_swallow_patterns: 'Content Rules',
  coverage_thresholds: 'Quality Gates',
  dead_code: 'Quality Gates',
  file_length_limits: 'Quality Gates',
  dependency_excludes: 'Dependencies',
  duplicate_dependency_excludes: 'Dependencies',
  boot_layout: 'Project Structure',
  markdown_docs: 'Project Structure',
  required_hooks: 'Project Structure',
}

const GUARD_CATEGORY_MAP: Record<string, string> = {
  guard_config_keys: 'Access Control',
  guard_protected_branches: 'Access Control',
  guard_subcommands: 'Access Control',
  guard_environment: 'Environment',
  guard_resource_limits: 'Environment',
  guard_paths: 'Filesystem',
}

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

const LANGUAGE_LABELS: Record<SwallowLanguage, string> = {
  shell: 'Shell',
  python: 'Python',
  js_ts: 'JS/TS',
  ansible: 'Ansible',
  cron: 'Cron',
}

const HOOK_KIND_ICONS: Record<HookKind, string> = {
  shell: 'ri-terminal-line',
  shell_inline: 'ri-terminal-line',
  shell_with_arg: 'ri-terminal-line',
  python_module: 'ri-code-line',
  python_module_files: 'ri-code-line',
  makefile_target: 'ri-tools-line',
}

const HOOK_KIND_LABELS: Record<HookKind, string> = {
  shell: 'Shell',
  shell_inline: 'Shell (inline)',
  shell_with_arg: 'Shell (with arg)',
  python_module: 'Python module',
  python_module_files: 'Python module (files)',
  makefile_target: 'Makefile target',
}

const HOOK_STAGE_LABELS: Record<string, string> = {
  'pre-commit': 'Pre-commit',
  'commit-msg': 'Commit-msg',
  'pre-push': 'Pre-push',
}

const STANDARD_TYPE_ICONS: Record<StandardType, string> = {
  regulation: 'ri-government-line',
  standard: 'ri-book-marked-line',
  framework: 'ri-flow-chart',
  declaration: 'ri-megaphone-line',
  'code-of-conduct': 'ri-shield-check-line',
  'executive-order': 'ri-government-line',
  treaty: 'ri-scales-3-line',
}

const STANDARD_TYPE_LABELS: Record<StandardType, string> = {
  regulation: 'Regulation',
  standard: 'Standard',
  framework: 'Framework',
  declaration: 'Declaration',
  'code-of-conduct': 'Code of Conduct',
  'executive-order': 'Executive Order',
  treaty: 'Treaty',
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
      tags: tags.length > 0 ? tags : [{ label: p.language, variant: 'muted' }],
    }
  })
}

export function configAdapter(configs: ConfigEntry[]): CardItem[] {
  return configs.map((c) => ({
    id: c.name,
    title: c.name,
    description: c.description ?? '',
    icon: 'ri-settings-3-line',
    monoTitle: true,
    category: CONFIG_CATEGORY_MAP[c.name] ?? 'Other',
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
    icon: 'ri-shield-keyhole-line',
    monoTitle: true,
    category: GUARD_CATEGORY_MAP[e.name] ?? 'Other',
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
      id: p.pattern,
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
  return scripts.map((s) => {
    const catLabel = capitalizeCategory(s.category)
    return {
      id: s.id,
      title: s.id,
      description: s.summary,
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
): CardItem[] {
  return hooks.map((h) => {
    const tags: CardItem['tags'] = [
      {
        label: HOOK_STAGE_LABELS[h.stage] ?? h.stage,
        variant: 'accent',
      },
      {
        label: HOOK_KIND_LABELS[h.kind] ?? h.kind,
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
      icon: HOOK_KIND_ICONS[h.kind] ?? 'ri-tools-line',
      monoTitle: true,
      tags,
      meta,
    }
  })
}

export function standardAdapter(standards: StandardEntry[]): CardItem[] {
  return standards.map((s) => {
    const tags: CardItem['tags'] = [
      { label: s.jurisdiction, variant: 'accent' },
      {
        label: STANDARD_TYPE_LABELS[s.type] ?? s.type,
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
      icon: STANDARD_TYPE_ICONS[s.type] ?? 'ri-book-marked-line',
      category: STANDARD_TYPE_LABELS[s.type] ?? s.type,
      tags,
      meta,
    }
  })
}
