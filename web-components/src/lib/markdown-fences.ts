const MERMAID_FENCE_PATTERN = /```mermaid[ \t]*\n([\s\S]*?)```[ \t]*\n?/g
const CODE_FENCE_PATTERN = /```(\w+)?[ \t]*\n([\s\S]*?)```[ \t]*\n?/g

export type MermaidSegment =
  | { type: 'md'; body: string }
  | { type: 'mermaid'; body: string }

export type CodeSegment =
  | { type: 'md'; text: string }
  | { type: 'code'; lang: string; code: string }

export function splitMermaidBlocks(content: string): MermaidSegment[] {
  const re = new RegExp(MERMAID_FENCE_PATTERN.source, MERMAID_FENCE_PATTERN.flags)
  const segments: MermaidSegment[] = []
  let lastIndex = 0

  for (const match of content.matchAll(re)) {
    const index = match.index ?? 0
    if (index > lastIndex) {
      segments.push({ type: 'md', body: content.slice(lastIndex, index) })
    }
    segments.push({ type: 'mermaid', body: match[1] })
    lastIndex = index + match[0].length
  }

  if (lastIndex < content.length) {
    segments.push({ type: 'md', body: content.slice(lastIndex) })
  }

  if (segments.length === 0) {
    segments.push({ type: 'md', body: content })
  }

  return segments
}

export function parseCodeFences(md: string): CodeSegment[] {
  const re = new RegExp(CODE_FENCE_PATTERN.source, CODE_FENCE_PATTERN.flags)
  const segments: CodeSegment[] = []
  let lastIndex = 0

  for (const match of md.matchAll(re)) {
    const index = match.index ?? 0
    if (index > lastIndex) {
      segments.push({ type: 'md', text: md.slice(lastIndex, index) })
    }
    segments.push({
      type: 'code',
      lang: match[1] || '',
      code: match[2],
    })
    lastIndex = index + match[0].length
  }

  if (lastIndex < md.length) {
    segments.push({ type: 'md', text: md.slice(lastIndex) })
  }

  if (segments.length === 0) {
    segments.push({ type: 'md', text: md })
  }

  return segments
}