export function CheckListLoadingState() {
  return (
    <div className="check-list loading-state" aria-busy="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="loading-line h-24 w-full" />
      ))}
    </div>
  )
}
