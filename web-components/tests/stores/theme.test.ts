import { describe, it, expect, beforeEach } from 'vitest'
import {
  useThemeStore,
  createThemeStore,
  configureThemeStorageKey,
} from '../../src/stores/theme'

describe('theme store', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear()
    }
    configureThemeStorageKey('wc-theme')
    useThemeStore.setState({ theme: 'light' })
  })

  it('starts with light theme by default', () => {
    expect(useThemeStore.getState().theme).toBe('light')
  })

  it('toggles to dark', () => {
    useThemeStore.getState().toggle()
    expect(useThemeStore.getState().theme).toBe('dark')
  })

  it('toggles back to light', () => {
    useThemeStore.getState().toggle()
    useThemeStore.getState().toggle()
    expect(useThemeStore.getState().theme).toBe('light')
  })

  it('persists to localStorage under the default key', () => {
    useThemeStore.getState().setTheme('dark')
    if (typeof localStorage !== 'undefined') {
      expect(localStorage.getItem('wc-theme')).toBe('dark')
    }
  })

  it('sets data-theme attribute on document', () => {
    useThemeStore.getState().setTheme('dark')
    if (typeof document !== 'undefined') {
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    }
  })

  it('persists under a custom storage key via createThemeStore', () => {
    const store = createThemeStore('custom-theme-key')
    store.getState().setTheme('dark')
    if (typeof localStorage !== 'undefined') {
      expect(localStorage.getItem('custom-theme-key')).toBe('dark')
    }
    expect(store.getState().theme).toBe('dark')
  })

  it('memoizes stores per storage key', () => {
    expect(createThemeStore('memo-key')).toBe(createThemeStore('memo-key'))
    expect(createThemeStore('memo-key-a')).not.toBe(createThemeStore('memo-key-b'))
  })

  it('honours configureThemeStorageKey for the shared hook', () => {
    configureThemeStorageKey('app-theme')
    useThemeStore.getState().setTheme('dark')
    if (typeof localStorage !== 'undefined') {
      expect(localStorage.getItem('app-theme')).toBe('dark')
    }
    configureThemeStorageKey('wc-theme')
  })
})
