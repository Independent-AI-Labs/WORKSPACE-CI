export function ConfigTableLoadingState() {
  return (
    <div className="wiki-card-grid loading-state" aria-busy="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="wiki-card">
          <div className="loading-line h-6 w-3/4" />
          <div className="loading-line h-4 w-full" />
          <div className="loading-line h-4 w-1/2" />
        </div>
      ))}
    </div>
  )
}
