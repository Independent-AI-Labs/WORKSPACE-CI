export interface MakefileTarget {
  name: string
  description: string
  prerequisites: string[]
  section: string
  phony: boolean
}

export interface MakefileData {
  targets: MakefileTarget[]
  rawContent: string
  highlightedHtml: string
}
