'use client'

import { getWikiLabels } from '@/lib/yaml-loader'

interface LanguageSelectorProps {
  value: string
  onChange: (lang: string) => void
}

export function LanguageSelector({ value, onChange }: LanguageSelectorProps) {
  const languages = getWikiLabels().playground_languages
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
