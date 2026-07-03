import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import grayMatter from 'gray-matter'
import { marked } from 'marked'
import { sanitizeHtml } from '@/lib/sanitize'

const CONTENT_ROOT = join(process.cwd(), 'src', 'content')

export interface MarkdownResult {
  frontmatter: Record<string, unknown>
  content: string
  html: string
}

export function loadMarkdown(filePath: string): MarkdownResult | null {
  const fullPath = filePath.startsWith('/')
    ? filePath
    : join(CONTENT_ROOT, filePath)

  if (!existsSync(fullPath)) return null

  let raw: string
  try {
    raw = readFileSync(fullPath, 'utf8')
  } catch (e) {
    console.error(`Failed to read markdown file: ${fullPath}`, e)
    return null
  }
  const { data, content } = grayMatter(raw)
  const rawHtml = marked(content, { gfm: true, breaks: false }) as string
  const html = sanitizeHtml(rawHtml)

  return { frontmatter: data, content, html }
}

export function loadMarkdownByDir(
  dir: string,
  slug: string,
): MarkdownResult | null {
  return loadMarkdown(join(dir, `${slug}.md`))
}

export function listMarkdownFiles(dir: string): string[] {
  const fullPath = join(CONTENT_ROOT, dir)
  if (!existsSync(fullPath)) return []
  return readdirSync(fullPath)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, ''))
    .sort()
}
