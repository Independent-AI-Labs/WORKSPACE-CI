import { getNavLabelForHref } from '@/lib/wiki-nav'

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function resolvePath(
  values: Record<string, unknown>,
  path: string,
): unknown {
  const parts = path.split('.')
  let current: unknown = values

  for (const part of parts) {
    if (current === null || current === undefined) return undefined
    if (typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }

  return current
}

export function formatValue(value: unknown): string {
  if (value === undefined || value === null) return '-'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch (e) {
    console.error('JSON.stringify failed, using String() instead:', e)
    return String(value)
  }
}

function escHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function formatValueHtml(value: unknown, indent = 0): string {
  const pad = '\n' + '  '.repeat(indent)
  const padInner = '\n' + '  '.repeat(indent + 1)

  if (value === null || value === undefined) {
    return '<span class="syn-null">null</span>'
  }
  if (typeof value === 'boolean') {
    return `<span class="syn-boolean">${value}</span>`
  }
  if (typeof value === 'number') {
    return `<span class="syn-number">${value}</span>`
  }
  if (typeof value === 'string') {
    return `<span class="syn-string">&quot;${escHtml(value)}&quot;</span>`
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '<span class="syn-punct">[]</span>'
    const items = value.map((v) => padInner + formatValueHtml(v, indent + 1))
    return `<span class="syn-punct">[</span>${items.join('<span class="syn-punct">,</span>')}${pad}<span class="syn-punct">]</span>`
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value)
    if (entries.length === 0) return '<span class="syn-punct">{}</span>'
    const items = entries.map(
      ([k, v]) =>
        `${padInner}<span class="syn-key">${escHtml(k)}</span><span class="syn-punct">: </span>${formatValueHtml(v, indent + 1)}`,
    )
    return `<span class="syn-punct">{</span>${items.join('<span class="syn-punct">,</span>')}${pad}<span class="syn-punct">}</span>`
  }
  return escHtml(String(value))
}

export function pageTitle(path: string): string {
  return getNavLabelForHref(path) ?? path
}

export function truncateMarkdown(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  const truncated = text.slice(0, maxLength)
  const lastPara = truncated.lastIndexOf('\n\n')
  if (lastPara > maxLength * 0.5) {
    return text.slice(0, lastPara + 2)
  }
  const lastSentence = truncated.lastIndexOf('. ')
  if (lastSentence > maxLength * 0.5) {
    return text.slice(0, lastSentence + 1)
  }
  const lastWord = truncated.lastIndexOf(' ')
  if (lastWord > 0) {
    return text.slice(0, lastWord)
  }
  return truncated
}
