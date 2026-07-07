import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { Tooltip } from '@/components/ui/Tooltip'

afterEach(() => {
  vi.useRealTimers()
})

describe('Tooltip', () => {
  it('renders children', () => {
    render(
      <Tooltip text="Help text">
        <span>Info</span>
      </Tooltip>,
    )
    expect(screen.getByText('Info')).toBeInTheDocument()
  })

  it('always renders tooltip with role=tooltip', () => {
    render(
      <Tooltip text="Help text">
        <span>Info</span>
      </Tooltip>,
    )
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
  })

  it('tooltip is hidden by default (no is-visible class)', () => {
    render(
      <Tooltip text="Help text">
        <span>Info</span>
      </Tooltip>,
    )
    expect(screen.getByRole('tooltip')).not.toHaveClass('is-visible')
  })

  it('shows tooltip on mouse enter', () => {
    render(
      <Tooltip text="Help text">
        <span>Info</span>
      </Tooltip>,
    )
    fireEvent.mouseEnter(screen.getByText('Info'))
    expect(screen.getByRole('tooltip')).toHaveClass('is-visible')
  })

  it('hides tooltip on mouse leave after delay', () => {
    vi.useFakeTimers()
    render(
      <Tooltip text="Help text">
        <span>Info</span>
      </Tooltip>,
    )
    const trigger = screen.getByText('Info')
    fireEvent.mouseEnter(trigger)
    fireEvent.mouseLeave(trigger)
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(screen.getByRole('tooltip')).not.toHaveClass('is-visible')
  })

  it('shows tooltip on focus', () => {
    render(
      <Tooltip text="Help text">
        <span>Info</span>
      </Tooltip>,
    )
    fireEvent.focus(screen.getByText('Info'))
    expect(screen.getByRole('tooltip')).toHaveClass('is-visible')
  })

  it('hides tooltip on blur after delay', () => {
    vi.useFakeTimers()
    render(
      <Tooltip text="Help text">
        <span>Info</span>
      </Tooltip>,
    )
    const trigger = screen.getByText('Info')
    fireEvent.focus(trigger)
    fireEvent.blur(trigger)
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(screen.getByRole('tooltip')).not.toHaveClass('is-visible')
  })

  it('dismissible with Escape', () => {
    render(
      <Tooltip text="Help text">
        <span>Info</span>
      </Tooltip>,
    )
    fireEvent.focus(screen.getByText('Info'))
    expect(screen.getByRole('tooltip')).toHaveClass('is-visible')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('tooltip')).not.toHaveClass('is-visible')
  })

  it('wrapper has aria-describedby pointing to tooltip', () => {
    render(
      <Tooltip text="Help text">
        <span>Info</span>
      </Tooltip>,
    )
    const tooltip = screen.getByRole('tooltip')
    const wrapper = screen.getByText('Info').parentElement
    expect(wrapper).toHaveAttribute('aria-describedby', tooltip.id)
  })

  it('wrapper is focusable (tabIndex=0)', () => {
    render(
      <Tooltip text="Help text">
        <span>Info</span>
      </Tooltip>,
    )
    const wrapper = screen.getByText('Info').parentElement
    expect(wrapper).toHaveAttribute('tabindex', '0')
  })
})
