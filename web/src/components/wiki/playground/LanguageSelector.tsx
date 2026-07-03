'use client'

interface LanguageSelectorProps {
  value: string
  onChange: (lang: string) => void
}

const LANGUAGES = [
  { id: 'python', label: 'Python' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'shell', label: 'Shell' },
  { id: 'yaml', label: 'YAML' },
]

export function LanguageSelector({ value, onChange }: LanguageSelectorProps) {
  return (
    <select
      className="language-selector"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Select language"
    >
      {LANGUAGES.map((lang) => (
        <option key={lang.id} value={lang.id}>
          {lang.label}
        </option>
      ))}
    </select>
  )
}
