import { describe, it, expect } from 'vitest'
import { parseCodeFences, splitMermaidBlocks } from '@/lib/markdown-fences'

describe('splitMermaidBlocks', () => {
  it('returns a single md segment when no mermaid fences exist', () => {
    expect(splitMermaidBlocks('# Title\n\nText')).toEqual([
      { type: 'md', body: '# Title\n\nText' },
    ])
  })

  it('splits text around a mermaid fence', () => {
    const content = 'Intro\n\n```mermaid\ngraph TD\n  A-->B\n```\n\nOutro'
    const segments = splitMermaidBlocks(content)
    expect(segments).toHaveLength(3)
    expect(segments[0]).toEqual({ type: 'md', body: 'Intro\n\n' })
    expect(segments[1].type).toBe('mermaid')
    expect(segments[1].body).toContain('graph TD')
    expect(segments[1].body).toContain('A-->B')
    expect(segments[2].body).toContain('Outro')
  })

  it('handles multiple mermaid blocks', () => {
    const content = [
      'A',
      '```mermaid',
      'graph TD',
      '```',
      'B',
      '```mermaid',
      'flowchart LR',
      '```',
      'C',
    ].join('\n')
    const segments = splitMermaidBlocks(content)
    expect(segments).toHaveLength(5)
    expect(segments.filter((s) => s.type === 'mermaid')).toHaveLength(2)
  })
})

describe('parseCodeFences', () => {
  it('returns a single md segment when no fences exist', () => {
    expect(parseCodeFences('plain text')).toEqual([
      { type: 'md', text: 'plain text' },
    ])
  })

  it('splits markdown around code fences', () => {
    const md = 'Before\n\n```bash\necho hi\n```\n\nAfter'
    const segments = parseCodeFences(md)
    expect(segments).toHaveLength(3)
    expect(segments[0]).toEqual({ type: 'md', text: 'Before\n\n' })
    expect(segments[1]).toMatchObject({ type: 'code', lang: 'bash' })
    expect(segments[1].type === 'code' && segments[1].code).toContain('echo hi')
    expect(segments[2]).toMatchObject({ type: 'md', text: expect.stringContaining('After') })
  })

  it('parses multiple fences in order', () => {
    const md = [
      '```python',
      'a = 1',
      '```',
      '',
      '```json',
      '{"x": 1}',
      '```',
    ].join('\n')
    const segments = parseCodeFences(md)
    expect(segments.filter((s) => s.type === 'code')).toHaveLength(2)
    expect(segments[0]).toMatchObject({ type: 'code', lang: 'python' })
    expect(segments[2]).toMatchObject({ type: 'code', lang: 'json' })
  })

  it('handles fences without a language tag', () => {
    expect(parseCodeFences('```\nplain\n```')).toEqual([
      { type: 'code', lang: '', code: 'plain\n' },
    ])
  })
})