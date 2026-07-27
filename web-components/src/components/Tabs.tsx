'use client'

import {
  createContext,
  useContext,
  useState,
  useMemo,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import clsx from 'clsx'

interface TabsContextValue {
  activeTab: string
  setActiveTab: (id: string) => void
}

const TabsContext = createContext<TabsContextValue | null>(null)

function useTabsContext(): TabsContextValue {
  const ctx = useContext(TabsContext)
  if (!ctx) {
    throw new Error('Tab components must be used within a Tabs provider')
  }
  return ctx
}

interface TabsProps {
  children: ReactNode
  defaultTab: string
}

export function Tabs({ children, defaultTab }: TabsProps) {
  const [activeTab, setActiveTab] = useState(defaultTab)
  const value = useMemo(() => ({ activeTab, setActiveTab }), [activeTab])
  return (
    <TabsContext.Provider value={value}>
      <div className="tabs">{children}</div>
    </TabsContext.Provider>
  )
}

interface TabListProps {
  children: ReactNode
  ariaLabel?: string
  orientation?: 'horizontal' | 'vertical'
}

export function TabList({
  children,
  ariaLabel,
  orientation = 'horizontal',
}: TabListProps) {
  const { activeTab, setActiveTab } = useTabsContext()

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const tabs = Array.from(
      e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    )
    if (tabs.length === 0) return
    const currentIndex = tabs.findIndex((t) => t.dataset.tabId === activeTab)
    if (currentIndex === -1) return

    let nextIndex: number | null = null
    const isHorizontal = orientation === 'horizontal'

    if (isHorizontal) {
      if (e.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length
      else if (e.key === 'ArrowLeft')
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length
    } else {
      if (e.key === 'ArrowDown') nextIndex = (currentIndex + 1) % tabs.length
      else if (e.key === 'ArrowUp')
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length
    }

    if (e.key === 'Home') nextIndex = 0
    else if (e.key === 'End') nextIndex = tabs.length - 1

    if (nextIndex !== null) {
      e.preventDefault()
      const nextTab = tabs[nextIndex]
      const nextId = nextTab.dataset.tabId
      if (nextId) {
        setActiveTab(nextId)
        nextTab.focus()
      }
    }
  }

  return (
    <div
      className="tabs__list"
      role="tablist"
      aria-label={ariaLabel}
      aria-orientation={orientation}
      onKeyDown={handleKeyDown}
    >
      {children}
    </div>
  )
}

interface TabProps {
  id: string
  label: string
}

export function Tab({ id, label }: TabProps) {
  const { activeTab, setActiveTab } = useTabsContext()
  const isActive = activeTab === id
  return (
    <button
      id={`tab-${id}`}
      role="tab"
      aria-selected={isActive}
      aria-controls={`panel-${id}`}
      tabIndex={isActive ? 0 : -1}
      data-tab-id={id}
      className={clsx('tab', isActive && 'is-active')}
      onClick={() => setActiveTab(id)}
    >
      {label}
    </button>
  )
}

interface TabPanelProps {
  id: string
  children: ReactNode
}

export function TabPanel({ id, children }: TabPanelProps) {
  const { activeTab } = useTabsContext()
  const isActive = activeTab === id
  return (
    <div
      id={`panel-${id}`}
      role="tabpanel"
      aria-labelledby={`tab-${id}`}
      tabIndex={0}
      className="tabs__panel"
      hidden={!isActive}
    >
      {children}
    </div>
  )
}
