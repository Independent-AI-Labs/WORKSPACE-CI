import type { ClassifiedPattern, PatternMatch } from '@/types/wiki'

const regexCache = new Map<string, RegExp>()

function getRegex(pattern: string): RegExp | null {
  if (regexCache.has(pattern)) {
    return regexCache.get(pattern)!
  }
  try {
    const re = new RegExp(pattern, 'g')
    regexCache.set(pattern, re)
    return re
  } catch (e) {
    console.error(`Invalid regex pattern "${pattern}":`, e)
    return null
  }
}

export function runPatterns(
  sourceCode: string,
  patterns: ClassifiedPattern[],
  activeCategories: Set<string>,
): PatternMatch[] {
  const matches: PatternMatch[] = []
  const seen = new Set<string>()

  const lines = sourceCode.split('\n')

  for (const p of patterns) {
    if (!activeCategories.has(p.category)) continue

    const re = getRegex(p.pattern)
    if (!re) continue

    re.lastIndex = 0
    let match: RegExpExecArray | null

    try {
      while ((match = re.exec(sourceCode)) !== null) {
        const before = sourceCode.slice(0, match.index)
        const lineNumber = before.split('\n').length
        const lineText = lines[lineNumber - 1] ?? ''
        const column = match.index - before.lastIndexOf('\n') - (before.lastIndexOf('\n') >= 0 ? 1 : 0)

        const key = `${lineNumber}:${p.pattern}`
        if (!seen.has(key)) {
          seen.add(key)
          matches.push({
            line: lineNumber,
            column: column >= 0 ? column : 0,
            lineText,
            pattern: p.pattern,
            reason: p.reason,
            category: p.category,
          })
        }

        if (match.index === re.lastIndex) {
          re.lastIndex++
        }
      }
    } catch (e) {
      console.error(`Error executing regex pattern "${p.pattern}":`, e)
      continue
    }
  }

  matches.sort((a, b) => a.line - b.line)
  return matches
}

export function clearRegexCache(): void {
  regexCache.clear()
}
