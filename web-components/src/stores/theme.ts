'use client'

import { create, type StoreApi, type UseBoundStore } from 'zustand'

export type Theme = 'dark' | 'light'

const DEFAULT_STORAGE_KEY = 'wc-theme'

let defaultStorageKey = DEFAULT_STORAGE_KEY

export function configureThemeStorageKey(storageKey: string): void {
  defaultStorageKey = storageKey
}

function applyTheme(storageKey: string, theme: Theme): void {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme)
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(storageKey, theme)
  }
}

function getSystemTheme(): Theme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export interface ThemeStore {
  theme: Theme
  toggle: () => void
  setTheme: (theme: Theme) => void
  hydrate: () => void
}

type BoundThemeStore = UseBoundStore<StoreApi<ThemeStore>>

function buildStore(storageKey: string): BoundThemeStore {
  return create<ThemeStore>((set, get) => ({
    theme: 'light',
    toggle: () => {
      const next = get().theme === 'dark' ? 'light' : 'dark'
      applyTheme(storageKey, next)
      set({ theme: next })
    },
    setTheme: (theme: Theme) => {
      applyTheme(storageKey, theme)
      set({ theme })
    },
    hydrate: () => {
      if (typeof document !== 'undefined') {
        const attr = document.documentElement.getAttribute('data-theme')
        if (attr === 'light' || attr === 'dark') {
          set({ theme: attr })
        } else if (typeof localStorage !== 'undefined') {
          const saved = localStorage.getItem(storageKey)
          if (saved === 'light' || saved === 'dark') {
            applyTheme(storageKey, saved)
            set({ theme: saved })
          } else {
            const system = getSystemTheme()
            applyTheme(storageKey, system)
            set({ theme: system })
          }
        }
      }

      if (typeof window !== 'undefined' && window.matchMedia) {
        const mql = window.matchMedia('(prefers-color-scheme: dark)')
        mql.addEventListener('change', (e) => {
          const saved =
            typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey) : null
          if (saved !== 'light' && saved !== 'dark') {
            const system: Theme = e.matches ? 'dark' : 'light'
            applyTheme(storageKey, system)
            set({ theme: system })
          }
        })
      }
    },
  }))
}

const storeCache = new Map<string, BoundThemeStore>()

export function createThemeStore(
  storageKey: string = defaultStorageKey,
): BoundThemeStore {
  let store = storeCache.get(storageKey)
  if (!store) {
    store = buildStore(storageKey)
    storeCache.set(storageKey, store)
  }
  return store
}

interface UseThemeStore {
  (): ThemeStore
  <T>(selector: (state: ThemeStore) => T): T
  getState: () => ThemeStore
  setState: (partial: Partial<ThemeStore>) => void
  subscribe: (
    listener: (state: ThemeStore, prevState: ThemeStore) => void,
  ) => () => void
}

export const useThemeStore: UseThemeStore = Object.assign(
  function useThemeStore<T>(selector?: (state: ThemeStore) => T) {
    const store = createThemeStore(defaultStorageKey)
    return selector ? store(selector) : store()
  } as UseThemeStore,
  {
    getState: () => createThemeStore(defaultStorageKey).getState(),
    setState: (partial: Partial<ThemeStore>) =>
      createThemeStore(defaultStorageKey).setState(partial),
    subscribe: (listener: (state: ThemeStore, prevState: ThemeStore) => void) =>
      createThemeStore(defaultStorageKey).subscribe(listener),
  },
)
