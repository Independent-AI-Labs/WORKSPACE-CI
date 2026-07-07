export interface WikiPageEntry {
  id: string
  title: string
  section: string
  content: string
  href: string
  keywords: string[]
}

export interface WikiPagesConfig {
  version: number
  pages: WikiPageEntry[]
}
