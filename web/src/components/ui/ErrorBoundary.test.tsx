import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import type { ReactElement } from 'react'

function ThrowOnRender(): null {
  throw new Error('test error')
}

function SafeComponent(): ReactElement {
  return <div>safe content</div>
}

describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <SafeComponent />
      </ErrorBoundary>,
    )
    expect(getByText('safe content')).toBeInTheDocument()
  })

  it('renders error UI when child throws', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { getByText } = render(
      <ErrorBoundary>
        <ThrowOnRender />
      </ErrorBoundary>,
    )
    expect(getByText('Something went wrong')).toBeInTheDocument()
    expect(
      getByText('An unexpected error occurred. Please try again.'),
    ).toBeInTheDocument()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('does not catch errors in parent render', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { getByText } = render(
      <ErrorBoundary>
        <div>outer</div>
      </ErrorBoundary>,
    )
    expect(getByText('outer')).toBeInTheDocument()
    spy.mockRestore()
  })
})
