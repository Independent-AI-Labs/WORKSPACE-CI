import { describe, it, expect, afterEach } from 'vitest'
import { join } from 'path'
import { resolveRepoDir } from '@/lib/project-registry'

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
  repoName: 'CI',
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
    expect(resolveRepoDir(siblingCfg, projectsRoot)).toBe(join(projectsRoot, 'CI'))
  })
})