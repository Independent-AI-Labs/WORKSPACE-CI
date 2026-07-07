import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PillFilter } from '@/components/wiki/PillFilter'

const categories = [
  { id: 'Alpha', label: 'Alpha' },
  { id: 'Beta', label: 'Beta' },
]

const categoryCounts = { Alpha: 2, Beta: 1 }

function makeHandlers() {
  return {
    toggleCategory: vi.fn(),
    selectAll: vi.fn(),
    deselectAll: vi.fn(),
  }
}

describe('PillFilter', () => {
  it('renders all category pills with counts', () => {
    const h = makeHandlers()
    render(
      <PillFilter
        categories={categories}
        activeCategories={new Set(['Alpha', 'Beta'])}
        toggleCategory={h.toggleCategory}
        selectAll={h.selectAll}
        deselectAll={h.deselectAll}
        categoryCounts={categoryCounts}
      />,
    )
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('calls toggleCategory when a pill is clicked', () => {
    const h = makeHandlers()
    render(
      <PillFilter
        categories={categories}
        activeCategories={new Set(['Alpha', 'Beta'])}
        toggleCategory={h.toggleCategory}
        selectAll={h.selectAll}
        deselectAll={h.deselectAll}
        categoryCounts={categoryCounts}
      />,
    )
    fireEvent.click(screen.getByText('Alpha'))
    expect(h.toggleCategory).toHaveBeenCalledWith('Alpha')
  })

  it('renders Select all and Deselect all buttons', () => {
    const h = makeHandlers()
    render(
      <PillFilter
        categories={categories}
        activeCategories={new Set(['Alpha', 'Beta'])}
        toggleCategory={h.toggleCategory}
        selectAll={h.selectAll}
        deselectAll={h.deselectAll}
        categoryCounts={categoryCounts}
      />,
    )
    expect(screen.getByText('Select all')).toBeInTheDocument()
    expect(screen.getByText('Deselect all')).toBeInTheDocument()
  })

  it('calls selectAll and deselectAll handlers', () => {
    const h = makeHandlers()
    render(
      <PillFilter
        categories={categories}
        activeCategories={new Set(['Alpha', 'Beta'])}
        toggleCategory={h.toggleCategory}
        selectAll={h.selectAll}
        deselectAll={h.deselectAll}
        categoryCounts={categoryCounts}
      />,
    )
    fireEvent.click(screen.getByText('Select all'))
    expect(h.selectAll).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByText('Deselect all'))
    expect(h.deselectAll).toHaveBeenCalledTimes(1)
  })
})
