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

export function pageTitle(path: string): string {
  const map: Record<string, string> = {
    '/': 'Home',
    '/patterns': 'Code Anti-Patterns',
    '/hooks': 'Git Hooks',
    '/config': 'Config Files',
    '/guard': 'Workspace Guard',
    '/checks': 'Static Analysis',
    '/playground': 'Playground',
    '/tooling': 'Tools & Scripts',
    '/integration': 'Integration Guide',
  }
  return map[path] ?? path
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
