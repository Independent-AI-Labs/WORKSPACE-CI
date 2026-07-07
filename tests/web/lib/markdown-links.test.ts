import { describe, it, expect } from 'vitest'
import {
  slugifyHeading,
  rewriteRelativeHref,
  buildReadmeMarked,
} from '@/lib/markdown-links'

describe('slugifyHeading', () => {
  it('lowercases and hyphenates plain text', () => {
    expect(slugifyHeading('Quick Start')).toBe('quick-start')
  })

  it('strips punctuation', () => {
    expect(slugifyHeading("What's New?")).toBe('whats-new')
  })

  it('collapses repeated hyphens and trims edges', () => {
    expect(slugifyHeading('Foo & Bar')).toBe('foo-bar')
  })

  it('strips inline html tags', () => {
    expect(slugifyHeading('<code>Arch</code> Overview')).toBe('arch-overview')
  })

  it('decodes entities to spaces', () => {
    expect(slugifyHeading('A &amp; B')).toBe('a-b')
  })

  it('preserves underscores and digits', () => {
    expect(slugifyHeading('Section 2_Foo')).toBe('section-2_foo')
  })
})

describe('rewriteRelativeHref', () => {
  const ctx = { repoUrl: 'https://github.com/org/repo', branch: 'main' }

  it('rewrites a file path to a blob url', () => {
    expect(rewriteRelativeHref('docs/HOOKS.md', ctx)).toBe(
      'https://github.com/org/repo/blob/main/docs/HOOKS.md',
    )
  })

  it('rewrites a directory path to a tree url', () => {
    expect(rewriteRelativeHref('lib/', ctx)).toBe(
      'https://github.com/org/repo/tree/main/lib/',
    )
  })

  it('strips a leading ./ prefix', () => {
    expect(rewriteRelativeHref('./docs/HOOKS.md', ctx)).toBe(
      'https://github.com/org/repo/blob/main/docs/HOOKS.md',
    )
  })

  it('uses a custom branch', () => {
    expect(rewriteRelativeHref('docs/HOOKS.md', { ...ctx, branch: 'master' })).toBe(
      'https://github.com/org/repo/blob/master/docs/HOOKS.md',
    )
  })

  it('defaults to main when branch missing', () => {
    expect(rewriteRelativeHref('docs/HOOKS.md', { repoUrl: 'https://github.com/org/repo' })).toBe(
      'https://github.com/org/repo/blob/main/docs/HOOKS.md',
    )
  })

  it('leaves anchor links untouched', () => {
    expect(rewriteRelativeHref('#quick-start', ctx)).toBe('#quick-start')
  })

  it('leaves absolute urls untouched', () => {
    expect(rewriteRelativeHref('https://example.com/x', ctx)).toBe('https://example.com/x')
  })

  it('leaves protocol-relative urls untouched', () => {
    expect(rewriteRelativeHref('//example.com/x', ctx)).toBe('//example.com/x')
  })

  it('leaves mailto untouched', () => {
    expect(rewriteRelativeHref('mailto:a@b.com', ctx)).toBe('mailto:a@b.com')
  })

  it('passes through when no repo url is set', () => {
    expect(rewriteRelativeHref('docs/HOOKS.md', {})).toBe('docs/HOOKS.md')
  })
})

describe('buildReadmeMarked', () => {
  const ctx = { repoUrl: 'https://github.com/org/repo', branch: 'main' }
  const markedInstance = buildReadmeMarked(ctx)

  it('emits heading ids', () => {
    const html = markedInstance.parse('## Quick Start\n') as string
    expect(html).toContain('<h2 id="quick-start">Quick Start</h2>')
  })

  it('slugifies bold headings', () => {
    const html = markedInstance.parse('### **Architecture**\n') as string
    expect(html).toContain('id="architecture"')
    expect(html).toContain('<strong>Architecture</strong>')
  })

  it('dedupes repeated heading ids', () => {
    const md = '## Foo\n## Foo\n## Foo\n'
    const html = markedInstance.parse(md) as string
    expect(html).toContain('id="foo"')
    expect(html).toContain('id="foo-1"')
    expect(html).toContain('id="foo-2"')
  })

  it('rewrites relative links to blob urls', () => {
    const html = markedInstance.parse('[hooks](docs/HOOKS.md)\n') as string
    expect(html).toContain(
      'href="https://github.com/org/repo/blob/main/docs/HOOKS.md"',
    )
  })

  it('adds target and rel to external links', () => {
    const html = markedInstance.parse('[ext](https://example.com)\n') as string
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('does not add target to anchor links', () => {
    const html = markedInstance.parse('[toc](#quick-start)\n') as string
    expect(html).toContain('href="#quick-start"')
    expect(html).not.toContain('target=')
  })

  it('keeps link titles', () => {
    const html = markedInstance.parse('[x](docs/HOOKS.md "title here")\n') as string
    expect(html).toContain('title="title here"')
  })
})
