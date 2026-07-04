export interface CodeStatsRepo {
  repo: string
  files: number
  blank: number
  comment: number
  code: number
}

export interface CodeStatsLanguage {
  language: string
  files: number
  blank: number
  comment: number
  code: number
  repos: number
}

export interface CodeStatsRepoLanguage {
  repo: string
  language: string
  files: number
  blank: number
  comment: number
  code: number
}

export interface CodeStatsTotals {
  repos: number
  files: number
  blank: number
  comment: number
  code: number
  lines: number
}

export interface CodeStatsData {
  generated_at: string
  totals: CodeStatsTotals
  repos: CodeStatsRepo[]
  languages: CodeStatsLanguage[]
  repo_languages: CodeStatsRepoLanguage[]
}

export interface LanguagePercent {
  language: string
  percent: number
  code: number
}
