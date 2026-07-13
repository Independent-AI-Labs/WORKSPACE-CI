import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('@/lib/highlight', () => ({
  highlightCode: vi.fn().mockResolvedValue('<pre><code>highlighted</code></pre>'),
  escapeHtml: (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
}))

import { ContentRenderer } from '@/components/wiki/ContentRenderer'

describe('ContentRenderer: mermaid handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('wraps mermaid blocks in a mermaid-frame div with escaped source', async () => {
    const content = '```mermaid\ngraph TD\n  A-->B\n```'
    const { container } = render(await ContentRenderer({ content }))
    const frame = container.querySelector('.mermaid-frame')
    expect(frame).not.toBeNull()
    expect(frame?.hasAttribute('data-mermaid')).toBe(true)
    const pre = frame?.querySelector('pre.mermaid')
    expect(pre).not.toBeNull()
    expect(pre?.id).toBe('mermaid-diagram-0')
    expect(pre?.textContent).toContain('graph TD')
    expect(pre?.textContent).toContain('A-->B')
  })

  it('preserves mermaid source containing blank lines (subgraph blocks)', async () => {
    const source = [
      'graph TB',
      '    subgraph "Layer A"',
      '        A["Node A"]',
      '    end',
      '',
      '    subgraph "Layer B"',
      '        B["Node B"]',
      '    end',
      '    A --> B',
    ].join('\n')
    const content = '```mermaid\n' + source + '\n```'
    const { container } = render(await ContentRenderer({ content }))
    const pre = container.querySelector('pre.mermaid')
    expect(pre?.textContent).toContain('subgraph "Layer A"')
    expect(pre?.textContent).toContain('subgraph "Layer B"')
    expect(pre?.textContent).toContain('A --> B')
  })

  it('handles multiple mermaid blocks with text between them', async () => {
    const content = [
      'Some intro text',
      '',
      '```mermaid',
      'graph TD',
      '  A-->B',
      '```',
      '',
      'Middle text',
      '',
      '```mermaid',
      'flowchart LR',
      '  C-->D',
      '```',
      '',
      'End text',
    ].join('\n')
    const { container } = render(await ContentRenderer({ content }))
    const frames = container.querySelectorAll('.mermaid-frame')
    expect(frames).toHaveLength(2)
    expect(frames[0].querySelector('pre.mermaid')?.id).toBe('mermaid-diagram-0')
    expect(frames[1].querySelector('pre.mermaid')?.id).toBe('mermaid-diagram-1')
    expect(frames[0].querySelector('pre.mermaid')?.textContent).toContain('A-->B')
    expect(frames[1].querySelector('pre.mermaid')?.textContent).toContain('C-->D')
    expect(container.textContent).toContain('Some intro text')
    expect(container.textContent).toContain('Middle text')
    expect(container.textContent).toContain('End text')
  })

  it('escapes HTML inside mermaid source', async () => {
    const content = '```mermaid\ngraph TD\n  A["text with <br/> tag"]\n```'
    const { container } = render(await ContentRenderer({ content }))
    const frame = container.querySelector('.mermaid-frame')
    expect(frame?.innerHTML).toContain('&lt;br/&gt;')
    expect(frame?.innerHTML).not.toContain('<br/>')
  })

  it('does not pass mermaid through marked (no heading IDs on mermaid)', async () => {
    const content = '```mermaid\n## Not a heading\n```'
    const { container } = render(await ContentRenderer({ content }))
    expect(container.querySelector('h2')).toBeNull()
  })

  it('still renders regular markdown around mermaid blocks', async () => {
    const content = [
      '# Title',
      '',
      '```mermaid',
      'graph TD',
      '  A-->B',
      '```',
      '',
      '## Subtitle',
      '',
      'Some **bold** text',
    ].join('\n')
    const { container } = render(await ContentRenderer({ content }))
    expect(container.querySelector('h1')).not.toBeNull()
    expect(container.querySelector('h2')).not.toBeNull()
    expect(container.querySelector('.mermaid-frame')).not.toBeNull()
    expect(container.querySelector('strong')?.textContent).toBe('bold')
  })

  it('passes repoUrl and branch to buildReadmeMarked for link rewriting', async () => {
    const content = [
      '# Title',
      '',
      '[link](./file.py)',
      '',
      '```mermaid',
      'graph TD',
      '  A-->B',
      '```',
    ].join('\n')
    const { container } = render(
      await ContentRenderer({
        content,
        repoUrl: 'https://github.com/org/repo',
        branch: 'develop',
      }),
    )
    const link = container.querySelector('a')
    expect(link?.getAttribute('href')).toBe(
      'https://github.com/org/repo/blob/develop/file.py',
    )
    const frame = container.querySelector('.mermaid-frame')
    expect(frame).not.toBeNull()
  })

  it('renders content with no mermaid blocks unchanged', async () => {
    const content = '# Title\n\nSome text\n\n```bash\necho hi\n```'
    const { container } = render(await ContentRenderer({ content }))
    expect(container.querySelector('.mermaid-frame')).toBeNull()
    expect(container.querySelector('h1')).not.toBeNull()
  })
})
