export interface PageViewEvent {
  type: 'page_view'
  path: string
  title: string
  timestamp: number
  referrer: string
  sessionId: string
}

export interface PageExitEvent {
  type: 'page_exit'
  path: string
  dwellMs: number
  maxScrollPercent: number
  timestamp: number
  sessionId: string
}

export interface SearchEvent {
  type: 'search'
  query: string
  resultCount: number
  timestamp: number
  sessionId: string
}

export interface FeedbackEvent {
  type: 'feedback'
  targetId: string
  targetType: 'pattern' | 'hook' | 'config' | 'guard' | 'check' | 'page' | 'tooling' | 'project' | 'standard'
  vote: 'up' | 'down'
  comment?: string
  timestamp: number
  sessionId: string
}

export interface PlaygroundEvent {
  type: 'playground'
  action: 'language_change' | 'category_toggle' | 'match_found'
  details: Record<string, unknown>
  timestamp: number
  sessionId: string
}

export type AnalyticsEvent =
  | PageViewEvent
  | PageExitEvent
  | SearchEvent
  | FeedbackEvent
  | PlaygroundEvent

export interface AnalyticsState {
  events: AnalyticsEvent[]
  pageViews: Record<string, number>
  dwellTimes: Record<string, number>
  feedback: Record<string, FeedbackEvent[]>
  searchQueries: { query: string; count: number }[]
  totalViews: number
  totalFeedback: number
  totalSearches: number
  sessionId: string

  track: (event: AnalyticsEvent) => void
  addFeedback: (event: FeedbackEvent) => void
  getPageViews: (path: string) => number
  getDwellTime: (path: string) => number
  getTopPages: (limit: number) => { path: string; views: number }[]
  getUserVote: (targetId: string) => 'up' | 'down' | null
}
