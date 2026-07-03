export function CategoryNavLoadingState() {
  return (
    <div className="category-nav loading-state" aria-busy="true">
      {Array.from({ length: 16 }).map((_, i) => (
        <div key={i} className="loading-line h-6 w-40" />
      ))}
    </div>
  )
}
