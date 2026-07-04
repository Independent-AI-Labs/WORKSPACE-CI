export interface EntryPointSource {
  id: string
  name: string
  source_file: string
  docstring: string | null
  source: string
  language: string
}

export interface EntryPointSourceData {
  generated_at: string
  sources: EntryPointSource[]
}
