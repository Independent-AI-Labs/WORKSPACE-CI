import type { MakefileTarget } from '@/types/makefile'

function isSeparator(line: string): boolean {
  return /^#\s*=+\s*$/.test(line)
}

function extractSectionName(line: string): string | null {
  const match = line.match(/^#\s+(.+?)\s*$/)
  return match ? match[1] : null
}

function joinContinuations(content: string): string {
  return content
    .split('\n')
    .reduce((acc: string[], line) => {
      if (acc.length > 0 && acc[acc.length - 1].endsWith('\\')) {
        acc[acc.length - 1] =
          acc[acc.length - 1].slice(0, -1).trimEnd() + ' ' + line.trim()
      } else {
        acc.push(line)
      }
      return acc
    }, [])
    .join('\n')
}

function parseTargetLine(
  line: string,
): { name: string; prerequisites: string[]; description: string } | null {
  const hashIdx = line.indexOf('##')
  let description = ''
  let targetPart: string
  if (hashIdx !== -1) {
    description = line.slice(hashIdx + 2).trim()
    targetPart = line.slice(0, hashIdx).trim()
  } else {
    targetPart = line.trim()
  }

  const colonIdx = targetPart.indexOf(':')
  if (colonIdx === -1) return null

  const afterColon = targetPart[colonIdx + 1]
  if (afterColon === '=' || afterColon === '?' || afterColon === '+') {
    return null
  }

  const name = targetPart.slice(0, colonIdx).trim()
  if (!name) return null
  if (name.startsWith('.') || name.startsWith('_')) return null

  const prereqStr = targetPart.slice(colonIdx + 1).trim()
  const prerequisites = prereqStr ? prereqStr.split(/\s+/).filter(Boolean) : []

  return { name, prerequisites, description }
}

export function parseMakefile(content: string): MakefileTarget[] {
  const joined = joinContinuations(content)
  const lines = joined.split('\n')
  const targets: MakefileTarget[] = []
  const phonySet = new Set<string>()
  let currentSection = 'General'

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    if (isSeparator(line)) {
      if (i + 2 < lines.length && isSeparator(lines[i + 2])) {
        const name = extractSectionName(lines[i + 1])
        if (name) {
          currentSection = name
          i += 2
          continue
        }
      }
      continue
    }

    if (trimmed === '' || trimmed.startsWith('#')) continue
    if (line.startsWith('\t') || line.startsWith(' ')) continue

    if (/^\.PHONY:/.test(trimmed)) {
      const parts = trimmed.slice('.PHONY:'.length).trim().split(/\s+/)
      for (const p of parts) {
        if (p) phonySet.add(p)
      }
      continue
    }

    if (
      /^export\b/.test(trimmed) ||
      /^-?include\b/.test(trimmed) ||
      /^ifdef\b/.test(trimmed) ||
      /^ifndef\b/.test(trimmed) ||
      /^else\b/.test(trimmed) ||
      /^endif\b/.test(trimmed) ||
      /^ifeq\b/.test(trimmed) ||
      /^ifneq\b/.test(trimmed)
    ) {
      continue
    }

    const parsed = parseTargetLine(trimmed)
    if (!parsed) continue

    targets.push({
      name: parsed.name,
      description: parsed.description,
      prerequisites: parsed.prerequisites,
      section: currentSection,
      phony: phonySet.has(parsed.name),
    })
  }

  return targets
}
