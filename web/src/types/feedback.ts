export interface FeedbackEntry {
  vote: 'up' | 'down'
  comment?: string
  timestamp: number
  sessionId: string
}

export interface FeedbackData {
  targetType: string
  targetId: string
  upvotes: number
  downvotes: number
  entries: FeedbackEntry[]
}

export interface FeedbackCounts {
  upvotes: number
  downvotes: number
}

export interface FeedbackSubmission {
  targetType: string
  targetId: string
  vote: 'up' | 'down'
  comment?: string
  sessionId: string
}
