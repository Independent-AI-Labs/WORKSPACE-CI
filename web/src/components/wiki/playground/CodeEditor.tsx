'use client'

import { forwardRef, useImperativeHandle, useRef, useEffect } from 'react'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { EditorState, EditorSelection } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { python } from '@codemirror/lang-python'
import { javascript } from '@codemirror/lang-javascript'
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  StreamLanguage,
} from '@codemirror/language'
import { shell as shellMode } from '@codemirror/legacy-modes/mode/shell'
import { yaml as yamlMode } from '@codemirror/legacy-modes/mode/yaml'
import { go as goMode } from '@codemirror/legacy-modes/mode/go'
import { lua as luaMode } from '@codemirror/legacy-modes/mode/lua'
import { rust as rustMode } from '@codemirror/legacy-modes/mode/rust'
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
    const docRef = useRef<string>('')

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
      switch (lang) {
        case 'python':
        case 'bash':
          return [python()]
        case 'javascript':
        case 'typescript':
        case 'js_ts':
          return [javascript()]
        case 'shell':
        case 'cron':
          return [StreamLanguage.define(shellMode)]
        case 'ansible':
        case 'yaml':
          return [StreamLanguage.define(yamlMode)]
        case 'go':
          return [StreamLanguage.define(goMode)]
        case 'lua':
          return [StreamLanguage.define(luaMode)]
        case 'rust':
          return [StreamLanguage.define(rustMode)]
        default:
          return []
      }
    }

    useEffect(() => {
      if (!containerRef.current) return

      const state = EditorState.create({
        doc: docRef.current,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          ...getLanguageExtension(language),
          EditorView.lineWrapping,
          lineNumbers(),
          syntaxHighlighting(defaultHighlightStyle),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              docRef.current = update.state.doc.toString()
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
        docRef.current = view.state.doc.toString()
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
