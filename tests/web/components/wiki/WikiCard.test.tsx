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
  it('renders title as a link when href is provided', () => {
    const { container } = render(<WikiCard item={makeItem({ href: '/test' })} />)
    const article = container.querySelector('article.wiki-card')
    expect(article).not.toBeNull()
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/test')
    expect(link).toHaveClass('wiki-card__title-link')
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

  it('renders description paragraphs separated by blank lines', () => {
    const { container } = render(
      <WikiCard
        item={makeItem({
          description: 'First paragraph sentence.\n\nSecond paragraph sentence.',
        })}
      />,
    )
    const description = container.querySelector('.wiki-card__description')
    expect(description).not.toBeNull()
    const paragraphs = description?.querySelectorAll('p')
    expect(paragraphs).toHaveLength(2)
    expect(paragraphs?.[0]?.textContent).toBe('First paragraph sentence.')
    expect(paragraphs?.[1]?.textContent).toBe('Second paragraph sentence.')
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

  it('does not render footer CTA link for href-only cards', () => {
    const { container } = render(<WikiCard item={makeItem({ href: '/detail' })} />)
    expect(container.querySelector('.wiki-card__cta')).toBeNull()
  })

  it('renders viewDetails in footer when provided', () => {
    const { container } = render(
      <WikiCard
        item={makeItem({ href: '/detail' })}
        viewDetails={<button className="wiki-card__cta">Makefile</button>}
      />,
    )
    const cta = container.querySelector('.wiki-card__cta')
    expect(cta).not.toBeNull()
    expect(cta?.textContent).toBe('Makefile')
  })

  it('renders external GitHub link when repoUrl is set', () => {
    const { container } = render(
      <WikiCard item={makeItem({ href: '/detail', repoUrl: 'https://github.com/Org/Repo' })} />,
    )
    const externalLink = container.querySelector('.wiki-card__external-link') as HTMLAnchorElement
    expect(externalLink).not.toBeNull()
    expect(externalLink.getAttribute('href')).toBe('https://github.com/Org/Repo')
    expect(externalLink.getAttribute('target')).toBe('_blank')
    expect(externalLink.getAttribute('rel')).toBe('noopener noreferrer')
    expect(externalLink.querySelector('i')).toHaveClass('ri-external-link-line')
    expect(externalLink.textContent).toContain('GitHub')
  })

  it('does not render external link when repoUrl is absent', () => {
    const { container } = render(<WikiCard item={makeItem({ href: '/detail' })} />)
    expect(container.querySelector('.wiki-card__external-link')).toBeNull()
  })

  it('renders icon when provided', () => {
    const { container } = render(
      <WikiCard item={makeItem({ icon: 'ri-settings-3-line' })} />,
    )
    const icon = container.querySelector('.wiki-card__header i')
    expect(icon).not.toBeNull()
    expect(icon).toHaveClass('ri-settings-3-line')
  })

  it('renders theme logo when logoPath is provided instead of icon', () => {
    const { container } = render(
      <WikiCard item={makeItem({ icon: 'ri-settings-3-line', logoPath: '/LOGO.png' })} />,
    )
    const logo = container.querySelector('.wiki-card__logo') as HTMLElement
    expect(logo).not.toBeNull()
    expect(logo.tagName).toBe('SPAN')
    expect(logo.getAttribute('aria-hidden')).toBe('true')
    expect(logo.style.backgroundColor).toBe('var(--accent)')
    expect(logo.style.cssText).toContain('/LOGO.png')
    expect(container.querySelector('.wiki-card__header i')).toBeNull()
  })

  it('renders icon when logoPath is not provided', () => {
    const { container } = render(
      <WikiCard item={makeItem({ icon: 'ri-settings-3-line' })} />,
    )
    expect(container.querySelector('.wiki-card__logo')).toBeNull()
    expect(container.querySelector('.wiki-card__header i')).not.toBeNull()
  })
})
