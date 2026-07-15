import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CardListSection } from '@/components/wiki/CardListSection'
import type { CardItem } from '@/types/card'
import type { ReactNode } from 'react'

const items: CardItem[] = [
  { id: 'a', title: 'Item A', description: 'Desc A', category: 'Alpha' },
  { id: 'b', title: 'Item B', description: 'Desc B', category: 'Beta' },
  { id: 'c', title: 'Item C', description: 'Desc C', category: 'Alpha' },
]

const categories = [
  { id: 'Alpha', label: 'Alpha' },
  { id: 'Beta', label: 'Beta' },
]

const cardContent: Record<string, ReactNode> = {
  a: <div data-testid="content-a">A content</div>,
  b: <div data-testid="content-b">B content</div>,
  c: <div data-testid="content-c">C content</div>,
}

describe('CardListSection', () => {
  it('renders count, pills, and all items initially', () => {
    render(
      <CardListSection
        items={items}
        categories={categories}
        itemLabel="items"
        cardContent={cardContent}
      />,
    )
    const count = screen.getByText('3 of 3 items')
    expect(count).toBeInTheDocument()
    expect(count).toHaveClass('list-section__count')
    expect(screen.getByText('Item A')).toBeInTheDocument()
    expect(screen.getByText('Item B')).toBeInTheDocument()
    expect(screen.getByText('Item C')).toBeInTheDocument()
  })

  it('filters items when a category pill is toggled off', () => {
    render(
      <CardListSection
        items={items}
        categories={categories}
        itemLabel="items"
        cardContent={cardContent}
      />,
    )
    fireEvent.click(screen.getByText('Alpha'))
    expect(screen.getByText('1 of 3 items')).toBeInTheDocument()
    expect(screen.queryByText('Item A')).not.toBeInTheDocument()
    expect(screen.queryByText('Item C')).not.toBeInTheDocument()
    expect(screen.getByText('Item B')).toBeInTheDocument()
  })

  it('shows empty message when no items exist', () => {
    render(
      <CardListSection
        items={[]}
        categories={categories}
        itemLabel="items"
        cardContent={{}}
        emptyMessage="Nothing here."
      />,
    )
    expect(screen.getByText('Nothing here.')).toBeInTheDocument()
    expect(screen.queryByText('Select all')).not.toBeInTheDocument()
  })

  it('renders card content for each visible item', () => {
    render(
      <CardListSection
        items={items}
        categories={categories}
        itemLabel="items"
        cardContent={cardContent}
      />,
    )
    expect(screen.getByTestId('content-a')).toBeInTheDocument()
    expect(screen.getByTestId('content-b')).toBeInTheDocument()
    expect(screen.getByTestId('content-c')).toBeInTheDocument()
  })
})
