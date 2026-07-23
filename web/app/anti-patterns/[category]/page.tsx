import { WikiShell } from '@/components/wiki/WikiShell'
import { PatternList } from '@/components/wiki/PatternList'
import { getBannedPatterns, getSwallowPatterns, getWikiLabels } from '@/lib/yaml-loader'
import { loadSwallowDetectors } from '@/lib/docs-loader'
import { classifyAll, classifySwallowPatterns } from '@/lib/patterns'
import { highlightCode } from '@/lib/highlight'
import { PATTERN_CATEGORIES } from '@/types/patterns'
import type { PatternCategory } from '@/types/patterns'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

const VALID_CATEGORIES: PatternCategory[] = PATTERN_CATEGORIES.map(
  (c) => c.id,
)

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
  const labels = getWikiLabels()
  const bannedPatterns = classifyAll(config)
  const swallowPatterns = classifySwallowPatterns(swallowConfig, detectorData)
  const allPatterns = [...bannedPatterns, ...swallowPatterns]
  const filtered = allPatterns.filter((p) => p.category === category)

  const highlightedHtml: Record<string, string> = {}
  for (const p of filtered) {
    if (p.detectorFunction && p.detectorSource) {
      highlightedHtml[p.detectorFunction] = await highlightCode(
        p.detectorSource,
        'python',
      )
    }
  }

  return (
    <WikiShell>
      <h1>Patterns: {category}</h1>
      <PatternList
        patterns={filtered}
        highlightedHtml={highlightedHtml}
        labels={labels}
      />
    </WikiShell>
  )
}
