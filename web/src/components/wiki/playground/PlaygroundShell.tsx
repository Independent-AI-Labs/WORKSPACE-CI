'use client'

import { usePlayground } from '@/hooks/usePlayground'
import { LanguageSelector } from '@/components/wiki/playground/LanguageSelector'
import { PatternCategoryFilter } from '@/components/wiki/playground/PatternCategoryFilter'
import { MatchPanel } from '@/components/wiki/playground/MatchPanel'
import { CodeEditor } from '@/components/wiki/playground/CodeEditor'
import type { ClassifiedPattern } from '@/types/patterns'

interface EditorApi {
  scrollToLine: (line: number) => void
}

export function PlaygroundShell({ patterns }: { patterns: ClassifiedPattern[] }) {
  const {
    matches,
    setMatches,
    language,
    setLanguage,
    activeCategories,
    toggleCategory,
    editorRef,
  } = usePlayground(patterns)

  return (
    <div className="playground-shell">
      <div className="playground-toolbar">
        <LanguageSelector value={language} onChange={setLanguage} />
        <PatternCategoryFilter
          active={activeCategories}
          onToggle={toggleCategory}
        />
      </div>
      <div className="playground-panes">
        <CodeEditor
          ref={editorRef as React.MutableRefObject<EditorApi | null>}
          patterns={patterns}
          activeCategories={activeCategories}
          language={language}
          onMatchesChange={setMatches}
        />
        <MatchPanel
          matches={matches}
          onMatchClick={(line: number) => editorRef.current?.scrollToLine(line)}
        />
      </div>
    </div>
  )
}
