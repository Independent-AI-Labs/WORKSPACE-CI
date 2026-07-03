'use client'

import { Component, ReactNode } from 'react'

type ErrorFallbackRender = (args: {
  error: Error
  reset: () => void
}) => ReactNode

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  fallbackRender?: ErrorFallbackRender
  onError?: (error: Error, info: { componentStack: string | null }) => void
  resetKeys?: unknown[]
  componentId?: string
}

interface ErrorBoundaryState {
  hasError: boolean
  error: (Error & { digest?: string }) | null
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(
    error: Error & { digest?: string },
  ): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (this.state.hasError && prevProps.resetKeys !== this.props.resetKeys) {
      const prevKeys = prevProps.resetKeys ?? []
      const nextKeys = this.props.resetKeys ?? []
      const changed = prevKeys.some((k, i) => !Object.is(k, nextKeys[i]))
      if (changed) {
        this.setState({ hasError: false, error: null })
      }
    }
  }

  componentDidCatch(
    error: Error,
    info: { componentStack: string | null },
  ): void {
    const tag = this.props.componentId ? `[${this.props.componentId}]` : ''
    console.error(`ErrorBoundary${tag} caught:`, error, info)
    this.props.onError?.(error, info)
  }

  reset = (): void => {
    this.setState({ hasError: false, error: null })
  }

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallbackRender) {
        return this.props.fallbackRender({
          error: this.state.error,
          reset: this.reset,
        })
      }
      if (this.props.fallback !== undefined) {
        return this.props.fallback
      }
      return (
        <div className="error-boundary" role="alert">
          <h2>Something went wrong</h2>
          <p className="text-muted">
            An unexpected error occurred. Please try again.
          </p>
          {this.state.error.digest && (
            <p className="text-muted">
              Error reference: {this.state.error.digest}
            </p>
          )}
          <button
            className="btn btn--secondary"
            onClick={this.reset}
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
