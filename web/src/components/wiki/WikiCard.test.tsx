import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WikiCard } from '@/components/wiki/WikiCard'
import type { CardItem } from '@/types/card'

function makeItem(overrides: Partial<CardItem> = {}): CardItem {
  return {
    id: 'test-item',
    title: 'Test Item',
    description: 'A test description.',
    ...overrides,
  }
}

describe('WikiCard', () => {
  it('renders as a link when href is provided', () => {
    render(<WikiCard item={makeItem({ href: '/test' })} />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/test')
    expect(link).toHaveClass('wiki-card')
  })

  it('renders as an article when no href', () => {
    const { container } = render(<WikiCard item={makeItem()} />)
    const article = container.querySelector('article')
    expect(article).not.toBeNull()
    expect(article).toHaveClass('wiki-card')
    expect(article).toHaveAttribute('id', 'test-item')
  })

  it('renders title in code when monoTitle is true', () => {
    const { container } = render(
      <WikiCard item={makeItem({ monoTitle: true, title: 'my_func' })} />,
    )
    const code = container.querySelector('code.wiki-card__title')
    expect(code).not.toBeNull()
    expect(code?.textContent).toBe('my_func')
  })

  it('renders title in span when monoTitle is false', () => {
    const { container } = render(
      <WikiCard item={makeItem({ monoTitle: false, title: 'My Card' })} />,
    )
    const span = container.querySelector('span.wiki-card__title')
    expect(span).not.toBeNull()
    expect(span?.textContent).toBe('My Card')
  })

  it('renders subtitle when provided', () => {
    render(<WikiCard item={makeItem({ subtitle: 'A subtitle' })} />)
    expect(screen.getByText('A subtitle')).toBeInTheDocument()
  })

  it('renders tags with correct badge classes', () => {
    const { container } = render(
      <WikiCard
        item={makeItem({
          tags: [
            { label: 'Python', variant: 'accent' },
            { label: '.py', variant: 'muted' },
          ],
        })}
      />,
    )
    const tags = container.querySelectorAll('.wiki-card__tag')
    expect(tags).toHaveLength(2)
    expect(tags[0]).toHaveClass('badge--blue')
    expect(tags[1]).toHaveClass('badge--gray')
  })

  it('renders meta items as dl/dt/dd', () => {
    const { container } = render(
      <WikiCard
        item={makeItem({
          meta: [
            { label: 'Fields', value: '12' },
            { label: 'Scope', value: 'Filename match' },
          ],
        })}
      />,
    )
    const dl = container.querySelector('dl.wiki-card__meta')
    expect(dl).not.toBeNull()
    const items = container.querySelectorAll('.wiki-card__meta-item')
    expect(items).toHaveLength(2)
    expect(screen.getByText('Fields')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
  })

  it('renders children inside wiki-card__children', () => {
    const { container } = render(
      <WikiCard item={makeItem()}>
        <div data-testid="child">Child content</div>
      </WikiCard>,
    )
    const childWrapper = container.querySelector('.wiki-card__children')
    expect(childWrapper).not.toBeNull()
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })

  it('renders View details CTA for linked cards', () => {
    render(<WikiCard item={makeItem({ href: '/detail' })} />)
    expect(screen.getByText('View details')).toBeInTheDocument()
  })

  it('does not render CTA for non-linked cards', () => {
    const { container } = render(<WikiCard item={makeItem()} />)
    expect(container.querySelector('.wiki-card__cta')).toBeNull()
  })

  it('renders icon when provided', () => {
    const { container } = render(
      <WikiCard item={makeItem({ icon: 'ri-settings-3-line' })} />,
    )
    const icon = container.querySelector('.wiki-card__header i')
    expect(icon).not.toBeNull()
    expect(icon).toHaveClass('ri-settings-3-line')
  })
})
