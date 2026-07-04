import { describe, it, expect, beforeEach } from 'vitest'
import { useThemeStore } from '@/stores/theme-store'

describe('theme-store', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear()
    }
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

  it('persists to localStorage', () => {
    useThemeStore.getState().setTheme('dark')
    if (typeof localStorage !== 'undefined') {
      expect(localStorage.getItem('theme')).toBe('dark')
    }
  })

  it('sets data-theme attribute on document', () => {
    useThemeStore.getState().setTheme('dark')
    if (typeof document !== 'undefined') {
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    }
  })
})
