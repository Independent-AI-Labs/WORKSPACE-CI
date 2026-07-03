export function PatternGridLoadingState() {
  return (
    <div className="pattern-grid loading-state" aria-busy="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="loading-line h-32 w-full" />
      ))}
    </div>
  )
}
