import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Tabs, TabList, Tab, TabPanel } from '@/components/ui/Tabs'

describe('Tabs', () => {
  it('renders all tab buttons', () => {
    render(
      <Tabs defaultTab="a">
        <TabList>
          <Tab id="a" label="Tab A" />
          <Tab id="b" label="Tab B" />
        </TabList>
      </Tabs>,
    )
    expect(screen.getByText('Tab A')).toBeInTheDocument()
    expect(screen.getByText('Tab B')).toBeInTheDocument()
  })

  it('shows active tab panel by default', () => {
    render(
      <Tabs defaultTab="a">
        <TabList>
          <Tab id="a" label="A" />
          <Tab id="b" label="B" />
        </TabList>
        <TabPanel id="a">Content A</TabPanel>
        <TabPanel id="b">Content B</TabPanel>
      </Tabs>,
    )
    expect(screen.getByText('Content A')).toBeVisible()
    expect(screen.getByText('Content B')).not.toBeVisible()
  })

  it('switches panel on tab click', () => {
    render(
      <Tabs defaultTab="a">
        <TabList>
          <Tab id="a" label="A" />
          <Tab id="b" label="B" />
        </TabList>
        <TabPanel id="a">Content A</TabPanel>
        <TabPanel id="b">Content B</TabPanel>
      </Tabs>,
    )
    fireEvent.click(screen.getByText('B'))
    expect(screen.getByText('Content A')).not.toBeVisible()
    expect(screen.getByText('Content B')).toBeVisible()
  })

  it('sets aria-selected on active tab', () => {
    render(
      <Tabs defaultTab="a">
        <TabList>
          <Tab id="a" label="A" />
          <Tab id="b" label="B" />
        </TabList>
      </Tabs>,
    )
    expect(screen.getByText('A')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('B')).toHaveAttribute('aria-selected', 'false')
  })

  it('uses roving tabindex (active=0, others=-1)', () => {
    render(
      <Tabs defaultTab="a">
        <TabList>
          <Tab id="a" label="A" />
          <Tab id="b" label="B" />
        </TabList>
      </Tabs>,
    )
    expect(screen.getByText('A')).toHaveAttribute('tabindex', '0')
    expect(screen.getByText('B')).toHaveAttribute('tabindex', '-1')
  })

  it('wires aria-controls and aria-labelledby bidirectionally', () => {
    render(
      <Tabs defaultTab="a">
        <TabList>
          <Tab id="a" label="A" />
          <Tab id="b" label="B" />
        </TabList>
        <TabPanel id="a">Content A</TabPanel>
        <TabPanel id="b">Content B</TabPanel>
      </Tabs>,
    )
    const tabA = screen.getByText('A')
    const panelA = screen.getByRole('tabpanel', { name: 'A' })
    expect(tabA).toHaveAttribute('aria-controls', 'panel-a')
    expect(panelA).toHaveAttribute('aria-labelledby', 'tab-a')
  })

  it('moves focus with ArrowRight and wraps', () => {
    render(
      <Tabs defaultTab="a">
        <TabList>
          <Tab id="a" label="A" />
          <Tab id="b" label="B" />
        </TabList>
      </Tabs>,
    )
    const tabA = screen.getByText('A')
    const tabB = screen.getByText('B')
    tabA.focus()
    fireEvent.keyDown(tabA, { key: 'ArrowRight' })
    expect(screen.getByText('B')).toHaveAttribute('tabindex', '0')
    expect(screen.getByText('A')).toHaveAttribute('tabindex', '-1')
    expect(tabB).toHaveFocus()
  })

  it('moves to first tab with Home and last with End', () => {
    render(
      <Tabs defaultTab="b">
        <TabList>
          <Tab id="a" label="A" />
          <Tab id="b" label="B" />
        </TabList>
      </Tabs>,
    )
    const tabB = screen.getByText('B')
    tabB.focus()
    fireEvent.keyDown(tabB, { key: 'Home' })
    expect(screen.getByText('A')).toHaveFocus()
    fireEvent.keyDown(screen.getByText('A'), { key: 'End' })
    expect(screen.getByText('B')).toHaveFocus()
  })
})
