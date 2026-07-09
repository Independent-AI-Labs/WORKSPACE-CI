'use client'

import type { PlaygroundLanguage } from '@/types/wiki-labels'

interface LanguageSelectorProps {
  value: string
  onChange: (lang: string) => void
  languages: PlaygroundLanguage[]
}

export function LanguageSelector({ value, onChange, languages }: LanguageSelectorProps) {
  return (
    <select
      className="language-selector"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Select language"
    >
      {languages.map((lang) => (
        <option key={lang.id} value={lang.id}>
          {lang.label}
        </option>
      ))}
    </select>
  )
}
