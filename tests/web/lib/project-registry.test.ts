import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { resolveRepoDir, extractReadmeSummary } from '@/lib/project-registry'

const cfg = {
  slug: 'workspace-vm',
  displayName: 'WORKSPACE-VM',
  language: 'Python',
  repoName: 'WORKSPACE-VM',
  icon: 'ri-server-line',
  logoPath: '/logos/workspace-vm.png',
}

const siblingCfg = {
  slug: 'workspace-ci',
  displayName: 'WORKSPACE-CI',
  language: 'Python',
  repoName: 'WORKSPACE-CI',
  icon: 'ri-terminal-box-line',
}

describe('resolveRepoDir', () => {
  afterEach(() => {
    delete process.env.WORKSPACE_PROJECTS_ROOT
  })

  it('resolves workspace-vm to parent of projects root in dev', () => {
    const projectsRoot = '/workspace/projects'
    expect(resolveRepoDir(cfg, projectsRoot)).toBe(join(projectsRoot, '..'))
  })

  it('resolves workspace-vm to WORKSPACE-VM under prod projects root', () => {
    process.env.WORKSPACE_PROJECTS_ROOT = '/workspace'
    const projectsRoot = '/workspace'
    expect(resolveRepoDir(cfg, projectsRoot)).toBe(join(projectsRoot, 'WORKSPACE-VM'))
  })

  it('resolves sibling repos by repoName', () => {
    const projectsRoot = '/workspace/projects'
    expect(resolveRepoDir(siblingCfg, projectsRoot)).toBe(join(projectsRoot, 'WORKSPACE-CI'))
  })
})

describe('extractReadmeSummary', () => {
  it('collects multiple intro paragraphs separated by blank lines', () => {
    const markdown = `# Sovereign Digital Workspace Stack

A federated repository for developing and running web services and AI agents on infrastructure **you control**.

The design centers on **data sovereignty**, **system immutability**, and **workspace-wide compliance**: agents run inside guarded sandboxes, quality gates apply before code ships, and sensitive services stay on your machines rather than a vendor cloud.

Clone the repository and run \`make install\` to set up the core developer toolchain.

---

## Getting Started
`
    const summary = extractReadmeSummary(markdown)
    const paragraphs = summary.split('\n\n')
    expect(paragraphs).toHaveLength(2)
    expect(paragraphs[0]).toContain('A federated repository')
    expect(paragraphs[1]).toContain('The design centers on')
    expect(summary).not.toContain('Clone the repository')
  })

  it('limits catalogue blurbs to two sentences', () => {
    const markdown = `# Title

Sentence one here.

Sentence two here.

Sentence three here.
`
    const summary = extractReadmeSummary(markdown)
    expect(summary.split('\n\n')).toHaveLength(2)
    expect(summary).toContain('Sentence one here.')
    expect(summary).toContain('Sentence two here.')
    expect(summary).not.toContain('Sentence three here.')
  })

  it('stops at horizontal rules and headings', () => {
    const markdown = `# Title

First sentence here. Second sentence follows.

> Blockquote should not appear.

Third sentence skipped.
`
    const summary = extractReadmeSummary(markdown)
    expect(summary).toBe('First sentence here. Second sentence follows.')
  })

  it('stops at the first blank line before non-prose content', () => {
    const markdown = `# Title

Intro sentence one. Intro sentence two.

<img src="diagram.png" alt="diagram" />

More prose below.
`
    const summary = extractReadmeSummary(markdown)
    expect(summary).toBe('Intro sentence one. Intro sentence two.')
  })

  it('skips images, badges, and HTML blocks before the intro text', () => {
    const markdown = `# Title

<p align="center">
  <img src="banner.png" alt="banner" />
</p>

[![CI](https://img.shields.io/badge/ci-passing-green.svg)](https://ci.example.com)

![logo](logo.png)

Real intro sentence here. Second intro sentence.
`
    const summary = extractReadmeSummary(markdown)
    expect(summary).toBe('Real intro sentence here. Second intro sentence.')
  })

  it('strips inline images and HTML tags from intro text', () => {
    const markdown = `# Title

Intro with ![icon](icon.png) inline image and <sub>subscript</sub> text.
`
    const summary = extractReadmeSummary(markdown)
    expect(summary).toBe('Intro with inline image and subscript text.')
  })

  it('skips multi-line HTML comments before the intro', () => {
    const markdown = `# Title

<!--
  editor note: keep badges above the fold
  more comment lines
-->

Actual intro sentence.
`
    const summary = extractReadmeSummary(markdown)
    expect(summary).toBe('Actual intro sentence.')
  })

  it('extracts multiple sentences from the WORKSPACE-VM README intro', () => {
    const readmePath = join(__dirname, '..', '..', '..', '..', '..', 'README.md')
    const summary = extractReadmeSummary(readFileSync(readmePath, 'utf8'))
    expect(summary).toContain('A federated repository')
    expect(summary).toContain('The design centers on')
  })
})