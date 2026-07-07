import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WikiSearch } from '@/components/wiki/WikiSearch'
import type { SearchIndexEntry } from '@/types/wiki'

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, prefetch: vi.fn() }),
}))

const data: SearchIndexEntry[] = [
  { id: '1', title: 'test pattern', section: 'Patterns', content: 'test content', href: '/patterns', type: 'pattern', keywords: ['test'] },
  { id: '2', title: 'check hook', section: 'Hooks', content: 'hook content', href: '/hooks', type: 'hook', keywords: ['hook'] },
]

describe('WikiSearch', () => {
  beforeEach(() => {
    mockPush.mockClear()
  })

  it('renders trigger button', () => {
    render(<WikiSearch searchData={data} />)
    expect(screen.getByRole('button', { name: 'Search wiki' })).toBeInTheDocument()
  })

  it('opens modal on trigger click', () => {
    render(<WikiSearch searchData={data} />)
    fireEvent.click(screen.getByRole('button', { name: 'Search wiki' }))
    expect(screen.getByRole('combobox')).toBeInTheDocument()
    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })

  it('input has aria-controls pointing to listbox', () => {
    render(<WikiSearch searchData={data} />)
    fireEvent.click(screen.getByRole('button', { name: 'Search wiki' }))
    const input = screen.getByRole('combobox')
    const listboxId = input.getAttribute('aria-controls')
    expect(listboxId).toBeTruthy()
    const listbox = screen.getByRole('listbox')
    expect(listbox.id).toBe(listboxId)
  })

  it('shows results when typing', () => {
    render(<WikiSearch searchData={data} />)
    fireEvent.click(screen.getByRole('button', { name: 'Search wiki' }))
    const input = screen.getByRole('combobox') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'test' } })
    expect(screen.getAllByRole('option').length).toBeGreaterThan(0)
  })

  it('first option is aria-selected on search', () => {
    render(<WikiSearch searchData={data} />)
    fireEvent.click(screen.getByRole('button', { name: 'Search wiki' }))
    const input = screen.getByRole('combobox') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'test' } })
    const options = screen.getAllByRole('option')
    expect(options[0]).toHaveAttribute('aria-selected', 'true')
  })

  it('input aria-activedescendant points to selected option', () => {
    render(<WikiSearch searchData={data} />)
    fireEvent.click(screen.getByRole('button', { name: 'Search wiki' }))
    const input = screen.getByRole('combobox') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'test' } })
    const options = screen.getAllByRole('option')
    const activeId = input.getAttribute('aria-activedescendant')
    expect(activeId).toBe(options[0].id)
  })

  it('ArrowDown moves selection and updates aria-activedescendant', () => {
    render(<WikiSearch searchData={data} />)
    fireEvent.click(screen.getByRole('button', { name: 'Search wiki' }))
    const input = screen.getByRole('combobox') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'content' } })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    const options = screen.getAllByRole('option')
    expect(options.length).toBeGreaterThan(1)
    expect(options[1]).toHaveAttribute('aria-selected', 'true')
    const activeId = input.getAttribute('aria-activedescendant')
    expect(activeId).toBe(options[1].id)
  })

  it('click on result navigates and closes', () => {
    render(<WikiSearch searchData={data} />)
    fireEvent.click(screen.getByRole('button', { name: 'Search wiki' }))
    const input = screen.getByRole('combobox') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'test' } })
    const links = screen.getAllByRole('option')
    fireEvent.click(links[0].querySelector('a')!)
    expect(mockPush).toHaveBeenCalledWith('/patterns')
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('Enter on selected result navigates', () => {
    render(<WikiSearch searchData={data} />)
    fireEvent.click(screen.getByRole('button', { name: 'Search wiki' }))
    const input = screen.getByRole('combobox') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'test' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mockPush).toHaveBeenCalledWith('/patterns')
  })

  it('Escape closes the modal', () => {
    render(<WikiSearch searchData={data} />)
    fireEvent.click(screen.getByRole('button', { name: 'Search wiki' }))
    const input = screen.getByRole('combobox') as HTMLInputElement
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('close button closes the modal', () => {
    render(<WikiSearch searchData={data} />)
    fireEvent.click(screen.getByRole('button', { name: 'Search wiki' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close search' }))
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('shows empty state when no results', () => {
    render(<WikiSearch searchData={data} />)
    fireEvent.click(screen.getByRole('button', { name: 'Search wiki' }))
    const input = screen.getByRole('combobox') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'zzzznotfound' } })
    expect(screen.getByText('No results found')).toBeInTheDocument()
  })
})
