'use client'

interface MatchPanelProps {
  matches: { line: number; lineText: string; pattern: string; reason: string; category: string }[]
  onMatchClick: (line: number) => void
}

export function MatchPanel({ matches, onMatchClick }: MatchPanelProps) {
  return (
    <div className="match-panel" aria-label="Pattern matches">
      <div className="match-panel__header">
        <span>Matches ({matches.length})</span>
      </div>
      <ul className="match-panel__list">
        {matches.length === 0 ? (
          <li className="match-panel__empty">No matches found</li>
        ) : (
          matches.map((match, i) => (
            <li
              key={i}
              className="match-panel__item"
              onClick={() => onMatchClick(match.line)}
            >
              <span className="match-panel__line">L{match.line}</span>
              <code className="match-panel__pattern">{match.pattern}</code>
              <span className="match-panel__reason">{match.reason}</span>
            </li>
          ))
        )}
      </ul>
    </div>
  )
}
