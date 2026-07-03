'use client'

import { forwardRef, useImperativeHandle, useRef, useEffect } from 'react'
import { EditorView, keymap } from '@codemirror/view'
import { EditorState, EditorSelection } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { python } from '@codemirror/lang-python'
import { javascript } from '@codemirror/lang-javascript'
import type { ClassifiedPattern, PatternCategory } from '@/types/patterns'
import type { PatternMatch } from '@/types/wiki'
import { runPatterns } from '@/lib/regex-engine'

interface CodeEditorProps {
  patterns: ClassifiedPattern[]
  activeCategories: Set<PatternCategory>
  language: string
  onMatchesChange: (matches: PatternMatch[]) => void
}

export interface CodeEditorRef {
  scrollToLine: (line: number) => void
}

export const CodeEditor = forwardRef<CodeEditorRef, CodeEditorProps>(
  function CodeEditor(
    { patterns, activeCategories, language, onMatchesChange },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null)
    const viewRef = useRef<EditorView | null>(null)

    const patternsRef = useRef(patterns)
    patternsRef.current = patterns
    const catsRef = useRef(activeCategories)
    catsRef.current = activeCategories
    const onMatchesRef = useRef(onMatchesChange)
    onMatchesRef.current = onMatchesChange

    useImperativeHandle(ref, () => ({
      scrollToLine: (line: number) => {
        if (viewRef.current) {
          const lineInfo = viewRef.current.state.doc.line(line)
          viewRef.current.dispatch({
            selection: EditorSelection.single(lineInfo.from),
            scrollIntoView: true,
          })
        }
      },
    }))

    const getLanguageExtension = (lang: string) => {
      if (lang === 'python') return [python()]
      if (lang === 'javascript' || lang === 'typescript') {
        return [javascript()]
      }
      return []
    }

    useEffect(() => {
      if (!containerRef.current) return

      const state = EditorState.create({
        doc: '',
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          ...getLanguageExtension(language),
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              const matches = runPatterns(
                update.state.doc.toString(),
                patternsRef.current,
                catsRef.current,
              )
              onMatchesRef.current(matches)
            }
          }),
        ],
      })

      const view = new EditorView({
        state,
        parent: containerRef.current,
      })
      viewRef.current = view

      return () => {
        view.destroy()
        viewRef.current = null
      }
    }, [language])

    return (
      <div
        className="code-editor"
        ref={containerRef}
      />
    )
  },
)

export default CodeEditor
