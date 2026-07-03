import { WikiShell } from '@/components/wiki/WikiShell'
import { PatternList } from '@/components/wiki/PatternList'
import { getBannedPatterns, getSwallowPatterns } from '@/lib/yaml-loader'
import { loadSwallowDetectors } from '@/lib/docs-loader'
import { classifyAll, classifySwallowPatterns } from '@/lib/patterns'
import type { PatternCategory } from '@/types/patterns'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

const VALID_CATEGORIES: PatternCategory[] = [
  'linter-suppression',
  'deferred-types',
  'quiet-errors',
  'obsolete-paths',
  'suppression',
  'unsafe-reflection',
  'data-classes',
  'test-quality',
  'path-safety',
  'uuid',
  'container-versions',
  'deprecated-python',
  'self-methods',
  'special-chars',
  'filename-rules',
  'directory-rules',
  'error-swallowing',
]

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>
}): Promise<Metadata> {
  const { category } = await params
  return {
    title: `Patterns: ${category}`,
  }
}

export default async function PatternCategoryPage({
  params,
}: {
  params: Promise<{ category: string }>
}) {
  const { category } = await params

  if (!VALID_CATEGORIES.includes(category as PatternCategory)) {
    notFound()
  }

  const [config, swallowConfig] = await Promise.all([
    getBannedPatterns(),
    getSwallowPatterns(),
  ])
  const detectorData = loadSwallowDetectors()
  const bannedPatterns = classifyAll(config)
  const swallowPatterns = classifySwallowPatterns(swallowConfig, detectorData)
  const allPatterns = [...bannedPatterns, ...swallowPatterns]
  const filtered = allPatterns.filter((p) => p.category === category)

  return (
    <WikiShell>
      <h1>Patterns: {category}</h1>
      <PatternList patterns={filtered} />
    </WikiShell>
  )
}
