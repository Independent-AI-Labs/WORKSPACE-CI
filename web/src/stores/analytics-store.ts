'use client'

import { create } from 'zustand'
import type {
  AnalyticsEvent,
  AnalyticsState,
  FeedbackEvent,
} from '@/types/analytics'

const STORAGE_KEY = 'workspace-ci-wiki-analytics'
const SESSION_STORAGE_KEY = 'workspace-ci-wiki-session'
const MAX_EVENTS = 2000
const IDLE_TIMEOUT_MS = 30 * 60 * 1000

function generateSessionId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `session-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

interface SessionData {
  sessionId: string
  lastActivityAt: number
}

function loadSession(): SessionData | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as SessionData
  } catch (e) {
    console.error('Failed to parse session from sessionStorage:', e)
    return null
  }
}

function saveSession(data: SessionData): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data))
  } catch (e) {
    console.error('Failed to save session to sessionStorage:', e)
  }
}

function loadFromStorage(): Partial<AnalyticsState> | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch (e) {
    console.error('Failed to parse analytics from localStorage:', e)
    return null
  }
}

let pendingSaveTimer: ReturnType<typeof setTimeout> | null = null

function scheduleSave(): void {
  if (typeof window === 'undefined') return
  if (pendingSaveTimer !== null) {
    clearTimeout(pendingSaveTimer)
  }
  const save = () => {
    pendingSaveTimer = null
    const state = useAnalyticsStore.getState()
    if (typeof localStorage === 'undefined') return
    try {
      const toSave = {
        events: state.events,
        pageViews: state.pageViews,
        dwellTimes: state.dwellTimes,
        feedback: state.feedback,
        searchQueries: state.searchQueries,
        totalViews: state.totalViews,
        totalFeedback: state.totalFeedback,
        totalSearches: state.totalSearches,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
    } catch (e) {
      console.error('Failed to save analytics to localStorage:', e)
    }
  }
  if (typeof window.requestIdleCallback === 'function') {
    pendingSaveTimer = setTimeout(() => {
      window.requestIdleCallback(save, { timeout: 1000 })
    }, 0)
  } else {
    pendingSaveTimer = setTimeout(save, 200)
  }
}

function flushSave(): void {
  if (pendingSaveTimer !== null) {
    clearTimeout(pendingSaveTimer)
    pendingSaveTimer = null
  }
  if (typeof localStorage === 'undefined') return
  const state = useAnalyticsStore.getState()
  try {
    const toSave = {
      events: state.events,
      pageViews: state.pageViews,
      dwellTimes: state.dwellTimes,
      feedback: state.feedback,
      searchQueries: state.searchQueries,
      totalViews: state.totalViews,
      totalFeedback: state.totalFeedback,
      totalSearches: state.totalSearches,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
  } catch (e) {
    console.error('Failed to flush analytics to localStorage:', e)
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushSave)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushSave()
    }
  })
}

interface InternalState extends AnalyticsState {
  _topPagesDirty: boolean
  _topPagesCache: { path: string; views: number }[]
  lastActivityAt: number
  hydrate: () => void
}

export const useAnalyticsStore = create<InternalState>((set, get) => ({
  events: [],
  pageViews: {},
  dwellTimes: {},
  feedback: {},
  searchQueries: [],
  totalViews: 0,
  totalFeedback: 0,
  totalSearches: 0,
  sessionId: '',
  lastActivityAt: 0,

  _topPagesDirty: true,
  _topPagesCache: [],

  hydrate: () => {
    const now = Date.now()
    const session = loadSession()
    let sessionId: string
    let lastActivityAt: number

    if (session && now - session.lastActivityAt < IDLE_TIMEOUT_MS) {
      sessionId = session.sessionId
      lastActivityAt = session.lastActivityAt
    } else {
      sessionId = generateSessionId()
      lastActivityAt = now
      saveSession({ sessionId, lastActivityAt })
    }

    const saved = loadFromStorage()
    if (saved) {
      set({
        events: saved.events ?? [],
        pageViews: saved.pageViews ?? {},
        dwellTimes: saved.dwellTimes ?? {},
        feedback: saved.feedback ?? {},
        searchQueries: saved.searchQueries ?? [],
        totalViews: saved.totalViews ?? 0,
        totalFeedback: saved.totalFeedback ?? 0,
        totalSearches: saved.totalSearches ?? 0,
        sessionId,
        lastActivityAt,
        _topPagesDirty: true,
      })
    } else {
      set({ sessionId, lastActivityAt, _topPagesDirty: true })
    }
  },

  track: (event: AnalyticsEvent) => {
    const now = Date.now()
    const state = get()
    let sessionId = state.sessionId

    if (now - state.lastActivityAt > IDLE_TIMEOUT_MS) {
      sessionId = generateSessionId()
    }
    saveSession({ sessionId, lastActivityAt: now })

    const eventWithSession = { ...event, sessionId }

    set((state) => {
      const events = [...state.events, eventWithSession].slice(-MAX_EVENTS)

      let pageViews = state.pageViews
      let dwellTimes = state.dwellTimes
      let totalViews = state.totalViews
      let searchQueries = state.searchQueries
      let totalSearches = state.totalSearches

      if (eventWithSession.type === 'page_view') {
        pageViews = { ...pageViews, [eventWithSession.path]: (pageViews[eventWithSession.path] ?? 0) + 1 }
        totalViews = totalViews + 1
      }

      if (eventWithSession.type === 'page_exit') {
        dwellTimes = {
          ...dwellTimes,
          [eventWithSession.path]: Math.max(
            dwellTimes[eventWithSession.path] ?? 0,
            eventWithSession.dwellMs,
          ),
        }
      }

      if (eventWithSession.type === 'search') {
        totalSearches = totalSearches + 1
        const existing = searchQueries.find((q) => q.query === eventWithSession.query)
        if (existing) {
          searchQueries = searchQueries.map((q) =>
            q.query === eventWithSession.query ? { ...q, count: q.count + 1 } : q,
          )
        } else {
          searchQueries = [...searchQueries, { query: eventWithSession.query, count: 1 }]
        }
      }

      const nextState: Partial<InternalState> = {
        events,
        pageViews,
        dwellTimes,
        totalViews,
        searchQueries,
        totalSearches,
        sessionId,
        lastActivityAt: now,
        _topPagesDirty: true,
      }

      return nextState
    })

    scheduleSave()
  },

  addFeedback: (event: FeedbackEvent) => {
    const now = Date.now()
    const state = get()
    let sessionId = state.sessionId

    if (now - state.lastActivityAt > IDLE_TIMEOUT_MS) {
      sessionId = generateSessionId()
    }
    saveSession({ sessionId, lastActivityAt: now })

    const eventWithSession = { ...event, sessionId }

    set((state) => {
      const existing = state.feedback[eventWithSession.targetId] ?? []
      const filtered = existing.filter((f) => f.vote !== eventWithSession.vote)
      return {
        feedback: {
          ...state.feedback,
          [eventWithSession.targetId]: [...filtered, eventWithSession],
        },
        totalFeedback: state.totalFeedback + 1,
        events: [...state.events, eventWithSession].slice(-MAX_EVENTS),
        sessionId,
        lastActivityAt: now,
      }
    })

    scheduleSave()
  },

  getPageViews: (path: string) => {
    return get().pageViews[path] ?? 0
  },

  getDwellTime: (path: string) => {
    return get().dwellTimes[path] ?? 0
  },

  getTopPages: (limit: number) => {
    const state = get()
    if (state._topPagesDirty) {
      const sorted = Object.entries(state.pageViews)
        .map(([path, views]) => ({ path, views }))
        .sort((a, b) => b.views - a.views)
      set({ _topPagesCache: sorted, _topPagesDirty: false })
      return sorted.slice(0, limit)
    }
    return state._topPagesCache.slice(0, limit)
  },

  getUserVote: (targetId: string) => {
    const state = get()
    const feedbacks = state.feedback[targetId]
    if (!feedbacks || feedbacks.length === 0) return null
    return feedbacks[feedbacks.length - 1].vote
  },
}))
