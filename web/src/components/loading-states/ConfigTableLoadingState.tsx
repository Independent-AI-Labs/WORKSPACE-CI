export function ConfigTableLoadingState() {
  return (
    <div className="config-fields loading-state" aria-busy="true">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="loading-line h-10 w-full" />
      ))}
    </div>
  )
}
