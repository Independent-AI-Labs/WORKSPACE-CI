export type StandardType =
  | 'regulation'
  | 'standard'
  | 'framework'
  | 'declaration'
  | 'code-of-conduct'
  | 'executive-order'
  | 'treaty'

export type StandardStatus = 'binding' | 'voluntary' | 'advisory'

export interface StandardEntry {
  id: string
  title: string
  fullTitle: string
  issuer: string
  jurisdiction: string
  date: string
  type: StandardType
  status: StandardStatus
  summary: string
  tags: string[]
  free: boolean
  downloadPath?: string
  sourceUrl?: string
  purchaseUrl?: string
  price?: string
  pages?: number
}
