'use client'

interface ServiceUnavailableProps {
  title: string
  description: string
  compact?: boolean
  onRetry?: () => void
}

export function ServiceUnavailable({
  title,
  description,
  compact = false,
  onRetry,
}: ServiceUnavailableProps) {
  return (
    <div
      className={'coming-soon' + (compact ? ' coming-soon--compact' : '')}
      role="status"
    >
      <i className="ri-server-line coming-soon__icon" aria-hidden="true" />
      <span className="coming-soon__badge coming-soon__badge--warn">Service Unavailable</span>
      <h1>{title}</h1>
      <p className="coming-soon__description">{description}</p>
      {onRetry && (
        <button type="button" className="btn btn--secondary" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}