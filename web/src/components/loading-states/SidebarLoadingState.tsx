export function SidebarLoadingState() {
  return (
    <div className="wiki-sidebar loading-state" aria-busy="true">
      <div className="loading-line h-6 w-40" />
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="loading-line h-4 w-32" />
      ))}
    </div>
  )
}
