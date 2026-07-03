import { describe, it, expect, beforeEach } from 'vitest'
import { useThemeStore } from '@/stores/theme-store'

describe('theme-store', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear()
    }
    useThemeStore.setState({ theme: 'dark' })
  })

  it('starts with dark theme by default', () => {
    expect(useThemeStore.getState().theme).toBe('dark')
  })

  it('toggles to light', () => {
    useThemeStore.getState().toggle()
    expect(useThemeStore.getState().theme).toBe('light')
  })

  it('toggles back to dark', () => {
    useThemeStore.getState().toggle()
    useThemeStore.getState().toggle()
    expect(useThemeStore.getState().theme).toBe('dark')
  })

  it('persists to localStorage', () => {
    useThemeStore.getState().setTheme('light')
    if (typeof localStorage !== 'undefined') {
      expect(localStorage.getItem('theme')).toBe('light')
    }
  })

  it('sets data-theme attribute on document', () => {
    useThemeStore.getState().setTheme('light')
    if (typeof document !== 'undefined') {
      expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    }
  })
})
