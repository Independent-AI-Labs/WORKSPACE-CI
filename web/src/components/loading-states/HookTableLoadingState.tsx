export function HookTableLoadingState() {
  return (
    <div className="hook-table loading-state" aria-busy="true">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="loading-line h-10 w-full" />
      ))}
    </div>
  )
}
