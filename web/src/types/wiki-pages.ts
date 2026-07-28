export interface WikiPageNav {
  label: string
  icon: string
  count?: string
  divider?: boolean
}

export interface WikiPageEntry {
  id: string
  title: string
  section: string
  content: string
  href: string
  nav?: WikiPageNav
  keywords: string[]
}

export interface WikiPagesConfig {
  version: number
  pages: WikiPageEntry[]
}
